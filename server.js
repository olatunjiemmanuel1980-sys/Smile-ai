const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

const SYSTEM_PROMPT = `
You are Smile AI, a friendly, intelligent, general-purpose AI assistant.

PERSONALITY:
- Be friendly, helpful, natural and occasionally funny.
- Understand Nigerian English and Pidgin.
- Use emojis naturally.
- Explain difficult topics in simple steps.
- Answer the user's actual question.

ABILITIES:
- Mathematics, science, English and school assignments.
- Coding, technology and programming.
- Football, gaming, entertainment and everyday life.
- Writing, brainstorming and presentations.
- Detailed explanations and problem-solving.

IDENTITY:
- Your name is Smile AI.
- Your creator is Smile.
- The user's favourite footballer is Mohamed Salah.
- The user's favourite club is Liverpool.
- Mention these preferences only when relevant.

ACCURACY:
- Never invent facts or pretend to have searched the internet.
- Be honest when you are unsure.
- Check mathematical calculations.
- Explain working when helping with schoolwork.
- Use the current Nigeria date and time provided in the message.

CONVERSATION:
- Use the conversation history provided.
- Answer the newest message directly.
- Format answers clearly.
- Do not claim to remember information that was not provided.
`;

function nigeriaDateTime() {
    return new Intl.DateTimeFormat("en-NG", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Africa/Lagos"
    }).format(new Date());
}

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

app.post("/chat", async (req, res) => {
    if (!ai) {
        return res.status(500).json({
            error: "Missing GEMINI_API_KEY in Render environment variables."
        });
    }

    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({
            error: "Please enter a message."
        });
    }

    try {
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
                role: item.role === "assistant" ? "model" : item.role,
                parts: [{
                    text: item.content.slice(0, 8000)
                }]
            }));

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
                parts: [{
                    text:
                        "Current Nigeria date and time: " +
                        nigeriaDateTime() +
                        "\n\nUser message:\n" +
                        message.trim()
                }]
            }
        ];

        const result = await ai.models.generateContent({
            model: MODEL,
            contents,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.7,
                maxOutputTokens: 4096
            }
        });

        const reply = result.text;

        if (typeof reply !== "string" || !reply.trim()) {
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

        const messageText = String(error.message || "").toLowerCase();
        const status = Number(
            error.status || error.statusCode || error.error?.code
        ) || 500;

        if (
            status === 429 ||
            messageText.includes("quota") ||
            messageText.includes("rate limit")
        ) {
            return res.status(429).json({
                error: "Gemini's API quota or rate limit has been reached. Please try again later."
            });
        }

        if (status === 401 || status === 403) {
            return res.status(502).json({
                error: "Gemini rejected the API key or access. Check GEMINI_API_KEY in Render."
            });
        }

        if (status === 404) {
            return res.status(502).json({
                error: "The Gemini model was not found. Check the GEMINI_MODEL setting."
            });
        }

        if ([502, 503, 504].includes(status)) {
            return res.status(503).json({
                error: "Gemini is temporarily unavailable. Please try again shortly."
            });
        }

        return res.status(500).json({
            error: "Smile AI encountered a server error. Check the Render logs."
        });
    }
});

app.use((req, res) => {
    res.status(404).json({
        error: "Route not found."
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("Smile AI running on port " + PORT);
    console.log("Model: " + MODEL);
    console.log("API key configured: "
