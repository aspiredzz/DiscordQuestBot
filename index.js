const { Client, GatewayIntentBits, Collection } = require('discord.js');

// ======================
// RAILWAY TOKEN SETUP
// ======================
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.log("❌ Missing DISCORD_TOKEN in environment variables (Railway)");
  process.exit(1);
}

// ======================
// CLIENT SETUP
// ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

// ======================
// SIMPLE COMMAND SYSTEM
// ======================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith('/')) return;

  const args = msg.content.slice(1).split(' ');
  const cmd = args.shift().toLowerCase();

  // ===== APPLY =====
  if (cmd === 'apply') {
    return msg.reply(`Application received: ${args.join(' ')}`);
  }

  // ===== ACCEPT =====
  if (cmd === 'accept') {
    return msg.reply(`Application accepted for ${args[0]}`);
  }

  // ===== DENY =====
  if (cmd === 'deny') {
    return msg.reply(`Application denied for ${args[0]}`);
  }

  // ===== REVIEW =====
  if (cmd === 'review') {
    return msg.reply(`Reviewing applications... (placeholder system)`);
  }

  // ===== STAFF NOTE =====
  if (cmd === 'staffnote') {
    return msg.reply(`Staff note saved: ${args.join(' ')}`);
  }

  // ===== BLACKLIST =====
  if (cmd === 'blacklist') {
    return msg.reply(`${args[0]} has been blacklisted`);
  }

  // ===== TEMPLATE =====
  if (cmd === 'template-create') {
    return msg.reply(`Template created: ${args.join(' ')}`);
  }

  if (cmd === 'template-use') {
    return msg.reply(`Using template: ${args.join(' ')}`);
  }

  // ===== UTILITY =====
  if (cmd === 'ping') {
    return msg.reply('pong');
  }

  if (cmd === 'avatar') {
    return msg.reply(msg.author.displayAvatarURL());
  }

  if (cmd === 'userinfo') {
    return msg.reply(`User: ${msg.author.tag}`);
  }

  if (cmd === 'serverinfo') {
    return msg.reply(`Server: ${msg.guild.name}`);
  }

  if (cmd === 'uptime') {
    return msg.reply(`${process.uptime().toFixed(0)} seconds`);
  }

  // ===== TICKET =====
  if (cmd === 'ticket') {
    return msg.reply(`Ticket created: ${args.join(' ')}`);
  }

  if (cmd === 'transcript') {
    return msg.reply('Transcript system placeholder');
  }

  // ===== PROFILE =====
  if (cmd === 'profile') {
    return msg.reply(`Profile for ${msg.author.username}`);
  }

  if (cmd === 'history') {
    return msg.reply('History system placeholder');
  }

  if (cmd === 'reputation') {
    return msg.reply('Reputation updated');
  }
});

// ======================
// READY EVENT
// ======================
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ======================
// LOGIN USING RAILWAY TOKEN
// ======================
client.login(TOKEN);
