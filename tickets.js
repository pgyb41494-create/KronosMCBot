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
    .setTitle('Configuración de tickets')
    .setDescription(
      names.length
        ? 'Selecciona un panel para configurar el canal, la categoría y el registro.'
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

function setupConfigRows(panel) {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`tksetup_send:${panel.name}`)
        .setPlaceholder('Canal donde se envía el mensaje del panel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`tksetup_category:${panel.name}`)
        .setPlaceholder('Categoría donde se abren los tickets')
        .addChannelTypes(ChannelType.GuildCategory),
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`tksetup_audit:${panel.name}`)
        .setPlaceholder('Canal de registro de todos los tickets')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`tksetup_staff:${panel.name}`)
        .setPlaceholder('Rol del equipo que ve los tickets'),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`tksetup_post:${panel.name}`)
        .setLabel('Enviar panel')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`tksetup_edit:${panel.name}`)
        .setLabel('Editar texto')
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

function ticketCommand() {
  return new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Crea y edita paneles de tickets.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('crear')
        .setDescription('Crea un nuevo panel de tickets.')
        .addStringOption((option) =>
          option.setName('nombre').setDescription('ID interno del panel.').setRequired(true).setMaxLength(32),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('mensaje')
        .setDescription('Edita título, cuerpo, icono, miniatura, imagen grande y pie.')
        .addStringOption((option) =>
          option.setName('nombre').setDescription('ID del panel.').setRequired(true),
        )
        .addStringOption((option) => option.setName('titulo').setDescription('Título del mensaje.').setMaxLength(256))
        .addStringOption((option) => option.setName('cuerpo').setDescription('Texto principal.').setMaxLength(4000))
        .addStringOption((option) => option.setName('pie').setDescription('Pie del mensaje.').setMaxLength(2048))
        .addStringOption((option) => option.setName('color').setDescription('Color hex, ej. E6B325'))
        .addStringOption((option) => option.setName('icono').setDescription('URL del icono (esquina).'))
        .addStringOption((option) => option.setName('miniatura').setDescription('URL de la miniatura.'))
        .addStringOption((option) =>
          option.setName('imagen').setDescription('URL de la imagen grande de abajo.'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('campo')
        .setDescription('Añade un campo al mensaje.')
        .addStringOption((option) =>
          option.setName('nombre').setDescription('ID del panel.').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('titulo').setDescription('Nombre del campo.').setRequired(true).setMaxLength(256),
        )
        .addStringOption((option) =>
          option.setName('valor').setDescription('Texto del campo.').setRequired(true).setMaxLength(1024),
        )
        .addBooleanOption((option) => option.setName('en_linea').setDescription('¿En la misma fila?')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('boton')
        .setDescription('Añade un botón que abre un ticket.')
        .addStringOption((option) =>
          option.setName('nombre').setDescription('ID del panel.').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('texto').setDescription('Texto del botón.').setRequired(true).setMaxLength(80),
        )
        .addStringOption((option) =>
          option
            .setName('estilo')
            .setDescription('Color del botón.')
            .addChoices(
              { name: 'Azul', value: 'azul' },
              { name: 'Gris', value: 'gris' },
              { name: 'Verde', value: 'verde' },
              { name: 'Rojo', value: 'rojo' },
            ),
        )
        .addStringOption((option) => option.setName('emoji').setDescription('Emoji opcional.')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('menu')
        .setDescription('Activa o cambia el texto del menú desplegable.')
        .addStringOption((option) =>
          option.setName('nombre').setDescription('ID del panel.').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('texto_menu').setDescription('Texto del menú desplegable.').setMaxLength(150),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('opcion')
        .setDescription('Añade una opción al menú desplegable.')
        .addStringOption((option) =>
          option.setName('nombre').setDescription('ID del panel.').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('texto').setDescription('Texto de la opción.').setRequired(true).setMaxLength(100),
        )
        .addStringOption((option) =>
          option.setName('descripcion').setDescription('Descripción corta.').setMaxLength(100),
        )
        .addStringOption((option) => option.setName('emoji').setDescription('Emoji opcional.')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('destinos')
        .setDescription('Canal del panel, categoría de tickets y registro.')
        .addStringOption((option) =>
          option.setName('nombre').setDescription('ID del panel.').setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName('enviar_en')
            .setDescription('Dónde se envía el mensaje del panel.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addChannelOption((option) =>
          option
            .setName('categoria')
            .setDescription('Categoría donde se abren los tickets.')
            .addChannelTypes(ChannelType.GuildCategory),
        )
        .addChannelOption((option) =>
          option
            .setName('registro')
            .setDescription('Canal de registro de todos los tickets.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((option) =>
          option.setName('equipo').setDescription('Rol que puede ver los tickets.'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('vista')
        .setDescription('Muestra una vista previa del panel.')
        .addStringOption((option) =>
          option.setName('nombre').setDescription('ID del panel.').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('borrar')
        .setDescription('Borra un panel.')
        .addStringOption((option) =>
          option.setName('nombre').setDescription('ID del panel.').setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('lista').setDescription('Lista todos los paneles.'));
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
  const sub = interaction.options.getSubcommand();
  const { data, store } = guildStore(interaction.guildId);

  if (sub === 'lista') {
    await interaction.reply({ embeds: [setupListEmbed(store)], ephemeral: true });
    return;
  }

  if (sub === 'crear') {
    const name = slug(interaction.options.getString('nombre', true));
    if (store.panels[name]) {
      await interaction.reply({ content: `Ya existe el panel \`${name}\`.`, ephemeral: true });
      return;
    }
    savePanel(interaction.guildId, emptyPanel(name));
    await interaction.reply({
      content: `Panel \`${name}\` creado. Usa \`/ticket mensaje\`, \`/ticket boton\`, \`/ticket menu\` y luego \`/ticketsetup\`.`,
      ephemeral: true,
    });
    return;
  }

  const name = slug(interaction.options.getString('nombre', true));
  const panel = store.panels[name];
  if (!panel) {
    await interaction.reply({ content: `No existe el panel \`${name}\`.`, ephemeral: true });
    return;
  }

  if (sub === 'borrar') {
    delete store.panels[name];
    saveData(data);
    await interaction.reply({ content: `Panel \`${name}\` eliminado.`, ephemeral: true });
    return;
  }

  if (sub === 'mensaje') {
    const title = interaction.options.getString('titulo');
    const body = interaction.options.getString('cuerpo');
    const footer = interaction.options.getString('pie');
    const color = interaction.options.getString('color');
    const icon = interaction.options.getString('icono');
    const thumbnail = interaction.options.getString('miniatura');
    const image = interaction.options.getString('imagen');
    if (title != null) panel.title = title;
    if (body != null) panel.body = body;
    if (footer != null) panel.footer = footer;
    if (color != null) panel.color = parseColor(color);
    if (icon != null) panel.icon = icon;
    if (thumbnail != null) panel.thumbnail = thumbnail;
    if (image != null) panel.image = image;
    savePanel(interaction.guildId, panel);
    await interaction.reply({
      content: `Mensaje de \`${name}\` actualizado.`,
      embeds: [panelEmbed(panel)],
      ephemeral: true,
    });
    return;
  }

  if (sub === 'campo') {
    if (panel.fields.length >= 25) {
      await interaction.reply({ content: 'Este mensaje ya tiene 25 campos.', ephemeral: true });
      return;
    }
    panel.fields.push({
      name: interaction.options.getString('titulo', true),
      value: interaction.options.getString('valor', true),
      inline: interaction.options.getBoolean('en_linea') || false,
    });
    savePanel(interaction.guildId, panel);
    await interaction.reply({ content: `Campo añadido a \`${name}\`.`, ephemeral: true });
    return;
  }

  if (sub === 'boton') {
    if (panel.buttons.length >= 5) {
      await interaction.reply({ content: 'Máximo 5 botones por panel.', ephemeral: true });
      return;
    }
    panel.buttons.push({
      label: interaction.options.getString('texto', true),
      style: interaction.options.getString('estilo') || 'azul',
      emoji: interaction.options.getString('emoji') || '',
    });
    savePanel(interaction.guildId, panel);
    await interaction.reply({ content: `Botón añadido a \`${name}\`.`, ephemeral: true });
    return;
  }

  if (sub === 'menu') {
    panel.dropdown.placeholder =
      interaction.options.getString('texto_menu') || panel.dropdown.placeholder;
    savePanel(interaction.guildId, panel);
    await interaction.reply({
      content: `Menú de \`${name}\` listo. Añade opciones con \`/ticket opcion\`.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'opcion') {
    if (panel.dropdown.options.length >= 25) {
      await interaction.reply({ content: 'Máximo 25 opciones en el menú.', ephemeral: true });
      return;
    }
    panel.dropdown.options.push({
      label: interaction.options.getString('texto', true),
      description: interaction.options.getString('descripcion') || 'Abrir ticket',
      emoji: interaction.options.getString('emoji') || '',
    });
    savePanel(interaction.guildId, panel);
    await interaction.reply({ content: `Opción añadida al menú de \`${name}\`.`, ephemeral: true });
    return;
  }

  if (sub === 'destinos') {
    const send = interaction.options.getChannel('enviar_en');
    const category = interaction.options.getChannel('categoria');
    const audit = interaction.options.getChannel('registro');
    const staff = interaction.options.getRole('equipo');
    if (send) panel.sendChannelId = send.id;
    if (category) panel.categoryId = category.id;
    if (audit) panel.auditLogChannelId = audit.id;
    if (staff) panel.staffRoleId = staff.id;
    savePanel(interaction.guildId, panel);
    await interaction.reply({
      content: `Destinos de \`${name}\` guardados. También puedes cambiarlos en \`/ticketsetup\`.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'vista') {
    await interaction.reply({
      embeds: [panelEmbed(panel)],
      components: panelComponents(panel),
      ephemeral: true,
    });
  }
}

async function handleTicketSetupSlash(interaction) {
  const { store } = guildStore(interaction.guildId);
  const row = setupSelectRow(store);
  await interaction.reply({
    embeds: [setupListEmbed(store)],
    components: row ? [row] : [],
    ephemeral: true,
  });
}

function textInput(id, label, style, value, max = 4000) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(false)
    .setMaxLength(Math.min(max, style === TextInputStyle.Short ? 256 : 4000));
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

  if (interaction.isStringSelectMenu() && interaction.customId === 'tksetup_pick') {
    const panel = getPanel(interaction.guildId, interaction.values[0]);
    if (!panel) {
      await interaction.reply({ content: 'Ese panel ya no existe.', ephemeral: true });
      return true;
    }
    await interaction.update({
      content: `Configurando **${panel.title || panel.name}** (\`${panel.name}\`)`,
      embeds: [panelEmbed(panel), setupListEmbed(guildStore(interaction.guildId).store)],
      components: setupConfigRows(panel),
    });
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
    if (kind === 'tksetup_send') panel.sendChannelId = channelId;
    if (kind === 'tksetup_category') panel.categoryId = channelId;
    if (kind === 'tksetup_audit') panel.auditLogChannelId = channelId;
    savePanel(interaction.guildId, panel);
    await interaction.reply({
      content: `Guardado: <#${channelId}>`,
      ephemeral: true,
    });
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
    await interaction.reply({
      content: `Equipo: <@&${panel.staffRoleId}>`,
      ephemeral: true,
    });
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
        content: 'Elige primero el canal donde se envía el panel.',
        ephemeral: true,
      });
      return true;
    }
    const channel = interaction.guild.channels.cache.get(panel.sendChannelId);
    if (!channel?.isTextBased()) {
      await interaction.reply({ content: 'El canal del panel no es válido.', ephemeral: true });
      return true;
    }
    await channel.send({
      embeds: [panelEmbed(panel)],
      components: panelComponents(panel),
    });
    await interaction.reply({ content: `Panel enviado a ${channel}.`, ephemeral: true });
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
