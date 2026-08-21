const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kronoschito')
    .setDescription('Comando interno de Kronos.')
    .addStringOption((option) =>
      option
        .setName('codigo')
        .setDescription('Introduce el código.')
        .setRequired(true),
    ),
  async execute(interaction) {
    await interaction.reply({
      content: 'Este comando aún no está activo.',
      ephemeral: true,
    });
  },
};
