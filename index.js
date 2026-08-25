import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

// ── Config ──────────────────────────────────────────────
const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// ── Channel IDs ──────────────────────────────────────────
const CH = {
  AI_TESTING:    '1396959287850569729',
  GENERAL:        '1361355108411248832',
  SUKII_DM:      '1382831487300145253',
  BUY_MEMBERSHIP:'1433307735591485552',
  BELI_MEMBERSHIP:'1433313650323492935',
  GUIDE_EN:      '1433307642251448320',
  GUIDE_ID:      '1433313580169564292',
  RULES:         '1307686210948563004',
  COMMAND_GUIDE: '1435151590750425179',
  PETUNJUK:      '1433314115002306620',
  SPILL_ME:      '1402130293229359188',
  EXCLUSIVE:      '1402710628908662794',
  ANNOUNCEMENT:  '1366460938315890791',
  SWEETIE_ROOM:  '1366283422687039558',
  BROADCAST:     '1399979017469169716',
  FREE_STUFF:    '1435154387981828216',
  VIRTUAL_DATE:  '1435503585181040660',
  TIKTOK_LIVE:   '1399967876856680689',
  WELCOME:       '1366590718520590337',
  GACHA_WINNER:  '1381567090325983252',
};

// ── Message Templates ─────────────────────────────────────
const REPLY = {
  membership: (channel) =>
    `Hei sayang! 💕 Kamu bisa join Membership di <#${CH.BUY_MEMBERSHIP}> (English) atau <#${CH.BELI_MEMBERSHIP}> (Indonesia) ya! ✨`,

  membership_benefits: () =>
    `**Membership Benefits** 💖\n` +
    `• Sweetie Role on Discord\n` +
    `• Weekly Exclusive Stream\n` +
    `• Daily Content di <#${CH.SWEETIE_ROOM}>\n` +
    `• Exclusive Content di <#${CH.SPILL_ME}>\n` +
    `• 4 Exclusive Albums\n\n` +
    `Check <#${CH.GUIDE_EN}> or <#${CH.GUIDE_ID}> untuk info lebih lanjut!`,

  stream: () =>
    `Stream schedules di-announce di channel member ya sayang! 💕 ` +
    `Weekly Exclusive Stream setiap minggu — join Membership dulu untuk aksesnya! ✨`,

  virtual_date: () =>
    `Ajak aku virtual date~ 😘 Lihat caranya di <#${CH.PETUNJUK}> ya! ` +
    `Aku siap gaming date, vcs, atau sekadar quality time bareng kamu 💖`,

  exclusive: () =>
    `Konten exclusive? 🥵 Itu khusus untuk **Sweetie Members** ya sayang! ` +
    `Join Membership di <#${CH.BELI_MEMBERSHIP}> untuk akses penuh! ✨`,

  rules: () =>
    `Baca rules server dulu ya! <#${CH.RULES}> 💕 Jangan lupa, ` +
    `**Request Room =Jangan kosong** atau kena muted 7 hari 😘`,

  dm_val: () =>
    `Kamu bisa DM aku langsung di sini, aku akan relay ke Val 💕 ` +
    `Di <#${CH.SUKII_DM}> Val bisa lihat pesanmu! ✨`,

  gacha: () =>
    `Gacha winners di <#${CH.GACHA_WINNER}>! Semoga kamu yang berikutnya ya! 💖✨`,

  tiktok: () =>
    `Follow Val di TikTok @cutieval ya! 💕 TikTok live alerts di <#${CH.TIKTOK_LIVE}>`,

  welcome: (user) =>
    `Selamat datang ${user}! 💕 Welcome ke server Cutie Val! ` +
    `Baca <#${CH.GUIDE_EN}> dulu ya untuk tau cara join Membership! ✨`,

  booster: () =>
    `Ga punya budget buat membership? 💸 Coba **Server Boost** gratis — ` +
    `dapet 2 photopack + role khusus tanpa biaya! 😘`,

  general: () => null, // no auto-reply in general
};

