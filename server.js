const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ================================
// CONFIGURATION
// ================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

const genAI = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })
    : null;

// ================================
// SMILE AI PERSONALITY
// ================================

const SYSTEM_PROMPT = `
You are Smile AI, a helpful, intelligent, friendly AI assistant.

PERSONALITY:
- Be friendly, natural, and respectful.
- You can use Nigerian English or light Nigerian Pidgin when appropriate.
- Be funny sometimes, but know when to be serious.
- Explain difficult things in simple steps.
- Help with schoolwork, mathematics, science, coding, writing,
  technology, ideas, and everyday questions.
- When solving mathematics, show the working step by step.
- Never pretend you performed an action you did not perform.
- Never invent search results, sources, facts, or website links.
- If you do not know something, be honest.

MEMORY:
- Use the saved user memories and conversation history provided.
- Remember relevant information included in the supplied context.
- Do not claim to remember information that is not available.
- If the user asks you to remember something permanently, explain
  that it can be saved when the application successfully stores it.

WEB SEARCH:
- When web search results are provided, use them to answer questions
  about current events and other up-to-date information.
- Prefer information supported by the provided search results.
- Include relevant source links when available.
- If search results are incomplete, explain the limitation.
- Never claim you searched the web if no search was performed.
`;

// ================================
// BASIC ROUTES
// ================================

app.get("/", (req, res) => {
  res.json({
    name: "Smile AI",
    status: "online",
    message: "Smile AI is ready to chat!"
  });
});

app.get("/health", (req, res) => {
  res.json({
    name: "Smile AI",
    status: "ok",
    model: MODEL,
    configured: Boolean(GEMINI_API_KEY),
    supabaseConfigured: Boolean(supabase),
    tavilySearchConfigured: Boolean(TAVILY_API_KEY)
  });
});

// ================================
// AUTHENTICATION
// ================================

async function authenticate(req, res, next) {
  try {
    if (!supabase) {
      return res.status(503).json({
        error: "Supabase is not configured on the server."
      });
    }

    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

    if (!token) {
      return res.status(401).json({
        error: "Please sign in to use Smile AI."
      });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data || !data.user) {
      return res.status(401).json({
        error: "Your session is invalid or expired. Please sign in again."
      });
    }

    req.user = data.user;
    next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(500).json({
      error: "Authentication failed."
    });
  }
}

// ================================
// DETECT QUESTIONS THAT NEED SEARCH
// ================================

function needsWebSearch(query) {
  return /\b(search the web|search web|search the internet|web search|look it up|find sources|give me sources|cite sources|latest|currently|current|today|right now|this week|this month|recent|breaking news|news|price|exchange rate|standings|live score|live update|live result|this season|who won|who is currently|what happened|2025|2026|2027)\b/i.test(
    query
  );
}

// ================================
// TAVILY WEB SEARCH
// ================================

async function searchWeb(query) {
  if (!TAVILY_API_KEY) {
    return [];
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TAVILY_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: query.slice(0, 500),
        search_depth: "basic",
        max_results: 5,
        include_answer: false
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "Tavily search error:",
        response.status,
        errorText.slice(0, 300)
      );

      return [];
    }

    const data = await response.json();

    return (data.results || []).slice(0, 5).map((result) => ({
      title: String(result.title || "Search result").slice(0, 300),
      url: String(result.url || ""),
      content: String(result.content || "").slice(0, 2500)
    }));
  } catch (error) {
    console.error("Web search failed:", error.message);
    return [];
  }
}

// ================================
// CHAT ROUTE
// ================================

