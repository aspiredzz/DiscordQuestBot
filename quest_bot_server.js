const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const express = require('express');
const axios = require('axios');
require('dotenv').config(); // Load .env FIRST
const app = express();
const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  ws: { large_threshold: 250 },
  rest: { timeout: 15000 }
});

const userSessions = new Map();
const PORT = process.env.PORT || 3000;

// Enhanced logging for debugging
const LOG = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
  debug: (msg) => process.env.DEBUG && console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`)
};

class QuestFarmer {
  constructor(userId, token) {
    this.userId = userId;
    this.token = token;
    this.running = false;
    this.completedCount = 0;
    this.failedQuests = new Map();
    this.questCache = new Map();
    this.baseDelay = 1200;
    this.maxRetries = 5;
    this.statusCallback = null;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 10;
    this.lastActivityTime = Date.now();
  }

  async makeRequest(endpoint, method = 'GET', body = null) {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        const config = {
          method,
          url: `https://discord.com/api/v10${endpoint}`,
          headers: {
            'Authorization': `Bot ${this.token}`, // CRITICAL: Bot prefix for bot tokens
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'X-RateLimit-Precision': 'millisecond'
          },
          timeout: 10000,
          validateStatus: () => true // Don't throw on any status
        };

        if (body) config.data = body;

        const response = await axios(config);
        
        // Handle rate limiting explicitly
        if (response.status === 429) {
          const retryAfter = response.headers['retry-after'] || response.data?.retry_after;
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : this.baseDelay * Math.pow(2, retries);
          LOG.warn(`Rate limited. Waiting ${delay}ms (attempt ${retries + 1}/${this.maxRetries})`);
          await this.sleep(delay);
          retries++;
          continue;
        }

        // Token validation check
        if (response.status === 401) {
          this.running = false;
          throw new Error(`❌ 401 Unauthorized - Token invalid, expired, or malformed. Check your token format, boss man.`);
        }

        // Server errors - retry with backoff
        if (response.status >= 500) {
          LOG.warn(`Server error ${response.status}. Retrying...`);
          await this.sleep(this.baseDelay * Math.pow(2, retries));
          retries++;
          continue;
        }

        // Success
        if (response.status >= 200 && response.status < 300) {
          this.consecutiveErrors = 0;
          this.lastActivityTime = Date.now();
          return response.data;
        }

        // Client errors (non-401) - don't retry
        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}: ${response.statusText || JSON.stringify(response.data)}`);
        }

        return response.data;

      } catch (error) {
        this.consecutiveErrors++;
        
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          this.running = false;
          throw error;
        }

        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          const delay = this.baseDelay * Math.pow(2, retries);
          LOG.warn(`Connection timeout. Retrying in ${delay}ms...`);
          await this.sleep(delay);
          retries++;
          continue;
        }

        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          const delay = this.baseDelay * Math.pow(3, retries);
          LOG.warn(`Network error. Retrying in ${delay}ms...`);
          await this.sleep(delay);
          retries++;
          continue;
        }

        if (retries < this.maxRetries - 1) {
          retries++;
          await this.sleep(this.baseDelay * Math.pow(2, retries));
          continue;
        }

        throw error;
      }
    }

    throw new Error(`Max retries exceeded on ${endpoint}`);
  }

  async validateToken() {
    try {
      LOG.info('Validating user token...');
      const result = await this.makeRequest('/users/@me');
      
      if (!result.id) {
        throw new Error('Invalid token response - no user ID returned');
      }

      LOG.info(`Token valid for user: ${result.username}#${result.discriminator || '0'}`);
      return true;
    } catch (error) {
      LOG.error(`Token validation failed: ${error.message}`);
      throw error;
    }
  }

  async fetchQuests() {
    try {
      const quests = await this.makeRequest('/users/@me/quests');
      
      if (!Array.isArray(quests)) {
        LOG.warn(`Quests endpoint returned non-array: ${typeof quests}`);
        return [];
      }

      quests.forEach(quest => {
        if (quest.id) this.questCache.set(quest.id, quest);
      });

      return quests.filter(q => q && q.id);
    } catch (error) {
      LOG.error(`Quest fetch failed: ${error.message}`);
      this.updateStatus(`⚠️ Fetch failed: ${error.message}`);
      return [];
    }
  }

  async completeQuest(questId) {
    if (this.questCache.has(questId) && this.questCache.get(questId).completed) {
      return true;
    }

    try {
      await this.makeRequest(`/users/@me/quests/${questId}`, 'POST', {});
      LOG.debug(`Quest ${questId} completed`);
      return true;
    } catch (error) {
      LOG.warn(`Quest completion failed: ${questId} - ${error.message}`);
      
      if (!this.failedQuests.has(questId)) {
        this.failedQuests.set(questId, { retries: 0, nextRetry: Date.now() + 5000 });
      } else {
        const failureData = this.failedQuests.get(questId);
        failureData.retries++;
        failureData.nextRetry = Date.now() + (5000 * Math.pow(2, Math.min(failureData.retries, 5)));
      }
      return false;
    }
  }

  async claimReward(questId) {
    try {
      await this.makeRequest(`/users/@me/quests/${questId}/claim`, 'POST', {});
      this.completedCount++;
      this.questCache.delete(questId);
      LOG.debug(`Reward claimed for quest ${questId}`);
      return true;
    } catch (error) {
      LOG.warn(`Reward claim failed: ${questId} - ${error.message}`);
      return false;
    }
  }

  async processFailedQuests() {
    const now = Date.now();
    const quests = Array.from(this.failedQuests.entries());

    for (const [questId, failureData] of quests) {
      if (failureData.retries >= this.maxRetries) {
        LOG.warn(`Quest ${questId} exceeded max retries. Removing.`);
        this.failedQuests.delete(questId);
        continue;
      }

      if (now >= failureData.nextRetry) {
        const completed = await this.completeQuest(questId);
        if (completed) {
          await this.claimReward(questId);
          this.failedQuests.delete(questId);
        }
      }
    }
  }

  async start() {
    if (this.running) return;
    
    this.running = true;
    this.completedCount = 0;
    this.questCache.clear();
    this.failedQuests.clear();
    this.consecutiveErrors = 0;

    LOG.info(`Quest farming started for user ${this.userId}`);

    while (this.running) {
      try {
        // Kill switch if too many consecutive errors
        if (this.consecutiveErrors > this.maxConsecutiveErrors) {
          this.running = false;
          this.updateStatus(`❌ Too many consecutive errors. Stopping.`);
          break;
        }

        const quests = await this.fetchQuests();
        const pendingQuests = quests.filter(q => q && !q.completed);

        if (pendingQuests.length === 0) {
          this.updateStatus(`🔄 No pending quests. Checking retries...`);
          await this.processFailedQuests();
          await this.sleep(this.baseDelay * 2);
          continue;
        }

        this.updateStatus(`📋 Processing ${pendingQuests.length} quest(s)...`);

        for (const quest of pendingQuests) {
          if (!this.running) break;

          const completed = await this.completeQuest(quest.id);
          if (completed) {
            const rewarded = await this.claimReward(quest.id);
            if (rewarded) {
              this.updateStatus(`✅ Quest claimed! Total: ${this.completedCount}`);
            }
          }

          await this.sleep(this.baseDelay);
        }

        await this.processFailedQuests();
        await this.sleep(this.baseDelay);

      } catch (error) {
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          this.running = false;
          LOG.error(`Token error: ${error.message}`);
          this.updateStatus(`❌ ${error.message}`);
          break;
        } else {
          LOG.error(`Farming error: ${error.message}`);
          this.updateStatus(`⚠️ Error: ${error.message}`);
          await this.sleep(this.baseDelay * 3);
        }
      }
    }

    LOG.info(`Quest farming stopped. Total completed: ${this.completedCount}`);
  }

  stop() {
    this.running = false;
    this.updateStatus(`⏹️ Bot stopped. Total completed: ${this.completedCount}`);
    LOG.info(`Stopped by user. Completed: ${this.completedCount}`);
  }

  updateStatus(message) {
    if (this.statusCallback) this.statusCallback(message);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      running: this.running,
      completed: this.completedCount,
      failed: this.failedQuests.size,
      cached: this.questCache.size,
      errors: this.consecutiveErrors,
      uptime: Date.now() - this.lastActivityTime
    };
  }
}

