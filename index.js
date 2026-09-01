import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { listFiles, downloadFile } from './drive-source/drive-source.js';
import { tickLiveLoop, tickPostsLoop, setDiscordClient } from './tevi-notif.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
const execFile = promisify(_execFile);

// ── Dynamic Discord upload limit (boost-aware) ──────────────────
function getGuildUploadLimit(guild) {
  const tier = guild?.premiumTier ?? 0;
  // Verified live: tier 0 base ~10MB (10 OK, 12 fail) — bot limit, not tier boost.
  if (tier >= 3) return 100 * 1024 * 1024;
  if (tier === 2) return 50 * 1024 * 1024;
  return 10 * 1024 * 1024;
}
async function probeDuration(filePath) {
  try {
    const { stdout } = await execFile('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1', filePath]);
    const d = parseFloat(stdout.trim());
    return isFinite(d) && d > 0 ? d : 0;
  } catch { return 0; }
}
async function compressVideoToLimit(inputPath, limitBytes) {
  const targetBytes = Math.floor(limitBytes * 0.95); // 5% margin
  const dur = await probeDuration(inputPath);
  // If no duration, use CRF-only 720p fallback
  const outPath = inputPath + '.compressed.mp4';
  let args;
  if (dur > 0) {
    const targetBitrateK = Math.floor((targetBytes * 8 / dur) / 1000);
    // clamp 300k-4000k, allocate 128k for audio
    const videoK = Math.max(300, Math.min(4000, targetBitrateK - 128));
    args = ['-y','-i',inputPath,'-vf','scale=min(1280\,iw):-2','-c:v','libx264','-preset','fast','-b:v', String(videoK)+'k','-maxrate', String(videoK)+'k','-bufsize', String(videoK*2)+'k','-c:a','aac','-b:a','128k', outPath];
  } else {
    args = ['-y','-i',inputPath,'-vf','scale=min(1280\,iw):-2','-c:v','libx264','-preset','fast','-crf','26','-c:a','aac','-b:a','128k', outPath];
  }
  await execFile('ffmpeg', args, { timeout: 120000 });
  return outPath;
}
async function prepareAttachment(buf, filename, guild) {
  const limit = getGuildUploadLimit(guild) - 512*1024; // 0.5MB margin
  if (buf.length <= limit) return { buffer: buf, filename };
  // Need ffmpeg — write temp
  const ext = path.extname(filename) || '.mp4';
  const tmpIn = path.join(os.tmpdir(), `sukii-in-${Date.now()}${ext}`);
  const tmpOutHolder = { path: null };
  try {
    fs.writeFileSync(tmpIn, buf);
    const outPath = await compressVideoToLimit(tmpIn, limit);
    tmpOutHolder.path = outPath;
    const outBuf = fs.readFileSync(outPath);
    console.log(`[compress] ${filename}: ${(buf.length/1024/1024).toFixed(1)}MB -> ${(outBuf.length/1024/1024).toFixed(1)}MB (limit ${(limit/1024/1024).toFixed(1)}MB)`);
    if (outBuf.length > limit) console.warn(`[compress] still over limit after compress: ${(outBuf.length/1024/1024).toFixed(1)}MB`);
    const outName = filename.replace(/\.[^.]+$/, '.mp4');
    return { buffer: outBuf, filename: outName, tmpFiles: [tmpIn, outPath] };
  } catch (e) {
    console.warn('[compress] failed:', e.message.slice(0,300));
    return { buffer: buf, filename, compressError: e.message };
  } finally {
    // cleanup will be done by caller after send
  }
}

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
  VIRTUAL_DATE_TICKET: '1433314184103329893',
};

// ── Virtual Date Config ─────────────────────────────────────
// ── Virtual Date Config ─────────────────────────────────────
// Labels match babyval.com Private Video Call section. No prices shown
// (babyval.com doesn't display them either).
const VD_OPTIONS = {
  vd_7:  { label: '7 Menit',  duration: 7,  description: 'Video Call Singkat bareng Baby Val' },
  vd_10: { label: '10 Menit', duration: 10, description: 'Rekomended buat Video Call bareng Baby Val' },
  vd_20: { label: '20 Menit', duration: 20, description: 'VIP Personal Video Call bareng Baby Val' },
};

const VD_LINKS = {
  vd_7:  'https://ganknow.com/services/96251-babyval-video-call-7-menit',
  vd_10: 'https://ganknow.com/services/96250-babyval-video-call-10-menit',
  vd_20: 'https://ganknow.com/services/96249-babyval-video-call-20-menit',
};