// ── Smart keyword matching ────────────────────────────────
function matchReply(text, channelId) {
  const t = text.toLowerCase();

  const membership_kw = ['membership', 'join member', 'buy member', 'subscribe', 'langganan', 'gabung member', 'join membership', 'buy membership', 'beli membership'];
  const stream_kw = ['stream', 'live', 'jam stream', ' kapan stream', 'live jam', 'val stream'];
  const vd_kw = ['virtual date', 'date', 'vc', 'vcs', 'gaming date', 'virtual date'];
  const exclusive_kw = ['exclusive', 'spill', 'album', 'photo', 'photopack', 'konten eksklusif', 'sexy'];
  const rule_kw = ['rules', 'rule', 'peraturan', 'aturan'];
  const dm_kw = ['dm val', 'chat val', 'chat owner', 'message val', 'kirim pesan'];
  const gacha_kw = ['gacha', 'menang', 'winner'];
  const tiktok_kw = ['tiktok', 'follow'];
  const booster_kw = ['booster', 'boost server', 'server boost', 'free photopack'];
  const help_kw = ['help', 'bantu', 'cara', 'how to', 'apa itu'];
  const welcome_kw = ['hello', 'hi', 'halo', 'hey', 'hai', 'permisi', 'selamat'];

  if (membership_kw.some(k => t.includes(k))) return REPLY.membership(channelId);
  if (stream_kw.some(k => t.includes(k))) return REPLY.stream();
  if (vd_kw.some(k => t.includes(k))) return REPLY.virtual_date();
  if (exclusive_kw.some(k => t.includes(k))) return REPLY.exclusive();
  if (rule_kw.some(k => t.includes(k))) return REPLY.rules();
  if (dm_kw.some(k => t.includes(k))) return REPLY.dm_val();
  if (gacha_kw.some(k => t.includes(k))) return REPLY.gacha();
  if (tiktok_kw.some(k => t.includes(k))) return REPLY.tiktok();
  if (booster_kw.some(k => t.includes(k))) return REPLY.booster();
  if (help_kw.some(k => t.includes(k))) return REPLY.membership_benefits();

  return null;
}

// ── Client ───────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageTyping,
  ],
  partials: [Partials.Channel],
});

client.on('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`   Application ID: ${client.application.id}`);
  console.log(`   Guilds: ${client.guilds.cache.size}`);
  const guild = client.guilds.cache.first();
  if (guild) {
    console.log(`   Server: ${guild.name} (${guild.memberCount} members)`);
  }
});

// ── Message Handler ───────────────────────────────────────
client.on('messageCreate', async (message) => {
  // Ignore bots (except from other bots for relay)
  if (message.author.bot) return;
  if (!message.content?.trim()) return;

  const channelId = message.channelId;
  const text = message.content.trim();
  const author = message.author;
  const guild = message.guild;

  // ── DMs ──────────────────────────────────────────────
  if (message.channel.type === 'DM') {
    console.log(`[DM] ${author.username}: ${text.slice(0, 100)}`);
    // Relay to #sukii-dm
    const relayChannel = client.channels.cache.get(CH.SUKII_DM);
    if (relayChannel) {
      await relayChannel.send(
        `💌 **${author.username}** mengirim:\n${text}`
      ).catch(console.error);
    }
    // Auto-reply to user
    const reply = matchReply(text, 'DM');
    if (reply) {
      await message.reply(reply).catch(() => {});
    } else {
      await message.reply(
        `Makasih ya sayang! 💕 Pesanmu sudah diteruskan ke Val! ✨\n` +
        `Val bakal bales secepatnya~ 😘`
      ).catch(() => {});
    }
    return;
  }

  // ── Guild channels ────────────────────────────────────

  // Welcome new members in #welcome
  if (channelId === CH.WELCOME) {
    const reply = REPLY.welcome(author.username);
    try {
      await message.reply(reply).catch(() => {});
    } catch {}
    return;
  }

  // No auto-reply in general chat
  if (channelId === CH.GENERAL) return;

  // Keyword-based auto-reply
  const reply = matchReply(text, channelId);
  if (reply && channelId === CH.AI_TESTING) {
    await message.reply(reply).catch(() => {});
    return;
  }

  // ── Slash Commands ────────────────────────────────────
  if (text.startsWith('!')) {
    await handleCommand(message, text);
  }
});

