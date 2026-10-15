// ==========================================
// SMILE AI — AUTHENTICATION + CHAT
// ==========================================

const SUPABASE_URL = window.SMILE_SUPABASE_URL;
const SUPABASE_KEY = window.SMILE_SUPABASE_KEY;
const BACKEND_URL = "https://smile-ai-1.onrender.com/chat";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

// ==========================================
// PAGE ELEMENTS
// ==========================================

const authPanel = document.getElementById("authPanel");
const appPanel = document.getElementById("appPanel");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const signupButton = document.getElementById("signupButton");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");

const authMessage = document.getElementById("authMessage");
const chat = document.getElementById("chat");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const statusText = document.getElementById("status");

let currentUser = null;
let conversationId = null;
let sendingMessage = false;

// ==========================================
// AUTHENTICATION HELPERS
// ==========================================

function showAuth(message = "") {
    authPanel.classList.remove("hidden");
    appPanel.classList.add("hidden");
    authMessage.textContent = message;
}

function showApp(user) {
    currentUser = user;

    authPanel.classList.add("hidden");
    appPanel.classList.remove("hidden");

    authMessage.textContent = "";
    statusText.textContent = "🟢 Online";

    // Keep each account's conversation separate on this device.
    conversationId = localStorage.getItem(
        "smileConversationId_" + user.id
    );

    loadLocalMessages();

    messageInput.focus();
}

function setAuthButtonsDisabled(disabled) {
    signupButton.disabled = disabled;
    loginButton.disabled = disabled;

    signupButton.style.opacity = disabled ? "0.6" : "1";
    loginButton.style.opacity = disabled ? "0.6" : "1";
}

// ==========================================
// SIGN UP
// ==========================================

signupButton.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        authMessage.textContent =
            "Enter your email address and password.";
        return;
    }

    if (password.length < 6) {
        authMessage.textContent =
            "Your password must contain at least 6 characters.";
        return;
    }

    setAuthButtonsDisabled(true);
    authMessage.textContent = "Creating your account...";

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password
        });

        if (error) {
            throw error;
        }

        if (data.session && data.user) {
            showApp(data.user);
            addMessage(
                "assistant",
                "Welcome to Smile AI! ❤️ Your account is ready. Let's chat!"
            );
        } else {
            authMessage.textContent =
                "Account created! Check your email for the confirmation link, " +
                "then return here and log in.";
        }
    } catch (error) {
        authMessage.textContent =
            error.message || "Couldn't create your account. Try again.";
    } finally {
        setAuthButtonsDisabled(false);
    }
});

// ==========================================
// LOG IN
// ==========================================

loginButton.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        authMessage.textContent =
            "Enter your email address and password.";
        return;
    }

    setAuthButtonsDisabled(true);
    authMessage.textContent = "Logging in...";

    try {
        const { data, error } =
            await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

        if (error) {
            throw error;
        }

        showApp(data.user);
    } catch (error) {
        authMessage.textContent =
            error.message || "Login failed. Check your details.";
    } finally {
        setAuthButtonsDisabled(false);
    }
});

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
        "message " + (role === "user" ? "user" : "assistant");

    const content = document.createElement("div");
    content.textContent = text;

    const timestamp = document.createElement("span");
    timestamp.className = "time";
    timestamp.textContent = new Date().toLocaleTimeString([], {
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

function showTyping() {
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
        console.error("Couldn't save local chat:", error);
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
        console.error("Couldn't load local chat:", error);

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

    if (!text) {
        return;
    }

    sendingMessage = true;
    sendButton.disabled = true;
    messageInput.disabled = true;

    addMessage("user", text);
    messageInput.value = "";

    showTyping();
    statusText.textContent = "Thinking...";

    try {
        // Get the latest authenticated session.
        const {
            data: { session },
            error: sessionError
        } = await supabaseClient.auth.getSession();

        if (sessionError) {
            throw sessionError;
        }

        if (!session) {
            throw new Error("Your session expired. Please log in again.");
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
            throw new Error("Smile AI returned an empty response.");
        }

        // Remember the database conversation ID.
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
            "Sorry 😭 I couldn't complete that request. " +
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
// CHECK EXISTING LOGIN SESSION
// ==========================================

async function startSmileAI() {
    if (
        !SUPABASE_URL ||
        !SUPABASE_KEY ||
        SUPABASE_KEY === "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE"
    ) {
        showAuth(
            "Supabase setup is incomplete. Check your publishable key in index.html."
        );
        return;
    }

    try {
        const { data, error } =
            await supabaseClient.auth.getSession();

        if (error) {
            throw error;
        }

        if (data.session && data.session.user) {
            showApp(data.session.user);
        } else {
            showAuth();
        }
    } catch (error) {
        console.error("Session error:", error);

        showAuth(
            "Couldn't check your login session. Refresh the page and try again."
        );
    }
}

// Listen for login changes and session expiration.
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
        showApp(session.user);
    } else if (event === "SIGNED_OUT") {
        currentUser = null;
        conversationId = null;
        showAuth();
    }
});

// Start Smile AI.
startSmileAI();