const VD_TIMER = 10 * 60 * 1000; // 10 minutes

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
    auditCutiesRole(guild);
    // Refresh Virtual Date dropdown prices in channel
    syncVirtualDateMessage(guild).catch((e) => console.warn('[VD-sync]', e.message));
  }
  // Start booster channel scheduler (every 2 days at 20:00 WIB)
  scheduleBoosterPost();
  // Start spill me scheduler (daily at 18:00 WIB)
  scheduleSpillMePost();
  // Start Tevi notification polls (live + posts)
  setDiscordClient(client);
  tickLiveLoop();
  tickPostsLoop();
  setInterval(tickLiveLoop, 60 * 1000);
  setInterval(tickPostsLoop, 5 * 60 * 1000);
});

// ── Virtual Date dropdown message sync ──────────────────────
// Builds (or edits) the dropdown embed in #tiket with current prices.
// Idempotent: looks for existing message from Sukii and edits; else posts.
async function syncVirtualDateMessage(guild) {
  const ch = guild.channels.cache.get(CH.VIRTUAL_DATE_TICKET);
  if (!ch) { console.log('[VD-sync] ticket channel not found'); return; }

  const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = await import('discord.js');
  const select = new StringSelectMenuBuilder()
    .setCustomId('virtual_date_select_id')
    .setPlaceholder('💞 Private Video Call')
    .addOptions(Object.entries(VD_OPTIONS).map(([key, o]) => ({
      label: o.label,
      value: key,
      description: o.description,
    })));
  const row = new ActionRowBuilder().addComponents(select);

  const embed = new EmbedBuilder()
    .setColor(0xff65a3)
    .setTitle('💞 Private Video Call')
    .setDescription(
      'Mau ngobrol atau VCS privat 1 on 1 bareng Baby Val?\n\n' +
      'Pilih paket di bawah ini. Setelah klik, ticket thread akan dibuat otomatis.'
    )
    .setFooter({ text: 'Pilih paket Video Call bareng Baby Val' })
    .setTimestamp();

  // Find existing Sukii message with our dropdown
  const messages = await ch.messages.fetch({ limit: 20 });
  const existing = messages.find((m) =>
    m.author.id === client.user.id &&
    m.components?.some((r) => r.components?.some((c) => c.customId === 'virtual_date_select_id'))
  );

  if (existing) {
    await existing.edit({ embeds: [embed], components: [row] });
    console.log('[VD-sync] edited existing dropdown message:', existing.id);
  } else {
    const sent = await ch.send({ embeds: [embed], components: [row] });
    console.log('[VD-sync] posted new dropdown message:', sent.id);
  }
}

// ── Interaction Handler (select menus, buttons) ───────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'virtual_date_select_id') return;

  const user = interaction.user;
  const value = interaction.values[0];
  const option = VD_OPTIONS[value];
  if (!option) return;

  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  const ticketChannel = client.channels.cache.get(CH.VIRTUAL_DATE_TICKET);
  if (!ticketChannel) {
    await interaction.editReply('❌ Channel tiket tidak ditemukan.').catch(() => {});
    return;
  }

  const threadName = `🎫 ${user.username} | ${option.label}`;
  let thread;
  try {
    thread = await ticketChannel.threads.create({
      name: threadName,
      type: 'GUILD_PRIVATE_THREAD',
      autoArchiveDuration: 60,
    });
    await thread.members.add(user.id);
  } catch {
    try {
      thread = await ticketChannel.threads.create({
        name: threadName,
        autoArchiveDuration: 60,
      });
      await thread.members.add(user.id);
    } catch (e) {
      await interaction.editReply(`❌ Gagal buat thread: ${e.message}`).catch(() => {});
      return;
    }
  }

  const payMsg =
    `Halo ${user.username}! 💕\n\n` +
    `Terima kasih sudah memilih **${option.label}**!\n\n` +
    `Silakan lakukan pembayaran ke link berikut:\n` +
    `👉 ${VD_LINKS[value]}\n\n` +
    `Setelah bayar, kirim bukti transfer/payment confirmation di thread ini yaa.\n` +
    `Kamu punya waktu **10 menit** sebelum thread ini ditutup otomatis.\n\n` +
    `Terima kasih! 💖`;

  try {
    await thread.send({ content: payMsg });
  } catch (e) {
    await interaction.editReply(`❌ Gagal kirim pesan: ${e.message}`).catch(() => {});
    return;
  }

  // Timers: warn at 5 min, close at 10 min
  const userId = user.id;
  const threadId = thread.id;

  const closeTimer = setTimeout(async () => {
    activeTimers.delete(userId);
    const t = client.channels.cache.get(threadId);
    if (t) {
      await t.send('⏰ Waktu habis. Thread ditutup.').catch(() => {});
      await t.delete().catch(() => {});
    }
  }, VD_TIMER);

  const warnTimer = setTimeout(async () => {
    const t = client.channels.cache.get(threadId);
    if (t) {
      await t.send('⏰ Sisa **5 menit**! Segera kirim bukti pembayaran.').catch(() => {});
    }
  }, VD_TIMER / 2);

  activeTimers.set(userId, { closeTimer, warnTimer, threadId });

  await interaction.editReply({
    content: `✅ Tiket dibuat! <#${thread.id}>\nPastikan sudah baca <#${CH.PETUNJUK}> ya!`
  }).catch(() => {});
});