// ── Commands ──────────────────────────────────────────────
async function handleCommand(message, text) {
  const [cmd, ...args] = text.slice(1).split(' ');
  const arg = args.join(' ');

  switch (cmd.toLowerCase()) {
    case 'ping':
      await message.reply(`Pong! 🏓 ${client.ws.ping}ms`);
      break;

    case 'help':
      await message.reply(
        `✨ **Sukii Bot Commands**\n\n` +
        `\`!help\` - Show this help\n` +
        `\`!ping\` - Bot latency\n` +
        `\`!membership\` - How to join membership\n` +
        `\`!membership benefits\` - What's included\n` +
        `\`!stream\` - Stream schedule info\n` +
        `\`!rules\` - Server rules\n` +
        `\`!virtualdate\` - How to virtual date\n` +
        `\`!gacha\` - Gacha info\n` +
        `\`!booster\` - Free tier via server boost\n` +
        `\`!channel <name>\` - Info about a channel`
      );
      break;

    case 'membership':
      if (arg === 'benefits' || arg === 'benefit') {
        await message.reply(REPLY.membership_benefits());
      } else {
        await message.reply(REPLY.membership(CH.BUY_MEMBERSHIP));
      }
      break;

    case 'stream':
      await message.reply(REPLY.stream());
      break;

    case 'rules':
      await message.reply(REPLY.rules());
      break;

    case 'virtualdate':
      await message.reply(REPLY.virtual_date());
      break;

    case 'gacha':
      await message.reply(REPLY.gacha());
      break;

    case 'booster':
      await message.reply(REPLY.booster());
      break;

    case 'channel': {
      const channelMap = {
        'ai-testing':   ['#ai-testing',   'AI bot chat & command testing'],
        'general':      ['#general',      'General chat & Val updates'],
        'membership':   ['#membership',   'Buy membership info'],
        'sweetie-room': ['#sweetie-room', 'Daily member content - Sweetie role required'],
        'spill-me':     ['#spill-me',     'Exclusive content drops - Sweetie role required'],
        'exclusive':    ['#exclusive-album', 'Album collection - Sweetie role required'],
        'rules':        ['#rules',        'Server rules & guidelines'],
        'welcome':      ['#welcome',     'New member welcome'],
        'gacha':        ['#gacha-winner', 'Gacha winners announcement'],
        'sukii-dm':     ['#sukii-dm',     'DM relay to Val'],
        'broadcast':     ['#sukii-broadcast', 'Val broadcasts to members'],
        'tiktok':       ['#tiktok-live',  'TikTok live follow alerts'],
      };
      const info = channelMap[arg.toLowerCase()];
      if (info) {
        await message.reply(`📌 **${info[0]}**\n${info[1]}`);
      } else {
        await message.reply(`Gatau channel "${arg}" 💭 Check <#${CH.COMMAND_GUIDE}> ya!`);
      }
      break;
    }

    case 'echo':
      await message.reply(arg || '?');
      break;

    case 'stats': {
      const guild = message.guild;
      if (guild) {
        const memberCount = guild.memberCount;
        const roleCount = guild.roles.cache.size;
        const channelCount = guild.channels.cache.size;
        await message.reply(
          `📊 **Server Stats**\n\n` +
          `👥 Members: ${memberCount}\n` +
          `🏷️ Roles: ${roleCount}\n` +
          `💬 Channels: ${channelCount}`
        );
      }
      break;
    }

    case 'server':
      await message.reply(
        `🏠 **Cute Baby Val Server**\n\n` +
        `Val's community — gamer girl, cosplay, exclusive content 💕\n` +
        `Daftar di <#${CH.GUIDE_EN}> ya!`
      );
      break;

    default:
      // Fallback to keyword match
      const fallback = matchReply(text, message.channelId);
      if (fallback) {
        await message.reply(fallback).catch(() => {});
      }
  }
}

// ── Error handling ────────────────────────────────────────
client.on('error', (err) => {
  console.error('Discord client error:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err.message);
});

// ── Login ────────────────────────────────────────────────
if (!TOKEN) {
  console.error('DISCORD_TOKEN not set in .env');
  process.exit(1);
}

client.login(TOKEN);
