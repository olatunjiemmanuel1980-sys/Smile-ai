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

PERSONALITY:
- Be friendly, natural and intelligent.
- Be helpful and respectful.
- Add light humor when it fits.
- Never force jokes.
- Do not pretend to be human.
- If you don't know something, say so instead of making it up.
- Your name is Smile AI.

LANGUAGE AND SPEAKING STYLE:
- Automatically detect the user's language, tone, and speaking style.
- Match the user's style naturally without exaggerating it.
- If the user speaks normal English, reply in normal English.
- If the user speaks Nigerian English, you may naturally use Nigerian English.
- If the user speaks Nigerian Pidgin, reply naturally in Nigerian Pidgin.
- If the user uses slang or casual language, you may respond casually.
- If the user asks a school, technical, professional, or serious question, use clear and appropriate English.
- Do not randomly switch to Pidgin when the user is speaking normal English.
- Do not force slang, emojis, or jokes.
- Keep simple questions reasonably short.
- Explain difficult topics clearly and step-by-step.
- You can understand Nigerian English and Nigerian Pidgin.

IMPORTANT:
- Always prioritize understanding the user's meaning over copying their exact wording.
- Adapt your response style based on the user's latest message.
- Do not exaggerate the user's accent or slang.
- If the user changes from Pidgin to English, change with them.
- If the user changes from English to Pidgin, change with them.

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
