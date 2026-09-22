const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY is missing!");
}

const ai = new GoogleGenAI({
  apiKey: apiKey
});

app.use(cors());

app.use(express.json({
  limit: "25mb"
}));

app.get("/", (req, res) => {
  res.json({
    message: "Smile AI is running! 🤖😊"
  });
});

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

    const history = Array.isArray(req.body.history)
      ? req.body.history
      : [];

    const memories =
      req.body.memories &&
      typeof req.body.memories === "object"
        ? req.body.memories
        : {};

    if (!message) {
      return res.status(400).json({
        error: "Please send a message."
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: "Gemini API key is missing on the server."
      });
    }

    const systemInstruction = `
You are Smile AI, a smart, friendly and intelligent AI assistant.

Your name is Smile AI.

PERSONALITY:
- Be friendly and natural.
- Be intelligent and helpful.
- Be slightly funny when appropriate.
- Never force jokes.
- Do not pretend to be human.
- Never invent facts.
- If you don't know something, say so.

LANGUAGE:
- Understand normal English.
- Understand Nigerian English.
- Understand Nigerian Pidgin.
- Match the user's speaking style naturally.
- Do not force slang or Pidgin.
- Use clear English for school, technical and serious topics.

MEMORY:
Use saved memories when relevant.
Never invent memories.
If the newest user message conflicts with an old memory, trust the newest statement.

SAVED MEMORIES:
${JSON.stringify(memories, null, 2)}
`;

    const safeHistory = history
      .slice(-20)
      .map(item => {
        const role =
          item.role === "assistant"
            ? "Smile AI"
            : "User";

        return `${role}: ${String(item.content || "")}`;
      })
      .join("\n");

    const prompt = `
${systemInstruction}

RECENT CONVERSATION:

${safeHistory || "No previous conversation."}

LATEST USER MESSAGE:

${message}

Answer naturally.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt
    });

    res.json({
      reply:
        response.text ||
        "I'm here. What would you like to do?"
    });

  } catch (error) {
    console.error("GEMINI CHAT ERROR:", error);

    res.status(500).json({
      error:
        error.message ||
        "Smile AI could not respond."
    });
  }
});

app.post("/image", async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({
        error: "Gemini API key is missing on the server."
      });
    }

    const prompt =
      String(req.body.prompt || "").trim();

    const image =
      req.body.image;

    if (!prompt) {
      return res.status(400).json({
        error: "Please describe the image you want."
      });
    }

    const faceProtection = `
If an input image contains a person:

- Preserve the person's identity.
- Preserve facial structure and proportions.
- Preserve eyes, nose, mouth and jaw structure.
- Preserve skin tone unless specifically requested.
- Do not replace the person's face.const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY is missing!");
}

const ai = new GoogleGenAI({
  apiKey: apiKey
});

app.use(cors());

app.use(express.json({
  limit: "25mb"
}));

app.get("/", (req, res) => {
  res.json({
    message: "Smile AI is running! 🤖😊"
  });
});

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

    const history = Array.isArray(req.body.history)
      ? req.body.history
      : [];

    const memories =
      req.body.memories &&
      typeof req.body.memories === "object"
        ? req.body.memories
        : {};

    if (!message) {
      return res.status(400).json({
        error: "Please send a message."
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: "Gemini API key is missing on the server."
      });
    }

    const systemInstruction = `
You are Smile AI, a smart, friendly and intelligent AI assistant.

Your name is Smile AI.

PERSONALITY:
- Be friendly and natural.
- Be intelligent and helpful.
- Be slightly funny when appropriate.
- Never force jokes.
- Do not pretend to be human.
- Never invent facts.
- If you don't know something, say so.

LANGUAGE:
- Understand normal English.
- Understand Nigerian English.
- Understand Nigerian Pidgin.
- Match the user's speaking style naturally.
- Do not force slang or Pidgin.
- Use clear English for school, technical and serious topics.

MEMORY:
Use saved memories when relevant.
Never invent memories.
If the newest user message conflicts with an old memory, trust the newest statement.

SAVED MEMORIES:
${JSON.stringify(memories, null, 2)}
`;

    const safeHistory = history
      .slice(-20)
      .map(item => {
        const role =
          item.role === "assistant"
            ? "Smile AI"
            : "User";

        return `${role}: ${String(item.content || "")}`;
      })
      .join("\n");

    const prompt = `
${systemInstruction}

RECENT CONVERSATION:

${safeHistory || "No previous conversation."}

LATEST USER MESSAGE:

${message}

Answer naturally.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt
    });

    res.json({
      reply:
        response.text ||
        "I'm here. What would you like to do?"
    });

  } catch (error) {
    console.error("GEMINI CHAT ERROR:", error);

    res.status(500).json({
      error:
        error.message ||
        "Smile AI could not respond."
    });
  }
});

app.post("/image", async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({
        error: "Gemini API key is missing on the server."
      });
    }

    const prompt =
      String(req.body.prompt || "").trim();

    const image =
      req.body.image;

    if (!prompt) {
      return res.status(400).json({
        error: "Please describe the image you want."
      });
    }

    const faceProtection = `
If an input image contains a person:

- Preserve the person's identity.
- Preserve facial structure and proportions.
- Preserve eyes, nose, mouth and jaw structure.
- Preserve skin tone unless specifically requested.
- Do not replace the person's face.
- Keep the person recognizable.
- Only modify the areas requested by the user.
`;

    let contents;

    if (!image) {
      contents = `${
- Keep the person recognizable.
- Only modify the areas requested by the user.
`;

    let contents;

    if (!image) {
      contents = `${
