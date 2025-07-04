import express from "express";
const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🌐 Music bot is alive!");
});

app.listen(port, () => {
  console.log(`🌐 Keepalive running on port ${port}`);
});
