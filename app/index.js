const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const express = require('express');
const crypto = require('crypto');
const http = require('http');
const Anthropic = require('@anthropic-ai/sdk');

const TOKEN = process.env.DISCORD_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;
const RAILWAY_APP_URL = process.env.RAILWAY_APP_URL || `http://localhost:${PORT}`;

if (!TOKEN || !ANTHROPIC_API_KEY) {
  console.error('❌ Missing required env vars: DISCORD_TOKEN, ANTHROPIC_API_KEY');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],
  rest: { timeout: 15000 }
});

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const app = express();

// In-memory user notes storage
const userNotes = new Map();

const LOG = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`)
};

// 24/7 Self-Pinger
class SelfPinger {
  constructor(appUrl, interval = 10 * 60 * 1000) {
    this.appUrl = appUrl;
    this.interval = interval;
    this.lastPing = null;
    this.pingCount = 0;
    this.failureCount = 0;
  }

  start() {
    LOG.info(`🔄 Self-pinger started - pinging every ${this.interval / 1000 / 60} minutes`);
    this.ping();
    this.intervalId = setInterval(() => this.ping(), this.interval);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    LOG.info('❌ Self-pinger stopped');
  }

  ping() {
    const healthEndpoint = `${this.appUrl}/health`;
    this.lastPing = new Date().toISOString();

    http.get(healthEndpoint, (res) => {
      if (res.statusCode === 200) {
        this.pingCount++;
        LOG.info(`✅ Self-ping successful #${this.pingCount}`);
        this.failureCount = 0;
      } else {
        this.failureCount++;
        LOG.warn(`⚠️ Self-ping returned status ${res.statusCode}`);
      }
    }).on('error', (err) => {
      this.failureCount++;
      LOG.error(`❌ Self-ping failed: ${err.message}`);
    });
  }

  getStats() {
    return {
      lastPing: this.lastPing,
      totalPings: this.pingCount,
      failureCount: this.failureCount,
      intervalSeconds: this.interval / 1000
    };
  }
}

const selfPinger = new SelfPinger(RAILWAY_APP_URL, 10 * 60 * 1000);

// ===== TEXT & ENCODING TOOLS =====
const textTools = {
  wordcount: (text) => {
    const words = text.trim().split(/\s+/).length;
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, '').length;
    return { words, chars, charsNoSpaces };
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
  
  reverse: (text) => text.split('').reverse().join('')
};

const encodingTools = {
  base64Encode: (text) => Buffer.from(text).toString('base64'),
  base64Decode: (text) => {
    try {
      return Buffer.from(text, 'base64').toString('utf-8');
    } catch {
      throw new Error('Invalid Base64');
    }
  },
  rot13: (text) => text.replace(/[a-zA-Z]/g, c => String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)),
  urlEncode: (text) => encodeURIComponent(text),
  urlDecode: (text) => decodeURIComponent(text)
};