app.post("/chat", authenticate, async (req, res) => {
  try {
    if (!genAI) {
      return res.status(503).json({
        error: "Gemini API key is missing on the server."
      });
    }

    const userId = req.user.id;

    const message =
      typeof req.body.message === "string"
        ? req.body.message.trim()
        : "";

    const requestedConversationId =
      typeof req.body.conversationId === "string"
        ? req.body.conversationId
        : null;

    const browserHistory = Array.isArray(req.body.history)
      ? req.body.history
      : [];

    if (!message) {
      return res.status(400).json({
        error: "Please type a message first."
      });
    }

    if (message.length > 12000) {
      return res.status(400).json({
        error: "Your message is too long. Please shorten it."
      });
    }

    // --------------------------------
    // FIND OR CREATE CONVERSATION
    // --------------------------------

    let conversationId = requestedConversationId;

    if (conversationId) {
      const { data: conversation, error } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Conversation lookup error:", error.message);

        return res.status(500).json({
          error: "Could not load your conversation."
        });
      }

      if (!conversation) {
        conversationId = null;
      }
    }

    if (!conversationId) {
      const title =
        message.length > 60
          ? `${message.slice(0, 57)}...`
          : message;

      const { data: conversation, error } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          title
        })
        .select("id")
        .single();

      if (error || !conversation) {
        console.error(
          "Conversation creation error:",
          error ? error.message : "No conversation returned"
        );

        return res.status(500).json({
          error: "Could not create a conversation."
        });
      }

      conversationId = conversation.id;
    }

    // --------------------------------
    // SAVE USER MESSAGE
    // --------------------------------

    const { error: userMessageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "user",
        content: message
      });

    if (userMessageError) {
      console.error(
        "Saving user message error:",
        userMessageError.message
      );

      return res.status(500).json({
        error: "Could not save your message."
      });
    }

    // --------------------------------
    // LOAD SAVED MEMORIES
    // --------------------------------

    let savedMemories = [];

    const { data: memories, error: memoriesError } = await supabase
      .from("memories")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (memoriesError) {
      console.error(
        "Loading memories error:",
        memoriesError.message
      );
    } else {
      savedMemories = memories || [];
    }

    // --------------------------------
    // SAVE A REQUESTED MEMORY
    // --------------------------------

    const rememberMatch = message.match(
      /^(?:smile(?:\s+ai)?[,\s]*)?(?:please\s+)?remember(?:\s+that)?\s+(.+)$/i
    );

    let memoryNotice = "";

    if (rememberMatch && rememberMatch[1].trim()) {
      const memoryText = rememberMatch[1].trim().slice(0, 1000);

      const { data: existingMemory, error: existingMemoryError } =
        await supabase
          .from("memories")
          .select("id")
          .eq("user_id", userId)
          .eq("content", memoryText)
          .limit(1)
          .maybeSingle();

      if (existingMemoryError) {
        console.error(
          "Checking existing memory error:",
          existingMemoryError.message
        );
      }

      if (!existingMemory) {
        const { data: newMemory, error: memoryError } = await supabase
          .from("memories")
          .insert({
            user_id: userId,
            content: memoryText
          })
          .select("*")
          .single();

        if (memoryError) {
          console.error("Saving memory error:", memoryError.message);

          memoryNotice =
            " I couldn't save that memory permanently this time.";
        } else {
          savedMemories.unshift(newMemory);

          memoryNotice = " I've saved that in your memories.";
        }
      } else {
        memoryNotice = " I already have that saved in your memories.";
      }
    }

    // --------------------------------
    // LOAD RECENT CONVERSATION HISTORY
    // --------------------------------

    const { data: previousMessages, error: historyError } =
      await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(14);

    if (historyError) {
      console.error("Loading history error:", historyError.message);
    }

    let history = (previousMessages || [])
      .reverse()
      .slice(0, -1)
      .filter(
        (item) =>
          typeof item.content === "string" &&
          ["user", "assistant", "model"].includes(item.role)
      )
      .map((item) => ({
        role:
          item.role === "assistant" || item.role === "model"
            ? "model"
            : "user",
        parts: [{ text: item.content.slice(0, 12000) }]
      }));

    // Use browser-provided history if the database history is empty.
    if (history.length === 0 && browserHistory.length > 0) {
      history = browserHistory
        .filter(
          (item) =>
            item &&
            typeof item.content === "string" &&
            ["user", "assistant", "model"].includes(item.role)
        )
        .slice(-12)
        .map((item) => ({
          role:
            item.role === "assistant" || item.role === "model"
              ? "model"
              : "user",
          parts: [{ text: item.content.slice(0, 4000) }]
        }));
    }

    // Gemini conversation history must start with a user message.
    while (history.length > 0 && history[0].role !== "user") {
      history.shift();
    }

    // --------------------------------
    // DECIDE WHETHER TO SEARCH THE WEB
    // --------------------------------

    const shouldSearch =
      Boolean(TAVILY_API_KEY) && needsWebSearch(message);

    let searchResults = [];

    if (shouldSearch) {
      searchResults = await searchWeb(message);
    }

    const searchContext =
      searchResults.length > 0
        ? `
LIVE WEB SEARCH RESULTS:
The following results were retrieved for the user's question.
Use them as supporting information and cite relevant URLs in your answer.

${searchResults
  .map(
    (result, index) => `
