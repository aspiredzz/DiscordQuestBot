const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');

const TOKEN = process.env.DISCORD_TOKEN;
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN not found');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],
  rest: { timeout: 15000 }
});

const app = express();

const LOG = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`)
};

// Text Tools
const textTools = {
  wordcount: (text) => {
    const words = text.trim().split(/\s+/).length;
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, '').length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length;
    return { words, chars, charsNoSpaces, sentences };
  },
  
  textcase: (text, type) => {
    switch(type) {
      case 'upper': return text.toUpperCase();
      case 'lower': return text.toLowerCase();
      case 'title': return text.replace(/\b\w/g, c => c.toUpperCase());
      case 'alternating': return text.split('').map((c, i) => i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()).join('');
      case 'inverse': return text.split('').map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('');
      default: return text;
    }
  },
  
  reverse: (text) => text.split('').reverse().join(''),
  
  removeSpaces: (text) => text.replace(/\s/g, '')
};

// Encoding Tools
const encodingTools = {
  base64Encode: (text) => Buffer.from(text).toString('base64'),
  base64Decode: (text) => {
    try {
      return Buffer.from(text, 'base64').toString('utf-8');
    } catch {
      throw new Error('Invalid Base64');
    }
  },
  urlEncode: (text) => encodeURIComponent(text),
  urlDecode: (text) => decodeURIComponent(text)
};

// JSON Tools
const jsonTools = {
  format: (text) => {
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch(e) {
      throw new Error('Invalid JSON: ' + e.message);
    }
  },
  
  minify: (text) => {
    try {
      return JSON.stringify(JSON.parse(text));
    } catch(e) {
      throw new Error('Invalid JSON: ' + e.message);
    }
  },
  
  validate: (text) => {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }
};

// Crypto Tools
const cryptoTools = {
  md5: (text) => crypto.createHash('md5').update(text).digest('hex'),
  sha256: (text) => crypto.createHash('sha256').update(text).digest('hex')
};

// QR Code Generator
const qrGenerator = async (text) => {
  try {
    return await QRCode.toDataURL(text);
  } catch(e) {
    throw new Error('QR generation failed');
  }
};

// Fake Generators
const fakeGenerators = {
  fakeMessage: (username, content) => {
    return `
\`\`\`
🔵 ${username}
${content}
\`\`\`
    `.trim();
  },
  
  fakeConversation: (user1, msg1, user2, msg2) => {
    return `
\`\`\`
🔵 ${user1}: ${msg1}
🟣 ${user2}: ${msg2}
🔵 ${user1}: lmao
🟣 ${user2}: fr fr
\`\`\`
    `.trim();
  },
  
  fakeReply: (originalUser, originalMsg, replyUser, replyMsg) => {
    return `
\`\`\`
📌 ${originalUser}
${originalMsg}

↳ ${replyUser} replied:
${replyMsg}
\`\`\`
    `.trim();
  },
  
  fakeVC: (users) => {
    const userList = users.split(',').map(u => u.trim()).filter(u => u);
    return `
\`\`\`
🎙️ VOICE CHANNEL
━━━━━━━━━━━━━━━━
${userList.map(u => `🟢 ${u}`).join('\n')}
━━━━━━━━━━━━━━━━
\`\`\`
    `.trim();
  },
  
  fakeReport: (reportedUser, reason) => {
    return `
\`\`\`
⚠️ DISCORD REPORT
User: ${reportedUser}
Reason: ${reason}
Status: Under Review
Case ID: #${Math.random().toString(36).substr(2, 9).toUpperCase()}
\`\`\`
    `.trim();
  },
  
  fakeRequest: (username) => {
    return `
\`\`\`
➕ FRIEND REQUEST
From: ${username}
Message: "hey!"
[Accept] [Decline]
\`\`\`
    `.trim();
  }
};

