require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { loadCommandData, resetCommandsForAllGuilds } = require('./registerCommands');

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async () => {
  try {
    await resetCommandsForAllGuilds(client, loadCommandData());
    console.log('Cleared global commands and reset guild commands.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
});

client.login(token);
