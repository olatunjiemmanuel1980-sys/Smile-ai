// ==========================================
// SMILE AI — COMPLETE FRONTEND
// Google Login + Chat History + Web Search
// Conversation Context + Clickable Sources
// ==========================================

const SUPABASE_URL = window.SMILE_SUPABASE_URL;
const SUPABASE_KEY = window.SMILE_SUPABASE_KEY;

const BACKEND_URL = "https://smile-ai-1.onrender.com/chat";

// ==========================================
// HTML ELEMENTS
// ==========================================

const authPanel = document.getElementById("authPanel");
const appPanel = document.getElementById("appPanel");
const googleLoginButton = document.getElementById("googleLoginButton");
const logoutButton = document.getElementById("logoutButton");
const authMessage = document.getElementById("authMessage");
const chat = document.getElementById("chat");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const statusText = document.getElementById("status");

// ==========================================
// APP STATE
// ==========================================

let currentUser = null;
let conversationId = null;
let sendingMessage = false;

// Keep recent conversation context in memory.
let conversationHistory = [];

// ==========================================
// CHECK CONFIGURATION
// ==========================================

if (
  !window.supabase ||
  !SUPABASE_URL ||
  !SUPABASE_KEY
) {
  if (authMessage) {
    authMessage.textContent =
      "Smile AI setup is incomplete. Check your Supabase configuration.";
  }

  if (googleLoginButton) {
    googleLoginButton.disabled = true;
  }

  throw new Error("Supabase configuration is missing.");
}

if (
  !authPanel ||
  !appPanel ||
  !googleLoginButton ||
  !logoutButton ||
  !authMessage ||
  !chat ||
  !chatForm ||
  !messageInput ||
  !sendButton ||
  !statusText
) {
  throw new Error(
    "Smile AI HTML elements are missing. Check index.html."
  );
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// ==========================================
// GENERAL HELPERS
// ==========================================

function setStatus(message) {
  statusText.textContent = message;
}

function getHistoryKey() {
  return currentUser
    ? "smileConversation_" + currentUser.id
    : null;
}

function getConversationIdKey() {
  return currentUser
    ? "smileConversationId_" + currentUser.id
    : null;
}

function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

// ==========================================
// WEB SEARCH DETECTION
// ==========================================

function shouldRequestWebSearch(text) {
  const message = String(text || "").toLowerCase();

  const currentInformationPattern =
    /\b(latest|today|yesterday|yesterday's|last night|last week|this morning|this afternoon|tonight|tomorrow|current|currently|recent|recently|news|now|2026|2025|live|score|scores|result|results|weather|price|prices|president|coach|manager|transfer|transfers|standings|table|fixtures|schedule|who won|this season|breaking|update|updates|trending|trend|viral|search|browse|internet|online|web|look up|find online|research|fact check|verify|source|sources|what happened|release date|election|exchange rate|newest|announced|announcement|rumour|rumor|injury|injuries|lineup|line-up|starting eleven|kickoff|kick-off|match results|football results|current score|final score)\b/i;

  const eventPattern =
    /\b(what did .+ play|who did .+ play|who is .+ playing|when does .+ play|when is .+ playing|did .+ win|has .+ won|has .+ signed|is .+ injured|who scored|who is the coach|who is the manager|who is the president|what is happening|what's happening|what is going on|what's going on|any news about|tell me the latest about|who are they playing|what was the score)\b/i;

  const footballPattern =
    /\b(football|soccer|premier league|champions league|liverpool|man city|manchester city|man united|manchester united|arsenal|chelsea|tottenham|real madrid|barcelona|bayern|psg|messi|ronaldo|salah|haaland|mbappe|epl|ucl|footballer|striker|goalkeeper|football club)\b/i;

  return (
    currentInformationPattern.test(message) ||
    eventPattern.test(message) ||
    footballPattern.test(message)
  );
}

// ==========================================
// SAFE CLICKABLE LINKS
// ==========================================

function renderMessageContent(container, text) {
  container.replaceChildren();

  const sourceText = String(text || "");

  // Supports Markdown links and ordinary web URLs.
  const pattern =
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"']+)/gi;

  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(sourceText)) !== null) {
    container.appendChild(
      document.createTextNode(
        sourceText.slice(lastIndex, match.index)
      )
    );

    const label = match[1] || "";
    const rawUrl = match[2] || match[3];

    const trailingMatch = rawUrl.match(/[),.!?;:]+$/);

    const trailing = trailingMatch
      ? trailingMatch[0]
      : "";

    const url = trailing
      ? rawUrl.slice(0, -trailing.length)
      : rawUrl;

    try {
      const parsedUrl = new URL(url);

      if (
        parsedUrl.protocol === "https:" ||
        parsedUrl.protocol === "http:"
      ) {
        const link = document.createElement("a");

        link.href = parsedUrl.href;
        link.textContent = label || url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        link.style.color = "#66b3ff";
        link.style.textDecoration = "underline";
        link.style.overflowWrap = "anywhere";
        link.style.cursor = "pointer";

        container.appendChild(link);
      } else {
        container.appendChild(
          document.createTextNode(label || url)
        );
      }
    } catch {
      container.appendChild(
        document.createTextNode(label || url)
      );
    }

    if (trailing) {
      container.appendChild(
        document.createTextNode(trailing)
      );
    }

    lastIndex = match.index + match[0].length;
  }

  container.appendChild(
    document.createTextNode(
      sourceText.slice(lastIndex)
    )
  );

  container.style.whiteSpace = "pre-wrap";
  container.style.overflowWrap = "anywhere";
}

