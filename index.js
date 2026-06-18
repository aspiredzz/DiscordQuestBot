const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { loadCommands } = require('./loader/commandLoader');
const { load, save } = require('./database/db');
const { startWeb } = require('./server/web');
const { log } = require('./utils/logger');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

let DB = load();

loadCommands(client);

client.on('messageCreate', async (msg) => {
  if (!msg.content.startsWith('/') || msg.author.bot) return;

  const args = msg.content.slice(1).split(' ');
  const cmd = args.shift().toLowerCase();

  const command = client.commands.get(cmd);
  if (!command) return;

  if (DB.blacklist.includes(msg.author.id)) return;

  try {
    await command.execute(msg, args, DB, save, () => {
      DB = load();
    });
  } catch (e) {
    log('error', e.message);
  }
});

client.on('ready', () => {
  log('info', `Logged in as ${client.user.tag}`);
  startWeb(client);
});

client.login(process.env.TOKEN);
