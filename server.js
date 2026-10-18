const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");
const { createClient } = require("@supabase/supabase-js");
const { tavily } = require("@tavily/core");

const app = express();
const PORT = process.env.PORT || 10000;

// ==========================================
// CONFIGURATION
// ==========================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// If a Tavily key exists, use it.
// If no key exists, the official SDK can try keyless mode.
const tavilyClient = TAVILY_API_KEY
  ? tavily({ apiKey: TAVILY_API_KEY })
  : tavily();

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "apikey"
    ]
  })
);

app.use(express.json({ limit: "1mb" }));

// ==========================================
// SMILE AI PERSONALITY
// ==========================================

const SYSTEM_INSTRUCTION = `
You are Smile AI, a friendly, intelligent, helpful AI assistant.

PERSONALITY:
- Be friendly, natural, and conversational.
- Explain difficult things in simple language.
- Be funny sometimes, but do not force jokes.
- Nigerian English or Pidgin is welcome when appropriate.
- Do not use too many emojis.
- Do not bring up football unless it is relevant.
- Adapt your answers to the user's question.

CAPABILITIES:
- Help with schoolwork, mathematics, science, coding, writing,
  technology, everyday questions, and general knowledge.
- Show mathematical calculations step by step when requested.
- Help beginners learn programming.
- Use live search results when they are available.
- Answer questions about football, technology, science, news,
  entertainment, and other subjects.
- Be honest when you do not know something.

ACCURACY:
- Never invent facts, search results, sources, or current events.
- For current information, prioritize supplied search results.
- If search results are insufficient, say so clearly.
- Do not claim you searched the web unless a search succeeded.
- Cite relevant sources using the actual URLs supplied.
- Keep answers clear and useful.

IDENTITY:
Your name is Smile AI.
You are the user's AI friend.
`;

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/", (req, res) => {
  res.json({
    name: "Smile AI",
    status: "online"
  });
});

app.get("/health", (req, res) => {
  res.json({
    name: "Smile AI",
    status: "ok",
    model: GEMINI_MODEL,
    geminiConfigured: Boolean(GEMINI_API_KEY),
    supabaseConfigured: Boolean(
      SUPABASE_URL && SUPABASE_ANON_KEY
    ),
    tavilySearchConfigured: true,
    tavilyMode: TAVILY_API_KEY ? "api-key" : "keyless"
  });
});

// ==========================================
// TAVILY LIVE SEARCH
// ==========================================

async function searchWeb(query) {
  try {
    const cleanQuery = String(query || "")
      .trim()
      .slice(0, 400);

    if (!cleanQuery) {
      return {
        available: false,
        answer: "",
        results: [],
        error: "Please provide a search query."
      };
    }

    console.log("Smile AI searching the web:", cleanQuery);

    const data = await tavilyClient.search(cleanQuery, {
      searchDepth: "basic",
      topic: "general",
      maxResults: 5,
      includeAnswer: true
    });

    const results = (data.results || []).map((item) => ({
      title: item.title || "Untitled result",
      url: item.url || "",
      content: item.content || "",
      score: item.score
    }));

    const answer = data.answer || "";

    if (results.length === 0 && !answer) {
      return {
        available: false,
        answer: "",
        results: [],
        error: "The search returned no results."
      };
    }

    console.log(
      `Smile AI search succeeded: ${results.length} results.`
    );

    return {
      available: true,
      answer,
      results,
      error: null
    };
  } catch (error) {
    console.error(
      "Tavily search error:",
      error.message || error
    );

    const message = String(
      error.message || ""
    ).toLowerCase();

    let friendlyError = "Live search is temporarily unavailable.";

    if (
      message.includes("keyless") ||
      message.includes("rate limit") ||
      message.includes("limit reached") ||
      message.includes("429")
    ) {
      friendlyError =
        "Tavily's shared search limit may have been reached. Try again later.";
    } else if (
      message.includes("401") ||
      message.includes("unauthorized") ||
      message.includes("api key")
    ) {
      friendlyError =
        "Tavily rejected the API key. Check the Render environment settings or remove the key to test keyless mode.";
    } else if (
      message.includes("timeout") ||
      message.includes("timed out")
    ) {
      friendlyError = "The live search took too long. Try again.";
    }

    return {
      available: false,
      answer: "",
      results: [],
      error: friendlyError
    };
  }
}

// ==========================================
// DIRECT SEARCH TEST
// ==========================================

app.get("/search-test", async (req, res) => {
  const query =
    typeof req.query.q === "string" && req.query.q.trim()
      ? req.query.q.trim().slice(0, 400)
      : "Liverpool FC current head coach official";

  const result = await searchWeb(query);

  res.status(result.available ? 200 : 502).json({
    ok: result.available,
    query,
    resultCount: result.results.length,
    answer: result.answer || null,
    error: result.error || null,
    results: result.results.map((item) => ({
      title: item.title,
      url: item.url,
      content: item.content
    }))
  });
});

// ==========================================
// CHAT ENDPOINT
// ==========================================

