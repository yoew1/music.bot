// keep_alive.js
import express from "express";
const app = express();

app.get("/", (req, res) => {
  res.send("✅ Bot 正在保持活躍...");
});

// 可選：健康檢查 API
app.get("/status", (req, res) => {
  res.json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date(),
  });
});

app.listen(3000, () => {
  console.log("🌐 保活服務已啟動 (port 3000)");
});