const jsonTools = {
  format: (text) => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
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

// ===== CRYPTO TOOLS =====
const cryptoTools = {
  md5: (text) => crypto.createHash('md5').update(text).digest('hex'),
  sha256: (text) => crypto.createHash('sha256').update(text).digest('hex'),
  encryptSimple: (text, key) => {
    const cipher = crypto.createCipher('aes-256-cbc', key);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  },
  decryptSimple: (encrypted, key) => {
    try {
      const decipher = crypto.createDecipher('aes-256-cbc', key);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      throw new Error('Decryption failed - wrong key?');
    }
  }
};

// ===== CALCULATOR TOOLS =====
const calculator = {
  evaluate: (expression) => {
    try {
      // Simple safe evaluation - only allow numbers and operators
      if (!/^[0-9+\-*/(). ]+$/.test(expression)) {
        throw new Error('Invalid characters');
      }
      // eslint-disable-next-line no-eval
      const result = Function('"use strict"; return (' + expression + ')')();
      return result;
    } catch(e) {
      throw new Error('Invalid expression: ' + e.message);
    }
  },

  convert: (value, fromUnit, toUnit) => {
    const conversions = {
      'kg_lb': value => (value * 2.20462).toFixed(2),
      'lb_kg': value => (value / 2.20462).toFixed(2),
      'c_f': value => ((value * 9/5) + 32).toFixed(2),
      'f_c': value => ((value - 32) * 5/9).toFixed(2),
      'm_ft': value => (value * 3.28084).toFixed(2),
      'ft_m': value => (value / 3.28084).toFixed(2),
      'km_mi': value => (value * 0.621371).toFixed(2),
      'mi_km': value => (value / 0.621371).toFixed(2)
    };
    
    const key = `${fromUnit}_${toUnit}`;
    if (!conversions[key]) throw new Error('Unsupported conversion');
    return conversions[key](value);
  }
};

// ===== FUN SYSTEMS =====
const funSystems = {
  roll: (sides = 20) => Math.floor(Math.random() * sides) + 1,
  
  coin: () => Math.random() > 0.5 ? 'Heads' : 'Tails',
  
  ship: (user1, user2) => {
    const hash = crypto.createHash('md5').update(user1 + user2).digest('hex');
    const percentage = parseInt(hash.substring(0, 2), 16) % 101;
    const compatibility = percentage < 20 ? '💔' : percentage < 40 ? '💛' : percentage < 60 ? '🧡' : percentage < 80 ? '💕' : '💕💕';
    return { percentage, compatibility };
  },

  excuse: () => {
    const prefixes = [
      "I can't because",
      "I had to leave because",
      "I'm late because",
      "I couldn't make it because"
    ];
    const actors = [
      "my neighbor's cat",
      "a rogue squirrel",
      "my goldfish",
      "a sentient toaster",
      "my rubber duck",
      "a confused penguin",
      "my houseplant"
    ];
    const crises = [
      "started a rebellion in my kitchen",
      "accidentally rewired my internet",
      "challenged me to a staring contest",
      "unplugged everything in my house",
      "declared war on my wifi router",
      "organized a protest in my backyard",
      "hacked my Discord account"
    ];

    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const actor = actors[Math.floor(Math.random() * actors.length)];
    const crisis = crises[Math.floor(Math.random() * crises.length)];
    
    return `${prefix} ${actor} ${crisis}`;
  },

  timezone: (time, fromTz, toTz) => {
    const tzOffsets = {
      'EST': -5, 'EDT': -4,
      'CST': -6, 'CDT': -5,
      'MST': -7, 'MDT': -6,
      'PST': -8, 'PDT': -7,
      'GMT': 0, 'UTC': 0,
      'CET': 1, 'CEST': 2,
      'JST': 9, 'AEST': 10
    };

    const from = tzOffsets[fromTz.toUpperCase()] || 0;
    const to = tzOffsets[toTz.toUpperCase()] || 0;
    const diff = to - from;
    
    const [hours, minutes] = time.split(':').map(Number);
    let newHours = (hours + diff + 24) % 24;
    
    return `${String(newHours).padStart(2, '0')}:${String(minutes || 0).padStart(2, '0')}`;
  }
};

// ===== AI CHAT =====
const aiChat = async (userId, prompt) => {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: 'You are a helpful Discord bot. Keep responses concise (under 2000 characters). Be friendly and direct.',
      messages: [
        { role: 'user', content: prompt }
      ]
    });
    
    return message.content[0].type === 'text' ? message.content[0].text : 'No response';
  } catch(e) {
    throw new Error('AI error: ' + e.message);
  }
};

