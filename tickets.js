const fs = require('node:fs');
const path = require('node:path');
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require('discord.js');

const { dataFile } = require('./storage');

const DATA_FILE = dataFile('tickets-data.json');
const LEGACY_FILE = path.join(__dirname, 'tickets-data.json');
const GOLD = 0xE6B325;
const BUTTON_STYLES = {
  azul: ButtonStyle.Primary,
  gris: ButtonStyle.Secondary,
  verde: ButtonStyle.Success,
  rojo: ButtonStyle.Danger,
};

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    try {
      if (fs.existsSync(LEGACY_FILE)) {
        const data = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'));
        saveData(data);
        return data;
      }
    } catch {
      // ignore corrupt legacy file
    }
    return { guilds: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function guildStore(guildId) {
  const data = loadData();
  if (!data.guilds[guildId]) data.guilds[guildId] = { panels: {} };
  return { data, store: data.guilds[guildId] };
}

function slug(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü-]+/gi, '-')
    .replace(/-+/g, '-')
    .slice(0, 32);
}

function emptyPanel(name) {
  return {
    name,
    title: 'Tickets',
    body: 'Elige una opción para abrir un ticket.',
    color: GOLD,
    footer: '',
    icon: '',
    thumbnail: '',
    image: '',
    fields: [],
    buttons: [],
    dropdown: { placeholder: 'Selecciona una opción', options: [] },
    items: [],
    componentMode: null,
    sendChannelId: null,
    categoryId: null,
    auditLogChannelId: null,
    staffRoleIds: [],
    messageId: null,
    ticketTitle: 'Ticket',
    ticketBody: 'Hola {user}, gracias por abrir un ticket.\n> Motivo: {motivo}\nEl equipo te atenderá pronto.',
  };
}

function getPanel(guildId, name) {
  const { store } = guildStore(guildId);
  const panel = store.panels[slug(name)] || null;
  if (!panel) return null;
  if (!Array.isArray(panel.staffRoleIds)) {
    panel.staffRoleIds = panel.staffRoleId ? [panel.staffRoleId] : [];
  }
  if (!panel.ticketTitle) panel.ticketTitle = 'Ticket';
  if (!panel.ticketBody) {
    panel.ticketBody = 'Hola {user}, gracias por abrir un ticket.\n> Motivo: {motivo}\nEl equipo te atenderá pronto.';
  }
  normalizePanel(panel);
  return panel;
}

function normalizePanel(panel) {
  if (!Array.isArray(panel.items)) panel.items = [];
  if (!panel.dropdown) panel.dropdown = { placeholder: 'Selecciona una opción', options: [] };
  if (!Array.isArray(panel.buttons)) panel.buttons = [];
  if (!panel.componentMode && !panel.items.length) {
    if (panel.dropdown.options?.length) panel.componentMode = 'dropdown';
    else if (panel.buttons.length) panel.componentMode = 'buttons';
  }
  if (!panel.items.length) {
    if (panel.componentMode === 'dropdown' && panel.dropdown.options?.length) {
      panel.items = panel.dropdown.options.map((option) => ({
        label: option.label,
        description: option.description || '',
        emoji: option.emoji || '',
        style: 'azul',
        categoryId: option.categoryId || '',
        roleId: option.roleId || '',
      }));
    } else if (panel.buttons.length) {
      panel.items = panel.buttons.map((button) => ({
        label: button.label,
        description: '',
        emoji: button.emoji || '',
        style: button.style || 'azul',
        categoryId: button.categoryId || '',
        roleId: button.roleId || '',
      }));
    }
  }
  return panel;
}

function panelItems(panel) {
  normalizePanel(panel);
  return panel.items || [];
}

function staffIds(panel) {
  if (Array.isArray(panel.staffRoleIds) && panel.staffRoleIds.length) return panel.staffRoleIds;
  if (panel.staffRoleId) return [panel.staffRoleId];
  return [];
}

function staffMentions(panel) {
  const ids = staffIds(panel);
  return ids.length ? ids.map((id) => `<@&${id}>`).join(' ') : 'sin asignar';
}

function savePanel(guildId, panel) {
  const { data, store } = guildStore(guildId);
  store.panels[panel.name] = panel;
  saveData(data);
}

function parseColor(value) {
  if (value == null || value === '') return GOLD;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let hex = String(value).trim();
  if (/^0x/i.test(hex)) hex = hex.slice(2);
  hex = hex.replace('#', '');
  const num = Number.parseInt(hex, 16);
  return Number.isNaN(num) ? GOLD : num;
}

function colorHex(value) {
  return `#${Number(value || GOLD).toString(16).padStart(6, '0').toUpperCase()}`;
}

function serializeEmoji(emoji) {
  if (!emoji) return '';
  if (typeof emoji === 'string') return emoji;
  if (emoji.id) return `<${emoji.animated ? 'a' : ''}:${emoji.name || 'emoji'}:${emoji.id}>`;
  return emoji.name || '';
}

function parseComponentEmoji(raw, guild) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const custom = text.match(/<(a)?:([a-zA-Z0-9_]+):(\d{17,20})>/);
  if (custom) {
    return { animated: Boolean(custom[1]), name: custom[2], id: custom[3] };
  }
  const idOnly = text.match(/^(\d{17,20})$/);
  if (idOnly) {
    const cached = guild?.emojis?.cache.get(idOnly[1]);
    if (cached) return { animated: cached.animated, name: cached.name, id: cached.id };
    return { id: idOnly[1] };
  }
  const named = text.replace(/:/g, '');
  const fromGuild = guild?.emojis?.cache.find((emoji) => emoji.name === named);
  if (fromGuild) {
    return { animated: fromGuild.animated, name: fromGuild.name, id: fromGuild.id };
  }
  return text;
}

