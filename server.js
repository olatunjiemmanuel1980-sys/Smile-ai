const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Web search is disabled unless explicitly enabled.
const GOOGLE_SEARCH_ENABLED =
  process.env.ENABLE_GOOGLE_SEARCH === "true";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY
    })
  : null;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      )
    : null;


// ========================================
// SMILE AI'S BRAIN
// ========================================

const SYSTEM_PROMPT = `
You are Smile AI, a friendly, intelligent, thoughtful AI assistant.

YOUR PERSONALITY:
- Be friendly, natural, helpful and occasionally funny.
- Speak clearly and naturally.
- Use Nigerian English or Nigerian Pidgin when appropriate.
- Do not overuse emojis.
- Adapt your explanations to the user's level of understanding.
- Be respectful, patient and encouraging.

INTELLIGENCE:
- Understand the user's actual question before answering.
- Break difficult problems into manageable steps.
- Consider different possible solutions before recommending one.
- Check your calculations and reasoning for obvious errors.
- Explain important conclusions clearly.
- Ask a clarifying question when essential information is missing.
- Never invent facts to make an answer sound convincing.
- Clearly acknowledge uncertainty when appropriate.

MATHEMATICS AND SCIENCE:
- Solve mathematical problems step by step.
- Explain formulas and show how they are applied.
- Check answers where practical.
- Explain scientific concepts using understandable examples.
- Help with school assignments and presentations.

PROGRAMMING AND CODING:
- Help with JavaScript, HTML, CSS, Python, Node.js and other languages.
- Write complete code when the user requests a complete file.
- Explain code in simple language.
- Identify likely bugs and suggest practical fixes.
- Preserve existing functionality when modifying a project.
- Never claim that code has been tested or executed unless it actually has.
- Explain where code belongs and how to use it.
- Consider security, performance and reliability when recommending solutions.

CURRENT INFORMATION:
- Your built-in knowledge might not include recent developments.
- When Google Search is available, use it when current information would materially improve the answer.
- Do not claim to have searched the web unless the search tool was actually used.
- When search results provide sources, include useful source links.
- Distinguish verified information from assumptions.

CONVERSATION AND MEMORY:
- Use the conversation history provided to you.
- Use saved memories supplied in the prompt when relevant.
- Do not claim to remember information that was not supplied.
- Never reveal one user's private information to another user.

HONESTY:
- Never pretend to access websites, files, accounts or tools that you cannot access.
- Never claim an action succeeded unless there is evidence that it succeeded.
- If a request cannot be completed, explain the limitation and suggest a practical alternative.

Your goal is to provide accurate, useful and understandable answers.
`;


// ========================================
// BASIC ROUTES
// ========================================

app.get("/", (req, res) => {
  res.json({
    name: "Smile AI",
    status: "online"
  });
});


app.get("/health", (req, res) => {
  res.json({
    name: "Smile AI",
    status: "online",
    geminiConfigured: Boolean(ai),
    supabaseConfigured: Boolean(supabase),
    googleSearchEnabled: GOOGLE_SEARCH_ENABLED,
    model: MODEL
  });
});


// ========================================
// AUTHENTICATION
// ========================================

async function authenticate(req, res, next) {
  try {
    if (!supabase) {
      return res.status(503).json({
        error: "Supabase is not configured on the server."
      });
    }

    const authorization =
      req.headers.authorization || "";

    const match = authorization.match(
      /^Bearer\s+(.+)$/i
    );

    if (!match) {
      return res.status(401).json({
        error: "Please sign in to Smile AI."
      });
    }

    const { data, error } =
      await supabase.auth.getUser(match[1]);

    if (error || !data.user) {
      return res.status(401).json({
        error:
          "Your session is invalid or expired. Please sign in again."
      });
    }

    req.user = data.user;

    next();

  } catch (error) {
    console.error(
      "Authentication error:",
      error.message
    );

    return res.status(401).json({
      error: "Could not verify your account."
    });
  }
}


// ========================================
// CHAT
// ========================================

