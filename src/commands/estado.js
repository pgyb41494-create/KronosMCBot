const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('estado')
    .setDescription('Cambia tu estado: activo, inactivo o no molestar.')
    .addStringOption((option) =>
      option
        .setName('modo')
        .setDescription('Elige el estado que quieres usar.')
        .setRequired(true)
        .addChoices(
          { name: 'Activo', value: 'activo' },
          { name: 'Inactivo', value: 'inactivo' },
          { name: 'No molestar', value: 'no_molestar' },
        ),
    ),
  async execute(interaction) {
    await interaction.reply({
      content: 'Este comando aún no está activo.',
      ephemeral: true,
    });
  },
};
