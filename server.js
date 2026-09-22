const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY is missing!");
}

const ai = new GoogleGenAI({
  apiKey
});

app.use(cors());

app.use(express.json({
  limit: "25mb"
}));


/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.json({
    message: "Smile AI is running! 🤖😊"
  });
});


/* =========================
   CHAT BRAIN
========================= */

app.post("/chat", async (req, res) => {

  try {

    const message = req.body.message;

    const history =
      Array.isArray(req.body.history)
        ? req.body.history
        : [];

    const memories =
      req.body.memories &&
      typeof req.body.memories === "object"
        ? req.body.memories
        : {};


    if (!message) {

      return res.status(400).json({
        error: "Please send a message."
      });

    }


    if (!apiKey) {

      return res.status(500).json({
        error: "Gemini API key is missing on the server."
      });

    }


    const systemInstruction = `

You are Smile AI, a smart, friendly and intelligent AI assistant.

Your name is Smile AI.

PERSONALITY:
- Be friendly and natural.
- Be intelligent and helpful.
- Be slightly funny when appropriate.
- Never force jokes.
- Do not pretend to be human.
- Never invent facts.
- If you don't know something, say so.

LANGUAGE:
- Automatically understand the user's language.
- Understand normal English.
- Understand Nigerian English.
- Understand Nigerian Pidgin.
- Match the user's speaking style naturally.
- Do not force slang or Pidgin.
- Use clear English for school, technical and serious topics.

USER MEMORY:
The user may have saved memories below.

Use them naturally when relevant.

Rules:
- Never invent memories.
- Never claim to remember something that isn't provided.
- If the newest user message conflicts with an old memory, trust the newest statement.
- Do not talk about the technical memory system unless asked.

SAVED MEMORIES:
${JSON.stringify(memories, null, 2)}

CONVERSATION:
Use the recent conversation to understand follow-up questions.

You are Smile AI.
Respond naturally to the user's latest message.

`;


    const safeHistory =
      history
        .slice(-20)
        .map(item => {

          const role =
            item.role === "assistant"
              ? "Smile AI"
              : "User";

          return `${role}: ${String(
            item.content || ""
          )}`;

        })
        .join("\n");


    const prompt = `

${systemInstruction}

RECENT CONVERSATION:

${safeHistory || "No previous conversation."}

LATEST USER MESSAGE:

${message}

Answer the latest user message naturally.

`;


    const response =
      await ai.models.generateContent({

        model: "gemini-3.1-flash-lite",

        contents: prompt

      });


    res.json({

      reply:
        response.text ||
        "I'm here. What would you like to do?"

    });


  } catch (error) {

    console.error(
      "GEMINI CHAT ERROR:",
      error
    );


    res.status(500).json({

      error:
        error.message ||
        "Smile AI could not respond."

    });

  }

});


/* =========================
   IMAGE GENERATION / EDITING
========================= */

app.post("/image", async (req, res) => {

  try {

    if (!apiKey) {

      return res.status(500).json({
        error: "Gemini API key is missing on the server."
      });

    }


    const prompt =
      String(req.body.prompt || "").trim();


    const image =
      req.body.image;


    if (!prompt) {

      return res.status(400).json({
        error: "Please describe the image you want."
      });

    }


    /*
      IMPORTANT:

      When editing a person's photo,
      preserve identity and facial features
      as much as the image model allows.
    */


    const faceProtection = `

IMAGE EDITING INSTRUCTIONS:

If an input image contains a person:

- Preserve the person's identity.
- Preserve facial structure.
- Preserve facial proportions.
- Preserve eyes, nose, mouth and jaw structure.
- Preserve skin tone unless the user specifically asks for a change.
- Do not unnecessarily redesign the face.
- Do not randomly change the person's age.
- Do not replace the person's face.
- Keep the person recognizable.
- Only modify the areas requested by the user.

Make the requested changes while keeping
the original person's identity as consistent
as possible.

`;


    let contents;


    /* =========================
       TEXT TO IMAGE
    ========================= */

    if (!image) {

      contents =
        `${prompt}

Create a high-quality image.
Follow the user's description carefully.
Do not add unnecessary elements.`;


    }


    /* =========================
       IMAGE EDITING
    ========================= */

    else {

      /*
        Expect:

        data:image/jpeg;base64,...
        OR
        data:image/png;base64,...
      */

      const match =
        image.match(
          /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
        );


      if (!match) {

        return res.status(400).json({
          error: "Invalid image format."
        });

      }


      const mimeType =
        match[1];

      const base64Data =
        match[2];


      contents = [

        {
          text:
            `${prompt}

${faceProtection}`

        },

        {
          inlineData: {
            mimeType,
            data: base64Data
          }
        }

      ];

    }


    console.log(
      image
        ? "Generating edited image..."
        : "Generating new image..."
    );


    const response =
      await ai.models.generateContent({

        model:
          model: "gemini-3.5-flash-lite",
        
        contents,

        config: {

          responseModalities: [
            "TEXT",
            "IMAGE"
          ]

        }

      });


    let generatedImage = null;

    let textResponse = "";


    const parts =
      response.candidates?.[0]
        ?.content?.parts || [];


    for (const part of parts) {

      if (part.text) {

        textResponse +=
          part.text;

      }


      if (part.inlineData) {

        generatedImage = part.inlineData;

      }

    }


    if (!generatedImage) {

      return res.status(500).json({

        error:
          "Smile AI did not return an image.",

        message:
          textResponse ||
          "The image model did not generate an image."

      });

    }


    const imageData =
      `data:${generatedImage.mimeType};base64,${generatedImage.data}`;


    res.json({

      success: true,

      image: imageData,

      message:
        textResponse ||
        "Done! 😊"

    });


  } catch (error) {

    console.error(
      "IMAGE ERROR:",
      error
    );


    res.status(500).json({

      error:
        error.message ||
        "Smile AI could not create the image."

    });

  }

});


/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {

  console.log(
    `Smile AI running on port ${PORT}`
  );

});
