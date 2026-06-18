const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const axios = require('axios');
const app = express();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] });

const userSessions = new Map();
const PORT = process.env.PORT || 3000;

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
  }

  async makeRequest(endpoint, method = 'GET', body = null) {
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        const config = {
          method,
          url: `https://discord.com/api/v10${endpoint}`,
          headers: {
            'Authorization': this.token,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          },
          timeout: 10000
        };

        if (body) {
          config.data = body;
        }

        const response = await axios(config);
        return response.data;

      } catch (error) {
        if (error.response?.status === 401) {
          throw new Error('Token expired or invalid');
        }

        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : this.baseDelay * Math.pow(2, retries);
          await this.sleep(delay);
          retries++;
          continue;
        }

        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          const delay = this.baseDelay * Math.pow(2, retries);
          await this.sleep(delay);
          retries++;
          continue;
        }

        throw error;
      }
    }

    throw new Error('Max retries exceeded');
  }

  async validateToken() {
    try {
      await this.makeRequest('/users/@me');
      return true;
    } catch (error) {
      throw new Error('Token validation failed');
    }
  }

  async fetchQuests() {
    try {
      const quests = await this.makeRequest('/users/@me/quests');
      
      if (!Array.isArray(quests)) {
        return [];
      }

      quests.forEach(quest => {
        this.questCache.set(quest.id, quest);
      });

      return quests;
    } catch (error) {
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
      return true;
    } catch (error) {
      if (!this.failedQuests.has(questId)) {
        this.failedQuests.set(questId, { retries: 0, nextRetry: Date.now() + 5000 });
      } else {
        const failureData = this.failedQuests.get(questId);
        failureData.retries++;
        failureData.nextRetry = Date.now() + (5000 * Math.pow(2, failureData.retries));
      }
      return false;
    }
  }

  async claimReward(questId) {
    try {
      await this.makeRequest(`/users/@me/quests/${questId}/claim`, 'POST', {});
      this.completedCount++;
      this.questCache.delete(questId);
      return true;
    } catch (error) {
      return false;
    }
  }

  async processFailedQuests() {
    const now = Date.now();
    const quests = Array.from(this.failedQuests.entries());

    for (const [questId, failureData] of quests) {
      if (failureData.retries >= this.maxRetries) {
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

    while (this.running) {
      try {
        const quests = await this.fetchQuests();
        const pendingQuests = quests.filter(q => !q.completed);

        if (pendingQuests.length === 0) {
          this.updateStatus(`🔄 No pending quests, checking retries...`);
          await this.processFailedQuests();
          await this.sleep(this.baseDelay * 2);
          continue;
        }

        this.updateStatus(`📋 Processing ${pendingQuests.length} quest(s)...`);

        for (const quest of pendingQuests) {
          if (!this.running) break;

          const completed = await this.completeQuest(quest.id);
          if (completed) {
            await this.claimReward(quest.id);
            this.updateStatus(`✅ Quest claimed! Total: ${this.completedCount}`);
          }

          await this.sleep(this.baseDelay);
        }

        await this.processFailedQuests();
        await this.sleep(this.baseDelay);

      } catch (error) {
        if (error.message.includes('Token')) {
          this.running = false;
          this.updateStatus(`❌ ${error.message}`);
        } else {
          this.updateStatus(`⚠️ Error: ${error.message}`);
          await this.sleep(this.baseDelay * 3);
        }
      }
    }
  }

  stop() {
    this.running = false;
    this.updateStatus(`⏹️ Bot stopped. Total completed: ${this.completedCount}`);
  }

  updateStatus(message) {
    if (this.statusCallback) {
      this.statusCallback(message);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      running: this.running,
      completed: this.completedCount,
      failed: this.failedQuests.size,
      cached: this.questCache.size
    };
  }
}

client.on('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  client.user.setActivity('quests farming', { type: 'WATCHING' });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;

  if (interaction.commandName === 'start') {
    const token = interaction.options.getString('token');

    if (!token || token.length < 20) {
      return interaction.reply({ content: '❌ Invalid token format', ephemeral: true });
    }

    if (userSessions.has(userId)) {
      const existing = userSessions.get(userId);
      if (existing.running) {
        return interaction.reply({ content: '⚠️ Already running for this user', ephemeral: true });
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
          { name: 'Status', value: 'Running', inline: true },
          { name: 'Completed', value: '0', inline: true }
        )
        .setFooter({ text: 'Use /stop to halt the bot' });

      farmer.statusCallback = async (message) => {
        try {
          const updated = new EmbedBuilder()
            .setColor('#7289da')
            .setTitle('⚡ Quest Farmer Status')
            .setDescription(message)
            .addFields(
              { name: 'Completed', value: farmer.completedCount.toString(), inline: true },
              { name: 'Running', value: farmer.running ? 'Yes' : 'No', inline: true }
            )
            .setTimestamp();

          await interaction.editReply({ embeds: [updated] });
        } catch (e) {
          console.error('Status update failed:', e.message);
        }
      };

      farmer.start();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      userSessions.delete(userId);
      await interaction.editReply({ content: `❌ ${error.message}` });
    }
  }

  if (interaction.commandName === 'stop') {
    const farmer = userSessions.get(userId);

    if (!farmer || !farmer.running) {
      return interaction.reply({ content: '❌ No active bot session', ephemeral: true });
    }

    farmer.stop();

    const embed = new EmbedBuilder()
      .setColor('#f04747')
      .setTitle('⏹️ Quest Farmer Stopped')
      .addFields(
        { name: 'Total Completed', value: farmer.completedCount.toString() },
        { name: 'Session Time', value: new Date().toLocaleTimeString() }
      );

    interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (interaction.commandName === 'status') {
    const farmer = userSessions.get(userId);

    if (!farmer) {
      return interaction.reply({ content: '❌ No active session', ephemeral: true });
    }

    const status = farmer.getStatus();

    const embed = new EmbedBuilder()
      .setColor(farmer.running ? '#43b581' : '#f04747')
      .setTitle('📊 Farmer Status')
      .addFields(
        { name: 'Running', value: farmer.running ? 'Yes ✅' : 'No ❌', inline: true },
        { name: 'Completed', value: status.completed.toString(), inline: true },
        { name: 'Failed Quests', value: status.failed.toString(), inline: true },
        { name: 'Cached', value: status.cached.toString(), inline: true }
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
            .setDescription('Your Discord token')
            .setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the quest farmer'),
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check farmer status')
    ];

    await client.application.commands.set(commands);
    console.log('✅ Slash commands registered');
  } catch (error) {
    console.error('Command registration failed:', error);
  }
});

app.get('/', (req, res) => {
  res.send('🤖 Quest Farmer Bot is running');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
});

client.login(process.env.DISCORD_TOKEN);
