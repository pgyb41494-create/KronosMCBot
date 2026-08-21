# KronosMC Bot

Discord bot for **Kronos Network** (`@KronosMC`).

The bot presence is set to:

`KRONOS NETWORK | @KronosMC`

Commands are registered as stubs for now. They reply that they are not active yet.

## Commands

| Command | Description |
| --- | --- |
| `/ip` | Minecraft server IP |
| `/tienda` | Store link |
| `/estado` | Set status: activo, inactivo, no molestar |
| `/kronoschito` | Internal command (code + rank, not wired yet) |

## Setup

1. Copy `.env.example` to `.env` and fill in your Discord bot token, application ID, and guild ID.
2. Invite the bot to your Discord server with the `applications.commands` and `bot` scopes.
3. Install dependencies and register slash commands:

```bash
npm install
npm run deploy
npm start
```

Guild commands (with `DISCORD_GUILD_ID`) show up immediately. Global commands can take up to an hour.