// ===== COMMAND HANDLERS =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const { commandName, options } = interaction;

    // AI Chat
    if (commandName === 'aichatgpt') {
      const prompt = options.getString('ask');
      await interaction.deferReply({ ephemeral: true });
      
      try {
        const response = await aiChat(interaction.user.id, prompt);
        const embed = new EmbedBuilder()
          .setColor('#9333ea')
          .setTitle('🤖 Claude Response')
          .setDescription(response)
          .setFooter({ text: interaction.user.username });
        await interaction.editReply({ embeds: [embed] });
      } catch(e) {
        await interaction.editReply({ content: '❌ ' + e.message });
      }
    }

    // Calculator
    if (commandName === 'calc') {
      const expression = options.getString('expression');
      try {
        const result = calculator.evaluate(expression);
        const embed = new EmbedBuilder()
          .setColor('#3498db')
          .setTitle('🧮 Calculator')
          .addFields(
            { name: 'Expression', value: expression, inline: true },
            { name: 'Result', value: result.toString(), inline: true }
          );
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch(e) {
        await interaction.reply({ content: '❌ ' + e.message, ephemeral: true });
      }
    }

    if (commandName === 'convert') {
      const value = options.getNumber('value');
      const from = options.getString('from');
      const to = options.getString('to');
      
      try {
        const result = calculator.convert(value, from, to);
        const embed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('📏 Unit Converter')
          .setDescription(`${value}${from} = ${result}${to}`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch(e) {
        await interaction.reply({ content: '❌ ' + e.message, ephemeral: true });
      }
    }

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
          { name: 'No Spaces', value: stats.charsNoSpaces.toString(), inline: true }
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'textcase') {
      const text = options.getString('text');
      const type = options.getString('type');
      const result = textTools.textcase(text, type);
      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🔤 Text Case')
        .setDescription(`\`\`\`\n${result}\n\`\`\``);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'reverse') {
      const text = options.getString('text');
      const result = textTools.reverse(text);
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🔄 Reversed')
        .setDescription(`\`\`\`\n${result}\n\`\`\``);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Encoding
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

    if (commandName === 'rot13') {
      const text = options.getString('text');
      const result = encodingTools.rot13(text);
      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('🔀 ROT13 Cipher')
        .setDescription(`\`\`\`\n${result}\n\`\`\``);
      await interaction.reply({ embeds: [embed], ephemeral: true });
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

    // Crypto
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

    if (commandName === 'secret') {
      const text = options.getString('message');
      const action = options.getString('action');
      const key = options.getString('key');

      try {
        let result;
        if (action === 'encrypt') {
          result = cryptoTools.encryptSimple(text, key);
        } else {
          result = cryptoTools.decryptSimple(text, key);
        }
        
        const embed = new EmbedBuilder()
          .setColor('#9b59b6')
          .setTitle(action === 'encrypt' ? '🔐 Encrypted' : '🔓 Decrypted')
          .setDescription(`\`\`\`\n${result}\n\`\`\``);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch(e) {
        await interaction.reply({ content: '❌ ' + e.message, ephemeral: true });
      }
    }

    // Fun Systems
    if (commandName === 'roll') {
      const sides = options.getInteger('sides') || 20;
      const result = funSystems.roll(sides);
      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('🎲 Dice Roll')
        .setDescription(`Rolling a d${sides}...\n**${result}**`);
      await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'coin') {
      const result = funSystems.coin();
      const embed = new EmbedBuilder()
        .setColor('#95a5a6')
        .setTitle('🪙 Coin Flip')
        .setDescription(`**${result}**`);
      await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'ship') {
      const user1 = options.getString('user1');
      const user2 = options.getString('user2');
      const { percentage, compatibility } = funSystems.ship(user1, user2);
      const embed = new EmbedBuilder()
        .setColor('#ff69b4')
        .setTitle('💕 Ship Meter')
        .setDescription(`**${user1}** + **${user2}**\n${compatibility} **${percentage}%** compatibility`);
      await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'excuse') {
      const result = funSystems.excuse();
      const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('🤷 Excuse Generator')
        .setDescription(result);
      await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'time') {
      const time = options.getString('time');
      const from = options.getString('from');
      const to = options.getString('to');

      try {
        const result = funSystems.timezone(time, from, to);
        const embed = new EmbedBuilder()
          .setColor('#3498db')
          .setTitle('🕒 Timezone Converter')
          .setDescription(`**${time} ${from}** → **${result} ${to}**`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch(e) {
        await interaction.reply({ content: '❌ ' + e.message, ephemeral: true });
      }
    }

    if (commandName === 'note') {
      const action = options.getString('action');
      const userId = interaction.user.id;

      if (action === 'set') {
        const text = options.getString('text');
        userNotes.set(userId, text);
        const embed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('📝 Note Saved')
          .setDescription(`\`\`\`\n${text}\n\`\`\``);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else if (action === 'view') {
        const note = userNotes.get(userId);
        if (!note) {
          await interaction.reply({ content: '❌ No notes saved', ephemeral: true });
          return;
        }
        const embed = new EmbedBuilder()
          .setColor('#3498db')
          .setTitle('📝 Your Note')
          .setDescription(`\`\`\`\n${note}\n\`\`\``);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else if (action === 'clear') {
        userNotes.delete(userId);
        await interaction.reply({ content: '✅ Note cleared', ephemeral: true });
      }
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

  selfPinger.start();

  try {
    const commands = [
      // AI & Calculator
      new SlashCommandBuilder().setName('aichatgpt').setDescription('Ask Claude AI anything').addStringOption(o => o.setName('ask').setDescription('Your question').setRequired(true)),
      new SlashCommandBuilder().setName('calc').setDescription('Calculate an expression').addStringOption(o => o.setName('expression').setDescription('e.g., 2+2*3').setRequired(true)),
      new SlashCommandBuilder().setName('convert').setDescription('Convert units').addNumberOption(o => o.setName('value').setDescription('Value to convert').setRequired(true)).addStringOption(o => o.setName('from').setDescription('From unit').setRequired(true).addChoices({name: 'Kilograms', value: 'kg'}, {name: 'Pounds', value: 'lb'}, {name: 'Celsius', value: 'c'}, {name: 'Fahrenheit', value: 'f'}, {name: 'Meters', value: 'm'}, {name: 'Feet', value: 'ft'}, {name: 'Kilometers', value: 'km'}, {name: 'Miles', value: 'mi'})).addStringOption(o => o.setName('to').setDescription('To unit').setRequired(true).addChoices({name: 'Kilograms', value: 'kg'}, {name: 'Pounds', value: 'lb'}, {name: 'Celsius', value: 'c'}, {name: 'Fahrenheit', value: 'f'}, {name: 'Meters', value: 'm'}, {name: 'Feet', value: 'ft'}, {name: 'Kilometers', value: 'km'}, {name: 'Miles', value: 'mi'})),
      
      // Text Tools
      new SlashCommandBuilder().setName('wordcount').setDescription('Count words and characters').addStringOption(o => o.setName('text').setDescription('Text to analyze').setRequired(true)),
      new SlashCommandBuilder().setName('textcase').setDescription('Convert text case').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)).addStringOption(o => o.setName('type').setDescription('Case type').setRequired(true).addChoices({name: 'UPPERCASE', value: 'upper'}, {name: 'lowercase', value: 'lower'}, {name: 'Title Case', value: 'title'}, {name: 'aLtErNaTiNg', value: 'alternating'}, {name: 'InVeRsE', value: 'inverse'})),
      new SlashCommandBuilder().setName('reverse').setDescription('Reverse text').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),

      // Encoding
      new SlashCommandBuilder().setName('base64-encode').setDescription('Encode to Base64').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
      new SlashCommandBuilder().setName('base64-decode').setDescription('Decode from Base64').addStringOption(o => o.setName('text').setDescription('Base64 text').setRequired(true)),
      new SlashCommandBuilder().setName('rot13').setDescription('ROT13 cipher').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
      new SlashCommandBuilder().setName('url-encode').setDescription('URL encode').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
      new SlashCommandBuilder().setName('url-decode').setDescription('URL decode').addStringOption(o => o.setName('text').setDescription('Encoded text').setRequired(true)),

      // JSON
      new SlashCommandBuilder().setName('json-format').setDescription('Format JSON').addStringOption(o => o.setName('json').setDescription('JSON string').setRequired(true)),
      new SlashCommandBuilder().setName('json-minify').setDescription('Minify JSON').addStringOption(o => o.setName('json').setDescription('JSON string').setRequired(true)),
      new SlashCommandBuilder().setName('json-validate').setDescription('Validate JSON').addStringOption(o => o.setName('json').setDescription('JSON string').setRequired(true)),

      // Crypto
      new SlashCommandBuilder().setName('hash-md5').setDescription('Generate MD5 hash').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
      new SlashCommandBuilder().setName('hash-sha256').setDescription('Generate SHA256 hash').addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
      new SlashCommandBuilder().setName('secret').setDescription('Encrypt/Decrypt message').addStringOption(o => o.setName('message').setDescription('Message').setRequired(true)).addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices({name: 'Encrypt', value: 'encrypt'}, {name: 'Decrypt', value: 'decrypt'})).addStringOption(o => o.setName('key').setDescription('Encryption key').setRequired(true)),

      // Fun Systems
      new SlashCommandBuilder().setName('roll').setDescription('Roll dice').addIntegerOption(o => o.setName('sides').setDescription('Dice sides (default 20)').setMinValue(1).setMaxValue(1000)),
      new SlashCommandBuilder().setName('coin').setDescription('Flip a coin'),
      new SlashCommandBuilder().setName('ship').setDescription('Ship meter').addStringOption(o => o.setName('user1').setDescription('Person/thing 1').setRequired(true)).addStringOption(o => o.setName('user2').setDescription('Person/thing 2').setRequired(true)),
      new SlashCommandBuilder().setName('excuse').setDescription('Generate wild excuse'),
      new SlashCommandBuilder().setName('time').setDescription('Timezone converter').addStringOption(o => o.setName('time').setDescription('Time (HH:MM)').setRequired(true)).addStringOption(o => o.setName('from').setDescription('From timezone').setRequired(true).addChoices({name: 'EST', value: 'EST'}, {name: 'CST', value: 'CST'}, {name: 'PST', value: 'PST'}, {name: 'GMT', value: 'GMT'}, {name: 'CET', value: 'CET'}, {name: 'JST', value: 'JST'})).addStringOption(o => o.setName('to').setDescription('To timezone').setRequired(true).addChoices({name: 'EST', value: 'EST'}, {name: 'CST', value: 'CST'}, {name: 'PST', value: 'PST'}, {name: 'GMT', value: 'GMT'}, {name: 'CET', value: 'CET'}, {name: 'JST', value: 'JST'})),
      new SlashCommandBuilder().setName('note').setDescription('Personal notes').addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices({name: 'Set', value: 'set'}, {name: 'View', value: 'view'}, {name: 'Clear', value: 'clear'})).addStringOption(o => o.setName('text').setDescription('Note text (for set)')).setDMPermission(true)
    ];

    await client.application.commands.set(commands);
    LOG.info('✅ Slash commands registered');
  } catch(error) {
    LOG.error(`Command registration failed: ${error.message}`);
  }
});

client.on('error', error => LOG.error(`Client error: ${error.message}`));
client.on('warn', warning => LOG.warn(`Warning: ${warning}`));

// Express server
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    bot: client.user?.tag || 'offline',
    uptime: process.uptime(),
    pinger: selfPinger.getStats(),
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
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    pinger: selfPinger.getStats()
  });
});

const server = app.listen(PORT, () => {
  LOG.info(`🚀 Server on port ${PORT}`);
  LOG.info(`📊 Health check: /health`);
});

process.on('unhandledRejection', error => LOG.error(`Unhandled: ${error.message}`));
process.on('uncaughtException', error => {
  LOG.error(`Uncaught: ${error.message}`);
  selfPinger.stop();
  process.exit(1);
});

process.on('SIGTERM', () => {
  LOG.warn('SIGTERM received, shutting down gracefully...');
  selfPinger.stop();
  server.close(() => {
    client.destroy();
    process.exit(0);
  });
});

client.login(TOKEN);
