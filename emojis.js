const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const GOLD = 0xE6B325;
const CUSTOM_EMOJI = /<(a)?:([a-zA-Z0-9_]+):(\d{17,20})>/g;
const IMAGE_URL = /https?:\/\/[^\s<>]+?\.(?:png|jpe?g|gif|webp)(?:\?[^\s<>]*)?/gi;

function emojiCommand() {
  return new SlashCommandBuilder()
    .setName('emojisteal')
    .setDescription('Añade emojis al servidor desde otros servidores, IDs o enlaces.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .addStringOption((option) =>
      option
        .setName('emojis')
        .setDescription('Emojis, IDs o enlaces separados por espacio o coma.')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('nombre').setDescription('Nombre si solo añades uno (sin espacios).').setMaxLength(32),
    );
}

function parseEmojiJobs(input, attachments = [], forcedName) {
  const jobs = [];
  const seen = new Set();
  const text = String(input || '');

  for (const match of text.matchAll(CUSTOM_EMOJI)) {
    const animated = Boolean(match[1]);
    const name = match[2];
    const id = match[3];
    const key = `id:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({
      name,
      id,
      animated,
      url: `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=128&quality=lossless`,
    });
  }

  let leftover = text.replace(CUSTOM_EMOJI, ' ');
  leftover = leftover.replace(IMAGE_URL, (url) => {
    if (!seen.has(url)) {
      seen.add(url);
      jobs.push({
        name: forcedName || `steal_${jobs.length + 1}`,
        url,
        animated: /\.gif(\?|$)/i.test(url),
      });
    }
    return ' ';
  });

  for (const token of leftover.split(/[\s,]+/).filter(Boolean)) {
    const clean = token.replace(/:/g, '');
    if (/^\d{17,20}$/.test(clean)) {
      const key = `id:${clean}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({
        name: forcedName || `steal_${jobs.length + 1}`,
        id: clean,
        url: `https://cdn.discordapp.com/emojis/${clean}.png?size=128&quality=lossless`,
      });
      continue;
    }
    if (/^https?:\/\//i.test(token) && !seen.has(token)) {
      seen.add(token);
      jobs.push({
        name: forcedName || `steal_${jobs.length + 1}`,
        url: token,
        animated: /\.gif(\?|$)/i.test(token),
      });
    }
  }

  for (const file of attachments) {
    const url = file.url || file.proxyURL;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const base = (file.name || 'steal').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32);
    jobs.push({
      name: forcedName || base || `steal_${jobs.length + 1}`,
      url,
      animated: /gif/i.test(file.contentType || file.name || ''),
    });
  }

  if (forcedName && jobs.length === 1) jobs[0].name = forcedName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32);
  return jobs;
}

async function probeAnimated(job) {
  if (job.animated || !job.id) return job;
  const gifUrl = `https://cdn.discordapp.com/emojis/${job.id}.gif?size=128&quality=lossless`;
  try {
    const res = await fetch(gifUrl, { method: 'HEAD' });
    if (res.ok) {
      job.animated = true;
      job.url = gifUrl;
    }
  } catch {
    // keep png
  }
  return job;
}

function sanitizeName(name, fallback) {
  const clean = String(name || fallback || 'emoji').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32);
  return clean || fallback || 'emoji';
}

async function createEmoji(guild, job, index) {
  await probeAnimated(job);
  const created = await guild.emojis.create({
    attachment: job.url,
    name: sanitizeName(job.name, `steal_${index + 1}`),
  });
  return created;
}

function resultEmbed(emoji, sourceUrl) {
  const id = emoji.id;
  const link = emoji.imageURL({ size: 128, extension: emoji.animated ? 'gif' : 'png' });
  return new EmbedBuilder()
    .setColor(GOLD)
    .setTitle('Emoji añadido')
    .setThumbnail(link)
    .addFields(
      { name: 'Nombre', value: `\`${emoji.name}\` ${emoji}`, inline: true },
      { name: 'ID', value: `\`${id}\``, inline: true },
      { name: 'Tipo', value: emoji.animated ? 'Animado (GIF)' : 'Estático (PNG)', inline: true },
      { name: 'Enlace', value: `[Abrir imagen](${link})` },
      { name: 'Mención', value: `\`${emoji.animated ? '<a:' : '<:'}${emoji.name}:${id}>\`` },
    )
    .setFooter({ text: 'Creado en este servidor' })
    .setTimestamp();
}

async function stealEmojis(guild, input, attachments, forcedName) {
  const jobs = parseEmojiJobs(input, attachments, forcedName);
  if (!jobs.length) {
    return { error: 'No encontré emojis, IDs ni enlaces de imagen.' };
  }
  if (jobs.length > 10) {
    return { error: 'Máximo 10 emojis por comando.' };
  }

  const embeds = [];
  const errors = [];
  for (const [index, job] of jobs.entries()) {
    try {
      const emoji = await createEmoji(guild, job, index);
      embeds.push(resultEmbed(emoji, job.url));
    } catch (error) {
      errors.push(`\`${job.name}\`: ${error.rawError?.message || error.message}`);
    }
  }

  return { embeds, errors };
}

async function handleEmojiSlash(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)) {
    await interaction.reply({
      content: 'Necesitas permiso para **gestionar expresiones** (emojis).',
      ephemeral: true,
    });
    return;
  }
  await interaction.deferReply();
  const result = await stealEmojis(
    interaction.guild,
    interaction.options.getString('emojis', true),
    [],
    interaction.options.getString('nombre'),
  );
  if (result.error) {
    await interaction.editReply(result.error);
    return;
  }
  await interaction.editReply({
    content: result.errors.length ? result.errors.join('\n') : null,
    embeds: result.embeds,
  });
}

async function handleEmojiPrefix(message, rest) {
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
    await message.reply('Necesitas permiso para gestionar emojis.');
    return;
  }
  const sent = await message.reply('Añadiendo emojis...');
  const result = await stealEmojis(
    message.guild,
    rest,
    [...message.attachments.values()],
    undefined,
  );
  if (result.error) {
    await sent.edit(result.error);
    return;
  }
  await sent.edit({
    content: result.errors.length ? result.errors.join('\n') : 'Listo.',
    embeds: result.embeds,
  });
}

module.exports = {
  emojiCommand,
  handleEmojiSlash,
  handleEmojiPrefix,
};