function applyVars(text, ctx = {}) {
  if (text == null || text === '') return text;
  const user = ctx.user;
  const guild = ctx.guild;
  const map = {
    '{user}': user ? `<@${user.id}>` : '{user}',
    '{usuario}': user ? `<@${user.id}>` : '{usuario}',
    '{username}': user?.username ?? '{username}',
    '{usertag}': user?.tag ?? user?.username ?? '{usertag}',
    '{userid}': user?.id ?? '{userid}',
    '{server}': guild?.name ?? '{server}',
    '{servidor}': guild?.name ?? '{servidor}',
    '{serverid}': guild?.id ?? '{serverid}',
    '{membercount}': guild?.memberCount != null ? String(guild.memberCount) : '{membercount}',
    '{miembros}': guild?.memberCount != null ? String(guild.memberCount) : '{miembros}',
    '{channel}': ctx.channel ? `<#${ctx.channel.id}>` : '{channel}',
    '{canal}': ctx.channel ? `<#${ctx.channel.id}>` : '{canal}',
    '{motivo}': ctx.reason || '{motivo}',
    '{reason}': ctx.reason || '{reason}',
    '{staff}': ctx.staff || '{staff}',
    '{panel}': ctx.panelName || '{panel}',
  };

  let out = String(text);
  for (const [key, value] of Object.entries(map)) {
    out = out.split(key).join(String(value));
  }
  return out;
}

function varsFooter() {
  return {
    text: 'Variables: {user} {usuario} {username} {usertag} {userid} | {server} {servidor} {membercount} {miembros} | {channel} {canal} {motivo} {staff} {panel}',
  };
}

function ticketInsideEmbed(panel, ctx = {}) {
  return new EmbedBuilder()
    .setColor(panel.color || GOLD)
    .setTitle(applyVars(panel.ticketTitle || 'Ticket', ctx).slice(0, 256))
    .setDescription(
      applyVars(
        panel.ticketBody || 'Hola {user}, el equipo te atenderá pronto.\n> Motivo: {motivo}',
        ctx,
      ).slice(0, 4096),
    )
    .setTimestamp();
}

function panelEmbed(panel, ctx = {}) {
  const title = applyVars(panel.title || 'Tickets', ctx).slice(0, 256);
  const embed = new EmbedBuilder()
    .setColor(panel.color || GOLD)
    .setTitle(title || 'Tickets')
    .setDescription(applyVars(panel.body || ' ', ctx).slice(0, 4096));

  if (panel.icon) embed.setAuthor({ name: title || 'Tickets', iconURL: panel.icon });
  if (panel.thumbnail) embed.setThumbnail(applyVars(panel.thumbnail, ctx));
  if (panel.image) embed.setImage(applyVars(panel.image, ctx));
  if (panel.footer) embed.setFooter({ text: applyVars(panel.footer, ctx).slice(0, 2048) });
  if (panel.fields?.length) {
    embed.addFields(
      panel.fields.map((field) => ({
        name: applyVars(field.name, ctx).slice(0, 256),
        value: applyVars(field.value, ctx).slice(0, 1024),
        inline: Boolean(field.inline),
      })),
    );
  }

  return embed;
}

function panelComponents(panel, ctx = {}) {
  const rows = [];
  const items = panelItems(panel);
  const mode = panel.componentMode;
  const guild = ctx.guild;

  if (mode === 'buttons' && items.length) {
    for (let start = 0; start < Math.min(items.length, 25); start += 5) {
      const row = new ActionRowBuilder();
      for (const [offset, item] of items.slice(start, start + 5).entries()) {
        const index = start + offset;
        const built = new ButtonBuilder()
          .setCustomId(`tkbtn:${panel.name}:${index}`)
          .setLabel(applyVars(item.label, ctx).slice(0, 80))
          .setStyle(BUTTON_STYLES[item.style] || ButtonStyle.Primary);
        const emoji = parseComponentEmoji(item.emoji, guild);
        if (emoji) built.setEmoji(emoji);
        row.addComponents(built);
      }
      rows.push(row);
    }
  }

  if (mode === 'dropdown' && items.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`tkdd:${panel.name}`)
      .setPlaceholder(applyVars(panel.dropdown.placeholder || 'Selecciona una opción', ctx).slice(0, 150))
      .addOptions(
        items.slice(0, 25).map((option, index) => {
          const item = {
            label: applyVars(option.label, ctx).slice(0, 100),
            value: String(index),
            description: applyVars(option.description || 'Abrir ticket', ctx).slice(0, 100),
          };
          const emoji = parseComponentEmoji(option.emoji, guild);
          if (emoji) item.emoji = emoji;
          return item;
        }),
      );
    rows.push(new ActionRowBuilder().addComponents(menu));
  }

  return rows;
}

function setupListEmbed(store) {
  const names = Object.keys(store.panels);
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle('Paneles de tickets')
    .setDescription(
      names.length
        ? 'Usa el menú de abajo para elegir un panel y configurarlo paso a paso.'
        : 'No hay paneles todavía. Crea uno con `/ticket` o **Importar mensaje** con el enlace del embed.',
    );

  if (names.length) {
    embed.addFields(
      names.slice(0, 25).map((name) => {
        const panel = store.panels[name];
        return {
          name: panel.title || name,
          value: [
            `> ID: \`${name}\``,
            `> Canal: ${panel.sendChannelId ? `<#${panel.sendChannelId}>` : 'sin asignar'}`,
            `> Categoría: ${panel.categoryId ? `<#${panel.categoryId}>` : 'sin asignar'}`,
            `> Registro: ${panel.auditLogChannelId ? `<#${panel.auditLogChannelId}>` : 'sin asignar'}`,
            `> Equipo: ${staffMentions(panel)}`,
          ].join('\n'),
        };
      }),
    );
  }

  return embed;
}

function setupSelectRow(store) {
  const names = Object.keys(store.panels).slice(0, 25);
  if (!names.length) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tksetup_pick')
      .setPlaceholder('Elige un panel de tickets')
      .addOptions(
        names.map((name) => ({
          label: (store.panels[name].title || name).slice(0, 100),
          value: name,
          description: `ID: ${name}`.slice(0, 100),
        })),
      ),
  );
}

