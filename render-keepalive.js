import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// 你的 Replit Web 保活網址（用 http 不要用 https）
const URLS = [
  "http://your-replit-project-name.your-username.repl.co"
];

app.get("/", (req, res) => {
  res.send("✅ Render keepalive is running");
});

setInterval(() => {
  URLS.forEach(async (url) => {
    try {
      const res = await fetch(url);
      console.log(`[${new Date().toISOString()}] Pinged ${url} → ${res.status}`);
    } catch (err) {
      console.error(`❌ Failed to ping ${url}:`, err.message);
    }
  });
}, 1000 * 60 * 2); // 每 2 分鐘

app.listen(PORT, () => {
  console.log(`Render keepalive server listening on port ${PORT}`);
});
