"use strict";

/*
  SMILE AI FRONTEND

  Keep this URL pointed at your existing Render backend.
  Do not put your Gemini API key in this file.
*/

const BACKEND_URL = "https://smile-ai-1.onrender.com/chat";

const STORAGE = {
  chats: "smileChats",
  current: "smileCurrentChat",
  memories: "smileMemories",
  theme: "smileTheme",
  voice: "smileVoiceReplies"
};

const DEFAULT_MEMORIES = {
  name: "",
  favoriteFootballer: "",
  favoriteClub: "",
  favoriteGame: "",
  favoriteColor: ""
};

const $ = (id) => document.getElementById(id);

const elements = {
  sidebar: $("sidebar"),
  messages: $("messages"),
  welcome: $("welcome"),
  historyList: $("historyList"),
  input: $("messageInput"),
  form: $("chatForm"),
  send: $("sendBtn"),
  status: $("connectionStatus"),
  notice: $("notice"),
  menu: $("menuBtn"),
  newChat: $("newChatBtn"),
  theme: $("themeBtn"),
  voiceToggle: $("voiceToggleBtn"),
  memory: $("memoryBtn"),
  clear: $("clearBtn"),
  mic: $("micBtn"),
  stopVoice: $("stopVoiceBtn")
};

let chats = readStorage(STORAGE.chats, []);
let memories = {
  ...DEFAULT_MEMORIES,
  ...readStorage(STORAGE.memories, {})
};

let currentChatId = localStorage.getItem(STORAGE.current) || null;
let isSending = false;
let recognition = null;

let voiceReplies = localStorage.getItem(STORAGE.voice) !== "false";

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveChats() {
  localStorage.setItem(STORAGE.chats, JSON.stringify(chats));
}

function saveMemories() {
  localStorage.setItem(STORAGE.memories, JSON.stringify(memories));
}

function createId() {
  return Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8);
}

function currentChat() {
  return chats.find(chat => chat.id === currentChatId) || null;
}

function createChat() {
  const chat = {
    id: createId(),
    title: "New conversation",
    messages: [],
    updatedAt: Date.now()
  };

  chats.unshift(chat);
  currentChatId = chat.id;

  localStorage.setItem(STORAGE.current, currentChatId);
  saveChats();
  renderHistory();
  renderChat();

  return chat;
}

