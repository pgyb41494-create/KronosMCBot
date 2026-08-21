require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, ActivityType } = require('discord.js');
const { botStatus } = require('./config');
const { loadCommandData, resetCommandsForAllGuilds, resetGuildCommands } = require('./registerCommands');

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  }
}

const commandData = loadCommandData();

function setNetworkPresence() {
  client.user.setPresence({
    activities: [
      {
        name: botStatus,
        type: ActivityType.Custom,
        state: botStatus,
      },
    ],
    status: 'online',
  });
}

client.once(Events.ClientReady, async (readyClient) => {
  setNetworkPresence();
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Status set to: ${botStatus}`);

  try {
    await resetCommandsForAllGuilds(readyClient, commandData);
  } catch (error) {
    console.error('Failed to reset per-server commands:', error);
  }
});

client.on(Events.GuildCreate, async (guild) => {
  try {
    await resetGuildCommands(guild, commandData);
  } catch (error) {
    console.error(`Failed to reset commands for ${guild.id}:`, error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    const reply = { content: 'Hubo un error al ejecutar este comando.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(token);
