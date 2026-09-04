const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Smile AI backend is running! 😊"
  });
});

app.post("/chat", (req, res) => {
  const message = req.body.message;

  res.json({
    reply: `Smile AI received: ${message}`
  });
});

app.listen(PORT, () => {
  console.log(`Smile AI running on port ${PORT}`);
});
