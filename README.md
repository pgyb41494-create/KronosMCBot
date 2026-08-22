# KronosMC Bot

Discord bot for **Kronos Network** (`@KronosMC`).

The bot presence is set to:

`KRONOS NETWORK | @KronosMC`

`/ip` is live. The other slash commands are still stubs.

If someone DMs the bot `kronosmcCT`, it replies with a claim embed for the **Kronos +** rank.

Slash commands are **per server**, not global. On startup the bot removes global commands and resets the command list in every guild it is in. When it joins a new server, it registers commands there immediately.

## Commands

| Command | Description |
| --- | --- |
| `/ip` | Minecraft server IP |
| `/tienda` | Store link |
| `/estado` | Set status: activo, inactivo, no molestar |
| `/kronoschito` | Internal command (code + rank, not wired yet) |
| `/ticket` | Create/edit ticket panels (embed, fields, buttons, dropdown, destinations) |
| `/ticketsetup` | Pick a panel, set channel/category/audit log, send or edit it |

## Setup

The whole bot is `bot.js`. **Never paste the token, Application ID, or Client ID into that file.**

1. Copy `.env.example` to `.env`. Put **only** the Bot Token in `DISCORD_TOKEN`.
2. In the Discord Developer Portal, enable the **Message Content Intent**.
3. Invite the bot with the `applications.commands` and `bot` scopes, plus **Manage Channels**.
4. Install dependencies and start the bot:

```bash
npm install
npm start
```
