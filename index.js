const { Client, GatewayIntentBits } = require('discord.js');

// ======================
// RAILWAY TOKEN
// ======================
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.log("❌ Missing DISCORD_TOKEN in Railway Variables");
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

// ======================
// READY EVENT (FIXED)
// ======================
client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ======================
// COMMAND HANDLER
// ======================
client.on('messageCreate', (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith('/')) return;

  const args = msg.content.slice(1).split(' ');
  const cmd = args.shift().toLowerCase();

  // ===== APPLICATION SYSTEM =====
  if (cmd === 'apply') {
    return msg.reply(`Application received: ${args.join(' ') || 'no details'}`);
  }

  if (cmd === 'accept') {
    return msg.reply(`Accepted: ${args[0] || 'unknown user'}`);
  }

  if (cmd === 'deny') {
    return msg.reply(`Denied: ${args[0] || 'unknown user'}`);
  }

  if (cmd === 'review') {
    return msg.reply('Reviewing applications...');
  }

  // ===== STAFF SYSTEM =====
  if (cmd === 'staffnote') {
    return msg.reply(`Staff note saved: ${args.join(' ')}`);
  }

  if (cmd === 'blacklist') {
    return msg.reply(`User blacklisted: ${args[0] || 'unknown'}`);
  }

  // ===== TEMPLATE =====
  if (cmd === 'template-create') {
    return msg.reply(`Template created: ${args.join(' ')}`);
  }

  if (cmd === 'template-use') {
    return msg.reply(`Template used: ${args.join(' ')}`);
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
    return msg.reply(`Server: ${msg.guild?.name || 'DM'}`);
  }

  if (cmd === 'uptime') {
    return msg.reply(`Uptime: ${Math.floor(process.uptime())}s`);
  }

  // ===== TICKETS =====
  if (cmd === 'ticket') {
    return msg.reply(`Ticket created: ${args.join(' ') || 'no reason'}`);
  }

  if (cmd === 'transcript') {
    return msg.reply('Transcript system placeholder');
  }

  // ===== PROFILES =====
  if (cmd === 'profile') {
    return msg.reply(`Profile: ${msg.author.username}`);
  }

  if (cmd === 'history') {
    return msg.reply('History system placeholder');
  }

  if (cmd === 'reputation') {
    return msg.reply('Reputation updated');
  }
});

// ======================
// ERROR HANDLING
// ======================
client.on('error', console.error);
process.on('unhandledRejection', console.error);

// ======================
// LOGIN
// ======================
client.login(TOKEN);
