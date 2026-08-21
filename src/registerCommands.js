const fs = require('node:fs');
const path = require('node:path');

function loadCommandData() {
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

  return commandFiles.map((file) => {
    const command = require(path.join(commandsPath, file));
    return command.data.toJSON();
  });
}

async function removeGlobalCommands(client) {
  await client.application.commands.set([]);
  console.log('Removed all global commands.');
}

async function resetGuildCommands(guild, commandData) {
  await guild.commands.set(commandData);
  console.log(`Reset ${commandData.length} commands for ${guild.name} (${guild.id}).`);
}

async function resetCommandsForAllGuilds(client, commandData) {
  await removeGlobalCommands(client);

  for (const guild of client.guilds.cache.values()) {
    await resetGuildCommands(guild, commandData);
  }
}

module.exports = {
  loadCommandData,
  removeGlobalCommands,
  resetGuildCommands,
  resetCommandsForAllGuilds,
};
