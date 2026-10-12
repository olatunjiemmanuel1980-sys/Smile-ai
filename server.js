"use strict";

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const ai = API_KEY
  ? new GoogleGenAI({ apiKey: API_KEY })
  : null;

app.disable("x-powered-by");

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "1mb" }));

const DEFAULT_MEMORIES = {
  name: "",
  favoriteFootballer: "",
  favoriteClub: "",
  favoriteGame: "",
  favoriteColor: ""
};

const SYSTEM_INSTRUCTION = `
You are Smile AI, a friendly, helpful and intelligent AI assistant.

- Your name is Smile AI.
- Be natural, respectful and conversational.
- Understand Nigerian English and Pidgin.
- Explain schoolwork step by step when requested.
- Help with coding and creative ideas.
- Use supplied memories when relevant.
- Never pretend to remember information you were not given.
- Be honest when you do not know something.
- Never claim you performed an action you cannot perform.
`;

function cleanString(value, maxLength = 1000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function cleanMemories(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_MEMORIES };
  }

  return {
    name: cleanString(value.name, 100),
    favoriteFootballer: cleanString(value.favoriteFootballer, 100),
    favoriteClub: cleanString(value.favoriteClub, 100),
    favoriteGame: cleanString(value.favoriteGame, 100),
    favoriteColor: cleanString(value.favoriteColor, 100)
  };
}

function cleanHistory(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-20)
    .filter(item =>
      item &&
      ["user", "assistant", "model"].includes(item.role) &&
      typeof item.text === "string"
    )
    .map(item => ({
      role: item.role === "user" ? "user" : "model",
      parts: [{ text: item.text.slice(0, 6000) }]
    }));
}

function formatMemories(memories) {
  const known = Object.entries(memories)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}: ${value}`);

  return known.length
    ? known.join("\n")
    : "No personal memories have been saved.";
}

app.get("/", (req, res) => {
  res.json({
    name: "Smile AI",
    status: "online"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Smile AI",
    model: MODEL,
    configured: Boolean(API_KEY)
  });
});

app.post("/chat", async (req, res) => {
  try {
    if (!ai) {
      return res.status(503).json({
        error: "GEMINI_API_KEY is missing in Render environment variables."
      });
    }

    const message = cleanString(req.body?.message, 10000);

    if (!message) {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    const memories = cleanMemories(req.body?.memories);
    const history = cleanHistory(req.body?.history);

    const contents = [
      ...history,
      {
        role: "user",
        parts: [{
          text:
            "Personal memories, if relevant:\n" +
            formatMemories(memories) +
            "\n\nCurrent message:\n" +
            message
        }]
      }
    ];

    const result = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.8,
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
      memories
    });

  } catch (error) {
    console.error("Smile AI error:", error);

    const status = Number(error.status || error.statusCode || 0);

    if (status === 429) {
      return res.status(429).json({
        error: "Gemini API quota or rate limit reached. Please try again later."
      });
    }

    if (status === 503 || status === 502) {
      return res.status(503).json({
        error: "The AI service is temporarily unavailable. Please try again."
      });
    }

    return res.status(500).json({
      error: "Smile AI encountered a server error. Check Render logs."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Smile AI server listening on port ${PORT}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Gemini API configured: ${Boolean(API_KEY)}`);
});