const LAST_SETUP_STEP = 8;
const SETUP_STEPS = [
  {
    id: 1,
    title: 'Paso 1 de 8 · Canal del mensaje',
    hint: 'Elige dónde se envía el panel de tickets.',
  },
  {
    id: 2,
    title: 'Paso 2 de 8 · Categoría',
    hint: 'Los tickets nuevos se abrirán en esta categoría (por defecto).',
  },
  {
    id: 3,
    title: 'Paso 3 de 8 · Registro',
    hint: 'Canal de registro de todos los tickets (abrir y cerrar).',
  },
  {
    id: 4,
    title: 'Paso 4 de 8 · Equipo',
    hint: 'Puedes elegir más de un rol. Esos roles verán los tickets.',
  },
  {
    id: 5,
    title: 'Paso 5 de 8 · Mensaje del panel',
    hint: 'Este embed es el que se publica en el canal (título, cuerpo, color, imágenes).',
  },
  {
    id: 6,
    title: 'Paso 6 de 8 · Mensaje dentro del ticket',
    hint: 'Este texto aparece dentro del canal cuando alguien abre un ticket.',
  },
  {
    id: 7,
    title: 'Paso 7 de 8 · Tipo de panel',
    hint: 'Elige **Menú desplegable** o **Botones**. Después de elegir, el tipo se bloquea y puedes añadir opciones.',
  },
  {
    id: 8,
    title: 'Paso 8 de 8 · Republicar',
    hint: 'Revisa todo y publica el panel otra vez con la nueva configuración.',
  },
];

function panelSummary(panel) {
  return [
    `> **ID:** \`${panel.name}\``,
    `> **Canal:** ${panel.sendChannelId ? `<#${panel.sendChannelId}>` : 'sin asignar'}`,
    `> **Categoría:** ${panel.categoryId ? `<#${panel.categoryId}>` : 'sin asignar'}`,
    `> **Registro:** ${panel.auditLogChannelId ? `<#${panel.auditLogChannelId}>` : 'sin asignar'}`,
    `> **Equipo:** ${staffMentions(panel)}`,
    `> **Color:** \`${colorHex(panel.color)}\``,
    `> **Tipo:** ${panel.componentMode === 'dropdown' ? 'menú desplegable' : panel.componentMode === 'buttons' ? 'botones' : 'sin elegir'}`,
  ].join('\n');
}

function wizardNav(panel, step) {
  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`tksetup_back:${panel.name}:${step}`)
      .setLabel('Atrás')
      .setStyle(ButtonStyle.Secondary),
  );
  if (step < LAST_SETUP_STEP) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`tksetup_next:${panel.name}:${step}`)
        .setLabel('Siguiente')
        .setStyle(ButtonStyle.Primary),
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`tksetup_post:${panel.name}`)
        .setLabel('Republicar')
        .setStyle(ButtonStyle.Success),
    );
  }
  return row;
}

function wizardPayload(panel, step) {
  const info = SETUP_STEPS.find((item) => item.id === step) || SETUP_STEPS[0];
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(info.title)
    .setDescription(`${info.hint}\n\n${panelSummary(panel)}`);

  if (step === 5 || step === 6) embed.setFooter(varsFooter());

  const rows = [];

  if (step === 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`tksetup_send:${panel.name}`)
          .setPlaceholder('Canal donde se envía el mensaje del panel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
    );
  }

  if (step === 2) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`tksetup_category:${panel.name}`)
          .setPlaceholder('Categoría donde se abren los tickets')
          .addChannelTypes(ChannelType.GuildCategory),
      ),
    );
  }

  if (step === 3) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`tksetup_audit:${panel.name}`)
          .setPlaceholder('Canal de registro de todos los tickets')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
    );
  }

  if (step === 4) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`tksetup_staff:${panel.name}`)
          .setPlaceholder('Roles del equipo que ven los tickets')
          .setMinValues(0)
          .setMaxValues(25),
      ),
    );
  }

  if (step === 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`tksetup_edit:${panel.name}`)
          .setLabel('Editar texto')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`tksetup_color:${panel.name}`)
          .setLabel('Color HEX')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  if (step === 6) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`tksetup_tickettxt:${panel.name}`)
          .setLabel('Editar mensaje del ticket')
          .setStyle(ButtonStyle.Primary),
      ),
    );
  }

  if (step === 7) {
    if (!panel.componentMode) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`tksetup_mode_dd:${panel.name}`)
            .setLabel('Menú desplegable')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`tksetup_mode_btn:${panel.name}`)
            .setLabel('Botones')
            .setStyle(ButtonStyle.Success),
        ),
      );
    } else {
      const ops = [
        new ButtonBuilder()
          .setCustomId(`tksetup_additem:${panel.name}`)
          .setLabel('Añadir opción')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`tksetup_clearitems:${panel.name}`)
          .setLabel('Vaciar lista')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`tksetup_mode_reset:${panel.name}`)
          .setLabel('Cambiar tipo')
          .setStyle(ButtonStyle.Secondary),
      ];
      if (panel.componentMode === 'dropdown') {
        ops.unshift(
          new ButtonBuilder()
            .setCustomId(`tksetup_editmenu:${panel.name}`)
            .setLabel('Texto del menú')
            .setStyle(ButtonStyle.Secondary),
        );
      }
      rows.push(new ActionRowBuilder().addComponents(ops.slice(0, 5)));
      const items = panelItems(panel);
      if (items.length) {
        rows.push(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`tksetup_rmpick:${panel.name}`)
              .setPlaceholder('Quitar una opción')
              .addOptions(
                items.slice(0, 25).map((item, index) => ({
                  label: `Quitar: ${item.label}`.slice(0, 100),
                  value: String(index),
                  description: (item.description || 'Eliminar esta opción').slice(0, 100),
                })),
              ),
          ),
        );
      }
    }
  }

  rows.push(wizardNav(panel, step));

  const embeds = [embed];
  if (step === 5) embeds.push(panelEmbed(panel));
  if (step === 6) embeds.push(ticketInsideEmbed(panel));
  if (step === 8) embeds.push(panelEmbed(panel), ticketInsideEmbed(panel));
  if (step === 7) {
    const items = panelItems(panel);
    const locked = panel.componentMode
      ? panel.componentMode === 'dropdown'
        ? 'Menú desplegable (bloqueado)'
        : 'Botones (bloqueado)'
      : 'Sin elegir — pulsa un botón de arriba';
    embeds.push(
      new EmbedBuilder()
        .setColor(panel.color || GOLD)
        .setTitle(locked)
        .setDescription(
          [
            panel.componentMode === 'dropdown'
              ? `> Texto del menú: **${panel.dropdown?.placeholder || 'Selecciona una opción'}**`
              : null,
            items.length
              ? items
                  .map(
                    (item, index) =>
                      `> ${index + 1}. ${item.emoji ? `${item.emoji} ` : ''}**${item.label}**${item.description ? `\n> ${item.description}` : ''}${item.categoryId ? `\n> Categoría: <#${item.categoryId}>` : ''}${item.roleId ? `\n> Rol: <@&${item.roleId}>` : ''}`,
                  )
                  .join('\n')
              : '> No hay opciones todavía. Usa **Añadir opción**.',
          ]
            .filter(Boolean)
            .join('\n'),
        ),
    );
  }

  return { embeds, components: rows };
}

