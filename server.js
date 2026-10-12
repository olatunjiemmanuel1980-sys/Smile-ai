const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;

// Both models have remaining quota according to your dashboard.
const MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite"
];

const SYSTEM_PROMPT = `
You are Smile AI, the user's friendly AI companion.

PERSONALITY:
- Be friendly, funny, intelligent, and helpful.
- Understand Nigerian English and Pidgin.
- Use emojis naturally.
- Answer questions directly.
- Explain difficult things in simple language.

CURRENT DATE:
Use the current date and time provided in each request.
The date is generated automatically using the Africa/Lagos timezone.
Never claim that the current year is 2025 when the supplied date says otherwise.

LIVE INTERNET SEARCH:
- Use Google Search whenever current information would help.
- Search for current football results, transfers, news, technology,
  gaming, celebrities, prices, and other recent developments.
- Search when the user explicitly asks you to check something.
- Never invent search results or pretend you searched when you did not.
- If a search fails, honestly explain that current information
  could not be verified.

MEMORY:
- Use the personal memories and conversation history provided.
- Remember that the user's favourite footballer is Mohamed Salah.
- Remember that the user's favourite football club is Liverpool.
- Do not claim to remember information that is not available.

FOOTBALL:
- Give accurate information about teams, players, competitions,
  tactics, results, transfers, and football history.
- Check current information when asked about recent events.
- Never invent fixtures or live scores.

IMPORTANT:
- Never reveal API keys or server secrets.
- Never claim that you completed an internet search if you did not.
`;

function getCurrentDate() {
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

    return history.slice(-15).map((item) => {
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
            "";

        if (typeof content !== "string" || !content.trim()) {
            return "";
        }

        return `${role}: ${content.trim()}`;
    }).filter(Boolean).join("\n");
}

app.get("/", (req, res) => {
    res.json({
        name: "Smile AI",
        status: "online"
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "Smile AI",
        models: MODELS,
        configured: Boolean(API_KEY),
        liveSearch: true
    });
});

async function askGemini(model, input) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 45000);

    try {
        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/interactions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": API_KEY
                },
                body: JSON.stringify({
                    model: model,
                    input: input,
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

        const data = await response.json();

        return {
            ok: response.ok,
            status: response.status,
            data: data
        };

    } finally {
        clearTimeout(timeout);
    }
}

app.post("/chat", async (req, res) => {
    if (!API_KEY) {
        return res.status(500).json({
            reply: "My AI brain is missing its API key. Please check the server settings."
        });
    }

    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({
            reply: "Oya, send me a message first! 😂"
        });
    }

    const history = formatHistory(req.body?.history);

    const input = `
CURRENT DATE AND TIME IN NIGERIA:
${getCurrentDate()}

IMPORTANT PERSONAL MEMORIES:
- Favourite footballer: Mohamed Salah.
- Favourite football club: Liverpool.

RECENT CONVERSATION:
${history || "No previous conversation provided."}

NEW MESSAGE:
${message.trim()}

Answer the new message using the relevant context.
Use Google Search for current information when needed.
`;

    for (const model of MODELS) {
        try {
            console.log(`Trying model: ${model}`);

            const result = await askGemini(model, input);

            if (result.ok) {
                const data = result.data;

                const reply =
                    data.output_text ||
                    data.outputText ||
                    "";

                if (reply.trim()) {
                    console.log(`Success using ${model}`);

                    return res.json({
                        reply: reply.trim(),
                        model: model
                    });
                }

                console.error(
                    "Empty response:",
                    JSON.stringify(data)
                );

                continue;
            }

            console.error(
                `Gemini error from ${model}:`,
                result.status,
                JSON.stringify(result.data)
            );

            // Try the next model when quota is exhausted
            // or the current model is temporarily unavailable.
            if (
                result.status === 429 ||
                result.status === 503
            ) {
                continue;
            }

            return res.status(502).json({
                reply:
                    "My AI service returned an error. " +
                    "Please check the server logs."
            });

        } catch (error) {
            console.error(
                `Request failed for ${model}:`,
                error.message
            );

            if (error.name === "AbortError") {
                continue;
            }
        }
    }

    return res.status(503).json({
        reply:
            "Both AI models are temporarily unavailable or have " +
            "reached their limits. Please try again later."
    });
});

app.listen(PORT, () => {
    console.log(`Smile AI running on port ${PORT}`);
    console.log("Primary model:", MODELS[0]);
    console.log("Fallback model:", MODELS[1]);
    console.log("Google Search enabled in requests");
});
