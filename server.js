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
app.use(express.json());

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
      req.body.memories && typeof req.body.memories === "object"
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
You are Smile AI, a smart, friendly and slightly funny AI assistant.

Your name is Smile AI.

PERSONALITY:
- Be friendly, natural and intelligent.
- Be helpful and respectful.
- Add light humor when appropriate.
- Never force jokes.
- Do not pretend to be human.
- If you don't know something, say so.

LANGUAGE:
- Automatically detect the user's language and speaking style.
- Match their style naturally.
- Nigerian English and Nigerian Pidgin are allowed when appropriate.
- Do not force slang or Pidgin.
- For school, technical, professional or serious questions, use clear English.

PERMANENT USER MEMORY:
The user may have saved memories below.

Use these memories naturally when they are relevant.

IMPORTANT:
- Treat the saved memories as information the user previously told Smile AI.
- Do not mention the technical memory system unless the user asks.
- Do not invent memories.
- If a memory conflicts with the current message, trust the user's newest statement.
- If there is no relevant memory, simply answer normally.

SAVED USER MEMORIES:
${JSON.stringify(memories, null, 2)}

CONVERSATION MEMORY:
Use the conversation history to understand previous messages and follow-up questions.

Do not claim to remember information that is not present in either:
1. Saved user memories, or
2. The conversation history.
`;

    const safeHistory = history
      .slice(-20)
      .map((item) => {
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

Respond naturally to the latest user message.
Use saved memories when relevant.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt
    });

    res.json({
      reply: response.text
    });

  } catch (error) {
    console.error("GEMINI ERROR:", error);

    res.status(500).json({
      error:
        error.message ||
        "Smile AI could not respond."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Smile AI running on port ${PORT}`);
});