function ensureChat() {
  let chat = currentChat();

  if (!chat) {
    chat = createChat();
  }

  return chat;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function showNotice(message) {
  elements.notice.textContent = message;
  elements.notice.classList.remove("hidden");
}

function hideNotice() {
  elements.notice.classList.add("hidden");
  elements.notice.textContent = "";
}

function setStatus(message) {
  elements.status.textContent = message;
}

function scrollToBottom() {
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function renderHistory() {
  elements.historyList.replaceChildren();

  chats
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach(chat => {
      const item = document.createElement("div");

      item.className = "history-item";
      item.textContent = chat.title || "New conversation";
      item.title = chat.title || "New conversation";

      if (chat.id === currentChatId) {
        item.style.background = "var(--panel2)";
      }

      item.addEventListener("click", () => {
        currentChatId = chat.id;
        localStorage.setItem(STORAGE.current, currentChatId);
        renderHistory();
        renderChat();
        elements.sidebar.classList.remove("open");
      });

      elements.historyList.appendChild(item);
    });
}

function addMessageElement(message, index) {
  const wrapper = document.createElement("article");
  wrapper.className = `message ${message.role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = message.role === "user" ? "👤" : "😊";

  const content = document.createElement("div");
  content.className = "message-content";

  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = message.role === "user" ? "You" : "Smile AI";

  const text = document.createElement("div");
  text.className = "message-text";
  text.textContent = message.text;

  const time = document.createElement("div");
  time.className = "message-time";
  time.textContent = formatTime(message.timestamp);

  content.append(name, text, time);

  if (message.role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const copy = document.createElement("button");
    copy.textContent = "Copy";

    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(message.text);
        copy.textContent = "Copied!";
        setTimeout(() => copy.textContent = "Copy", 1200);
      } catch {
        showNotice("Copy isn't available in this browser.");
      }
    });

    const speak = document.createElement("button");
    speak.textContent = "🔊 Read aloud";

    speak.addEventListener("click", () => speakText(message.text));

    actions.append(copy, speak);
    content.appendChild(actions);
  }

  wrapper.append(avatar, content);
  elements.messages.appendChild(wrapper);
}

function renderChat() {
  elements.messages.replaceChildren();

  const chat = currentChat();

  if (!chat || chat.messages.length === 0) {
    elements.messages.appendChild(elements.welcome);
    elements.welcome.classList.remove("hidden");
    return;
  }

  elements.welcome.classList.add("hidden");

  chat.messages.forEach((message, index) => {
    addMessageElement(message, index);
  });

  scrollToBottom();
}

function addMessage(role, text) {
  const chat = ensureChat();

  const message = {
    role,
    text,
    timestamp: Date.now()
  };

  chat.messages.push(message);
  chat.updatedAt = Date.now();

  if (role === "user" && chat.title === "New conversation") {
    chat.title = text.slice(0, 38) +
      (text.length > 38 ? "..." : "");
  }

  saveChats();
  renderHistory();
  renderChat();

  return message;
}

function setLoading(loading) {
  isSending = loading;
  elements.send.disabled = loading;
  elements.input.disabled = loading;
  elements.send.textContent = loading ? "Thinking..." : "Send ↑";
  setStatus(loading ? "Thinking" : "Ready");
}

function showTyping() {
  const wrapper = document.createElement("article");
  wrapper.className = "message";
  wrapper.id = "typingIndicator";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "😊";

  const content = document.createElement("div");
  content.className = "message-content typing";
  content.textContent = "Smile AI is thinking...";

  wrapper.append(avatar, content);
  elements.messages.appendChild(wrapper);

  scrollToBottom();
}

function removeTyping() {
  $("typingIndicator")?.remove();
}

function buildHistory(chat) {
  return (chat?.messages || [])
    .slice(-20)
    .filter(message =>
      ["user", "assistant"].includes(message.role)
    )
    .map(message => ({
      role: message.role,
      text: message.text
    }));
}

async function sendMessage(text) {
  text = String(text || "").trim();

  if (!text || isSending) return;

  hideNotice();
  ensureChat();

  const chat = currentChat();

  addMessage("user", text);

  elements.input.value = "";
  elements.input.style.height = "auto";

  setLoading(true);
  showTyping();

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: text,
        history: buildHistory(chat),
        memories
      })
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        "The server returned an invalid response. Check your Render logs."
      );
    }

    if (!response.ok) {
      throw new Error(data.error || `Server error (${response.status})`);
    }

    const reply = data.reply || data.response;

    if (!reply) {
      throw new Error("Smile AI returned an empty response.");
    }

    removeTyping();
    addMessage("assistant", reply);

    if (data.memories && typeof data.memories === "object") {
      memories = {
        ...memories,
        ...data.memories
      };

      saveMemories();
    }

    if (voiceReplies) {
      speakText(reply);
    }

  } catch (error) {
    removeTyping();

    console.error("Smile AI error:", error);

    let explanation = error.message || "Unknown error.";

    if (error instanceof TypeError) {
      explanation =
        "Could not reach Smile AI. Check your internet connection and confirm that the Render backend is running.";
    }

    addMessage(
      "assistant",
      "Sorry, something went wrong. 😕\n\n" + explanation
    );

  } finally {
    setLoading(false);
    elements.input.disabled = false;
    elements.input.focus();
  }
}

elements.form.addEventListener("submit", event => {
  event.preventDefault();
  sendMessage(elements.input.value);
});

elements.input.addEventListener("keydown", event => {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing
  ) {
    event.preventDefault();

    if (!isSending) {
      sendMessage(elements.input.value);
    }
  }
});

elements.input.addEventListener("input", () => {
  elements.input.style.height = "auto";

  elements.input.style.height =
    Math.min(elements.input.scrollHeight, 150) + "px";
});

document.querySelectorAll(".suggestion").forEach(button => {
  button.addEventListener("click", () => {
    sendMessage(button.textContent.replace(/^[^ ]+ /, ""));
  });
});

elements.newChat.addEventListener("click", () => {
  createChat();
  elements.sidebar.classList.remove("open");
  elements.input.focus();
});

elements.menu.addEventListener("click", () => {
  elements.sidebar.classList.toggle("open");
});

elements.theme.addEventListener("click", () => {
  const light = document.body.dataset.theme !== "light";

  if (light) {
    document.body.dataset.theme = "light";

    document.documentElement.style.setProperty("--bg", "#f5f6fb");
    document.documentElement.style.setProperty("--panel", "#ffffff");
    document.documentElement.style.setProperty("--panel2", "#e9ebf4");
    document.documentElement.style.setProperty("--text", "#181a25");
    document.documentElement.style.setProperty("--muted", "#686e7d");
    document.documentElement.style.setProperty("--border", "#dfe2ec");
    document.documentElement.style.setProperty("--user", "#e8e4ff");

    localStorage.setItem(STORAGE.theme, "light");
  } else {
    applyDarkTheme();
  }
});

function applyDarkTheme() {
  document.body.dataset.theme = "dark";

  document.documentElement.style.setProperty("--bg", "#090b10");
  document.documentElement.style.setProperty("--panel", "#11141c");
  document.documentElement.style.setProperty("--panel2", "#191d28");
  document.documentElement.style.setProperty("--text", "#f4f5f8");
  document.documentElement.style.setProperty("--muted", "#9299aa");
  document.documentElement.style.setProperty("--border", "#282d3a");
  document.documentElement.style.setProperty("--user", "#292447");

  localStorage.setItem(STORAGE.theme, "dark");
}

elements.voiceToggle.addEventListener("click", () => {
  voiceReplies = !voiceReplies;

  localStorage.setItem(STORAGE.voice, String(voiceReplies));

  updateVoiceButton();

  if (!voiceReplies && "speechSynthesis" in window) {
    speechSynthesis.cancel();
  }
});

function updateVoiceButton() {
  elements.voiceToggle.textContent =
    voiceReplies ? "🔊 Voice replies: ON" : "🔇 Voice replies: OFF";
}

function speakText(text) {
  if (!("speechSynthesis" in window)) {
    showNotice("Voice replies are not supported by this browser.");
    return;
  }

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-NG";
  utterance.rate = 1;
  utterance.pitch = 1;

  speechSynthesis.speak(utterance);
}

elements.stopVoice.addEventListener("click", () => {
  if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
  }
});

elements.mic.addEventListener("click", () => {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showNotice(
      "Voice input is unavailable in this browser. Try a browser that supports speech recognition."
    );
    return;
  }

  if (recognition) {
    recognition.stop();
    recognition = null;
    elements.mic.textContent = "🎤";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-NG";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    elements.mic.textContent = "⏹️";
    setStatus("Listening");
  };

  recognition.onresult = event => {
    let transcript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }

    elements.input.value = transcript;
  };

  recognition.onerror = event => {
    showNotice("Voice input error: " + event.error);
  };

  recognition.onend = () => {
    elements.mic.textContent = "🎤";
    setStatus("Ready");
    recognition = null;
  };

  recognition.start();
});

elements.memory.addEventListener("click", () => {
  const fields = [
    ["name", "Your name"],
    ["favoriteFootballer", "Favourite footballer"],
    ["favoriteClub", "Favourite football club"],
    ["favoriteGame", "Favourite game"],
    ["favoriteColor", "Favourite colour"]
  ];

  for (const [key, label] of fields) {
    const answer = prompt(
      `${label}:\nLeave blank to keep the current value.`,
      memories[key] || ""
    );

    if (answer === null) return;

    if (answer.trim()) {
      memories[key] = answer.trim();
    }
  }

  saveMemories();

  showNotice("Your saved memories have been updated. 🧠");
});

elements.clear.addEventListener("click", () => {
  const chat = currentChat();

  if (!chat) return;

  if (!confirm("Clear all messages in this conversation?")) {
    return;
  }

  chat.messages = [];
  chat.title = "New conversation";
  chat.updatedAt = Date.now();

  saveChats();
  renderHistory();
  renderChat();
});

function initialize() {
  const savedTheme = localStorage.getItem(STORAGE.theme);

  if (savedTheme === "light") {
    document.body.dataset.theme = "dark";
    elements.theme.click();
  } else {
    applyDarkTheme();
  }

  updateVoiceButton();

  if (!currentChat()) {
    if (chats.length) {
      currentChatId = chats[0].id;
      localStorage.setItem(STORAGE.current, currentChatId);
    } else {
      createChat();
    }
  }

  renderHistory();
  renderChat();
}

initialize();
