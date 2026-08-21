const { SlashCommandBuilder } = require('discord.js');
const { ipEmbed } = require('../embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Muestra la IP del servidor de Minecraft.'),
  async execute(interaction) {
    await interaction.reply({ embeds: [ipEmbed()] });
  },
};
