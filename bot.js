require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  EmbedBuilder,
  ActivityType,
  Events,
} = require('discord.js');
const { ticketCommand, ticketSetupCommand, handleTicketInteraction } = require('./tickets');



const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Create a .env file next to bot.js with ONE line:');
  console.error('DISCORD_TOKEN=your_bot_token');
  console.error('Do not put the token in this code file.');
  process.exit(1);
}

if (/^\d{17,20}$/.test(token.trim())) {
  console.error('That is an Application ID, not a Bot Token.');
  console.error('Developer Portal -> Bot -> Token. Put that in .env only.');
  process.exit(1);
}

const STATUS = 'KRONOS NETWORK | @KronosMC';
const IP = 'kronosmcct.xyz';
const BEDROCK_PORT = '25569';
const CLAIM_CODE = 'kronosmcCT';
const GOLD = 0xE6B325;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const commands = [
  new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Muestra la IP del servidor de Minecraft.'),
  new SlashCommandBuilder()
    .setName('tienda')
    .setDescription('Muestra el enlace de la tienda de Kronos Network.'),
  new SlashCommandBuilder()
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
  new SlashCommandBuilder()
    .setName('kronoschito')
    .setDescription('Comando interno de Kronos.')
    .addStringOption((option) =>
      option.setName('codigo').setDescription('Introduce el código.').setRequired(true),
    ),
  ticketCommand(),
  ticketSetupCommand(),
].map((command) => command.toJSON());

function ipEmbed() {
  return new EmbedBuilder()
    .setColor(GOLD)
    .setTitle('IP del servidor')
    .setDescription('Usa estos datos para entrar a **Kronos Network**.')
    .addFields(
      {
        name: 'Java Edition',
        value: `> **IP:** \`${IP}\`\n> Entra directo con la IP, sin puerto extra.`,
      },
      {
        name: 'Bedrock Edition',
        value: `> **IP:** \`${IP}\`\n> **Puerto:** \`${BEDROCK_PORT}\``,
      },
    )
    .setFooter({ text: STATUS })
    .setTimestamp();
}

function claimEmbed() {
  return new EmbedBuilder()
    .setColor(GOLD)
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
      { name: 'Rango', value: '> **Kronos +**', inline: true },
      { name: 'Recompensa', value: '> Kit **MUY OP**', inline: true },
      {
        name: 'Cómo obtenerlo',
        value: '> Abre un **ticket** en el Discord y muestra este mensaje.',
      },
    )
    .setFooter({ text: STATUS })
    .setTimestamp();
}

async function resetCommands(guild) {
  await guild.commands.set(commands);
}

client.once(Events.ClientReady, async () => {
  client.user.setPresence({
    activities: [{ name: STATUS, type: ActivityType.Custom, state: STATUS }],
    status: 'online',
  });

  await client.application.commands.set([]);

  for (const guild of client.guilds.cache.values()) {
    await resetCommands(guild);
  }

  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.GuildCreate, async (guild) => {
  await resetCommands(guild);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || message.guild) return;
  if (message.content.trim().toLowerCase() !== CLAIM_CODE.toLowerCase()) return;

  await message.reply({ embeds: [claimEmbed()] });
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (await handleTicketInteraction(interaction)) return;
  } catch (error) {
    console.error(error);
    const reply = { content: 'Hubo un error con el sistema de tickets.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ip') {
    await interaction.reply({ embeds: [ipEmbed()] });
    return;
  }

  await interaction.reply({
    content: 'Este comando aún no está activo.',
    ephemeral: true,
  });
});

client.login(token);
