const fs = require('fs');
const path = require('path');

function loadCommands(client) {
  const base = path.join(__dirname, '../systems');

  const systems = fs.readdirSync(base);

  for (const sys of systems) {
    const files = fs.readdirSync(path.join(base, sys));

    for (const file of files) {
      const cmd = require(`${base}/${sys}/${file}`);
      client.commands.set(cmd.name, cmd);
    }
  }
}

module.exports = { loadCommands };