// ==========================================
// LOGIN SCREEN
// ==========================================

function showAuth(message = "") {
  authPanel.classList.remove("hidden");
  appPanel.classList.add("hidden");

  authMessage.textContent = message;
  currentUser = null;
  conversationHistory = [];
}

function showApp(user) {
  if (!user) return;

  const isNewUser = currentUser?.id !== user.id;

  currentUser = user;

  authPanel.classList.add("hidden");
  appPanel.classList.remove("hidden");

  setStatus("🟢 Online");

  if (isNewUser) {
    const savedConversationId = getConversationIdKey();

    conversationId = savedConversationId
      ? localStorage.getItem(savedConversationId)
      : null;

    loadLocalMessages();
  }
}

// ==========================================
// GOOGLE LOGIN
// ==========================================

googleLoginButton.addEventListener("click", async () => {
  googleLoginButton.disabled = true;

  authMessage.textContent = "Connecting to Google...";

  try {
    const { error } =
      await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin
        }
      });

    if (error) throw error;
  } catch (error) {
    console.error("Google login error:", error);

    authMessage.textContent =
      error.message ||
      "Google login failed. Please try again.";

    googleLoginButton.disabled = false;
  }
});

// ==========================================
// LOG OUT
// ==========================================

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  setStatus("Logging out...");

  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) throw error;

    currentUser = null;
    conversationId = null;
    conversationHistory = [];

    chat.innerHTML = "";

    showAuth("You've logged out successfully. ❤️");
  } catch (error) {
    console.error("Logout error:", error);

    setStatus("Logout failed. Please try again.");
  } finally {
    logoutButton.disabled = false;
  }
});

// ==========================================
// DISPLAY MESSAGES
// ==========================================

function addMessage(role, text, save = true) {
  const message = document.createElement("div");

  message.className =
    "message " +
    (role === "user" ? "user" : "assistant");

  const content = document.createElement("div");

  renderMessageContent(content, text);

  const timestamp = document.createElement("span");

  timestamp.className = "time";

  timestamp.textContent = new Date().toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );

  message.appendChild(content);
  message.appendChild(timestamp);

  chat.appendChild(message);

  scrollToBottom();

  if (save && currentUser) {
    saveLocalMessage(role, text);
  }
}

// ==========================================
// TYPING INDICATOR
// ==========================================

function showTyping() {
  removeTyping();

  const typing = document.createElement("div");

  typing.id = "smileTyping";
  typing.className = "message assistant";
  typing.textContent = "Smile AI is thinking...";

  chat.appendChild(typing);

  scrollToBottom();
}

function removeTyping() {
  const typing = document.getElementById("smileTyping");

  if (typing) {
    typing.remove();
  }
}

// ==========================================
// SAVE CHAT HISTORY
// ==========================================

function saveLocalMessage(role, text) {
  try {
    const key = getHistoryKey();

    if (!key) return;

    const messages = JSON.parse(
      localStorage.getItem(key) || "[]"
    );

    messages.push({
      role,
      text,
      time: Date.now()
    });

    localStorage.setItem(
      key,
      JSON.stringify(messages.slice(-100))
    );
  } catch (error) {
    console.error("Chat history error:", error);
  }
}

// ==========================================
// LOAD CHAT HISTORY
// ==========================================