function pickPayload(store) {
  const components = [];
  const row = setupSelectRow(store);
  if (row) components.push(row);
  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tksetup_import')
        .setLabel('Importar mensaje')
        .setStyle(ButtonStyle.Primary),
    ),
  );
  return {
    content: null,
    embeds: [setupListEmbed(store)],
    components,
  };
}

function importModal() {
  const input = textInput('enlace', 'Enlace del mensaje', TextInputStyle.Paragraph, '', 200, true);
  input.setPlaceholder('Clic derecho → Copiar enlace del mensaje');

  return new ModalBuilder()
    .setCustomId('tksetup_import_modal')
    .setTitle('Importar panel')
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function parseMessageLink(input, fallbackChannelId) {
  const text = String(input || '').trim();
  const match = text.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (match) {
    return { guildId: match[1], channelId: match[2], messageId: match[3] };
  }
  const idOnly = text.match(/^(\d{17,20})$/);
  if (idOnly && fallbackChannelId) {
    return { channelId: fallbackChannelId, messageId: idOnly[1] };
  }
  return null;
}

function styleFromDiscord(style) {
  if (style === ButtonStyle.Primary || style === 1) return 'azul';
  if (style === ButtonStyle.Secondary || style === 2) return 'gris';
  if (style === ButtonStyle.Success || style === 3) return 'verde';
  if (style === ButtonStyle.Danger || style === 4) return 'rojo';
  return 'azul';
}

function panelFromMessage(message) {
  const embed = message.embeds[0];
  let name = slug(embed?.title || 'tickets');
  if (!name) name = 'tickets';

  const panel = emptyPanel(name);
  if (embed) {
    panel.title = embed.title || panel.title;
    panel.body = embed.description || panel.body;
    panel.color = embed.color || panel.color;
    panel.footer = embed.footer?.text || '';
    panel.icon = embed.author?.iconURL || embed.author?.icon_url || '';
    panel.thumbnail = embed.thumbnail?.url || '';
    panel.image = embed.image?.url || '';
    panel.fields = (embed.fields || []).map((field) => ({
      name: field.name,
      value: field.value,
      inline: Boolean(field.inline),
    }));
  }

  panel.buttons = [];
  panel.dropdown = { placeholder: 'Selecciona una opción', options: [] };
  panel.items = [];
  panel.componentMode = null;

  for (const row of message.components || []) {
    for (const component of row.components || []) {
      if (component.type === 2 || component.data?.style) {
        panel.buttons.push({
          label: component.label || 'Ticket',
          style: styleFromDiscord(component.style),
          emoji: serializeEmoji(component.emoji),
        });
      }
      if (component.type === 3 || component.options) {
        panel.dropdown.placeholder = component.placeholder || panel.dropdown.placeholder;
        panel.dropdown.options = (component.options || []).map((option) => ({
          label: option.label,
          description: option.description || 'Abrir ticket',
          emoji: serializeEmoji(option.emoji),
        }));
      }
    }
  }

  if (panel.dropdown.options.length) panel.componentMode = 'dropdown';
  else if (panel.buttons.length) panel.componentMode = 'buttons';
  normalizePanel(panel);

  panel.sendChannelId = message.channelId;
  panel.messageId = message.id;
  return panel;
}

async function importPanelFromLink(interaction, link) {
  const parsed = parseMessageLink(link, interaction.channelId);
  if (!parsed) {
    await interaction.reply({
      content: 'Enlace inválido. En Discord: clic derecho en el mensaje del panel → **Copiar enlace del mensaje**.',
      ephemeral: true,
    });
    return;
  }

  if (parsed.guildId && parsed.guildId !== interaction.guildId) {
    await interaction.reply({ content: 'Ese mensaje no es de este servidor.', ephemeral: true });
    return;
  }

  const channel = await interaction.guild.channels.fetch(parsed.channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    await interaction.reply({ content: 'No pude ver ese canal. Dame acceso y prueba otra vez.', ephemeral: true });
    return;
  }

  const message = await channel.messages.fetch(parsed.messageId).catch(() => null);
  if (!message) {
    await interaction.reply({ content: 'No encontré ese mensaje.', ephemeral: true });
    return;
  }

  const { store } = guildStore(interaction.guildId);
  let panel = panelFromMessage(message);
  let base = panel.name;
  let n = 2;
  while (store.panels[panel.name]) {
    panel.name = `${base}-${n}`.slice(0, 32);
    n += 1;
  }

  savePanel(interaction.guildId, panel);

  try {
    await message.edit({
      embeds: message.embeds,
      components: panelComponents(panel, { guild: interaction.guild }),
    });
  } catch (error) {
    console.error('Could not rebind imported panel message:', error);
  }

  await interaction.reply({
    content: `Panel \`${panel.name}\` importado desde ${channel}. Ya puedes editarlo con \`/ticketsetup\`.`,
    ephemeral: true,
  });
}

function ticketCommand() {
  return new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Crea y edita paneles de tickets.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
}

function ticketActionRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tkt_accion')
      .setPlaceholder('Elige una acción')
      .addOptions(
        { label: 'Importar mensaje', value: 'importar', description: 'Recupera un panel ya publicado' },
        { label: 'Crear panel', value: 'crear', description: 'Nuevo panel de tickets' },
        { label: 'Editar mensaje', value: 'mensaje', description: 'Título, cuerpo, pie e imágenes' },
        { label: 'Añadir campo', value: 'campo', description: 'Un field extra en el embed' },
        { label: 'Vista previa', value: 'vista', description: 'Ver cómo queda el panel' },
        { label: 'Borrar panel', value: 'borrar', description: 'Eliminar un panel' },
        { label: 'Lista', value: 'lista', description: 'Ver todos los paneles' },
      ),
  );
}

