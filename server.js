const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;

const MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite"
];

const SYSTEM_PROMPT = `
You are Smile AI, a friendly, intelligent and funny AI companion.

PERSONALITY:
- Be friendly, natural, and helpful.
- Understand Nigerian English and Pidgin.
- Use emojis naturally.
- Match the user's tone.
- Explain difficult things simply.
- Answer the actual question directly.

CURRENT DATE:
- Use the current date supplied with each request.
- The date is generated using the Africa/Lagos timezone.
- Never pretend the current year is 2025 when the supplied date
  says otherwise.

LIVE INTERNET:
- Use Google Search when current information would help.
- Search for current news, football, transfers, technology,
  games, celebrities, prices and other relevant topics.
- When asked to check something current, try to search.
- Never invent search results, live scores or recent events.
- Be honest if live information cannot be verified.

PERSONAL MEMORIES:
- The user's favourite footballer is Mohamed Salah.
- The user's favourite football club is Liverpool.
- Use these memories when relevant.
- Do not claim to remember other facts unless they are provided.

FOOTBALL:
- Explain teams, tactics, competitions and football history.
- Check current information for recent results and transfers.
- Never invent fixtures or live scores.

PRIVACY:
- Never reveal API keys or server secrets.
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
            if (!item || typeof item !== "object") {
                return "";
            }

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

            if (
                typeof content !== "string" ||
                !content.trim()
            ) {
                return "";
            }

            return `${role}: ${content.trim()}`;
        })
        .filter(Boolean)
        .join("\n");
}

/*
 * IMPORTANT FIX:
 * The Interactions API returns text inside
 * steps[].content[].text, not necessarily output_text.
 */
function extractReply(data) {
    if (typeof data?.output_text === "string") {
        return data.output_text.trim();
    }

    if (typeof data?.outputText === "string") {
        return data.outputText.trim();
    }

    if (!Array.isArray(data?.steps)) {
        return "";
    }

    return data.steps
        .filter((step) => step.type === "model_output")
        .flatMap((step) =>
            Array.isArray(step.content)
                ? step.content
                : []
        )
        .filter(
            (part) =>
                part.type === "text" &&
                typeof part.text === "string"
        )
        .map((part) => part.text)
        .join("\n")
        .trim();
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
        liveSearch: true,
        responseParsing: "Interactions API steps supported"
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

        const rawText = await response.text();

        let data;

        try {
            data = JSON.parse(rawText);
        } catch {
            data = {
                error: {
                    message: rawText.slice(0, 1000)
                }
            };
        }

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
            reply:
                "My AI brain is missing its API key. " +
                "Check GEMINI_API_KEY in the server settings."
        });
    }

    const message = req.body?.message;

    if (
        typeof message !== "string" ||
        !message.trim()
    ) {
        return res.status(400).json({
            reply: "Oya, send me a message first! 😂"
        });
    }

    const history = formatHistory(req.body?.history);

    const input = `
CURRENT DATE AND TIME IN NIGERIA:
${getNigeriaDateTime()}

IMPORTANT PERSONAL MEMORIES:
- Favourite footballer: Mohamed Salah.
- Favourite football club: Liverpool.

RECENT CONVERSATION:
${history || "No previous conversation provided."}

NEW USER MESSAGE:
${message.trim()}

Respond naturally to the new message.
Use Google Search when current information would help.
Do not invent current facts.
`;

    let lastError = null;

    for (const model of MODELS) {
        try {
            console.log("Trying Gemini model:", model);

            const result = await askGemini(model, input);

            if (!result.ok) {
                lastError = {
                    status: result.status,
                    details: result.data
                };

                console.error(
                    "Gemini API error:",
                    model,
                    result.status,
                    JSON.stringify(result.data)
                );

                if (
                    result.status === 429 ||
                    result.status === 500 ||
                    result.status === 502 ||
                    result.status === 503 ||
                    result.status === 504
                ) {
                    continue;
                }

                return res.status(502).json({
                    reply:
                        "Gemini rejected the request. " +
                        "Check the server logs for the exact reason."
                });
            }

            const reply = extractReply(result.data);

            if (!reply) {
                lastError = {
                    status: 502,
                    details: {
                        message:
                            "The API returned no extractable text.",
                        responseStatus: result.data?.status,
                        stepTypes: Array.isArray(result.data?.steps)
                            ? result.data.steps.map(
                                (step) => step.type
                            )
                            : []
                    }
                };

                console.error(
                    "Could not extract Gemini response:",
                    JSON.stringify(lastError.details)
                );

                continue;
            }

            console.log("Gemini response successful:", model);

            return res.json({
                reply: reply,
                model: model
            });

        } catch (error) {
            lastError = {
                message: error.message
            };

            console.error(
                "Gemini request failed:",
                model,
                error.message
            );
        }
    }

    console.error(
        "All Gemini models failed:",
        JSON.stringify(lastError)
    );

    const lastStatus = lastError?.status;

    if (lastStatus === 429) {
        return res.status(429).json({
            reply:
                "My AI quota has been reached 😭. " +
                "Please wait for the limit to reset."
        });
    }

    return res.status(503).json({
        reply:
            "My AI service is temporarily unavailable 😕. " +
            "Check the server logs for the latest error."
    });
});

app.listen(PORT, () => {
    console.log("Smile AI is running on port", PORT);
    console.log("Primary model:", MODELS[0]);
    console.log("Fallback model:", MODELS[1]);
    console.log("Google Search configured");
});
