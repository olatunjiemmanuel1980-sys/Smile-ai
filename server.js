const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;

// IMPORTANT: Define the model correctly.
const MODEL = "gemini-3.5-flash-lite";

const ai = API_KEY
    ? new GoogleGenAI({ apiKey: API_KEY })
    : null;

const SYSTEM_PROMPT = `
You are Smile AI, a friendly, intelligent and funny AI assistant.

PERSONALITY:
- Be friendly, natural and helpful.
- Understand Nigerian English and Nigerian Pidgin.
- Use emojis naturally.
- Explain schoolwork clearly.
- Give direct, useful answers.
- Never invent facts or pretend to know something you do not know.

IDENTITY:
- Your name is Smile AI.
- Your creator is Smile.
- You help people learn, chat, brainstorm and solve problems.

MEMORIES:
- The user's favourite footballer is Mohamed Salah.
- The user's favourite football club is Liverpool.
- Use these facts when relevant.

DATE:
- Use the current date and time supplied in the message.
- The timezone is Africa/Lagos.
- Never invent a different date.

CONVERSATION:
- Use the conversation history provided.
- Answer the latest user message directly.
`;

function getNigeriaDateTime() {
    return new Intl.DateTimeFormat("en-NG", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Africa/Lagos"
    }).format(new Date());
}

function getErrorStatus(error) {
    return Number(
        error.status ||
        error.statusCode ||
        error.error?.code
    ) || 500;
}

// Website health check.
app.get("/", (req, res) => {
    res.json({
        name: "Smile AI",
        status: "online",
        model: MODEL
    });
});

// Detailed health check.
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "Smile AI",
        model: MODEL,
        configured: Boolean(API_KEY)
    });
});

// Main chat endpoint.
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
        // Read recent conversation history.
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
                role:
                    item.role === "assistant"
                        ? "model"
                        : item.role,
                parts: [{
                    text: item.content.slice(0, 8000)
                }]
            }));

        // Avoid sending the latest message twice.
        const lastMessage = history[history.length - 1];

        if (
            lastMessage &&
            lastMessage.role === "user" &&
            lastMessage.parts[0].text.trim() === message.trim()
        ) {
            history.pop();
        }

        const currentDate = getNigeriaDateTime();

        const contents = [
            ...history,
            {
                role: "user",
                parts: [{
                    text:
                        "Current date and time in Nigeria: " +
                        currentDate +
                        "\n\nMy message is:\n" +
                        message.trim()
                }]
            }
        ];

        console.log("Sending request to Gemini:", MODEL);

        const result = await ai.models.generateContent({
            model: MODEL,
            contents: contents,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.7,
                maxOutputTokens: 2048
            }
        });

        const reply = result.text;

        if (typeof reply !== "string" || !reply.trim()) {
            console.error("Gemini returned an empty response.");

            return res.status(502).json({
                error: "Gemini returned an empty answer. Please try again."
            });
        }

        console.log("Smile AI replied successfully.");

        return res.json({
            reply: reply.trim(),
            model: MODEL,
            status: "success"
        });

    } catch (error) {
        const status = getErrorStatus(error);

        console.error("Smile AI request failed:", error.message);

        if (status === 429) {
            return res.status(429).json({
                error: "Gemini's request quota or rate limit has been reached. Check your free-tier usage and try again when available."
            });
        }

        if (status === 404) {
            return res.status(502).json({
                error: "The configured Gemini model was not found. Check the model name in server.js."
            });
        }

        if (status === 401 || status === 403) {
            return res.status(502).json({
                error: "Google rejected the API key or access to this model. Check your Gemini API key and permissions."
            });
        }

        if ([500, 502, 503, 504].includes(status)) {
            return res.status(503).json({
                error: "Gemini is temporarily unavailable. Please try again shortly."
            });
        }

        return res.status(500).json({
            error: "Smile AI encountered a server error. Check the Render logs."
        });
    }
});

// Unknown routes.
app.use((req, res) => {
    res.status(404).json({
        error: "Route not found."
    });
});

// Start server.
app.listen(PORT, "0.0.0.0", () => {
    console.log("Smile AI is running on port " + PORT);
    console.log("Model: " + MODEL);
    console.log("Gemini API configured: " + Boolean(API_KEY));
});