function ticketHomePayload(store) {
  return {
    content: null,
    embeds: [
      new EmbedBuilder()
        .setColor(GOLD)
        .setTitle('Tickets')
        .setDescription('Elige una acción en el menú. No hace falta rellenar opciones del comando.')
        .addFields({
          name: 'Paneles',
          value: Object.keys(store.panels).length
            ? Object.keys(store.panels)
                .slice(0, 15)
                .map((name) => `> \`${name}\``)
                .join('\n')
            : '> Todavía no hay paneles.',
        }),
    ],
    components: [ticketActionRow()],
  };
}

function panelPickRow(store, action) {
  const names = Object.keys(store.panels).slice(0, 25);
  if (!names.length) return null;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`tkt_panel:${action}`)
      .setPlaceholder('Elige el panel')
      .addOptions(
        names.map((name) => ({
          label: (store.panels[name].title || name).slice(0, 100),
          value: name,
          description: `ID: ${name}`.slice(0, 100),
        })),
      ),
  );
}

function crearModal() {
  return new ModalBuilder()
    .setCustomId('tkt_crear')
    .setTitle('Crear panel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        textInput('nombre', 'Nombre / ID del panel', TextInputStyle.Short, '', 32, true),
      ),
    );
}

function campoModal(name) {
  return new ModalBuilder()
    .setCustomId(`tkt_campo:${name}`)
    .setTitle('Añadir campo')
    .addComponents(
      new ActionRowBuilder().addComponents(textInput('titulo', 'Título', TextInputStyle.Short, '', 256, true)),
      new ActionRowBuilder().addComponents(textInput('valor', 'Valor', TextInputStyle.Paragraph, '', 1024, true)),
    );
}

function itemModal(name) {
  return new ModalBuilder()
    .setCustomId(`tksetup_item:${name}`)
    .setTitle('Añadir opción')
    .addComponents(
      new ActionRowBuilder().addComponents(textInput('titulo', 'Título', TextInputStyle.Short, '', 80, true)),
      new ActionRowBuilder().addComponents(
        textInput('descripcion', 'Descripción', TextInputStyle.Short, 'Abrir ticket', 100),
      ),
      new ActionRowBuilder().addComponents(
        textInput('emoji', 'Emoji (servidor o unicode)', TextInputStyle.Short, '', 80),
      ),
      new ActionRowBuilder().addComponents(
        textInput('categoria', 'ID categoría (opcional)', TextInputStyle.Short, '', 20),
      ),
      new ActionRowBuilder().addComponents(textInput('rol', 'ID rol extra (opcional)', TextInputStyle.Short, '', 20)),
    );
}

function colorModal(panel) {
  return new ModalBuilder()
    .setCustomId(`tksetup_color_modal:${panel.name}`)
    .setTitle('Color del embed')
    .addComponents(
      new ActionRowBuilder().addComponents(
        textInput('color', 'HEX (#FF0000 o 0x7289DA)', TextInputStyle.Short, colorHex(panel.color), 10, true),
      ),
    );
}

function menuModal(name, current) {
  return new ModalBuilder()
    .setCustomId(`tksetup_menu:${name}`)
    .setTitle('Menú desplegable')
    .addComponents(
      new ActionRowBuilder().addComponents(
        textInput('texto_menu', 'Texto del menú', TextInputStyle.Short, current, 150),
      ),
    );
}

function ticketSetupCommand() {
  return new SlashCommandBuilder()
    .setName('ticketsetup')
    .setDescription('Elige un panel, configura canal y categoría, y envíalo o edítalo.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
}

async function sendAudit(guild, panel, options) {
  if (!panel.auditLogChannelId) return;
  let channel = guild.channels.cache.get(panel.auditLogChannelId);
  if (!channel) {
    channel = await guild.channels.fetch(panel.auditLogChannelId).catch(() => null);
  }
  if (!channel?.isTextBased()) return;

  const payload = {
    embeds: [
      new EmbedBuilder()
        .setColor(options.color || GOLD)
        .setTitle(options.title || 'Registro | Tickets')
        .setDescription((options.description || '').slice(0, 4096))
        .addFields((options.fields || []).slice(0, 25))
        .setTimestamp(),
    ],
  };
  if (options.files?.length) payload.files = options.files;

  await channel.send(payload);
}

function formatLogTime(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function formatDuration(startMs) {
  const ms = Math.max(0, Date.now() - startMs);
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours) return `${hours}h ${minutes % 60}m`;
  return `${Math.max(1, minutes)}m`;
}

async function fetchTicketHistory(channel) {
  const collected = [];
  let before;
  for (let i = 0; i < 10; i += 1) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    const list = [...batch.values()];
    collected.push(...list);
    before = list[list.length - 1].id;
    if (batch.size < 100) break;
  }

  collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = collected.map((message) => {
    const time = formatLogTime(message.createdAt);
    const author = message.author?.tag || message.author?.username || 'Desconocido';
    const bits = [];
    if (message.content) bits.push(message.content);
    if (message.attachments.size) {
      bits.push(
        [...message.attachments.values()].map((file) => `[archivo] ${file.url}`).join(' '),
      );
    }
    if (message.embeds.length && !message.content) bits.push('[embed]');
    return `[${time}] ${author}: ${bits.join(' ') || '(sin texto)'}`;
  });

  const participants = [...new Set(collected.map((message) => message.author?.tag).filter(Boolean))];

  return {
    count: collected.length,
    participants,
    transcript: lines.join('\n') || '(No hay mensajes)',
  };
}

