import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`   Application ID: ${client.application.id}`);
});

client.on('messageCreate', async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  // Simple ping command
  if (message.content === '!ping') {
    await message.reply(`Pong! 🏓 ${client.ws.ping}ms`);
  }

  // Echo command
  if (message.content.startsWith('!echo ')) {
    const text = message.content.slice(6);
    await message.reply(text);
  }
});

client.on('error', (err) => {
  console.error('Discord client error:', err);
});

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('DISCORD_TOKEN not set in .env');
  process.exit(1);
}

client.login(TOKEN);
