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
} = require('discord.js');

const DATA_FILE = path.join(__dirname, 'tickets-data.json');
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
    sendChannelId: null,
    categoryId: null,
    auditLogChannelId: null,
    staffRoleId: null,
    messageId: null,
  };
}

function getPanel(guildId, name) {
  const { store } = guildStore(guildId);
  return store.panels[slug(name)] || null;
}

function savePanel(guildId, panel) {
  const { data, store } = guildStore(guildId);
  store.panels[panel.name] = panel;
  saveData(data);
}

function parseColor(value) {
  if (!value) return GOLD;
  const hex = value.replace('#', '').trim();
  const num = Number.parseInt(hex, 16);
  return Number.isNaN(num) ? GOLD : num;
}

function panelEmbed(panel) {
  const embed = new EmbedBuilder()
    .setColor(panel.color || GOLD)
    .setTitle(panel.title || 'Tickets')
    .setDescription(panel.body || ' ');

  if (panel.icon) embed.setAuthor({ name: panel.title || 'Tickets', iconURL: panel.icon });
  if (panel.thumbnail) embed.setThumbnail(panel.thumbnail);
  if (panel.image) embed.setImage(panel.image);
  if (panel.footer) embed.setFooter({ text: panel.footer });
  if (panel.fields?.length) {
    embed.addFields(
      panel.fields.map((field) => ({
        name: field.name,
        value: field.value,
        inline: Boolean(field.inline),
      })),
    );
  }

  return embed;
}

