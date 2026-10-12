const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;

// CORRECT MODEL DECLARATION
const MODEL = "gemini-3.5-flash-lite";

const ai = API_KEY
    ? new GoogleGenAI({ apiKey: API_KEY })
    : null;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const SYSTEM_PROMPT = `
You are Smile AI, a friendly, intelligent, funny and helpful AI assistant.

PERSONALITY:
- Be warm, natural and conversational.
- Use emojis naturally.
- Understand Nigerian English and Nigerian Pidgin.
- Explain schoolwork clearly.
- Give useful and direct answers.
- Be honest when you do not know something.
- Never pretend to perform actions you cannot perform.

IDENTITY:
- Your name is Smile AI.
- Your creator is Smile.
- You are an AI assistant that helps people learn, chat and solve problems.

CONVERSATION:
- Pay attention to the conversation history.
- Remember context from earlier messages in the current conversation.
- Answer the latest message directly.
- Keep simple answers concise.
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

// Retry temporary errors only once to reduce waiting time.
async function generateReply(contents) {
    try {
        return await ai.models.generateContent({
            model: MODEL,
            contents,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.7,
                maxOutputTokens: 1024
            }
        });
    } catch (error) {
        const status = getStatus(error);

        console.error(
            "Gemini request failed:",
            error.message
        );

        if (![408, 429, 500, 502, 503, 504].includes(status)) {
            throw error;
        }

        console.log("Retrying Gemini request once...");

        await sleep(1200);

        return await ai.models.generateContent({
            model: MODEL,
            contents,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.7,
                maxOutputTokens: 1024
            }
        });
    }
}

// Service status
app.get("/", (req, res) => {
    res.json({
        name: "Smile AI",
        status: "online",
        model: MODEL
    });
});

// Health check
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "Smile AI",
        model: MODEL,
        configured: Boolean(API_KEY)
    });
});

// Chat endpoint
app.post("/chat", async (req, res) => {
    try {
        if (!ai) {
            return res.status(500).json({
                error: "Gemini API key is missing on the server."
            });
        }

        const message = req.body?.message;

        if (
            typeof message !== "string" ||
            !message.trim()
        ) {
            return res.status(400).json({
                error: "Please enter a message."
            });
        }

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

        // Prevent sending the current message twice.
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
                    text: message.trim()
                }]
            }
        ];

        const result = await generateReply(contents);
        const reply = result.text;

        if (
            typeof reply !== "string" ||
            !reply.trim()
        ) {
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
        console.error(
            "Smile AI chat error:",
            error.message
        );

        const status = getStatus(error);

        if ([429, 503, 504].includes(status)) {
            return res.status(503).json({
                error: "Smile AI is temporarily busy. Please try again shortly."
            });
        }

        if (status === 404) {
            return res.status(502).json({
                error: "The Gemini model is unavailable. Check the model name."
            });
        }

        return res.status(500).json({
            error: "Smile AI encountered a server error.",
            details: error.message || "Unknown error"
        });
    }
});

// Unknown routes
app.use((req, res) => {
    res.status(404).json({
        error: "Route not found."
    });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Smile AI running on port ${PORT}`);
    console.log(`Model: ${MODEL}`);
    console.log(`Gemini API configured: ${Boolean(API_KEY)}`);
});