SOURCE ${index + 1}
Title: ${result.title}
URL: ${result.url}
Content: ${result.content}
`
  )
  .join("\n")}
`
        : shouldSearch
        ? `
The application attempted a web search, but no usable results were returned.
Be honest if you cannot verify the latest information.
Do not invent sources or claim the search succeeded.
`
        : "";

    const memoriesContext =
      savedMemories.length > 0
        ? `
SAVED MEMORIES ABOUT THIS USER:
${savedMemories
  .map((memory) => {
    const content =
      typeof memory.content === "string"
        ? memory.content
        : typeof memory.memory === "string"
        ? memory.memory
        : "";

    return content ? `- ${content}` : "";
  })
  .filter(Boolean)
  .join("\n")}
`
        : "There are currently no saved memories available.";

    const systemInstruction = `
${SYSTEM_PROMPT}

${memoriesContext}

${searchContext}
`;

    // --------------------------------
    // GENERATE AI RESPONSE
    // --------------------------------

    const chat = genAI.chats.create({
      model: MODEL,
      history,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 4096
      }
    });

    const result = await chat.sendMessage({
      message
    });

    let reply =
      typeof result.text === "string"
        ? result.text.trim()
        : "";

    if (!reply) {
      reply =
        "Sorry bro, I couldn't generate a reply this time. Try again.";
    }

    if (memoryNotice) {
      reply += `\n\n${memoryNotice.trim()}`;
    }

    // --------------------------------
    // SAVE AI RESPONSE
    // --------------------------------

    const { error: assistantMessageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: reply
      });

    if (assistantMessageError) {
      console.error(
        "Saving assistant message error:",
        assistantMessageError.message
      );
    }

    // --------------------------------
    // UPDATE CONVERSATION ACTIVITY
    // --------------------------------

    const { error: updateConversationError } = await supabase
      .from("conversations")
      .update({
        updated_at: new Date().toISOString()
      })
      .eq("id", conversationId)
      .eq("user_id", userId);

    if (updateConversationError) {
      console.error(
        "Updating conversation error:",
        updateConversationError.message
      );
    }

    // --------------------------------
    // SEND RESPONSE TO FRONTEND
    // --------------------------------

    return res.json({
      reply,
      model: MODEL,
      status: "success",
      conversationId,
      webSearched: shouldSearch,
      sources: searchResults.map((result) => ({
        title: result.title,
        url: result.url
      }))
    });
  } catch (error) {
    console.error("Smile AI chat error:", error);

    const statusCode =
      error.status === 429 || error.status === 503 ? 503 : 500;

    return res.status(statusCode).json({
      error:
        statusCode === 503
          ? "Smile AI is busy right now. Please wait a little and try again."
          : "Sorry bro, Smile AI encountered an error. Please try again."
    });
  }
});

// ================================
// START SERVER
// ================================

app.listen(PORT, () => {
  console.log(`Smile AI is running on port ${PORT}`);
  console.log(`Gemini configured: ${Boolean(GEMINI_API_KEY)}`);
  console.log(`Supabase configured: ${Boolean(supabase)}`);
  console.log(`Tavily configured: ${Boolean(TAVILY_API_KEY)}`);
});