function loadLocalMessages() {
  chat.innerHTML = "";
  conversationHistory = [];

  try {
    const key = getHistoryKey();

    if (!key) return;

    const messages = JSON.parse(
      localStorage.getItem(key) || "[]"
    );

    if (!messages.length) {
      addMessage(
        "assistant",
        "Heyyy! ❤️ I'm Smile AI. What are we talking about today?",
        false
      );

      return;
    }

    messages.slice(-100).forEach((item) => {
      if (
        !item ||
        typeof item.text !== "string"
      ) {
        return;
      }

      const role =
        item.role === "user" ? "user" : "assistant";

      addMessage(role, item.text, false);
    });

    conversationHistory = messages
      .filter(
        (item) =>
          item &&
          typeof item.text === "string" &&
          ["user", "assistant"].includes(item.role)
      )
      .slice(-12)
      .map((item) => ({
        role: item.role,
        text: item.text
      }));
  } catch (error) {
    console.error("Couldn't load chat history:", error);

    addMessage(
      "assistant",
      "Heyyy! ❤️ I'm Smile AI. What are we talking about today?",
      false
    );
  }
}

// ==========================================
// PREPARE RECENT CONVERSATION CONTEXT
// ==========================================

function getRecentHistory() {
  return conversationHistory
    .slice(-12)
    .map((item) => ({
      role: item.role,
      text: item.text
    }));
}

// ==========================================
// SEND MESSAGE
// ==========================================

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || sendingMessage) return;

  const text = messageInput.value.trim();

  if (!text) return;

  sendingMessage = true;

  sendButton.disabled = true;
  messageInput.disabled = true;

  // Save and display the user's message.
  addMessage("user", text);

  // Include the current user message in conversation context.
  conversationHistory.push({
    role: "user",
    text
  });

  // Save the history before requesting the response.
  messageInput.value = "";

  showTyping();

  setStatus("Thinking...");

  try {
    const {
      data: { session },
      error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError) throw sessionError;

    if (!session) {
      throw new Error(
        "Your login session expired. Please sign in again."
      );
    }

    // Don't send the current message twice.
    const historyForBackend = conversationHistory
      .slice(0, -1)
      .slice(-12);

    const response = await fetch(BACKEND_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + session.access_token
      },

      body: JSON.stringify({
        message: text,
        conversationId,
        search: shouldRequestWebSearch(text),
        history: historyForBackend
      })
    });

    let result;

    try {
      result = await response.json();
    } catch {
      throw new Error(
        "Smile AI returned an invalid response. Try again."
      );
    }

    if (!response.ok) {
      throw new Error(
        result.error ||
        result.message ||
        "Smile AI couldn't process your message."
      );
    }

    if (!result.reply) {
      throw new Error(
        "Smile AI returned an empty response."
      );
    }

    if (result.conversationId) {
      conversationId = result.conversationId;

      const idKey = getConversationIdKey();

      if (idKey) {
        localStorage.setItem(idKey, conversationId);
      }
    }

    removeTyping();

    addMessage("assistant", result.reply);

    conversationHistory.push({
      role: "assistant",
      text: result.reply
    });

    conversationHistory =
      conversationHistory.slice(-12);

    if (result.searchError && !result.searched) {
      setStatus("🟠 Live search unavailable");
    } else if (result.searched) {
      setStatus("🟢 Web search completed");
    } else {
      setStatus("🟢 Online");
    }
  } catch (error) {
    removeTyping();

    console.error("Smile AI error:", error);

    const errorMessage =
      error.message ||
      "An unexpected error occurred.";

    addMessage(
      "assistant",
      "Sorry 😭 I couldn't complete that request.\n\n" +
      errorMessage +
      "\n\nPlease try again."
    );

    conversationHistory.push({
      role: "assistant",
      text: errorMessage
    });

    conversationHistory =
      conversationHistory.slice(-12);

    setStatus("🟠 Connection issue");
  } finally {
    removeTyping();

    sendingMessage = false;

    sendButton.disabled = false;
    messageInput.disabled = false;

    messageInput.focus();
  }
});

// ==========================================
// CHECK LOGIN SESSION
// ==========================================

async function startSmileAI() {
  try {
    const {
      data,
      error
    } = await supabaseClient.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
      showApp(data.session.user);
    } else {
      showAuth();
    }
  } catch (error) {
    console.error("Session check error:", error);

    showAuth(
      "Couldn't check your login session. Refresh and try again."
    );
  }
}

// ==========================================
// LISTEN FOR LOGIN CHANGES
// ==========================================

supabaseClient.auth.onAuthStateChange(
  (event, session) => {
    if (session?.user) {
      showApp(session.user);
    } else if (event === "SIGNED_OUT") {
      showAuth();
    }
  }
);

// ==========================================
// START SMILE AI
// ==========================================

startSmileAI();
