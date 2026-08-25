import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

// ── Config ──────────────────────────────────────────────
const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// ── Role IDs ──────────────────────────────────────────────
const ROLE = {
  CUTIES:      '1366648025619103744', // Cuties 💕 — default role for all members
  SWEETIE:     '1366648025589096453', // Sweetie — membership role (to add when found)
  MODERATORS:  null, // find dynamically
};

// ── Channel IDs ──────────────────────────────────────────
const CH = {
  SUKII_DM:      '1382831487300145253',
  BUY_MEMBERSHIP:'1433307735591485552',
  BELI_MEMBERSHIP:'1433313650323492935',
  GUIDE_EN:      '1433307642251448320',
  GUIDE_ID:      '1433313580169564292',
  RULES:         '1307686210948563004',
  PETUNJUK:      '1433314115002306620',
  SPILL_ME:      '1402130293229359188',
  EXCLUSIVE:      '1402710628908662794',
  ANNOUNCEMENT:  '1366460938315890791',
  SWEETIE_ROOM:  '1366283422687039558',
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
    `Follow Val di TikTok @cutieval ya! 💕`,

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
    // Audit: give Cuties role to members who don't have it
    auditCutiesRole(guild);
  }
});

// ── Auto-role: Give Cuties 💕 to new members ─────────────
client.on('guildMemberAdd', async (member) => {
  if (member.user.bot) return;
  try {
    const role = member.guild.roles.cache.get(ROLE.CUTIES);
    if (role && !member.roles.cache.has(ROLE.CUTIES)) {
      await member.roles.add(role);
      console.log(`[ROLE] Added Cuties to ${member.user.username}`);
    }
  } catch (err) {
    console.error(`[ROLE] Failed to add Cuties to ${member.user.username}:`, err.message);
  }
});

// ── Audit: Ensure all members have Cuties role ────────────
async function auditCutiesRole(guild) {
  try {
    const role = guild.roles.cache.get(ROLE.CUTIES);
    if (!role) { console.warn('[ROLE] Cuties role not found'); return; }

    let given = 0, skipped = 0;
    const members = await guild.members.fetch();

    for (const [id, member] of members) {
      if (member.user.bot) { skipped++; continue; }
      if (!member.roles.cache.has(ROLE.CUTIES)) {
        await member.roles.add(role).catch(() => {});
        given++;
        console.log(`[ROLE] +Cuties: ${member.user.username}`);
      } else {
        skipped++;
      }
    }
    console.log(`[ROLE] Audit done: gave Cuties to ${given} members, ${skipped} already had it`);
  } catch (err) {
    console.error('[ROLE] Audit failed:', err.message);
  }
}

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

  // Keyword-based auto-reply (no channel restriction)
  const reply = matchReply(text, channelId);
  if (reply) {
    await message.reply(reply).catch(() => {});
    return;
  }

  // ── Command check (only Baby Val role) ──────────────────────
  if (text.startsWith('!')) {
    if (!message.member || !hasBabyValRole(message.member)) return;
    await handleCommand(message, text);
  }
});

// ── Moderator IDs ─────────────────────────────────────────
const MOD_IDS = new Set(['1307562563147661364']); // Deo
const BABY_VAL_ROLE = '1361766462724898876'; // ❤️・Baby Val・❤️ — only role that can use commands

function isMod(userId) {
  return MOD_IDS.has(userId);
}

function hasBabyValRole(member) {
  return member.roles.cache.has(BABY_VAL_ROLE);
}

// ── Announcement Formatter ─────────────────────────────────

/**
 * Format patch-note style announcement.
 * Input format (newline-separated):
 *   TITLE: <text>
 *   SECT: <emoji> | <section_title> | <content>
 *   TLDR: <bullet>
 *   CHANNEL: <channel_id>
 */
