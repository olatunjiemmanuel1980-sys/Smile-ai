const BACKEND_URL = "https://smile-ai-1.onrender.com/chat";

const chat = document.getElementById("chat");
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

let conversation = [];

function getTime() {
return new Date().toLocaleTimeString([], {
hour: "2-digit",
minute: "2-digit"
});
}

function addMessage(text, sender) {
const message = document.createElement("div");
message.className = "message ${sender}";

const bubble = document.createElement("div");
bubble.className = "bubble";
bubble.textContent = text;

const time = document.createElement("span");
time.className = "time";
time.textContent = getTime();

message.appendChild(bubble);
message.appendChild(time);
chat.appendChild(message);

chat.scrollTop = chat.scrollHeight;

return message;
}

function quickSend(text) {
input.value = text;
form.requestSubmit();
}

window.quickSend = quickSend;

form.addEventListener("submit", async function (event) {
event.preventDefault();

const message = input.value.trim();

if (!message || sendBtn.disabled) return;

addMessage(message, "user");

conversation.push({
role: "user",
content: message
});

input.value = "";
sendBtn.disabled = true;
sendBtn.textContent = "…";

const loading = addMessage("Smile AI is thinking...", "ai");

try {
const response = await fetch(BACKEND_URL, {
method: "POST",
headers: {
"Content-Type": "application/json"
},
body: JSON.stringify({
message: message,
history: conversation.slice(-20)
})
});

const data = await response.json();

if (!response.ok) {
  throw new Error(
    data.error || data.message || `Server error ${response.status}`
  );
}

const reply =
  data.reply ||
  data.response ||
  data.text ||
  data.message;

if (typeof reply !== "string" || !reply.trim()) {
  throw new Error("The server returned no AI reply.");
}

loading.querySelector(".bubble").textContent = reply;

conversation.push({
  role: "assistant",
  content: reply
});

} catch (error) {
console.error("Smile AI error:", error);

loading.querySelector(".bubble").textContent =
  "Sorry 😭 I couldn't get a reply from my brain. Please try again. Error: " +
  error.message;

} finally {
sendBtn.disabled = false;
sendBtn.textContent = "➤";
input.focus();
chat.scrollTop = chat.scrollHeight;
}
});
