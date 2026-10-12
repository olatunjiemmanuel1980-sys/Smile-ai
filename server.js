const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

const SYSTEM_PROMPT = `
You are Smile AI, a friendly, intelligent, helpful AI assistant.

PERSONALITY:
- Be warm, natural, friendly, and occasionally funny.
- Use simple explanations when helping beginners.
- You may use Nigerian English or Pidgin when it suits the conversation.
- Do not overuse emojis.
- Never pretend to know something you do not know.

ABILITIES:
- Help with school subjects, mathematics, science, writing, and presentations.
- Help with JavaScript, HTML, CSS, coding, and debugging.
- Discuss football, games, technology, and everyday questions.
- Explain answers step by step when useful.
- If a question needs current internet information and web search is unavailable, be honest about that limitation.
- Do not invent facts, sources, or current news.

MEMORY:
- Use the conversation history provided to you.
- Remember details within the current conversation when possible.
- Do not claim to have permanent memory unless a memory system actually provides it.

Give useful, direct answers. If a question is unclear, ask a short follow-up question.
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
    configured: Boolean(API_KEY),
    model: MODEL
  });
});

app.post("/chat", async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({
        error: "Gemini API key is missing. Check GEMINI_API_KEY in Render."
      });
    }

    const { message, history = [] } = req.body || {};

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    const safeHistory = Array.isArray(history)
      ? history.slice(-12).filter(item =>
          item &&
          typeof item.content === "string" &&
          ["user", "model"].includes(item.role)
        )
      : [];

    const contents = safeHistory.map(item => ({
      role: item.role,
      parts: [{ text: item.content.slice(0, 6000) }]
    }));

    contents.push({
      role: "user",
      parts: [{ text: message.trim().slice(0, 6000) }]
    });

    const result = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 2048
      }
    });

    const reply = result.text;

    if (!reply || !reply.trim()) {
      return res.status(502).json({
        error: "Smile AI received an empty response. Please try again."
      });
    }

    return res.json({
      reply: reply.trim(),
      model: MODEL,
      status: "success"
    });

  } catch (error) {
    console.error("Smile AI error:", error);

    const message = String(error?.message || "");
    const status = Number(error?.status || error?.code || 0);

    if (
      status === 429 ||
      message.includes("429") ||
      message.toLowerCase().includes("quota") ||
      message.toLowerCase().includes("rate limit")
    ) {
      return res.status(429).json({
        error: "Gemini's free API quota or rate limit has been reached. Please wait for the limit to reset, or check your Google AI Studio usage dashboard."
      });
    }

    if (
      status === 401 ||
      status === 403 ||
      message.includes("API_KEY_INVALID")
    ) {
      return res.status(502).json({
        error: "Gemini rejected the API key. Check GEMINI_API_KEY in Render."
      });
    }

    if (status === 404 || message.includes("404")) {
      return res.status(502).json({
        error: `The Gemini model "${MODEL}" was not found or is unavailable to this API key. Set GEMINI_MODEL to a model supported by your account in Render.`
      });
    }

    if (
      status === 503 ||
      message.includes("503") ||
      message.toLowerCase().includes("overloaded")
    ) {
      return res.status(503).json({
        error: "Gemini is temporarily busy. Please try again shortly."
      });
    }

    return res.status(500).json({
      error: "Smile AI couldn't get a reply. Please try again shortly."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Smile AI running on port ${PORT}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Gemini API key configured: ${Boolean(API_KEY)}`);
});
