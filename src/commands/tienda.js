const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tienda')
    .setDescription('Muestra el enlace de la tienda de Kronos Network.'),
  async execute(interaction) {
    await interaction.reply({
      content: 'Este comando aún no está activo.',
      ephemeral: true,
    });
  },
};