app.post("/chat", authenticate, async (req, res) => {
  try {
    if (!ai) {
      return res.status(503).json({
        error: "Gemini is not configured on the server."
      });
    }

    const userId = req.user.id;

    const {
      message,
      history = [],
      conversationId = null
    } = req.body || {};

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    const text = message.trim().slice(0, 6000);


    // ====================================
    // CONVERSATION MANAGEMENT
    // ====================================

    let activeConversationId = conversationId;

    if (activeConversationId) {
      const { data: existing, error } =
        await supabase
          .from("conversations")
          .select("id")
          .eq("id", activeConversationId)
          .eq("user_id", userId)
          .maybeSingle();

      if (error) throw error;

      if (!existing) {
        return res.status(404).json({
          error: "Conversation not found."
        });
      }

    } else {
      const { data: created, error } =
        await supabase
          .from("conversations")
          .insert({
            user_id: userId,
            title: text.slice(0, 70)
          })
          .select("id")
          .single();

      if (error) throw error;

      activeConversationId = created.id;
    }


    // ====================================
    // SAVE USER MESSAGE
    // ====================================

    const { error: userMessageError } =
      await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          user_id: userId,
          role: "user",
          content: text
        });

    if (userMessageError) {
      throw userMessageError;
    }


    // ====================================
    // LOAD SAVED MEMORIES
    // ====================================

    const {
      data: savedMemories,
      error: memoryError
    } = await supabase
      .from("memories")
      .select("id, memory")
      .eq("user_id", userId)
      .order("created_at", {
        ascending: false
      })
      .limit(30);

    if (memoryError) throw memoryError;


    // ====================================
    // REMEMBER REQUESTS
    // ====================================

    const rememberMatch = text.match(
      /^(?:smile(?:\s+ai)?[,\s]*)?(?:please\s+)?remember(?:\s+that)?\s+(.+)$/i
    );

    if (
      rememberMatch &&
      rememberMatch[1].trim()
    ) {
      const memory = rememberMatch[1]
        .trim()
        .slice(0, 1000);

      const { error: saveMemoryError } =
        await supabase
          .from("memories")
          .insert({
            user_id: userId,
            memory
          });

      if (saveMemoryError) {
        throw saveMemoryError;
      }

      savedMemories.unshift({
        memory
      });
    }

    const memoryText = (savedMemories || [])
      .map(item => "- " + item.memory)
      .join("\n");


    // ====================================
    // LOAD CONVERSATION HISTORY
    // ====================================

    const {
      data: recentMessages,
      error: historyError
    } = await supabase
      .from("messages")
      .select("role, content")
      .eq("user_id", userId)
      .eq("conversation_id", activeConversationId)
      .order("created_at", {
        ascending: false
      })
      .limit(13);

    if (historyError) throw historyError;

    const dbHistory = (recentMessages || [])
      .reverse()
      .slice(0, -1)
      .map(item => ({
        role:
          item.role === "assistant"
            ? "model"
            : "user",
        parts: [
          {
            text: item.content.slice(0, 6000)
          }
        ]
      }));


    // Use browser history only when database
    // history is empty.

    const safeHistory = dbHistory.length
      ? dbHistory
      : Array.isArray(history)
        ? history
            .filter(item =>
              item &&
              typeof item.content === "string" &&
              ["user", "model"].includes(item.role)
            )
            .slice(-12)
            .map(item => ({
              role: item.role,
              parts: [
                {
                  text: item.content.slice(0, 6000)
                }
              ]
            }))
        : [];


    const contents = [
      ...safeHistory,
      {
        role: "user",
        parts: [
          {
            text
          }
        ]
      }
    ];


    // ====================================
    // GENERATE AI RESPONSE
    // ====================================

    const config = {
      systemInstruction:
        SYSTEM_PROMPT +
        "\n\nSAVED MEMORIES FOR THIS USER:\n" +
        (memoryText || "No saved memories yet."),

      maxOutputTokens: 2048
    };


    // Google Search is optional.
    // It remains disabled unless explicitly
    // enabled in the Render environment.

    if (GOOGLE_SEARCH_ENABLED) {
      config.tools = [
        {
          googleSearch: {}
        }
      ];
    }


    const result = await ai.models.generateContent({
      model: MODEL,
      contents,
      config
    });


    let reply = result.text || "";


    // ====================================
    // SEARCH SOURCES
    // ====================================

    if (GOOGLE_SEARCH_ENABLED) {
      const chunks =
        result.candidates?.[0]
          ?.groundingMetadata
          ?.groundingChunks || [];

      const sources = [];
      const seenUrls = new Set();

      for (const chunk of chunks) {
        const web = chunk.web;

        if (
          web?.uri &&
          !seenUrls.has(web.uri)
        ) {
          seenUrls.add(web.uri);

          sources.push({
            title: web.title || web.uri,
            uri: web.uri
          });
        }
      }

      if (sources.length > 0) {
        reply +=
          "\n\nSources:\n" +
          sources
            .slice(0, 5)
            .map(source =>
              "- " +
              source.title +
              ": " +
              source.uri
            )
            .join("\n");
      }
    }


    if (!reply.trim()) {
      return res.status(502).json({
        error:
          "Smile AI received an empty response. Please try again."
      });
    }


    // ====================================
    // SAVE AI RESPONSE
    // ====================================

    const {
      error: assistantMessageError
    } = await supabase
      .from("messages")
      .insert({
        conversation_id: activeConversationId,
        user_id: userId,
        role: "assistant",
        content: reply.trim()
      });

    if (assistantMessageError) {
      throw assistantMessageError;
    }


    // Update conversation activity.

    await supabase
      .from("conversations")
      .update({
        updated_at: new Date().toISOString()
      })
      .eq("id", activeConversationId)
      .eq("user_id", userId);


    // ====================================
    // SEND RESPONSE TO FRONTEND
    // ====================================

    return res.json({
      reply: reply.trim(),
      model: MODEL,
      status: "success",
      conversationId: activeConversationId
    });


  } catch (error) {
    console.error(
      "Smile AI error:",
      error.message
    );

    const message = String(
      error.message || ""
    ).toLowerCase();


    if (
      message.includes("quota") ||
      message.includes("rate limit") ||
      message.includes("429")
    ) {
      return res.status(429).json({
        error:
          "Gemini's rate limit has been reached. Please try again later."
      });
    }


    if (
      message.includes("503") ||
      message.includes("overloaded")
    ) {
      return res.status(503).json({
        error:
          "Gemini is busy right now. Please try again shortly."
      });
    }


    console.error(
      "Full error details:",
      error
    );

    return res.status(500).json({
      error:
        "Smile AI encountered a server error. Please try again."
    });
  }
});


// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {
  console.log(
    `Smile AI running on port ${PORT}`
  );

  console.log(
    `Gemini configured: ${Boolean(ai)}`
  );

  console.log(
    `Supabase configured: ${Boolean(supabase)}`
  );

  console.log(
    `Google Search enabled: ${GOOGLE_SEARCH_ENABLED}`
  );

  console.log(
    `Model: ${MODEL}`
  );
});