app.post("/chat", async (req, res) => {
  try {
    // --------------------------------------
    // CHECK GEMINI
    // --------------------------------------

    if (!ai) {
      return res.status(503).json({
        error: "Smile AI is not configured yet.",
        details: "Check the GEMINI_API_KEY environment variable."
      });
    }

    const { message, history, search } = req.body || {};

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    if (message.length > 12000) {
      return res.status(413).json({
        error: "Your message is too long. Please shorten it."
      });
    }

    // --------------------------------------
    // VERIFY SUPABASE SESSION
    // --------------------------------------

    const authHeader = req.headers.authorization || "";

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    let authenticatedUser = null;

    if (token) {
      if (!supabase) {
        return res.status(503).json({
          error: "Supabase is not configured on the backend."
        });
      }

      const { data, error } =
        await supabase.auth.getUser(token);

      if (error || !data.user) {
        return res.status(401).json({
          error: "Your session is invalid or expired. Please sign in again."
        });
      }

      authenticatedUser = data.user;
    }

    // --------------------------------------
    // PREPARE CONVERSATION HISTORY
    // --------------------------------------

    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (item) =>
              item &&
              typeof item.text === "string" &&
              ["user", "assistant", "model"].includes(item.role)
          )
          .slice(-12)
          .map((item) => ({
            role:
              item.role === "assistant"
                ? "model"
                : item.role,
            parts: [
              {
                text: item.text.slice(0, 6000)
              }
            ]
          }))
      : [];

    // --------------------------------------
    // DECIDE WHETHER TO SEARCH
    // --------------------------------------

    const currentInformationPattern =
      /\b(latest|today|current|currently|recent|news|now|2026|2025|live|score|results|weather|price|president|coach|manager|transfer|standings|table|fixtures|schedule|who won|this season|breaking|update|updates|search the web|look up|find online|source|sources)\b/i;

    // Keyless mode must also be allowed to attempt a search.
    const shouldSearch =
      search === true ||
      currentInformationPattern.test(message);

    let searchData = {
      available: false,
      answer: "",
      results: [],
      error: null
    };

    if (shouldSearch) {
      searchData = await searchWeb(message);
    }

    // --------------------------------------
    // PREPARE PROMPT
    // --------------------------------------

    let prompt = message.trim();

    if (searchData.available) {
      const searchContext = [
        "LIVE WEB SEARCH RESULTS",
        "",
        searchData.answer
          ? `Search summary: ${searchData.answer}`
          : "",
        ...searchData.results.map(
          (item, index) =>
            `${index + 1}. ${item.title}\n` +
            `URL: ${item.url}\n` +
            `Information: ${item.content}`
        ),
        "",
        "Instructions:",
        "- Answer using the search results.",
        "- Prioritize current and reliable information.",
        "- Cite relevant sources using their exact supplied URLs.",
        "- Never invent a source or URL.",
        "- If sources disagree, explain the disagreement.",
        "- If the results do not answer the question, say so."
      ]
        .filter(Boolean)
        .join("\n");

      prompt =
        `${searchContext}\n\n` +
        `USER QUESTION:\n${message.trim()}`;
    } else if (shouldSearch) {
      prompt =
        "IMPORTANT: A live web search was attempted but failed. " +
        "You do not have verified live search results for this question. " +
        "Do not invent sources, claim you searched successfully, " +
        "or present unverified current facts as confirmed. " +
        "Explain that live search is temporarily unavailable. " +
        "Offer general information only if useful.\n\n" +
        `USER QUESTION:\n${message.trim()}`;
    }

    // --------------------------------------
    // GENERATE GEMINI RESPONSE
    // --------------------------------------

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        ...safeHistory,
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.8,
        maxOutputTokens: 2048
      }
    });

    const reply =
      response.text ||
      "Sorry, I couldn't generate a response. Please try again.";

    // --------------------------------------
    // RETURN RESPONSE
    // --------------------------------------

    return res.json({
      reply,
      model: GEMINI_MODEL,
      searched: Boolean(
        shouldSearch && searchData.available
      ),
      searchResults: searchData.available
        ? searchData.results.map((item) => ({
            title: item.title,
            url: item.url
          }))
        : [],
      searchError: shouldSearch
        ? searchData.error
        : null,
      authenticated: Boolean(authenticatedUser)
    });
  } catch (error) {
    console.error("Smile AI chat error:", error);

    const errorMessage = String(
      error.message || ""
    ).toLowerCase();

    if (
      errorMessage.includes("429") ||
      errorMessage.includes("quota") ||
      errorMessage.includes("resource_exhausted")
    ) {
      return res.status(429).json({
        error: "Smile AI has reached its AI usage limit. Please try again later."
      });
    }

    if (
      errorMessage.includes("503") ||
      errorMessage.includes("overloaded") ||
      errorMessage.includes("temporarily unavailable")
    ) {
      return res.status(503).json({
        error: "Smile AI is temporarily busy. Please try again shortly."
      });
    }

    if (
      errorMessage.includes("api key") ||
      errorMessage.includes("permission denied") ||
      errorMessage.includes("unauthorized")
    ) {
      return res.status(502).json({
        error: "Smile AI could not authenticate with its AI service. Check your Render environment variables."
      });
    }

    return res.status(500).json({
      error: "Something went wrong while Smile AI was responding. Please try again."
    });
  }
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Smile AI is running on port ${PORT}`);
  console.log(`Model: ${GEMINI_MODEL}`);
  console.log(`Gemini configured: ${Boolean(GEMINI_API_KEY)}`);
  console.log(
    `Supabase configured: ${Boolean(
      SUPABASE_URL && SUPABASE_ANON_KEY
    )}`
  );
  console.log(
    `Tavily mode: ${TAVILY_API_KEY ? "API key" : "keyless"}`
  );
});
