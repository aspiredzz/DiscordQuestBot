const express = require('express');
const http = require('http');

function startWeb(client) {
  const app = express();

  app.get('/', (req, res) => {
    res.json({
      status: 'online',
      bot: client.user?.tag || 'loading',
      uptime: process.uptime()
    });
  });

  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });

  const PORT = process.env.PORT || 3000;

  const server = app.listen(PORT, () => {
    console.log(`WEB ON ${PORT}`);
  });

  // 🔥 SELF PINGER (keeps free hosting alive)
  setInterval(() => {
    http.get(`http://localhost:${PORT}/health`);
  }, 4 * 60 * 1000); // every 4 minutes

  return server;
}

module.exports = { startWeb };