// Map userId -> { closeTimer, warnTimer, threadId }
const activeTimers = new Map();

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

// ── Spill Me Channel — upload 1 content daily at 18:00 WIB ─────────────────
const SPILL_ME_CHANNEL_ID = '1402130293229359188';
const SPILL_ME_FOLDER_IDS = [
  process.env.SPILL_ME_FOLDER_ID_1 || '1yvJwybrLcAvNuQ9Hm7Zp_kBMiZP0FJ81',
  process.env.SPILL_ME_FOLDER_ID_2 || '1RFWjo4bh1swZgIXBsuPPLUlzZ-pNiuu0',
];
const SPILL_ME_ANNOUNCE_CHANNEL_ID = '1361355108411248832'; // #general
const SPILL_ME_ROLE_ID = '1307647406451720212'; // Sweetie

async function sendSpillMePost() {
  const channel = client.channels.cache.get(SPILL_ME_CHANNEL_ID);
  if (!channel) {
    console.warn('[SpillMe] Channel not found:', SPILL_ME_CHANNEL_ID);
    return;
  }

  if (!listFiles || !downloadFile) {
    console.log('[SpillMe] Drive module not loaded yet, skipping.');
    return;
  }

  // Collect files from both folders
  let allFiles = [];
  for (const folderId of SPILL_ME_FOLDER_IDS) {
    try {
      const files = await listFiles(folderId, 5);
      allFiles = allFiles.concat(files);
    } catch (e) {
      console.warn(`[SpillMe] Failed to list folder ${folderId}:`, e.message);
    }
  }

  // Sort newest first
  allFiles.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

  // Try uploading first file, if fails try next
  for (const file of allFiles) {
    let tmpFiles = [];
    try {
      console.log(`[SpillMe] Uploading: ${file.name}`);
      const rawBuf = await downloadFile(file.id);
      const ext = file.name.split('.').pop() || 'jpg';
      const rawName = `content_${Date.now()}.${ext}`;
      const guild2 = channel.guild ?? client.guilds.cache.first();
      const prep = await prepareAttachment(rawBuf, rawName, guild2);
      tmpFiles = prep.tmpFiles || [];
      await channel.send({ files: [{ attachment: prep.buffer, name: prep.filename }] });
      console.log(`[SpillMe] ✅ Sent: ${file.name} (compressed ${(prep.buffer.length / 1024 / 1024).toFixed(2)}MB)`);
      for (const f2 of tmpFiles) { try { fs.unlinkSync(f2); } catch {} }

      // Announce to #general
      try {
        const announceCh = client.channels.cache.get(SPILL_ME_ANNOUNCE_CHANNEL_ID);
        if (announceCh) {
          await announceCh.send(
            `Konten baru buat <@&${SPILL_ME_ROLE_ID}>!\nCek di <#${SPILL_ME_CHANNEL_ID}> yaa!`
          );
        }
      } catch (e) {
        console.warn('[SpillMe] Announce failed:', e.message);
      }
      return;
    } catch (e) {
      for (const f2 of tmpFiles) { try { fs.unlinkSync(f2); } catch {} }
      console.warn(`[SpillMe] Failed to upload ${file.name}:`, e.message);
      if (e.message.includes('Request entity too large') || e.message.includes('FILE_TOO_LARGE')) {
        console.log('[SpillMe] Size limit hit, trying next file...');
        continue;
      }
      break;
    }
  }
  console.warn('[SpillMe] No files could be uploaded.');
}

// Schedule: daily at 18:00 WIB
function scheduleSpillMePost() {
  function msUntilTarget(targetHourWIB) {
    // targetHourWIB = 18 means 18:00 WIB = 11:00 UTC
    const targetHourUTC = targetHourWIB - 7;
    const now = Date.now();
    const d = new Date(now);
    d.setUTCHours(targetHourUTC, 0, 0, 0);
    if (d.getTime() <= now) d.setUTCDate(d.getUTCDate() + 1);
    return d.getTime() - now;
  }

  function runAndReschedule() {
    sendSpillMePost().finally(() => {
      const ONE_DAY = 24 * 60 * 60 * 1000;
      setTimeout(runAndReschedule, ONE_DAY);
      console.log('[SpillMe] Next run tomorrow at 18:00 WIB.');
    });
  }

  const ms = msUntilTarget(18);
  console.log(`[SpillMe] First run in ${Math.round(ms / 1000 / 60)} minutes at 18:00 WIB.`);
  setTimeout(runAndReschedule, ms);
}

