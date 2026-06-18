const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // bot application ID

if (!TOKEN || !CLIENT_ID) {
  console.log("Missing DISCORD_TOKEN or CLIENT_ID");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ---------------- COMMANDS ---------------- */

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),

  new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Submit an application')
    .addStringOption(o =>
      o.setName('text')
        .setDescription('Your application')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('review')
    .setDescription('Review applications'),

  new SlashCommandBuilder()
    .setName('accept')
    .setDescription('Accept application')
    .addStringOption(o =>
      o.setName('user')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('deny')
    .setDescription('Deny application')
    .addStringOption(o =>
      o.setName('user')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Create ticket')
    .addStringOption(o =>
      o.setName('reason')
        .setRequired(true)
    )
].map(c => c.toJSON());

/* ---------------- REGISTER COMMANDS ---------------- */

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log("Registering slash commands...");
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log("Slash commands registered.");
  } catch (err) {
    console.error(err);
  }
}

/* ---------------- INTERACTIONS ---------------- */

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    return interaction.reply('pong');
  }

  if (interaction.commandName === 'apply') {
    const text = interaction.options.getString('text');
    return interaction.reply(`Application submitted:\n${text}`);
  }

  if (interaction.commandName === 'review') {
    return interaction.reply('No applications stored (add DB later)');
  }

  if (interaction.commandName === 'accept') {
    const user = interaction.options.getString('user');
    return interaction.reply(`Accepted: ${user}`);
  }

  if (interaction.commandName === 'deny') {
    const user = interaction.options.getString('user');
    return interaction.reply(`Denied: ${user}`);
  }

  if (interaction.commandName === 'ticket') {
    const reason = interaction.options.getString('reason');
    return interaction.reply(`Ticket created: ${reason}`);
  }
});

/* ---------------- READY ---------------- */

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/* ---------------- START ---------------- */

client.login(TOKEN);
registerCommands();