function panelComponents(panel) {
  const rows = [];

  if (panel.buttons?.length) {
    const row = new ActionRowBuilder();
    for (const [index, button] of panel.buttons.slice(0, 5).entries()) {
      const built = new ButtonBuilder()
        .setCustomId(`tkbtn:${panel.name}:${index}`)
        .setLabel(button.label.slice(0, 80))
        .setStyle(BUTTON_STYLES[button.style] || ButtonStyle.Primary);
      if (button.emoji) built.setEmoji(button.emoji);
      row.addComponents(built);
    }
    rows.push(row);
  }

  if (panel.dropdown?.options?.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`tkdd:${panel.name}`)
      .setPlaceholder(panel.dropdown.placeholder || 'Selecciona una opción')
      .addOptions(
        panel.dropdown.options.slice(0, 25).map((option, index) => {
          const item = {
            label: option.label.slice(0, 100),
            value: String(index),
            description: (option.description || 'Abrir ticket').slice(0, 100),
          };
          if (option.emoji) item.emoji = option.emoji;
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
        : 'No hay paneles todavía. Crea uno con `/ticket crear`.',
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

const SETUP_STEPS = [
  {
    id: 1,
    title: 'Paso 1 de 6 · Canal del mensaje',
    hint: 'Elige dónde se envía el panel de tickets.',
  },
  {
    id: 2,
    title: 'Paso 2 de 6 · Categoría',
    hint: 'Los tickets nuevos se abrirán en esta categoría.',
  },
  {
    id: 3,
    title: 'Paso 3 de 6 · Registro',
    hint: 'Canal de registro de todos los tickets (abrir y cerrar).',
  },
  {
    id: 4,
    title: 'Paso 4 de 6 · Equipo',
    hint: 'Rol que puede ver y atender los tickets.',
  },
  {
    id: 5,
    title: 'Paso 5 de 6 · Editar mensaje',
    hint: 'Cambia título, cuerpo, pie e imágenes.',
  },
  {
    id: 6,
    title: 'Paso 6 de 6 · Republicar',
    hint: 'Revisa todo y publica el panel otra vez con la nueva configuración.',
  },
];

function panelSummary(panel) {
  return [
    `> **ID:** \`${panel.name}\``,
    `> **Canal:** ${panel.sendChannelId ? `<#${panel.sendChannelId}>` : 'sin asignar'}`,
    `> **Categoría:** ${panel.categoryId ? `<#${panel.categoryId}>` : 'sin asignar'}`,
    `> **Registro:** ${panel.auditLogChannelId ? `<#${panel.auditLogChannelId}>` : 'sin asignar'}`,
    `> **Equipo:** ${panel.staffRoleId ? `<@&${panel.staffRoleId}>` : 'sin asignar'}`,
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
  if (step < 6) {
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
          .setPlaceholder('Rol del equipo que ve los tickets'),
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
      ),
    );
  }

  rows.push(wizardNav(panel, step));

  const embeds = [embed];
  if (step === 5 || step === 6) embeds.push(panelEmbed(panel));

  return { embeds, components: rows };
}

function pickPayload(store) {
  const row = setupSelectRow(store);
  return {
    content: null,
    embeds: [setupListEmbed(store)],
    components: row ? [row] : [],
  };
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
        { label: 'Crear panel', value: 'crear', description: 'Nuevo panel de tickets' },
        { label: 'Editar mensaje', value: 'mensaje', description: 'Título, cuerpo, pie e imágenes' },
        { label: 'Añadir campo', value: 'campo', description: 'Un field extra en el embed' },
        { label: 'Añadir botón', value: 'boton', description: 'Botón que abre un ticket' },
        { label: 'Menú desplegable', value: 'menu', description: 'Texto del dropdown' },
        { label: 'Añadir opción', value: 'opcion', description: 'Opción del menú desplegable' },
        { label: 'Destinos', value: 'destinos', description: 'Canal, categoría, registro y equipo' },
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

function botonModal(name) {
  return new ModalBuilder()
    .setCustomId(`tkt_boton:${name}`)
    .setTitle('Añadir botón')
    .addComponents(
      new ActionRowBuilder().addComponents(textInput('texto', 'Texto del botón', TextInputStyle.Short, '', 80, true)),
      new ActionRowBuilder().addComponents(textInput('estilo', 'Estilo: azul, gris, verde o rojo', TextInputStyle.Short, 'azul', 10)),
      new ActionRowBuilder().addComponents(textInput('emoji', 'Emoji (opcional)', TextInputStyle.Short, '', 32)),
    );
}

function menuModal(name, current) {
  return new ModalBuilder()
    .setCustomId(`tkt_menu:${name}`)
    .setTitle('Menú desplegable')
    .addComponents(
      new ActionRowBuilder().addComponents(
        textInput('texto_menu', 'Texto del menú', TextInputStyle.Short, current, 150),
      ),
    );
}

function opcionModal(name) {
  return new ModalBuilder()
    .setCustomId(`tkt_opcion:${name}`)
    .setTitle('Añadir opción')
    .addComponents(
      new ActionRowBuilder().addComponents(textInput('texto', 'Texto', TextInputStyle.Short, '', 100, true)),
      new ActionRowBuilder().addComponents(textInput('descripcion', 'Descripción', TextInputStyle.Short, 'Abrir ticket', 100)),
      new ActionRowBuilder().addComponents(textInput('emoji', 'Emoji (opcional)', TextInputStyle.Short, '', 32)),
    );
}

function ticketSetupCommand() {
  return new SlashCommandBuilder()
    .setName('ticketsetup')
    .setDescription('Elige un panel, configura canal y categoría, y envíalo o edítalo.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
}

async function sendAudit(guild, panel, text) {
  if (!panel.auditLogChannelId) return;
  const channel = guild.channels.cache.get(panel.auditLogChannelId);
  if (!channel?.isTextBased()) return;

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(GOLD)
        .setTitle('Registro | Tickets')
        .setDescription(text)
        .setTimestamp(),
    ],
  });
}

async function openTicket(interaction, panel, reason) {
  if (!panel.categoryId) {
    await interaction.reply({
      content: 'Este panel no tiene categoría. Un admin debe usar `/ticketsetup`.',
      ephemeral: true,
    });
    return;
  }

  const existing = interaction.guild.channels.cache.find(
    (channel) =>
      channel.parentId === panel.categoryId &&
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

  if (panel.staffRoleId) {
    overwrites.push({
      id: panel.staffRoleId,
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
    parent: panel.categoryId,
    topic: `ticket:${panel.name}:${interaction.user.id}`,
    permissionOverwrites: overwrites,
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tkclose:${panel.name}`)
      .setLabel('Cerrar ticket')
      .setStyle(ButtonStyle.Danger),
  );

  await channel.send({
    content: `${interaction.user}${panel.staffRoleId ? ` | <@&${panel.staffRoleId}>` : ''}`,
    embeds: [
      new EmbedBuilder()
        .setColor(panel.color || GOLD)
        .setTitle(panel.title || 'Ticket')
        .setDescription(
          [
            `Ticket de ${interaction.user}`,
            reason ? `> **Motivo:** ${reason}` : '> Explica tu problema y el equipo te atenderá.',
          ].join('\n'),
        )
        .setTimestamp(),
    ],
    components: [closeRow],
  });

  await interaction.reply({
    content: `Ticket creado: ${channel}`,
    ephemeral: true,
  });

  await sendAudit(
    interaction.guild,
    panel,
    `> **Abierto** por ${interaction.user} (${interaction.user.tag})\n> Panel: \`${panel.name}\`\n> Canal: ${channel}\n> Motivo: ${reason || 'botón'}`,
  );
}

async function handleTicketSlash(interaction) {
  const { store } = guildStore(interaction.guildId);
  await interaction.reply({ ...ticketHomePayload(store), ephemeral: true });
}

async function handleTicketSetupSlash(interaction) {
  const { store } = guildStore(interaction.guildId);
  await interaction.reply(pickPayload(store));
}

function textInput(id, label, style, value, max = 4000, required = false) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(Math.min(max, style === TextInputStyle.Short ? 400 : 4000));
  if (value) input.setValue(String(value).slice(0, Math.min(max, 4000)));
  return input;
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

  if (interaction.isStringSelectMenu() && interaction.customId === 'tkt_accion') {
    const action = interaction.values[0];
    const { store } = guildStore(interaction.guildId);

    if (action === 'crear') {
      await interaction.showModal(crearModal());
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
    if (action === 'boton') {
      await interaction.showModal(botonModal(panel.name));
      return true;
    }
    if (action === 'menu') {
      await interaction.showModal(menuModal(panel.name, panel.dropdown.placeholder));
      return true;
    }
    if (action === 'opcion') {
      await interaction.showModal(opcionModal(panel.name));
      return true;
    }
    if (action === 'destinos') {
      await interaction.update(wizardPayload(panel, 1));
      return true;
    }
    if (action === 'vista') {
      await interaction.update({
        content: null,
        embeds: [panelEmbed(panel)],
        components: [...panelComponents(panel), ticketActionRow()],
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

  if (interaction.isModalSubmit() && interaction.customId.startsWith('tkt_boton:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    if (panel.buttons.length >= 5) {
      await interaction.reply({ content: 'Máximo 5 botones por panel.', ephemeral: true });
      return true;
    }
    const style = (interaction.fields.getTextInputValue('estilo') || 'azul').toLowerCase().trim();
    panel.buttons.push({
      label: interaction.fields.getTextInputValue('texto'),
      style: BUTTON_STYLES[style] ? style : 'azul',
      emoji: interaction.fields.getTextInputValue('emoji') || '',
    });
    savePanel(interaction.guildId, panel);
    await interaction.reply({ content: `Botón añadido a \`${panel.name}\`.`, ephemeral: true });
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('tkt_menu:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    panel.dropdown.placeholder =
      interaction.fields.getTextInputValue('texto_menu') || panel.dropdown.placeholder;
    savePanel(interaction.guildId, panel);
    await interaction.reply({ content: `Menú de \`${panel.name}\` actualizado.`, ephemeral: true });
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('tkt_opcion:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    if (panel.dropdown.options.length >= 25) {
      await interaction.reply({ content: 'Máximo 25 opciones en el menú.', ephemeral: true });
      return true;
    }
    panel.dropdown.options.push({
      label: interaction.fields.getTextInputValue('texto'),
      description: interaction.fields.getTextInputValue('descripcion') || 'Abrir ticket',
      emoji: interaction.fields.getTextInputValue('emoji') || '',
    });
    savePanel(interaction.guildId, panel);
    await interaction.reply({ content: `Opción añadida al menú de \`${panel.name}\`.`, ephemeral: true });
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
    const next = Math.min(6, Number(stepText) + 1);
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
    panel.staffRoleId = interaction.values[0];
    savePanel(interaction.guildId, panel);
    await interaction.update(wizardPayload(panel, 4));
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

    const payload = {
      embeds: [panelEmbed(panel)],
      components: panelComponents(panel),
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
    const button = panel.buttons[Number(index)];
    await openTicket(interaction, panel, button?.label);
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('tkdd:')) {
    const name = interaction.customId.split(':')[1];
    const panel = getPanel(interaction.guildId, name);
    if (!panel) return true;
    const option = panel.dropdown.options[Number(interaction.values[0])];
    await openTicket(interaction, panel, option?.label);
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tkclose:')) {
    const panel = getPanel(interaction.guildId, interaction.customId.split(':')[1]);
    await interaction.reply('Cerrando ticket en 3 segundos...');
    if (panel) {
      await sendAudit(
        interaction.guild,
        panel,
        `> **Cerrado** por ${interaction.user} (${interaction.user.tag})\n> Canal: ${interaction.channel}`,
      );
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
};
