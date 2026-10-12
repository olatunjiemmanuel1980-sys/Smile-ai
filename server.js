const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.8-flash";

const ai = API_KEY
? new GoogleGenAI({ apiKey: API_KEY })
: null;

const SYSTEM_PROMPT = `
You are Smile AI, a friendly, intelligent, funny and helpful AI assistant.

PERSONALITY:

- Be warm, natural, friendly and conversational.
- Use emojis naturally.
- Understand Nigerian English and Nigerian Pidgin.
- Explain schoolwork clearly when asked.
- Give useful, direct answers.
- Be honest if you do not know something.
- Never pretend to perform actions you cannot perform.

IDENTITY:

- Your name is Smile AI.
- Your creator is Smile.
- You are an AI assistant that helps people learn, chat, brainstorm and solve problems.

CONVERSATION:

- Pay attention to the conversation history provided.
- Remember the context of the current conversation.
- Answer the user's latest message directly.
  `;

const sleep = ms =>
new Promise(resolve => setTimeout(resolve, ms));

function getStatus(error) {
return Number(
error.status ||
error.code ||
error.error?.code
) || 500;
}

function isTemporaryError(error) {
const status = getStatus(error);

return [408, 429, 500, 502, 503, 504].includes(status);
}

async function generateWithRetry(contents) {
let lastError;

// Three attempts, with a delay between attempts.
for (let attempt = 1; attempt <= 3; attempt++) {
try {
console.log(
"Gemini request: attempt ${attempt}/3 using ${MODEL}"
);

  return await ai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.8,
      maxOutputTokens: 2048
    }
  });

} catch (error) {
  lastError = error;

  console.error(
    `Gemini attempt ${attempt} failed:`,
    error.message
  );

  if (!isTemporaryError(error) || attempt === 3) {
    throw error;
  }

  // Wait 2 seconds, then 4 seconds.
  await sleep(attempt * 2000);
}

}

throw lastError;
}

// Main website / health check.
app.get("/", (req, res) => {
res.json({
name: "Smile AI",
status: "online",
model: MODEL
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

// Chat endpoint.
app.post("/chat", async (req, res) => {
try {
if (!ai) {
return res.status(500).json({
error: "Smile AI is missing its Gemini API key."
});
}

const message = req.body?.message;

if (typeof message !== "string" || !message.trim()) {
  return res.status(400).json({
    error: "Please enter a message."
  });
}

// The frontend may send previous messages.
let history = Array.isArray(req.body.history)
  ? req.body.history
  : [];

history = history
  .filter(item =>
    item &&
    typeof item.content === "string" &&
    ["user", "assistant", "model"].includes(item.role)
  )
  .slice(-20)
  .map(item => ({
    role: item.role === "assistant"
      ? "model"
      : item.role,
    parts: [{
      text: item.content.slice(0, 8000)
    }]
  }));

// Avoid including the current message twice.
const last = history[history.length - 1];

if (
  last &&
  last.role === "user" &&
  last.parts[0].text.trim() === message.trim()
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

const result = await generateWithRetry(contents);
const reply = result.text;

if (typeof reply !== "string" || !reply.trim()) {
  return res.status(502).json({
    error: "Gemini returned an empty reply. Please try again."
  });
}

console.log("Smile AI replied successfully.");

return res.json({
  reply: reply.trim(),
  model: MODEL,
  status: "success"
});

} catch (error) {
console.error("Smile AI chat error:", error);

const status = getStatus(error);

if ([429, 503, 504].includes(status)) {
  return res.status(503).json({
    error: "Smile AI is temporarily busy. Please try again shortly.",
    details: error.message
  });
}

if (status === 404) {
  return res.status(502).json({
    error: "The configured Gemini model is unavailable. Check the model name.",
    details: error.message
  });
}

return res.status(500).json({
  error: "Smile AI encountered a server error. Check Render logs.",
  details: error.message || "Unknown error"
});

}
});

// Handle unknown routes.
app.use((req, res) => {
res.status(404).json({
error: "Route not found."
});
});

app.listen(PORT, "0.0.0.0", () => {
console.log("Smile AI running on port ${PORT}");
console.log("Model: ${MODEL}");
console.log("Gemini API configured: ${Boolean(API_KEY)}");
});
