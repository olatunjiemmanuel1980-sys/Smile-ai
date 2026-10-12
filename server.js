const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;

// Use the model recommended by your Gemini error.
const MODEL = "gemini-3.8-flash";

let ai = null;

if (API_KEY) {
  ai = new GoogleGenAI({
    apiKey: API_KEY
  });
}

const memories = {};

const SYSTEM_PROMPT = `
You are Smile AI, a friendly, intelligent, funny and helpful AI assistant.

PERSONALITY:
- Be friendly, natural, warm and conversational.
- Talk like a real person, not a robot.
- Use emojis naturally, but do not overuse them.
- Understand Nigerian English and Nigerian Pidgin.
- Give clear explanations when helping with schoolwork.
- Be honest when you do not know something.
- Never pretend you performed an action you did not perform.

MEMORY:
- Remember important information the user tells you during the conversation.
- Use the conversation history to maintain context.
- Remember the user's preferences when they appear in the provided history.
- Never claim to have permanent memory unless the server actually saves it.

IDENTITY:
- Your name is Smile AI.
- Your creator is Smile.
- You are here to help, chat, explain, brainstorm and solve problems.

Answer the user's latest message directly.
`;

// Home route
app.get("/", (req, res) => {
  res.json({
    name: "Smile AI",
    status: "online",
    model: MODEL
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Smile AI",
    model: MODEL,
    configured: Boolean(API_KEY)
  });
});

// Chat route
app.post("/chat", async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing in Render environment variables."
      });
    }

    const message = req.body.message;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    const userId = String(req.body.userId || "default");

    // Keep a short conversation history in server memory.
    if (!memories[userId]) {
      memories[userId] = [];
    }

    let history = Array.isArray(req.body.history)
      ? req.body.history
      : [];

    // Keep only valid recent messages.
    history = history
      .filter(item =>
        item &&
        typeof item.content === "string" &&
        ["user", "assistant", "model"].includes(item.role)
      )
      .slice(-20)
      .map(item => ({
        role: item.role === "assistant" ? "model" : item.role,
        parts: [{ text: item.content.slice(0, 8000) }]
      }));

    // Avoid sending the latest message twice if the frontend
    // already included it in the history.
    if (
      history.length > 0 &&
      history[history.length - 1].role === "user" &&
      history[history.length - 1].parts[0].text.trim() === message.trim()
    ) {
      history.pop();
    }

    const contents = [
      ...history,
      {
        role: "user",
        parts: [{ text: message.trim() }]
      }
    ];

    const result = await ai.models.generateContent({
      model: MODEL,
      contents: contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.8,
        maxOutputTokens: 2048
      }
    });

    const reply = result.text;

    if (!reply || !reply.trim()) {
      return res.status(502).json({
        error: "Gemini returned an empty reply. Please try again."
      });
    }

    // Keep a small amount of recent context for this server session.
    memories[userId].push(
      { role: "user", content: message.trim() },
      { role: "assistant", content: reply }
    );

    memories[userId] = memories[userId].slice(-20);

    return res.json({
      reply: reply,
      model: MODEL,
      status: "success"
    });

  } catch (error) {
    console.error("Smile AI error:", error);

    const status = Number(error.status || error.code) || 500;

    return res.status(500).json({
      error: "Smile AI encountered a server error. Check Render logs.",
      details: error.message || "Unknown Gemini API error."
    });
  }
});

// Unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Smile AI server is running on port " + PORT);
  console.log("Model: " + MODEL);
  console.log("Gemini API key configured: " + Boolean(API_KEY));
});
