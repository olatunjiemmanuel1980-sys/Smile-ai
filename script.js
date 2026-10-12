"use strict";

/* =========================================
   SMILE AI — FRONTEND JAVASCRIPT
   Backend: Render + Gemini
========================================= */

const BACKEND_URL = "https://smile-ai-1.onrender.com/chat";

const $ = (id) => document.getElementById(id);

const STORAGE = {
    chats: "smileConversation",
    memories: "smileMemories",
    theme: "smileTheme",
    voice: "smileVoiceReplies"
};

let conversation = loadJSON(STORAGE.chats, []);
let memories = loadJSON(STORAGE.memories, {
    name: "",
    favoriteFootballer: "",
    favoriteClub: "",
    favoriteGame: "",
    favoriteColor: ""
});

let isSending = false;
let recognition = null;

function loadJSON(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

function saveData() {
    localStorage.setItem(STORAGE.chats, JSON.stringify(conversation));
    localStorage.setItem(STORAGE.memories, JSON.stringify(memories));
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function getTime() {
    return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}

/* =========================================
   CHAT DISPLAY
========================================= */

function addMessage(role, text, save = true) {
    const messages = $("messages");
    if (!messages) {
        console.error("Smile AI: Could not find #messages in index.html");
        return;
    }

    const empty = $("welcomeScreen");
    if (empty) empty.style.display = "none";

    const message = document.createElement("div");
    message.className = `message ${role}`;

    const label = role === "user" ? "You" : "Smile AI";

    message.innerHTML = `
        <div class="message-avatar">
            ${role === "user" ? "🙂" : "✨"}
        </div>
        <div class="message-content">
            <div class="message-name">${label}</div>
            <div class="message-text">${escapeHTML(text).replace(/\n/g, "<br>")}</div>
            <div class="message-time">${getTime()}</div>
        </div>
    `;

    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;

    if (save) {
        conversation.push({ role, text, time: getTime() });

        // Keep the most recent 100 messages.
        if (conversation.length > 100) {
            conversation = conversation.slice(-100);
        }

        saveData();
    }
}

function showNotice(text) {
    const notice = $("notice");
    if (notice) {
        notice.textContent = text;
        notice.style.display = "block";

        clearTimeout(showNotice.timer);
        showNotice.timer = setTimeout(() => {
            notice.style.display = "none";
        }, 6000);
    } else {
        console.log(text);
    }
}

function showTyping(show) {
    let typing = $("typingIndicator");

    if (!typing && $("messages")) {
        typing = document.createElement("div");
        typing.id = "typingIndicator";
        typing.className = "typing-indicator";
        typing.textContent = "✨ Smile AI is thinking...";
        $("messages").appendChild(typing);
    }

    if (typing) {
        typing.style.display = show ? "block" : "none";

        if (show && $("messages")) {
            $("messages").scrollTop = $("messages").scrollHeight;
        }
    }
}

function renderHistory() {
    const messages = $("messages");
    if (!messages) return;

    messages.innerHTML = "";

    if (conversation.length === 0) {
        const welcome = $("welcomeScreen");
        if (welcome) welcome.style.display = "block";
        return;
    }

    const welcome = $("welcomeScreen");
    if (welcome) welcome.style.display = "none";

    conversation.forEach((item) => {
        addMessage(item.role, item.text, false);
    });
}

/* =========================================
   SEND MESSAGE TO BACKEND
========================================= */

async function sendMessage(text) {
    const input = $("messageInput");

    text = String(text || "").trim();

    if (!text || isSending) return;

    isSending = true;

    const sendButton = $("sendButton");
    if (sendButton) sendButton.disabled = true;

    // Save history BEFORE adding the current message,
    // so the backend doesn't receive the current message twice.
    const previousHistory = conversation
        .slice(-20)
        .map((item) => ({
            role: item.role === "assistant" ? "model" : item.role,
            text: item.text
        }));

    if (input) input.value = "";

    addMessage("user", text);
    showTyping(true);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000);

        let response;

        try {
            response = await fetch(BACKEND_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: text,
                    history: previousHistory,
                    memories: memories
                }),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                data.message ||
                `Server error (${response.status})`
            );
        }

        if (!data.reply ||
