// ======================================
// SMILE AI — COMPLETE CHAT JAVASCRIPT
// ======================================

const BACKEND_URL = "https://smile-ai-1.onrender.com/chat";

const chat = document.getElementById("chat");
const form = document.getElementById("chatForm");
const input = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const statusText = document.getElementById("status");

let conversation = [];
let isSending = false;

// ======================================
// LOAD SAVED CONVERSATION
// ======================================

try {
    const saved = localStorage.getItem("smileConversation");

    if (saved) {
        conversation = JSON.parse(saved);

        if (!Array.isArray(conversation)) {
            conversation = [];
        }
    }
} catch (error) {
    conversation = [];
}

// ======================================
// CREATE A MESSAGE
// ======================================

function addMessage(text, sender) {
    const message = document.createElement("div");

    message.classList.add("message");
    message.classList.add(sender === "user" ? "user" : "bot");

    // Safely display text without interpreting it as HTML.
    message.appendChild(document.createTextNode(String(text)));

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

// ======================================
// SAVE CONVERSATION
// ======================================

function saveConversation() {
    try {
        localStorage.setItem(
            "smileConversation",
            JSON.stringify(conversation.slice(-50))
        );
    } catch (error) {
        console.log("Could not save conversation:", error);
    }
}

// ======================================
// RESTORE MESSAGES
// ======================================

function restoreConversation() {
    if (conversation.length === 0) {
        return;
    }

    // Remove the welcome message when restoring an old chat.
    chat.innerHTML = "";

    conversation.forEach(function (item) {
        if (!item || typeof item.content !== "string") {
            return;
        }

        if (item.role === "user") {
            addMessage(item.content, "user");
        } else if (item.role === "assistant" || item.role === "model") {
            addMessage(item.content, "bot");
        }
    });
}

restoreConversation();

// ======================================
// TYPING INDICATOR
// ======================================

function showTyping() {
    const typing = document.createElement("div");

    typing.className = "message bot";
    typing.id = "smileTyping";
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

// ======================================
// SEND MESSAGE
// ======================================

async function sendMessage(text) {
    text = String(text || "").trim();

    if (!text || isSending) {
        return;
    }

    isSending = true;
    sendButton.disabled = true;
    input.disabled = true;

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

    try {
        const response = await fetch(BACKEND_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: text,
                history: conversation.slice(-20).map(function (item) {
                    return {
                        role: item.role === "assistant" ? "model" : item.role,
                        content: item.content
                    };
                })
            })
        });

        const rawResponse = await response.text();

        let data;

        try {
            data = JSON.parse(rawResponse);
        } catch (error) {
            throw new Error(
                "Smile AI returned an unexpected response. Please try again."
            );
        }

        if (!response.ok) {
            throw new Error(
                data.error ||
                data.message ||
                "Server error: " + response.status
            );
        }

        const reply =
            data.reply ||
            data.response ||
            data.text ||
            data.message;

        if (typeof reply !== "string" || !reply.trim()) {
            throw new Error(
                "The server connected, but Smile AI returned no message."
            );
        }

        hideTyping();

        // Display Smile AI's reply.
        addMessage(reply, "bot");

        conversation.push({
            role: "assistant",
            content: reply
        });

        conversation = conversation.slice(-50);
        saveConversation();

        statusText.textContent = "Smile AI is online ✨";

    } catch (error) {
        hideTyping();

        console.error("Smile AI error:", error);

        addMessage(
            "Sorry 😭 I couldn't reply right now.\n\n" +
            error.message +
            "\n\nPlease try sending your message again.",
            "bot"
        );

        statusText.textContent = "Connection problem — try again";

    } finally {
        isSending = false;
        sendButton.disabled = false;
        input.disabled = false;
        input.focus();
        chat.scrollTop = chat.scrollHeight;
    }
}

// ======================================
// FORM SUBMISSION
// ======================================

form.addEventListener("submit", function (event) {
    event.preventDefault();

    const text = input.value.trim();

    sendMessage(text);
});

// ======================================
// SUGGESTION BUTTONS
// ======================================

function askSuggestion(text) {
    sendMessage(text);
}

// Make this function accessible to HTML onclick.
window.askSuggestion = askSuggestion;

// ======================================
// INITIAL STATUS
// ======================================

statusText.textContent = "Ready to chat ✨";

console.log("Smile AI JavaScript loaded successfully!");
