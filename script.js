// ==========================================
// SMILE AI — GOOGLE LOGIN + CHAT
// ==========================================

const SUPABASE_URL = window.SMILE_SUPABASE_URL;
const SUPABASE_KEY = window.SMILE_SUPABASE_KEY;

const BACKEND_URL =
  "https://smile-ai-1.onrender.com/chat";

const authPanel = document.getElementById("authPanel");
const appPanel = document.getElementById("appPanel");

const googleLoginButton =
  document.getElementById("googleLoginButton");

const logoutButton =
  document.getElementById("logoutButton");

const authMessage =
  document.getElementById("authMessage");

const chat = document.getElementById("chat");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const statusText = document.getElementById("status");

let currentUser = null;
let conversationId = null;
let sendingMessage = false;
let lastLoadedUserId = null;

// ==========================================
// CHECK CONFIGURATION
// ==========================================

if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) {
  authMessage.textContent =
    "Smile AI setup is incomplete. Check the Supabase configuration.";

  googleLoginButton.disabled = true;

  throw new Error("Supabase configuration is missing.");
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// ==========================================
// SHOW LOGIN
// ==========================================

function showAuth(message = "") {
  authPanel.classList.remove("hidden");
  appPanel.classList.add("hidden");

  authMessage.textContent = message;

  currentUser = null;
  lastLoadedUserId = null;
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

    if (error) {
      throw error;
    }

  } catch (error) {
    console.error("Google login error:", error);

    authMessage.textContent =
      error.message ||
      "Google login failed. Please try again.";

    googleLoginButton.disabled = false;
  }
});

// ==========================================
// SHOW CHAT
// ==========================================

function showApp(user) {
  if (!user) return;

  const isNewUser = currentUser?.id !== user.id;

  currentUser = user;

  authPanel.classList.add("hidden");
  appPanel.classList.remove("hidden");

  statusText.textContent = "🟢 Online";

  if (isNewUser) {
    conversationId = localStorage.getItem(
      "smileConversationId_" + user.id
    );

    loadLocalMessages();
  }

  lastLoadedUserId = user.id;
}

// ==========================================
// LOG OUT
// ==========================================

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  statusText.textContent = "Logging out...";

  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      throw error;
    }

    currentUser = null;
    conversationId = null;

    showAuth("You've logged out successfully. ❤️");

  } catch (error) {
    console.error("Logout error:", error);

    statusText.textContent =
      "Logout failed: " + error.message;

  } finally {
    logoutButton.disabled = false;
  }
});

// ==========================================
// CHAT DISPLAY
// ==========================================

function addMessage(role, text, save = true) {
  const message = document.createElement("div");

  message.className =
    "message " +
    (role === "user" ? "user" : "assistant");

  const content = document.createElement("div");
  content.textContent = text;

  const timestamp = document.createElement("span");

  timestamp.className = "time";

  timestamp.textContent =
    new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

  message.appendChild(content);
  message.appendChild(timestamp);

  chat.appendChild(message);

  chat.scrollTop = chat.scrollHeight;

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

  chat.scrollTop = chat.scrollHeight;
}

function removeTyping() {
  const typing = document.getElementById("smileTyping");

  if (typing) {
    typing.remove();
  }
}

// ==========================================
// LOCAL CHAT HISTORY
// ==========================================

function historyKey() {
  return currentUser
    ? "smileConversation_" + currentUser.id
    : null;
}

function saveLocalMessage(role, text) {
  try {
    const key = historyKey();

    if (!key) return;

    const messages = JSON.parse(
      localStorage.getItem(key) || "[]"
    );

    messages.push({
      role: role,
      text: text,
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

function loadLocalMessages() {
  chat.innerHTML = "";

  try {
    const key = historyKey();

    if (!key) return;

    const messages = JSON.parse(
      localStorage.getItem(key) || "[]"
    );

    if (messages.length === 0) {
      addMessage(
        "assistant",
        "Heyyy! ❤️ I'm Smile AI. What are we talking about today?",
        false
      );

      return;
    }

    messages.slice(-100).forEach((item) => {
      addMessage(item.role, item.text, false);
    });

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
// SEND MESSAGE TO SMILE AI
// ==========================================

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || sendingMessage) {
    return;
  }

  const text = messageInput.value.trim();

  if (!text) return;

  sendingMessage = true;

  sendButton.disabled = true;
  messageInput.disabled = true;

  addMessage("user", text);

  messageInput.value = "";

  showTyping();

  statusText.textContent = "Thinking...";

  try {
    const {
      data: { session },
      error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!session) {
      throw new Error(
        "Your login session expired. Please sign in again."
      );
    }

    const response = await fetch(BACKEND_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + session.access_token
      },

      body: JSON.stringify({
        message: text,
        conversationId: conversationId
      })
    });

    const result = await response.json();

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

      localStorage.setItem(
        "smileConversationId_" + currentUser.id,
        conversationId
      );
    }

    removeTyping();

    addMessage("assistant", result.reply);

    statusText.textContent = "🟢 Online";

  } catch (error) {
    removeTyping();

    console.error("Smile AI error:", error);

    addMessage(
      "assistant",
      "Sorry 😭 I couldn't complete that request.\n\n" +
      error.message +
      "\n\nPlease try again."
    );

    statusText.textContent = "Connection issue";

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
    const { data, error } =
      await supabaseClient.auth.getSession();

    if (error) {
      throw error;
    }

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
