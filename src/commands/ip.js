const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Muestra la IP del servidor de Minecraft.'),
  async execute(interaction) {
    await interaction.reply({
      content: 'Este comando aún no está activo.',
      ephemeral: true,
    });
  },
};
