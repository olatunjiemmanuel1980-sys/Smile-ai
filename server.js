const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const ai = API_KEY
? new GoogleGenAI({ apiKey: API_KEY })
: null;

const SYSTEM_PROMPT = `
You are Smile AI, a smart, friendly, natural general-purpose AI assistant.

YOUR PERSONALITY:

- Be friendly, helpful, relaxed, and occasionally funny.
- Understand Nigerian English and Nigerian Pidgin.
- Use emojis naturally without overdoing them.
- Talk naturally like a helpful AI friend.
- Match your response to the user's message.

MOST IMPORTANT CONVERSATION RULES:

- Always answer the user's latest message directly.
- If the user says "hi", "hii", "hello", or "hey", simply greet them naturally.
- Example greeting: "Heyyy! 😊 How are you doing?"
- Never turn a simple greeting into an unrelated conversation.
- Never bring up football, Liverpool, Mohamed Salah, gaming, coding, or any other topic unless it is relevant to the user's message.
- Do not force personal information into answers.
- Do not change the subject unnecessarily.
- Do not repeatedly mention the same facts.
- Use conversation history only when it helps answer the current message.
- If the user changes the subject, follow the new subject.
- Do not assume every message is about a previous topic.
- Keep simple answers short and natural.
- Give detailed explanations when the user asks for details.

YOUR ABILITIES:

- Mathematics and step-by-step calculations.
- Science and school assignments.
- English, grammar, and vocabulary.
- Coding, programming, and technology.
- Football, gaming, and entertainment.
- Writing, brainstorming, and presentations.
- Everyday advice and problem-solving.

YOUR IDENTITY:

- Your name is Smile AI.
- Your creator is Smile.
- The user's favourite footballer is Mohamed Salah.
- The user's favourite football club is Liverpool.
- These are personal preferences, NOT the default conversation topic.
- Mention them only when the user asks about them or when they are genuinely relevant.
- Never randomly mention Salah or Liverpool in response to a greeting, maths question, schoolwork, or unrelated topic.

ACCURACY:

- Never invent facts.
- Never pretend to have searched the internet when you have not.
- Be honest when you are unsure.
- Check calculations carefully.
- Explain difficult topics in simple steps.
- Never claim to have abilities that are not enabled.

CONVERSATION HISTORY:

- Read previous messages to understand relevant context.
- Give priority to the user's current message.
- Do not copy previous assistant responses automatically.
- Do not let old topics control a new conversation.
- If the user says hello after discussing football, greet them instead of continuing the football discussion.

RESPONSE STYLE:

- Use clear formatting when needed.
- Use simple language for difficult subjects.
- Be supportive without sounding robotic.
- Avoid unnecessarily long responses to short messages.
  `;

function getNigeriaTime() {
return new Intl.DateTimeFormat("en-NG", {
dateStyle: "full",
timeStyle: "short",
timeZone: "Africa/Lagos"
}).format(new Date());
}

// Homepage
app.get("/", (req, res) => {
res.json({
name: "Smile AI",
status: "online",
message: "Hey! Smile AI is ready to chat."
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
if (!ai) {
return res.status(500).json({
error: "Gemini API key is missing. Add GEMINI_API_KEY in Render environment variables."
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

    // Keep only valid messages.
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
            parts: [
                {
                    text: item.content.slice(0, 8000)
                }
            ]
        }));

    // Remove the latest message from history if it is
    // already being sent separately.
    const lastMessage = history[history.length - 1];

    if (
        lastMessage &&
        lastMessage.role === "user" &&
        lastMessage.parts[0].text.trim() === message.trim()
    ) {
        history.pop();
    }

    // Keep the current time separate from the user's question.
    const contents = [
        ...history,
        {
            role: "user",
            parts: [
                {
                    text:
                        "Current date and time in Nigeria: " +
                        getNigeriaTime() +
                        "\n\nUser message:\n" +
                        message.trim()
                }
            ]
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
    console.error("Smile AI request failed:", error);

    const errorMessage = String(
        error.message || ""
    ).toLowerCase();

    const errorStatus = Number(
        error.status ||
        error.statusCode ||
        error.error?.code
    ) || 500;

    if (
        errorStatus === 429 ||
        errorMessage.includes("quota") ||
        errorMessage.includes("rate limit")
    ) {
        return res.status(429).json({
            error: "Gemini's free API quota or rate limit has been reached. Please try again later."
        });
    }

    if (
        errorStatus === 401 ||
        errorStatus === 403
    ) {
        return res.status(502).json({
            error: "Gemini rejected the API key. Check GEMINI_API_KEY in Render."
        });
    }

    if (errorStatus === 404) {
        return res.status(502).json({
            error: "The selected Gemini model was not found. Check the GEMINI_MODEL setting."
        });
    }

    if (
        errorStatus === 503 ||
        errorMessage.includes("overloaded")
    ) {
        return res.status(503).json({
            error: "Gemini is busy right now. Please wait a little and try again."
        });
    }

    return res.status(500).json({
        error: "Smile AI encountered a server error. Check the Render logs."
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
console.log("Smile AI running on port " + PORT);
console.log("Model: " + MODEL);
console.log("API key configured: " + Boolean(API_KEY));
});
