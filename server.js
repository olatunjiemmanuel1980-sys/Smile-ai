const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Gemini model with Google Search grounding
const MODEL = "gemini-3.8-flash";

const SYSTEM_PROMPT = `
You are Smile AI, a friendly, intelligent, funny and helpful AI assistant.

YOUR PERSONALITY:
- Be friendly, natural, and conversational.
- You may use emojis when appropriate.
- Understand Nigerian English and Nigerian Pidgin.
- Match the user's tone.
- Explain difficult things simply.
- Be honest when you do not know something.

CURRENT INFORMATION:
- Use the current date and time supplied with each request.
- The current year is determined by that date, not your training data.
- Never assume that your training data represents today's information.
- Search the internet when current information would improve your answer.
- Search when asked about recent events, football, scores, transfers,
  celebrities, technology, games, prices, weather, or breaking news.
- Search for other topics too whenever useful.
- Do not invent search results, scores, news, dates, or facts.
- Clearly say when information cannot be verified.
- Distinguish old information from current information.

CONVERSATION:
- Pay attention to the conversation history provided by the server.
- Remember facts stated earlier in the available conversation.
- Do not claim to remember information that is not available.
- Answer the user's actual question directly.

FOOTBALL:
- Treat football questions seriously.
- Use current information for recent matches, standings, transfers,
  injuries, and team news when available.
- Never invent live scores.

PRIVACY AND SECURITY:
- Never reveal API keys or server secrets.
- Do not claim you performed an action that you did not perform.
`;

function getNigeriaDateTime() {
    return new Intl.DateTimeFormat("en-NG", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Africa/Lagos"
    }).format(new Date());
}

function formatHistory(history) {
    if (!Array.isArray(history)) {
        return "";
    }

    return history
        .slice(-15)
        .map((item) => {
            const role =
                item.role === "assistant" ||
                item.role === "model" ||
                item.sender === "assistant"
                    ? "Smile AI"
                    : "User";

            const content =
                item.content ??
                item.text ??
                item.message ??
                item.parts?.[0]?.text ??
                "";

            if (typeof content !== "string" || !content.trim()) {
                return "";
            }

            return `${role}: ${content.trim()}`;
        })
        .filter(Boolean)
        .join("\n");
}

app.get("/", (req, res) => {
    res.json({
        name: "Smile AI",
        status: "online",
        message: "Your AI friend is online."
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "Smile AI",
        model: MODEL,
        configured: Boolean(GEMINI_API_KEY),
        liveSearch: true
    });
});

app.post("/chat", async (req, res) => {
    try {
        if (!GEMINI_API_KEY) {
            return res.status(500).json({
                reply:
                    "My brain isn't connected yet 😭. " +
                    "Please check the GEMINI_API_KEY setting on the server."
            });
        }

        const message = req.body?.message;
        const history = req.body?.history;

        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                reply: "Oya, send me a message first 😅❤️"
            });
        }

        const dateTime = getNigeriaDateTime();
        const conversationHistory = formatHistory(history);

        const input = `
CURRENT DATE AND TIME IN NIGERIA:
${dateTime}

PREVIOUS CONVERSATION:
${conversationHistory || "No previous conversation supplied."}

NEW USER MESSAGE:
${message.trim()}

Respond naturally to the new user message.
Use Google Search when current information would help.
`;

        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, 55000);

        let response;

        try {
            response = await fetch(
                "https://generativelanguage.googleapis.com/v1beta/interactions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": GEMINI_API_KEY
                    },
                    body: JSON.stringify({
                        model: MODEL,
                        input,
                        system_instruction: SYSTEM_PROMPT,
                        tools: [
                            {
                                type: "google_search"
                            }
                        ],
                        store: false
                    }),
                    signal: controller.signal
                }
            );
        } finally {
            clearTimeout(timeout);
        }

        const data = await response.json();

        if (!response.ok) {
            console.error(
                "Gemini API error:",
                response.status,
                JSON.stringify(data)
            );

            if (response.status === 400) {
                return res.status(502).json({
                    reply:
                        "My live-search brain hit an API configuration " +
                        "problem 😭. Check the Render logs for the exact error."
                });
            }

            if (response.status === 401 || response.status === 403) {
                return res.status(502).json({
                    reply:
                        "I can't access my AI brain right now 🔑. " +
                        "The API key or search permissions may need fixing."
                });
            }

            if (response.status === 429) {
                return res.status(503).json({
                    reply:
                        "Too many requests or my free API limit has been " +
                        "reached 😭. Please try again later."
                });
            }

            return res.status(502).json({
                reply:
                    "My AI service is having a problem right now 😕. " +
                    "Please try again shortly."
            });
        }

        const reply =
            data.output_text ||
            data.outputText ||
            "";

        if (!reply.trim()) {
            console.error(
                "Gemini returned no output text:",
                JSON.stringify(data)
            );

            return res.status(502).json({
                reply:
                    "I received an empty response from my AI brain 😭. " +
                    "Please send your message again."
            });
        }

        return res.json({
            reply: reply.trim(),
            model: MODEL
        });

    } catch (error) {
        console.error("Chat error:", error);

        if (error.name === "AbortError") {
            return res.status(504).json({
                reply:
                    "That request took too long 😭. " +
                    "Please try asking again."
            });
        }

        return res.status(500).json({
            reply:
                "Something went wrong while I was thinking 😕. " +
                "Please try again."
        });
    }
});

app.listen(PORT, () => {
    console.log(`Smile AI is running on port ${PORT}`);
    console.log(`Model: ${MODEL}`);
    console.log(`Google Search grounding enabled`);
});
