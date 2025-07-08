const http = require('http');

setInterval(() => {
  http.get('https://music-bot-6nuq.onrender.com');
}, 1000 * 60 * 5); // 每 5 分鐘 ping 一次