const BOOSTER_CHANNEL_ID = '1466092749098057768';
const BOOSTER_FOLDER_ID = process.env.BOOSTER_DRIVE_FOLDER_ID || '';
const BOOSTER_ANNOUNCE_CHANNEL_ID = '1361355108411248832'; // #general
const BOOSTER_ROLE_ID = '1371209944912887948'; // Server Booster
const MAX_MESSAGES = 2;

async function sendBoosterPost() {
  if (!BOOSTER_FOLDER_ID) {
    console.log('[Booster] BOOSTER_DRIVE_FOLDER_ID not set, skipping.');
    return;
  }
  if (!listFiles || !downloadFile) {
    console.log('[Booster] Drive module not loaded yet, skipping this run.');
    return;
  }

  const channel = client.channels.cache.get(BOOSTER_CHANNEL_ID);
  if (!channel) {
    console.warn('[Booster] Channel not found:', BOOSTER_CHANNEL_ID);
    return;
  }

  try {
    // 1. Fetch latest files from Drive
    const files = await listFiles(BOOSTER_FOLDER_ID, MAX_MESSAGES);
    if (files.length === 0) {
      console.log('[Booster] No files found in Drive folder.');
      return;
    }

    console.log(`[Booster] Found ${files.length} file(s) in Drive. Posting to channel...`);

    // 2. Delete old messages (FIFO — keep max 2)
    const messages = await channel.messages.fetch({ limit: 100 });
    const toDelete = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp).first(MAX_MESSAGES);
    if (toDelete.length > 0) {
      console.log(`[Booster] Deleting ${toDelete.length} old message(s)...`);
      for (const msg of toDelete) {
        await msg.delete().catch((e) => console.warn('[Booster] Failed to delete msg:', e.message));
      }
    }

    // 3. Send new files (newest first)
    for (const file of files) {
      let tmpFilesB = [];
      try {
        const rawBuf = await downloadFile(file.id);
        const ext = file.name.split('.').pop() || 'jpg';
        const rawName = `photo.${ext}`;
        const guildB = channel.guild ?? client.guilds.cache.first();
        const prepB = await prepareAttachment(rawBuf, rawName, guildB);
        tmpFilesB = prepB.tmpFiles || [];
        await channel.send({
          content: `📷 *Post baru di Tevi*\n\nhttps://tevi.com/@cutieval`,
          files: [{ attachment: prepB.buffer, name: prepB.filename }],
        });
        console.log(`[Booster] Sent: ${file.name} (${(prepB.buffer.length/1024/1024).toFixed(1)}MB)`);
        for (const f2 of tmpFilesB) { try { fs.unlinkSync(f2); } catch {} }
      } catch (e) {
        for (const f2 of tmpFilesB) { try { fs.unlinkSync(f2); } catch {} }
        console.warn(`[Booster] Failed to send ${file.name}:`, e.message);
      }
    }

    // Announce to #general
    try {
      const announceCh = client.channels.cache.get(BOOSTER_ANNOUNCE_CHANNEL_ID);
      if (announceCh) {
        await announceCh.send(
          `Ada konten baru nih buat <@&${BOOSTER_ROLE_ID}>!\nCek di <#${BOOSTER_CHANNEL_ID}> yaa!`
        );
      }
    } catch (e) {
      console.warn('[Booster] Announce failed:', e.message);
    }
  } catch (err) {
    console.error('[Booster] Error:', err.message);
  }
}

// Schedule: every 2 days at 20:00 WIB (Asia/Jakarta = UTC+7)
function scheduleBoosterPost() {
  function msUntil(targetHourWIB, targetMinWIB) {
    // targetHourWIB = 20 means 20:00 WIB = 13:00 UTC
    const targetHourUTC = targetHourWIB - 7;
    const now = Date.now();
    // Target: today at (targetHourUTC:targetMinWIB) UTC
    const d = new Date(now);
    d.setUTCHours(targetHourUTC, targetMinWIB, 0, 0);
    if (d.getTime() <= now) d.setUTCDate(d.getUTCDate() + 1);
    return d.getTime() - now;
  }

  function runAndReschedule() {
    const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
    sendBoosterPost().finally(() => {
      setTimeout(runAndReschedule, TWO_DAYS);
      console.log('[Booster] Next run in 2 days at 20:00 WIB.');
    });
  }

  const ms = msUntil(20, 0);
  console.log(`[Booster] First run in ${Math.round(ms / 1000 / 60)} minutes at 20:00 WIB.`);
  setTimeout(runAndReschedule, ms);
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err.message);
});

// ── Login ───────────────────────────────────────────────
if (!TOKEN) {
  console.error('DISCORD_TOKEN not set in .env');
  process.exit(1);
}

client.login(TOKEN);