async function openTicket(interaction, panel, item) {
  const reason = typeof item === 'string' ? item : item?.label || '';
  const categoryId = (typeof item === 'object' && item?.categoryId) || panel.categoryId;
  const extraRoleId = typeof item === 'object' ? item?.roleId : '';

  if (!categoryId) {
    await interaction.reply({
      content: 'Este panel no tiene categoría. Un admin debe usar `/ticketsetup`.',
      ephemeral: true,
    });
    return;
  }

  const existing = interaction.guild.channels.cache.find(
    (channel) =>
      channel.topic === `ticket:${panel.name}:${interaction.user.id}`,
  );

  if (existing) {
    await interaction.reply({
      content: `Ya tienes un ticket abierto: ${existing}`,
      ephemeral: true,
    });
    return;
  }

  const overwrites = [
    {
      id: interaction.guild.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
      ],
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
  ];

  for (const roleId of staffIds(panel)) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }
  if (extraRoleId && /^\d{17,20}$/.test(extraRoleId) && !staffIds(panel).includes(extraRoleId)) {
    overwrites.push({
      id: extraRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  const channel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90),
    type: ChannelType.GuildText,
    parent: categoryId,
    topic: `ticket:${panel.name}:${interaction.user.id}`,
    permissionOverwrites: overwrites,
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tkclose:${panel.name}`)
      .setLabel('Cerrar ticket')
      .setStyle(ButtonStyle.Danger),
  );

  const ctx = {
    user: interaction.user,
    guild: interaction.guild,
    channel,
    reason: reason || '',
    staff: staffMentions(panel),
    panelName: panel.name,
  };

  await channel.send({
    content: applyVars(`{user}${staffIds(panel).length ? ' | {staff}' : ''}`, ctx),
    embeds: [ticketInsideEmbed(panel, ctx)],
    components: [closeRow],
  });

  await interaction.reply({
    content: `Ticket creado: ${channel}`,
    ephemeral: true,
  });

  await sendAudit(interaction.guild, panel, {
    title: 'Ticket abierto',
    color: 0x57f287,
    description: `Se abrió un ticket en ${channel}.`,
    fields: [
      { name: 'Usuario', value: `${interaction.user} \`${interaction.user.tag}\`\nID: \`${interaction.user.id}\``, inline: true },
      { name: 'Panel', value: `\`${panel.name}\``, inline: true },
      { name: 'Motivo', value: reason || 'botón', inline: true },
      { name: 'Canal', value: `${channel}`, inline: true },
      { name: 'Equipo', value: staffMentions(panel), inline: true },
      { name: 'Cuenta creada', value: `<t:${Math.floor(interaction.user.createdTimestamp / 1000)}:R>`, inline: true },
    ],
  });
}

async function handleTicketSlash(interaction) {
  const { store } = guildStore(interaction.guildId);
  await interaction.reply({ ...ticketHomePayload(store), ephemeral: true });
}

async function handleTicketSetupSlash(interaction) {
  const { store } = guildStore(interaction.guildId);
  await interaction.reply(pickPayload(store));
}

async function handleTicketSetupPrefix(message) {
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply('Necesitas permiso de gestionar servidor.');
    return;
  }
  await message.reply(pickPayload(guildStore(message.guildId).store));
}

function textInput(id, label, style, value, max = 4000, required = false) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(String(label).slice(0, 45))
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(Math.min(max, style === TextInputStyle.Short ? 400 : 4000));
  if (value) input.setValue(String(value).slice(0, Math.min(max, 4000)));
  return input;
}

function ticketMsgModal(panel) {
  return new ModalBuilder()
    .setCustomId(`tksetup_ticketmsg:${panel.name}`)
    .setTitle('Mensaje del ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        textInput('ticket_title', 'Título dentro del ticket', TextInputStyle.Short, panel.ticketTitle, 256),
      ),
      new ActionRowBuilder().addComponents(
        textInput('ticket_body', 'Cuerpo dentro del ticket', TextInputStyle.Paragraph, panel.ticketBody, 4000),
      ),
    );
}

function editModal(panel) {
  return new ModalBuilder()
    .setCustomId(`tkedit:${panel.name}`)
    .setTitle('Editar panel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        textInput('title', 'Título', TextInputStyle.Short, panel.title, 256),
      ),
      new ActionRowBuilder().addComponents(
        textInput('body', 'Cuerpo', TextInputStyle.Paragraph, panel.body, 4000),
      ),
      new ActionRowBuilder().addComponents(
        textInput('footer', 'Pie de página', TextInputStyle.Short, panel.footer, 256),
      ),
      new ActionRowBuilder().addComponents(
        textInput('image', 'Imagen grande (URL)', TextInputStyle.Short, panel.image, 400),
      ),
      new ActionRowBuilder().addComponents(
        textInput('thumbnail', 'Miniatura (URL)', TextInputStyle.Short, panel.thumbnail, 400),
      ),
    );
}