// Command Handlers
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const { commandName, options } = interaction;

    // Text Tools
    if (commandName === 'wordcount') {
      const text = options.getString('text');
      const stats = textTools.wordcount(text);
      const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('📊 Word Count')
        .addFields(
          { name: 'Words', value: stats.words.toString(), inline: true },
          { name: 'Characters', value: stats.chars.toString(), inline: true },
          { name: 'No Spaces', value: stats.charsNoSpaces.toString(), inline: true },
          { name: 'Sentences', value: stats.sentences.toString(), inline: true }
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'textcase') {
      const text = options.getString('text');
      const type = options.getString('type');
      const result = textTools.textcase(text, type);
      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🔤 Text Case Converter')
        .setDescription(`\`\`\`\n${result}\n\`\`\``);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'reverse') {
      const text = options.getString('text');
      const result = textTools.reverse(text);
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🔄 Reversed Text')
        .setDescription(`\`\`\`\n${result}\n\`\`\``);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'remove-spaces') {
      const text = options.getString('text');
      const result = textTools.removeSpaces(text);
      const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('⬜ Spaces Removed')
        .setDescription(`\`\`\`\n${result}\n\`\`\``);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Encoding Tools
    if (commandName === 'base64-encode') {
      const text = options.getString('text');
      const result = encodingTools.base64Encode(text);
      const embed = new EmbedBuilder()
        .setColor('#1abc9c')
        .setTitle('🔐 Base64 Encode')
        .setDescription(`\`\`\`\n${result}\n\`\`\``);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'base64-decode') {
      const text = options.getString('text');
      try {
        const result = encodingTools.base64Decode(text);
        const embed = new EmbedBuilder()
          .setColor('#1abc9c')
          .setTitle('🔓 Base64 Decode')
          .setDescription(`\`\`\`\n${result}\n\`\`\``);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch(e) {
        await interaction.reply({ content: '❌ ' + e.message, ephemeral: true });
      }
    }

    if (commandName === 'url-encode') {
      const text = options.getString('text');
      const result = encodingTools.urlEncode(text);
      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('🔗 URL Encode')
        .setDescription(`\`\`\`\n${result}\n\`\`\``);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'url-decode') {
      const text = options.getString('text');
      try {
        const result = encodingTools.urlDecode(text);
        const embed = new EmbedBuilder()
          .setColor('#f39c12')
          .setTitle('🔓 URL Decode')
          .setDescription(`\`\`\`\n${result}\n\`\`\``);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch(e) {
        await interaction.reply({ content: '❌ Invalid URL encoding', ephemeral: true });
      }
    }

    // JSON Tools
    if (commandName === 'json-format') {
      const text = options.getString('json');
      try {
        const result = jsonTools.format(text);
        const embed = new EmbedBuilder()
          .setColor('#3498db')
          .setTitle('📋 JSON Formatted')
          .setDescription(`\`\`\`json\n${result}\n\`\`\``);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch(e) {
        await interaction.reply({ content: '❌ ' + e.message, ephemeral: true });
      }
    }

    if (commandName === 'json-minify') {
      const text = options.getString('json');
      try {
        const result = jsonTools.minify(text);
        const embed = new EmbedBuilder()
          .setColor('#3498db')
          .setTitle('📋 JSON Minified')
          .setDescription(`\`\`\`json\n${result}\n\`\`\``);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch(e) {
        await interaction.reply({ content: '❌ ' + e.message, ephemeral: true });
      }
    }

    if (commandName === 'json-validate') {
      const text = options.getString('json');
      const isValid = jsonTools.validate(text);
      const embed = new EmbedBuilder()
        .setColor(isValid ? '#2ecc71' : '#e74c3c')
        .setTitle('✔️ JSON Validator')
        .setDescription(isValid ? '✅ Valid JSON' : '❌ Invalid JSON');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Crypto Tools
    if (commandName === 'hash-md5') {
      const text = options.getString('text');
      const result = cryptoTools.md5(text);
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🔐 MD5 Hash')
        .setDescription(`\`\`\`\n${result}\n\`\`\``);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'hash-sha256') {
      const text = options.getString('text');
      const result = cryptoTools.sha256(text);
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🔐 SHA256 Hash')
        .setDescription(`\`\`\`\n${result}\n\`\`\``);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // QR Code
    if (commandName === 'qr-generate') {
      const text = options.getString('text');
      try {
        const qrDataUrl = await qrGenerator(text);
        const embed = new EmbedBuilder()
          .setColor('#1abc9c')
          .setTitle('📱 QR Code Generated')
          .setDescription('Scan this QR code')
          .setImage(qrDataUrl);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch(e) {
        await interaction.reply({ content: '❌ QR generation failed', ephemeral: true });
      }
    }

    // Fake Generators
    if (commandName === 'fake-message') {
      const username = options.getString('username');
      const content = options.getString('message');
      const result = fakeGenerators.fakeMessage(username, content);
      await interaction.reply({ content: result, ephemeral: true });
    }

    if (commandName === 'fake-conversation') {
      const user1 = options.getString('user1');
      const msg1 = options.getString('message1');
      const user2 = options.getString('user2');
      const msg2 = options.getString('message2');
      const result = fakeGenerators.fakeConversation(user1, msg1, user2, msg2);
      await interaction.reply({ content: result, ephemeral: true });
    }

    if (commandName === 'fake-reply') {
      const origUser = options.getString('original_user');
      const origMsg = options.getString('original_message');
      const replyUser = options.getString('reply_user');
      const replyMsg = options.getString('reply_message');
      const result = fakeGenerators.fakeReply(origUser, origMsg, replyUser, replyMsg);
      await interaction.reply({ content: result, ephemeral: true });
    }

    if (commandName === 'fake-vc') {
      const users = options.getString('users');
      const result = fakeGenerators.fakeVC(users);
      await interaction.reply({ content: result, ephemeral: true });
    }

    if (commandName === 'fake-report') {
      const user = options.getString('user');
      const reason = options.getString('reason');
      const result = fakeGenerators.fakeReport(user, reason);
      await interaction.reply({ content: result, ephemeral: true });
    }

    if (commandName === 'fake-request') {
      const username = options.getString('username');
      const result = fakeGenerators.fakeRequest(username);
      await interaction.reply({ content: result, ephemeral: true });
    }

  } catch(error) {
    LOG.error(`Command error: ${error.message}`);
    try {
      await interaction.reply({ content: '❌ Command failed', ephemeral: true });
    } catch {}
  }
});

client.on('ready', async () => {
  LOG.info(`✅ Bot logged in as ${client.user.tag}`);
  client.user.setActivity('utility commands', { type: 'WATCHING' });

  try {
    const commands = [
      new SlashCommandBuilder().setName('wordcount').setDescription('Count words and characters').addStringOption(o => o.setName('text').setDescription('Text to analyze').setRequired(true)),
      new SlashCommandBuilder().setName('textcase').setDescription('Convert text case').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)).addStringOption(o => o.setName('type').setDescription('Case type').setRequired(true).addChoices({name: 'UPPERCASE', value: 'upper'}, {name: 'lowercase', value: 'lower'}, {name: 'Title Case', value: 'title'}, {name: 'aLtErNaTiNg', value: 'alternating'}, {name: 'InVeRsE', value: 'inverse'})),
      new SlashCommandBuilder().setName('reverse').setDescription('Reverse text').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
      new SlashCommandBuilder().setName('remove-spaces').setDescription('Remove all spaces').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
      new SlashCommandBuilder().setName('base64-encode').setDescription('Encode to Base64').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
      new SlashCommandBuilder().setName('base64-decode').setDescription('Decode from Base64').addStringOption(o => o.setName('text').setDescription('Base64 text').setRequired(true)),
      new SlashCommandBuilder().setName('url-encode').setDescription('URL encode').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
      new SlashCommandBuilder().setName('url-decode').setDescription('URL decode').addStringOption(o => o.setName('text').setDescription('Encoded text').setRequired(true)),
      new SlashCommandBuilder().setName('json-format').setDescription('Format JSON').addStringOption(o => o.setName('json').setDescription('JSON string').setRequired(true)),
      new SlashCommandBuilder().setName('json-minify').setDescription('Minify JSON').addStringOption(o => o.setName('json').setDescription('JSON string').setRequired(true)),
      new SlashCommandBuilder().setName('json-validate').setDescription('Validate JSON').addStringOption(o => o.setName('json').setDescription('JSON string').setRequired(true)),
      new SlashCommandBuilder().setName('hash-md5').setDescription('Generate MD5 hash').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
      new SlashCommandBuilder().setName('hash-sha256').setDescription('Generate SHA256 hash').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
      new SlashCommandBuilder().setName('qr-generate').setDescription('Generate QR code').addStringOption(o => o.setName('text').setDescription('Text/URL').setRequired(true)),
      new SlashCommandBuilder().setName('fake-message').setDescription('Create fake message').addStringOption(o => o.setName('username').setDescription('Username').setRequired(true)).addStringOption(o => o.setName('message').setDescription('Message').setRequired(true)),
      new SlashCommandBuilder().setName('fake-conversation').setDescription('Fake conversation').addStringOption(o => o.setName('user1').setDescription('User 1').setRequired(true)).addStringOption(o => o.setName('message1').setDescription('Message 1').setRequired(true)).addStringOption(o => o.setName('user2').setDescription('User 2').setRequired(true)).addStringOption(o => o.setName('message2').setDescription('Message 2').setRequired(true)),
      new SlashCommandBuilder().setName('fake-reply').setDescription('Fake reply').addStringOption(o => o.setName('original_user').setDescription('Original user').setRequired(true)).addStringOption(o => o.setName('original_message').setDescription('Original message').setRequired(true)).addStringOption(o => o.setName('reply_user').setDescription('Reply user').setRequired(true)).addStringOption(o => o.setName('reply_message').setDescription('Reply message').setRequired(true)),
      new SlashCommandBuilder().setName('fake-vc').setDescription('Fake voice channel').addStringOption(o => o.setName('users').setDescription('Usernames (comma separated)').setRequired(true)),
      new SlashCommandBuilder().setName('fake-report').setDescription('Fake Discord report').addStringOption(o => o.setName('user').setDescription('Reported user').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
      new SlashCommandBuilder().setName('fake-request').setDescription('Fake friend request').addStringOption(o => o.setName('username').setDescription('Username').setRequired(true))
    ];

    await client.application.commands.set(commands);
    LOG.info('✅ Slash commands registered');
  } catch(error) {
    LOG.error(`Command registration failed: ${error.message}`);
  }
});

client.on('error', error => LOG.error(`Client error: ${error.message}`));
client.on('warn', warning => LOG.warn(`Warning: ${warning}`));

// Express server with uptime monitoring
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    bot: client.user?.tag || 'offline',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    bot_online: client.isReady(),
    uptime: process.uptime(),
    ping: client.ws.ping,
    timestamp: new Date().toISOString()
  });
});

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.get('/status', (req, res) => {
  res.json({
    online: client.isReady(),
    user: client.user?.tag,
    uptime_ms: process.uptime() * 1000,
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
  });
});

app.listen(PORT, () => {
  LOG.info(`🚀 Server on port ${PORT}`);
  LOG.info(`📊 Uptime check: /health or /ping`);
});

process.on('unhandledRejection', error => LOG.error(`Unhandled: ${error.message}`));
process.on('uncaughtException', error => {
  LOG.error(`Uncaught: ${error.message}`);
  process.exit(1);
});

client.login(TOKEN);