// Discord bot events
client.on('ready', () => {
  LOG.info(`✅ Bot logged in as ${client.user.tag}`);
  client.user.setActivity('quest farming', { type: 'WATCHING' });
});

client.on('error', error => {
  LOG.error(`Discord client error: ${error.message}`);
});

client.on('warn', warning => {
  LOG.warn(`Discord warning: ${warning}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;

  if (interaction.commandName === 'start') {
    const token = interaction.options.getString('token');

    if (!token || token.length < 20) {
      return interaction.reply({
        content: '❌ Invalid token format. Tokens should be 20+ characters.',
        ephemeral: true
      });
    }

    if (userSessions.has(userId)) {
      const existing = userSessions.get(userId);
      if (existing.running) {
        return interaction.reply({
          content: '⚠️ Already running for this user. Use /stop first.',
          ephemeral: true
        });
      }
    }

    const farmer = new QuestFarmer(userId, token);

    try {
      await interaction.deferReply();
      await farmer.validateToken();

      userSessions.set(userId, farmer);

      const embed = new EmbedBuilder()
        .setColor('#43b581')
        .setTitle('✅ Quest Farmer Started')
        .setDescription('Your token is valid, bot is now farming quests...')
        .addFields(
          { name: 'Status', value: 'Running ▶️', inline: true },
          { name: 'Completed', value: '0', inline: true }
        )
        .setFooter({ text: 'Use /stop to halt the bot' })
        .setTimestamp();

      farmer.statusCallback = async (message) => {
        try {
          const updated = new EmbedBuilder()
            .setColor('#7289da')
            .setTitle('⚡ Quest Farmer Status')
            .setDescription(message)
            .addFields(
              { name: 'Completed', value: farmer.completedCount.toString(), inline: true },
              { name: 'Failed', value: farmer.failedQuests.size.toString(), inline: true },
              { name: 'Running', value: farmer.running ? 'Yes ✅' : 'No ❌', inline: true }
            )
            .setTimestamp();

          await interaction.editReply({ embeds: [updated] });
        } catch (e) {
          LOG.error(`Status update failed: ${e.message}`);
        }
      };

      farmer.start();
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      userSessions.delete(userId);
      LOG.error(`Start command failed: ${error.message}`);
      await interaction.editReply({ content: `❌ ${error.message}` });
    }
  }

  if (interaction.commandName === 'stop') {
    const farmer = userSessions.get(userId);

    if (!farmer || !farmer.running) {
      return interaction.reply({
        content: '❌ No active bot session',
        ephemeral: true
      });
    }

    farmer.stop();

    const embed = new EmbedBuilder()
      .setColor('#f04747')
      .setTitle('⏹️ Quest Farmer Stopped')
      .addFields(
        { name: 'Total Completed', value: farmer.completedCount.toString() },
        { name: 'Failed Quests', value: farmer.failedQuests.size.toString() },
        { name: 'Stopped At', value: new Date().toLocaleTimeString() }
      )
      .setTimestamp();

    interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (interaction.commandName === 'status') {
    const farmer = userSessions.get(userId);

    if (!farmer) {
      return interaction.reply({
        content: '❌ No active session',
        ephemeral: true
      });
    }

    const status = farmer.getStatus();

    const embed = new EmbedBuilder()
      .setColor(farmer.running ? '#43b581' : '#f04747')
      .setTitle('📊 Farmer Status')
      .addFields(
        { name: 'Running', value: farmer.running ? 'Yes ✅' : 'No ❌', inline: true },
        { name: 'Completed', value: status.completed.toString(), inline: true },
        { name: 'Failed', value: status.failed.toString(), inline: true },
        { name: 'Cached', value: status.cached.toString(), inline: true },
        { name: 'Consecutive Errors', value: status.errors.toString(), inline: true }
      )
      .setTimestamp();

    interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

client.on('ready', async () => {
  try {
    const commands = [
      new SlashCommandBuilder()
        .setName('start')
        .setDescription('Start the quest farmer')
        .addStringOption(option =>
          option
            .setName('token')
            .setDescription('Your Discord user token')
            .setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the quest farmer'),
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check current farmer status')
    ];

    await client.application.commands.set(commands);
    LOG.info('✅ Slash commands registered');
  } catch (error) {
    LOG.error(`Command registration failed: ${error.message}`);
  }
});

// Express server
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    uptime: process.uptime(),
    activeSessions: userSessions.size
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    sessions: userSessions.size,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  LOG.info(`🚀 Express server running on port ${PORT}`);
});

process.on('unhandledRejection', error => {
  LOG.error(`Unhandled rejection: ${error.message}`);
  console.error(error);
});

process.on('uncaughtException', error => {
  LOG.error(`Uncaught exception: ${error.message}`);
  console.error(error);
  process.exit(1);
});

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  LOG.error('❌ DISCORD_TOKEN not found in environment variables');
  process.exit(1);
}

client.login(TOKEN);
