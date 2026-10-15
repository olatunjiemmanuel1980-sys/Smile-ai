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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
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

const SYSTEM_PROMPT = `
You are Smile AI, a friendly, intelligent and helpful AI assistant.

PERSONALITY:
- Be warm, natural, friendly and occasionally funny.
- Explain difficult subjects in simple steps.
- Use Nigerian English or Pidgin when appropriate.
- Do not overuse emojis.
- Never pretend to know something you do not know.

ABILITIES:
- Help with mathematics, science, schoolwork and presentations.
- Help with HTML, CSS, JavaScript and debugging.
- Discuss football, games and technology.
- Explain calculations step by step.
- Be honest about limitations.

MEMORY:
- Use the saved memories supplied in the conversation.
- Use previous conversation messages when supplied.
- Only treat information in the supplied memories as established facts.
- Do not claim to remember information that is not available.
- Never reveal one user's private information to another user.

Give useful, direct answers.
`;

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
    model: MODEL
  });
});

// Verify the signed-in user using their Supabase access token.
async function authenticate(req, res, next) {
  try {
    if (!supabase) {
      return res.status(503).json({
        error: "Supabase is not configured on the server."
      });
    }

    const authorization = req.headers.authorization || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({
        error: "Please sign in to Smile AI."
      });
    }

    const { data, error } = await supabase.auth.getUser(match[1]);

    if (error || !data.user) {
      return res.status(401).json({
        error: "Your session is invalid or expired. Please sign in again."
      });
    }

    req.user = data.user;
    next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(401).json({
      error: "Could not verify your account."
    });
  }
}

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

    // Create a conversation for this authenticated user,
    // or verify ownership of the requested conversation.
    let activeConversationId = conversationId;

    if (activeConversationId) {
      const { data: existing, error } = await supabase
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
      const { data: created, error } = await supabase
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

    // Save the user's message.
    const { error: userMessageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: activeConversationId,
        user_id: userId,
        role: "user",
        content: text
      });

    if (userMessageError) throw userMessageError;

    // Retrieve only this user's saved memories.
    const { data: savedMemories, error: memoryError } =
      await supabase
        .from("memories")
        .select("id, memory")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);

    if (memoryError) throw memoryError;

    const memoryText = (savedMemories || [])
      .map(item => "- " + item.memory)
      .join("\n");

    // Store a memory only when the user explicitly asks
    // Smile AI to remember something.
    const rememberMatch = text.match(
      /^(?:smile(?:\s+ai)?[,\s]*)?(?:please\s+)?remember(?:\s+that)?\s+(.+)$/i
    );

    if (rememberMatch && rememberMatch[1].trim()) {
      const memory = rememberMatch[1].trim().slice(0, 1000);

      const { error: saveMemoryError } = await supabase
        .from("memories")
        .insert({
          user_id: userId,
          memory
        });

      if (saveMemoryError) throw saveMemoryError;

      savedMemories.unshift({ memory });
    }

    // Load recent messages from this conversation.
    const { data: recentMessages, error: historyError } =
      await supabase
        .from("messages")
        .select("role, content")
        .eq("user_id", userId)
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: false })
        .limit(13);

    if (historyError) throw historyError;

    const dbHistory = (recentMessages || [])
      .reverse()
      .slice(0, -1)
      .map(item => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content.slice(0, 6000) }]
      }));

    // Use browser history only when database history is empty.
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
              parts: [{ text: item.content.slice(0, 6000) }]
            }))
        : [];

    const contents = [
      ...safeHistory,
      {
        role: "user",
        parts: [{ text }]
      }
    ];

    const result = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction:
          SYSTEM_PROMPT +
          "\n\nSAVED MEMORIES FOR THIS USER:\n" +
          (memoryText || "No saved memories yet."),
        maxOutputTokens: 2048
      }
    });

    const reply = result.text;

    if (!reply || !reply.trim()) {
      return res.status(502).json({
        error: "Smile AI received an empty response. Please try again."
      });
    }

    // Save the AI response.
    const { error: assistantMessageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: activeConversationId,
        user_id: userId,
        role: "assistant",
        content: reply.trim()
      });

    if (assistantMessageError) throw assistantMessageError;

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", activeConversationId)
      .eq("user_id", userId);

    return res.json({
      reply: reply.trim(),
      model: MODEL,
      status: "success",
      conversationId: activeConversationId
    });

  } catch (error) {
    console.error("Smile AI error:", error.message);

    const message = String(error.message || "").toLowerCase();

    if (
      message.includes("quota") ||
      message.includes("rate limit") ||
      message.includes("429")
    ) {
      return res.status(429).json({
        error: "Gemini's rate limit has been reached. Please try again later."
      });
    }

    if (
      message.includes("503") ||
      message.includes("overloaded")
    ) {
      return res.status(503).json({
        error: "Gemini is busy right now. Please try again shortly."
      });
    }

    return res.status(500).json({
      error: "Smile AI encountered a server error. Please try again."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Smile AI running on port ${PORT}`);
  console.log(`Gemini configured: ${Boolean(ai)}`);
  console.log(`Supabase configured: ${Boolean(supabase)}`);
});
