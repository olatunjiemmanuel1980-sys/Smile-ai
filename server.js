const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

// Gemini API
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY is missing!");
}

const ai = new GoogleGenAI({
  apiKey: apiKey
});

app.use(cors());
app.use(express.json());

// Home / health check
app.get("/", (req, res) => {
  res.json({
    message: "Smile AI is running! 🤖😊"
  });
});

// Chat endpoint
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

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: message
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
