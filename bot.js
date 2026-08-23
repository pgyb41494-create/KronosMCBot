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
const { ticketCommand, ticketSetupCommand, handleTicketInteraction, handleTicketSetupPrefix } = require('./tickets');
const { emojiCommand, handleEmojiSlash, handleEmojiPrefix } = require('./emojis');



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
let botOnlineStatus = 'online';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
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
    .setDescription('Cambia el estado del bot: activo, inactivo o no molestar.')
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
  emojiCommand(),
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

function setBotPresence() {
  if (!client.user) return;
  client.user.setPresence({
    activities: [{ name: STATUS, type: ActivityType.Playing }],
    status: botOnlineStatus,
  });
}

async function resetCommands(guild) {
  await guild.commands.set(commands);
}

client.once(Events.ClientReady, async () => {
  botOnlineStatus = 'online';
  setBotPresence();

  await client.application.commands.set([]);

  for (const guild of client.guilds.cache.values()) {
    await resetCommands(guild);
  }

  setBotPresence();
  setInterval(setBotPresence, 10 * 60 * 1000);

  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Status: online | ${STATUS}`);
});

client.on(Events.GuildCreate, async (guild) => {
  await resetCommands(guild);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (!message.guild) {
    if (message.content.trim().toLowerCase() === CLAIM_CODE.toLowerCase()) {
      await message.reply({ embeds: [claimEmbed()] });
    }
    return;
  }

  if (!message.content.startsWith('!')) return;
  const body = message.content.slice(1).trim();
  const space = body.indexOf(' ');
  const cmd = (space === -1 ? body : body.slice(0, space)).toLowerCase();
  const rest = space === -1 ? '' : body.slice(space + 1);

  if (cmd === 'emojisteal') {
    await handleEmojiPrefix(message, rest);
    return;
  }
  if (cmd === 'ticketsetup') {
    await handleTicketSetupPrefix(message);
  }
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

  if (interaction.commandName === 'emojisteal') {
    await handleEmojiSlash(interaction);
    return;
  }

  if (interaction.commandName === 'ip') {
    await interaction.reply({ embeds: [ipEmbed()] });
    return;
  }

  if (interaction.commandName === 'estado') {
    const modo = interaction.options.getString('modo', true);
    if (modo === 'activo') botOnlineStatus = 'online';
    if (modo === 'inactivo') botOnlineStatus = 'idle';
    if (modo === 'no_molestar') botOnlineStatus = 'dnd';
    setBotPresence();
    await interaction.reply({
      content: `Estado del bot: **${modo.replace('_', ' ')}**.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: 'Este comando aún no está activo.',
    ephemeral: true,
  });
});

client.login(token);
