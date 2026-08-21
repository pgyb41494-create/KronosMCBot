const { EmbedBuilder } = require('discord.js');
const { botStatus, serverIp, bedrockPort } = require('./config');

const KRONOS_GOLD = 0xE6B325;

function ipEmbed() {
  return new EmbedBuilder()
    .setColor(KRONOS_GOLD)
    .setTitle('IP del servidor')
    .setDescription('Usa estos datos para entrar a **Kronos Network**.')
    .addFields(
      {
        name: 'Java Edition',
        value: ['> **IP:** `' + serverIp + '`', '> Entra directo con la IP, sin puerto extra.'].join('\n'),
      },
      {
        name: 'Bedrock Edition',
        value: ['> **IP:** `' + serverIp + '`', '> **Puerto:** `' + bedrockPort + '`'].join('\n'),
      },
      {
        name: 'Código secreto',
        value: [
          '> Mira bien la **IP**...',
          '> Si encuentras el código, envíamelo por **mensaje directo**.',
        ].join('\n'),
      },
    )
    .setFooter({ text: botStatus })
    .setTimestamp();
}

function claimCodeEmbed() {
  return new EmbedBuilder()
    .setColor(KRONOS_GOLD)
    .setTitle('¡Has reclamado el código KRONOSMCCT!')
    .setDescription(
      [
        '**Has reclamado el código `KRONOSMCCT`.**',
        '',
        '> Te da un rango exclusivo llamado **Kronos +**',
        '> Ese rango incluye un kit **MUY OP**',
        '> Lo reclamas abriendo un **ticket**',
      ].join('\n'),
    )
    .addFields(
      {
        name: 'Rango',
        value: '> **Kronos +**',
        inline: true,
      },
      {
        name: 'Recompensa',
        value: '> Kit **MUY OP**',
        inline: true,
      },
      {
        name: 'Cómo obtenerlo',
        value: '> Abre un **ticket** en el Discord y muestra este mensaje.',
      },
    )
    .setFooter({ text: botStatus })
    .setTimestamp();
}

module.exports = {
  ipEmbed,
  claimCodeEmbed,
};
