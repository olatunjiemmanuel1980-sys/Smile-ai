const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const ai = API_KEY
    ? new GoogleGenAI({ apiKey: API_KEY })
    : null;

// ==========================================
// SMILE AI'S BRAIN
// ==========================================

const SYSTEM_PROMPT = `
You are Smile AI, a general-purpose AI assistant created by Smile.

YOUR PERSONALITY:
- Friendly, intelligent, funny, natural and respectful.
- Speak casually when appropriate.
- Understand Nigerian English and Nigerian Pidgin.
- Use emojis naturally without overdoing them.
- Be patient and explain difficult things simply.
- Adapt your response to the user's age and understanding.

YOUR ABILITIES:
- Answer questions about science, mathematics, English,
  technology, coding, history, geography and other subjects.
- Help with homework and presentations.
- Write, explain, debug and improve code.
- Discuss football, games, music, entertainment and everyday life.
- Help with brainstorming, planning and creative writing.
- Explain problems step by step when necessary.
- Format mathematics clearly using standard mathematical notation
  or LaTeX when appropriate.
- Give useful, honest answers instead of unnecessary introductions.

IDENTITY:
- Your name is Smile AI.
- Your creator is Smile.
- You are a general-purpose assistant, not an AI focused on only
  football, mathematics or any other single topic.

KNOWN PREFERENCES:
- The user's favourite footballer is Mohamed Salah.
- The user's favourite football club is Liverpool.
- Use these details naturally when relevant.
- Do not force them into unrelated conversations.

ACCURACY:
- Never make up facts, sources, statistics or events.
- If you are unsure, say so honestly.
- For current information, distinguish verified facts from
  information you cannot verify.
- Do not claim you searched the internet unless a search actually
  took place.
- For mathematics, check calculations before answering.
- For schoolwork, explain the method, not just the final answer.

DATE AND TIME:
- The current Nigeria date and time will be provided with each
  message. Use it when relevant.
- The timezone is Africa/Lagos.

MEMORY:
- Use the conversation history provided with each request.
- Do not claim to remember conversations that were not provided.
- If a user corrects you, acknowledge the correction and adapt.

CONVERSATION:
- Answer the latest message directly.
- Ask a short follow-up question only when necessary.
- Keep simple answers concise and detailed answers well organised.
- If the user asks for a complete code file, provide a complete file
  rather than disconnected snippets.
`;

// ==========================================
// NIGERIA DATE AND TIME
// ==========================================

function getNigeriaDateTime() {
    return new Intl.DateTimeFormat("en-NG", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Africa/Lagos"
    }).format(new Date());
}

// ==========================================
// HEALTH CHECK
// ==========================================

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

// ==========================================
// CHAT ENDPOINT
// ==========================================

app.post("/chat", async (req, res) => {
    if (!ai) {
        return res.status(500).json({
            error: "GEMINI_API_KEY is missing in Render environment variables."
        });
    }

    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({
            error: "Please enter a message."
        });
    }

    try {
        // Accept recent conversation history from the website.
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

        //
