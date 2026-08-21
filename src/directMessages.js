const { Events } = require('discord.js');
const { claimCode } = require('./config');
const { claimCodeEmbed } = require('./embeds');

function isClaimCode(content) {
  return content.trim().toLowerCase() === claimCode.toLowerCase();
}

function registerDirectMessageHandler(client) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (message.guild) return;
    if (!isClaimCode(message.content)) return;

    try {
      await message.reply({ embeds: [claimCodeEmbed()] });
    } catch (error) {
      console.error('Failed to send claim code embed:', error);
    }
  });
}

module.exports = {
  registerDirectMessageHandler,
};
