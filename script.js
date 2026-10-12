// ==========================================
// SMILE AI — FIXED CHAT SYSTEM
// ==========================================

const BACKEND_URL = "https://smile-ai-1.onrender.com/chat";

const chat = document.getElementById("chat");
const form = document.getElementById("chatForm");
const input = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const statusText = document.getElementById("status");

let conversation = [];
let isSending = false;

// ==========================================
// LOAD SAVED CHAT
// ==========================================

try {
    const saved = localStorage.getItem("smileConversation");

    if (saved) {
        const parsed = JSON.parse(saved);

        if (Array.isArray(parsed)) {
            conversation = parsed.filter(item =>
                item &&
                typeof item.content === "string" &&
                ["user", "assistant", "model"].includes(item.role)
            ).slice(-50);
        }
    }
} catch (error) {
    console.error("Could not load chat:", error);
}

// ==========================================
// DISPLAY MESSAGE
// ==========================================

function addMessage(text, sender) {
    const message = document.createElement("div");

    message.className =
        "message " + (sender === "user" ? "user" : "bot");

    message.appendChild(
        document.createTextNode(String(text))
    );

    const time = document.createElement("span");
    time.className = "time";

    time.textContent = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });

    message.appendChild(time);
    chat.appendChild(message);

    chat.scrollTop = chat.scrollHeight;

    return message;
}

// ==========================================
// SAVE CHAT
// ==========================================

function saveConversation() {
    try {
        localStorage.setItem(
            "smileConversation",
            JSON.stringify(conversation.slice(-50))
        );
    } catch (error) {
        console.error("Could not save chat:", error);
    }
}

// ==========================================
// RESTORE CHAT
// ==========================================

function restoreConversation() {
    if (!conversation.length) return;

    chat.innerHTML = "";

    conversation.forEach(item => {
        const sender =
            item.role === "user" ? "user" : "bot";

        addMessage(item.content, sender);
    });
}

restoreConversation();

// ==========================================
// TYPING INDICATOR
// ==========================================

function showTyping() {
    hideTyping();

    const typing = document.createElement("div");

    typing.id = "smileTyping";
    typing.className = "message bot";
    typing.textContent = "Smile AI is thinking... 💭";

    chat.appendChild(typing);
    chat.scrollTop = chat.scrollHeight;
}

function hideTyping() {
    const typing = document.getElementById("smileTyping");

    if (typing) {
        typing.remove();
    }
}

// ==========================================
// SEND MESSAGE — WITH TIMEOUT
// ==========================================

async function sendMessage(text) {
    text = String(text || "").trim();

    if (!text || isSending) return;

    isSending = true;

    sendButton.disabled = true;
    input.disabled = true;

    // Save the previous conversation before adding this message.
    const previousHistory = conversation
        .slice(-20)
        .map(item => ({
            role: item.role === "assistant" ? "model" : item.role,
            content: item.content
        }));

    // Display the user's message immediately.
    addMessage(text, "user");

    conversation.push({
        role: "user",
        content: text
    });

    saveConversation();

    input.value = "";

    statusText.textContent = "Connecting to Smile AI...";
    showTyping();

    // Stop waiting if the backend takes too long.
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 45000);

    try {
        const response = await fetch(BACKEND_URL, {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                message: text,
                history: previousHistory
            }),

            signal: controller.signal
        });

        const responseText = await response.text();

        let data;

        try {
            data = JSON.parse(responseText);
        } catch {
            throw new Error(
                "The server returned an invalid response."
            );
        }

        if (!response.ok) {
            throw new Error(
                data.error ||
                data.message ||
                "Server error (" + response.status + ")."
            );
        }

        const reply =
            data.reply ||
            data.response ||
            data.text ||
            data.message;

        if (typeof reply !== "string" || !reply.trim()) {
            throw new Error(
                "The server connected, but returned no answer."
            );
        }

        hideTyping();

        addMessage(reply, "bot");

        conversation.push({
            role: "assistant",
            content: reply
        });

        conversation = conversation.slice(-50);

        saveConversation();

        statusText.textContent = "Smile AI is online ✨";

    } catch (error) {
        console.error("Smile AI request failed:", error);

        hideTyping();

        let errorMessage;

        if (error.name === "AbortError") {
            errorMessage =
                "Smile AI took too long to respond. 😕\n\n" +
                "The AI server may be busy. Please try again.";
        } else {
            errorMessage =
                "I couldn't get a reply right now. 😕\n\n" +
                error.message +
                "\n\nPlease try again.";
        }

        addMessage(errorMessage, "bot");

        statusText.textContent = "Connection problem — try again";

    } finally {
        clearTimeout(timeout);

        hideTyping();

        isSending = false;

        sendButton.disabled = false;
        input.disabled = false;

        input.focus();

        chat.scrollTop = chat.scrollHeight;
    }
}

// ==========================================
// FORM SUBMISSION
// ==========================================

form.addEventListener("submit", function(event) {
    event.preventDefault();
    sendMessage(input.value);
});

// ==========================================
// SUGGESTION BUTTONS
// ==========================================

function askSuggestion(text) {
    sendMessage(text);
}

window.askSuggestion = askSuggestion;

console.log("Smile AI chat system loaded successfully!");
