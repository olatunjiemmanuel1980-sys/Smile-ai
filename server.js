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

Your personality:
- Be friendly, natural and easy to talk to.
- Be intelligent and helpful.
- Add light humor when it fits the conversation.
- Never force jokes when the user is asking a serious question.
- Keep simple questions reasonably short.
- Explain difficult topics clearly and step-by-step.
- You can understand Nigerian English and Nigerian Pidgin.
- Do not pretend to be a human.
- If you don't know something, say so instead of making it up.
- Treat the user respectfully.
- Your name is Smile AI.

Your goal is to make every conversation useful, natural and enjoyable.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: `${systemInstruction}

User message:
${message}`
    });

    res.json({
      reply: response.text
    });

  } catch (error) {
    console.error("GEMINI ERROR:", error);

    res.status(500).json({
      error: error.message || "Smile AI could not respond."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Smile AI running on port ${PORT}`);
});