function formatAnnouncement(input) {
  const DIVIDER = '✦•━━━━━━━━━━━━━━━━━━━━━━━━━━━━━•✦';
  const lines = input.trim().split('\n');
  let title = '';
  const sections = [];
  const tldr = [];
  let channel = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('TITLE:')) {
      title = trimmed.slice(6).trim();
    } else if (trimmed.startsWith('SECT:')) {
      const rest = trimmed.slice(5).trim();
      const firstPipe = rest.indexOf('|');
      if (firstPipe === -1) continue;
      const emoji = rest.slice(0, firstPipe).trim();
      const afterEmoji = rest.slice(firstPipe + 1).trim();
      const lastPipe = afterEmoji.lastIndexOf('|');
      const secTitle = lastPipe === -1
        ? afterEmoji
        : afterEmoji.slice(0, lastPipe).trim();
      const secContent = lastPipe === -1
        ? ''
        : afterEmoji.slice(lastPipe + 1).trim();
      sections.push({ emoji, title: secTitle, content: secContent });
    } else if (trimmed.startsWith('TLDR:')) {
      tldr.push(trimmed.slice(5).trim());
    } else if (trimmed.startsWith('CHANNEL:')) {
      channel = trimmed.slice(8).trim();
    }
  }

  if (!title || sections.length === 0) return null;

  let msg = `# 🌟 **${title}** 🌟\n\n`;

  for (const { emoji, title: secTitle, content } of sections) {
    if (!content) {
      msg += `## ${emoji} **${secTitle}**\n\n`;
      continue;
    }
    // Split content: first part before any >> is the body, each >> starts a sub-section
    // Each sub-section format: ">>SubTitle\nsub-content"
    const parts = content.split(/(?=>>)/);
    let body = parts[0].trim();
    const subs = parts.slice(1);

    msg += `## ${emoji} **${secTitle}**\n${body}\n`;
    for (const sub of subs) {
      const subTrimmed = sub.trim(); // ">>Title\ncontent" or ">>Title"
      if (!subTrimmed.startsWith('>>')) continue;
      const after = subTrimmed.slice(2).trim(); // "Title\ncontent" or "Title"
      const nlIdx = after.indexOf('\n');
      if (nlIdx === -1) {
        msg += `### ${after}\n`;
      } else {
        const subTitle = after.slice(0, nlIdx).trim();
        const subBody = after.slice(nlIdx + 1).trim();
        msg += `### ${subTitle}\n${subBody}\n`;
      }
    }
    msg += '\n';
  }

  if (tldr.length > 0) {
    msg += `**📋 Ringkasan:**\n`;
    for (const b of tldr) msg += `• ${b}\n`;
    msg += '\n';
  }

  msg += `<@&${ROLE.CUTIES}>\n\n${DIVIDER}`;

  return { text: msg, channel };
}

// ── Commands ──────────────────────────────────────────────
async function handleCommand(message, text) {
  const [cmd, ...args] = text.slice(1).split('\n');
  const arg = args.join('\n');

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
        await message.reply(`Gatau channel "${arg}" 💭`).catch(() => {});
      }
      break;
    }

    case 'announce': {
      if (!MOD_IDS.has(message.author.id)) {
        await message.reply('❌ Hanya moderator yang bisa pakai ini.').catch(() => {});
        return;
      }
      const result = formatAnnouncement(arg);
      if (!result) {
        await message.reply(
          '❌ Format salah. Contoh:\n' +
          '```\n' +
          '!announce\n' +
          'TITLE: Update Bulan Ini\n' +
          'SECT: 🆕 | Konten Baru | Deskripsi konten\n' +
          'SECT: ⚠️ | Perhatian | Isi perhatian\n' +
          'TLDR: Bullet ringkasan 1\n' +
          'TLDR: Bullet ringkasan 2\n' +
          '```\n' +
          'Gunakan >> untuk sub-header (contoh: content>>Sub Header Title)'
        ).catch(() => {});
        return;
      }
      const targetCh = message.guild.channels.cache.get(result.channel || CH.ANNOUNCEMENT);
      if (!targetCh) {
        await message.reply(`❌ Channel tidak ditemukan.`).catch(() => {});
        return;
      }
      try {
        await targetCh.send(result.text);
        await message.reply(`✅ Announce terkirim ke <#${targetCh.id}>`).catch(() => {});
      } catch (err) {
        await message.reply(`❌ Gagal kirim: ${err.message}`).catch(() => {});
      }
      return;
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