async function handleTicketInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ticket') {
      await handleTicketSlash(interaction);
      return true;
    }
    if (interaction.commandName === 'ticketsetup') {
      await handleTicketSetupSlash(interaction);
      return true;
    }
    return false;
  }

  if (interaction.isButton() && interaction.customId === 'tksetup_import') {
    await interaction.showModal(importModal());
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'tksetup_import_modal') {
    await importPanelFromLink(interaction, interaction.fields.getTextInputValue('enlace'));
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'tkt_accion') {
    const action = interaction.values[0];
    const { store } = guildStore(interaction.guildId);

    if (action === 'crear') {
      await interaction.showModal(crearModal());
      return true;
    }

    if (action === 'importar') {
      await interaction.showModal(importModal());
      return true;
    }

    if (action === 'lista') {
      await interaction.update({
        content: null,
        embeds: [setupListEmbed(store)],
        components: [ticketActionRow()],
      });
      return true;
    }

    const pick = panelPickRow(store, action);
    if (!pick) {
      await interaction.reply({
        content: 'No hay paneles. Primero elige **Crear panel**.',
        ephemeral: true,
      });
      return true;
    }

    await interaction.update({
      content: null,
      embeds: [
        new EmbedBuilder()
          .setColor(GOLD)
          .setTitle('Tickets')
          .setDescription(`Acción: **${action}**\nElige el panel.`),
      ],
      components: [pick, ticketActionRow()],
    });
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('tkt_panel:')) {
    const action = interaction.customId.split(':')[1];
    const panel = getPanel(interaction.guildId, interaction.values[0]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }

    if (action === 'mensaje') {
      await interaction.showModal(editModal(panel));
      return true;
    }
    if (action === 'campo') {
      await interaction.showModal(campoModal(panel.name));
      return true;
    }
    if (action === 'vista') {
      await interaction.update({
        content: null,
        embeds: [panelEmbed(panel)],
        components: [...panelComponents(panel, { guild: interaction.guild }), ticketActionRow()],
      });
      return true;
    }
    if (action === 'borrar') {
      const { data, store } = guildStore(interaction.guildId);
      delete store.panels[panel.name];
      saveData(data);
      await interaction.update({
        content: `Panel \`${panel.name}\` eliminado.`,
        embeds: [],
        components: [ticketActionRow()],
      });
      return true;
    }
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'tkt_crear') {
    const name = slug(interaction.fields.getTextInputValue('nombre'));
    const { store } = guildStore(interaction.guildId);
    if (store.panels[name]) {
      await interaction.reply({ content: `Ya existe el panel \`${name}\`.`, ephemeral: true });
      return true;
    }
    savePanel(interaction.guildId, emptyPanel(name));
    await interaction.reply({
      content: `Panel \`${name}\` creado. Ahora puedes editar el mensaje o usar \`/ticketsetup\`.`,
      ephemeral: true,
    });
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('tkt_campo:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    if (panel.fields.length >= 25) {
      await interaction.reply({ content: 'Este mensaje ya tiene 25 campos.', ephemeral: true });
      return true;
    }
    panel.fields.push({
      name: interaction.fields.getTextInputValue('titulo'),
      value: interaction.fields.getTextInputValue('valor'),
      inline: false,
    });
    savePanel(interaction.guildId, panel);
    await interaction.reply({ content: `Campo añadido a \`${panel.name}\`.`, ephemeral: true });
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('tksetup_item:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    const max = panel.componentMode === 'buttons' ? 25 : 25;
    if (panelItems(panel).length >= max) {
      await interaction.reply({ content: 'Máximo 25 opciones.', ephemeral: true });
      return true;
    }
    const categoryId = interaction.fields.getTextInputValue('categoria').trim();
    const roleId = interaction.fields.getTextInputValue('rol').trim();
    panel.items.push({
      label: interaction.fields.getTextInputValue('titulo'),
      description: interaction.fields.getTextInputValue('descripcion') || 'Abrir ticket',
      emoji: interaction.fields.getTextInputValue('emoji') || '',
      style: 'azul',
      categoryId: /^\d{17,20}$/.test(categoryId) ? categoryId : '',
      roleId: /^\d{17,20}$/.test(roleId) ? roleId : '',
    });
    savePanel(interaction.guildId, panel);
    await interaction.update(wizardPayload(panel, 7));
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('tksetup_color_modal:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    panel.color = parseColor(interaction.fields.getTextInputValue('color'));
    savePanel(interaction.guildId, panel);
    await interaction.update(wizardPayload(panel, 5));
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('tksetup_menu:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    panel.dropdown.placeholder =
      interaction.fields.getTextInputValue('texto_menu') || panel.dropdown.placeholder;
    savePanel(interaction.guildId, panel);
    await interaction.update(wizardPayload(panel, 7));
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'tksetup_pick') {
    const panel = getPanel(interaction.guildId, interaction.values[0]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    await interaction.update(wizardPayload(panel, 1));
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tksetup_next:')) {
    const [, name, stepText] = interaction.customId.split(':');
    const panel = getPanel(interaction.guildId, name);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    const next = Math.min(LAST_SETUP_STEP, Number(stepText) + 1);
    await interaction.update(wizardPayload(panel, next));
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tksetup_back:')) {
    const [, name, stepText] = interaction.customId.split(':');
    const step = Number(stepText);
    if (step <= 1) {
      await interaction.update(pickPayload(guildStore(interaction.guildId).store));
      return true;
    }
    const panel = getPanel(interaction.guildId, name);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    await interaction.update(wizardPayload(panel, step - 1));
    return true;
  }

  if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('tksetup_')) {
    const [kind, name] = interaction.customId.split(':');
    const panel = getPanel(interaction.guildId, name);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    const channelId = interaction.values[0];
    let step = 1;
    if (kind === 'tksetup_send') {
      if (panel.sendChannelId !== channelId) panel.messageId = null;
      panel.sendChannelId = channelId;
      step = 1;
    }
    if (kind === 'tksetup_category') {
      panel.categoryId = channelId;
      step = 2;
    }
    if (kind === 'tksetup_audit') {
      panel.auditLogChannelId = channelId;
      step = 3;
    }
    savePanel(interaction.guildId, panel);
    await interaction.update(wizardPayload(panel, step));
    return true;
  }

  if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('tksetup_staff:')) {
    const name = interaction.customId.split(':')[1];
    const panel = getPanel(interaction.guildId, name);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    panel.staffRoleIds = interaction.values;
    delete panel.staffRoleId;
    savePanel(interaction.guildId, panel);
    await interaction.update(wizardPayload(panel, 4));
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tksetup_mode_dd:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    panel.componentMode = 'dropdown';
    normalizePanel(panel);
    savePanel(interaction.guildId, panel);
    await interaction.update(wizardPayload(panel, 7));
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tksetup_mode_btn:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    panel.componentMode = 'buttons';
    normalizePanel(panel);
    savePanel(interaction.guildId, panel);
    await interaction.update(wizardPayload(panel, 7));
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tksetup_mode_reset:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    panel.componentMode = null;
    savePanel(interaction.guildId, panel);
    await interaction.update(wizardPayload(panel, 7));
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tksetup_additem:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    await interaction.showModal(itemModal(panel.name));
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tksetup_clearitems:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    panel.items = [];
    panel.buttons = [];
    if (panel.dropdown) panel.dropdown.options = [];
    savePanel(interaction.guildId, panel);
    await interaction.update(wizardPayload(panel, 7));
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('tksetup_rmpick:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    const index = Number(interaction.values[0]);
    panel.items.splice(index, 1);
    savePanel(interaction.guildId, panel);
    await interaction.update(wizardPayload(panel, 7));
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tksetup_color:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    await interaction.showModal(colorModal(panel));
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tksetup_editmenu:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    await interaction.showModal(menuModal(panel.name, panel.dropdown.placeholder));
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tksetup_post:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    if (!panel.sendChannelId) {
      await interaction.reply({
        content: 'Elige primero el canal donde se envía el panel (paso 1).',
        ephemeral: true,
      });
      return true;
    }
    const channel = interaction.guild.channels.cache.get(panel.sendChannelId);
    if (!channel?.isTextBased()) {
      await interaction.reply({ content: 'El canal del panel no es válido.', ephemeral: true });
      return true;
    }

    const publishCtx = { guild: interaction.guild, panelName: panel.name };
    const payload = {
      embeds: [panelEmbed(panel, publishCtx)],
      components: panelComponents(panel, publishCtx),
    };

    let published = 'enviado';
    if (panel.messageId) {
      try {
        const existing = await channel.messages.fetch(panel.messageId);
        await existing.edit(payload);
        published = 'actualizado';
      } catch {
        const sent = await channel.send(payload);
        panel.messageId = sent.id;
        savePanel(interaction.guildId, panel);
      }
    } else {
      const sent = await channel.send(payload);
      panel.messageId = sent.id;
      savePanel(interaction.guildId, panel);
    }

    await interaction.reply({
      content: `Panel ${published} en ${channel}.`,
      ephemeral: true,
    });
    await interaction.message.delete().catch(() => {});
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tksetup_tickettxt:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    await interaction.showModal(ticketMsgModal(panel));
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('tksetup_ticketmsg:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    panel.ticketTitle = interaction.fields.getTextInputValue('ticket_title') || panel.ticketTitle;
    panel.ticketBody = interaction.fields.getTextInputValue('ticket_body') || panel.ticketBody;
    savePanel(interaction.guildId, panel);
    await interaction.update(wizardPayload(panel, 6));
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tksetup_edit:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    await interaction.showModal(editModal(panel));
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('tkedit:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    panel.title = interaction.fields.getTextInputValue('title') || panel.title;
    panel.body = interaction.fields.getTextInputValue('body') || panel.body;
    panel.footer = interaction.fields.getTextInputValue('footer');
    panel.image = interaction.fields.getTextInputValue('image');
    panel.thumbnail = interaction.fields.getTextInputValue('thumbnail');
    savePanel(interaction.guildId, panel);
    await interaction.reply({
      content: 'Panel actualizado.',
      embeds: [panelEmbed(panel)],
      ephemeral: true,
    });
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tkbtn:')) {
    const [, name, index] = interaction.customId.split(':');
    const panel = getPanel(interaction.guildId, name);
    if (!panel) return true;
    const items = panelItems(panel);
    const button = items[Number(index)];
    await openTicket(interaction, panel, button);
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('tkdd:')) {
    const name = interaction.customId.split(':')[1];
    const panel = getPanel(interaction.guildId, name);
    if (!panel) return true;
    const option = panelItems(panel)[Number(interaction.values[0])];
    await openTicket(interaction, panel, option);
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tkclose:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    await interaction.reply('Cerrando ticket y enviando el registro...');

    if (panel) {
      const topic = interaction.channel.topic || '';
      const openedId = topic.split(':')[2];
      const opener = openedId ? `<@${openedId}>` : 'desconocido';
      const history = await fetchTicketHistory(interaction.channel).catch(() => ({
        count: 0,
        participants: [],
        transcript: '(No se pudo leer el historial)',
      }));

      const files = [];
      if (history.transcript) {
        files.push(
          new AttachmentBuilder(Buffer.from(history.transcript, 'utf8'), {
            name: `ticket-${interaction.channel.name}.txt`,
          }),
        );
      }

      await sendAudit(interaction.guild, panel, {
        title: 'Ticket cerrado',
        color: 0xed4245,
        description: `Se cerró ${interaction.channel} y se adjuntó el historial del chat.`,
        fields: [
          { name: 'Cerrado por', value: `${interaction.user} \`${interaction.user.tag}\``, inline: true },
          { name: 'Abierto por', value: opener, inline: true },
          { name: 'Panel', value: `\`${panel.name}\``, inline: true },
          { name: 'Duración', value: formatDuration(interaction.channel.createdTimestamp), inline: true },
          { name: 'Mensajes', value: String(history.count), inline: true },
          {
            name: 'Participantes',
            value: (history.participants.join('\n') || 'ninguno').slice(0, 1024),
            inline: true,
          },
          { name: 'Canal', value: `\`${interaction.channel.name}\``, inline: false },
        ],
        files,
      });
    }

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 3000);
    return true;
  }

  return false;
}

module.exports = {
  ticketCommand,
  ticketSetupCommand,
  handleTicketInteraction,
  handleTicketSetupPrefix,
};
