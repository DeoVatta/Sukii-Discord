import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Will be set after Discord client ready (avoid circular import)
let discordClient = null;
export function setDiscordClient(client) { discordClient = client; }

// ── Config ─────────────────────────────────────────────────
const CFG = {
  pollIntervalSec: parseInt(process.env.POLL_INTERVAL_SEC || '60', 10),
  postsPollIntervalSec: parseInt(process.env.POSTS_POLL_INTERVAL_SEC || '300', 10),
  startupGraceMs: 30_000,
  teviLiveUrl: process.env.TEVI_LIVE_URL || 'http://localhost:8899/api/tevi/live',
  teviPostsUrl: process.env.TEVI_POSTS_URL || 'http://localhost:8899/api/tevi/posts',
  teviApiKey: process.env.TEVI_API_KEY || 'tevi_sec_vps_9f82b7c4d8e13a9602fa481e',
  teviMediaBaseUrl: process.env.TEVI_MEDIA_BASE_URL || 'http://localhost:8899',
  teviChannel: process.env.TEVI_CHANNEL || 'cutieval',
  cooldownMs: parseInt(process.env.COOLDOWN_MS || String(60 * 60 * 1000), 10),
  liveCooldownMs: parseInt(process.env.LIVE_COOLDOWN_MS || String(60 * 60 * 1000), 10),
  logDir: join(__dirname, 'tevi-data'),
  // Discord channels (mirrors Telegram: live→general+notif, posts→notif)
  liveChannelId: process.env.DISCORD_LIVE_CHANNEL_ID || '1361355108411248832',
  postsChannelId: process.env.DISCORD_NOTIF_CHANNEL_ID || '1361337546675851376',
};

const NOTIF_CHANNEL_ID = '1361337546675851376'; // #notif — used by posts fallback
const LIVE_CHANNEL_ID = '1361355108411248832';  // #general — live announce

function ts() { return new Date().toISOString().replace('T',' ').slice(0,19); }
function log(level, msg) {
  const line = `[${ts()}] [${level}] ${msg}`;
  console.log(`[tevi-notif] ${line}`);
  try { appendFileSync(join(CFG.logDir, 'tevi-notif.log'), line+'\n'); } catch {}
}

// ── State ──────────────────────────────────────────────────
const STATE_FILE = join(CFG.logDir, 'notif-state.json');
try { mkdirSync(CFG.logDir, { recursive: true }); } catch {}
function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE,'utf8')); } catch {
    return { wasLive: false, lastNotifiedAt: 0, lastLiveNotifiedAt: 0, startedAt: Date.now() };
  }
}
function saveState(s) { try { writeFileSync(STATE_FILE, JSON.stringify(s,null,2)); } catch(e){ log('WARN', `saveState: ${e.message}`); } }

// ── Discord send ───────────────────────────────────────────
async function discordSend(channelId, payload) {
  if (!discordClient) { log('WARN','discordClient not set yet, skipping send'); return false; }
  try {
    const ch = discordClient.channels.cache.get(channelId) || await discordClient.channels.fetch(channelId).catch(()=>null);
    if (!ch) { log('WARN', `channel ${channelId} not found`); return false; }
    const msg = await ch.send(payload);
    log('INFO', `Discord sent to ${channelId} (msg_id=${msg.id})`);
    return true;
  } catch(e){
    log('ERROR', `Discord send to ${channelId} failed: ${e.message.slice(0,400)}`);
    return false;
  }
}

function renderLiveNotif() {
  return `Aku Live Sekarang di Tevi.. Yang mau Challenge join yaa\n\nhttps://tevi.com/@cutieval`;
}
function renderTextPost(post) { return post.caption || post.title || ''; }
function renderMediaCaption(post) {
  const postUrl = post.postUrl || post.post_url || `https://tevi.com/@${CFG.teviChannel}/post/${post.id}`;
  return `Post baru di Tevi\n\n${postUrl}`;
}

async function pollTevi(url) {
  const headers = CFG.teviApiKey ? { Authorization: `Bearer ${CFG.teviApiKey}` } : {};
  const res = await fetch(url, { headers }).catch(e=>{ log('WARN', `fetch ${url}: ${e.message}`); return null; });
  if (!res || !res.ok) { log('WARN', `tevi ${url} -> ${res?.status||'no response'}`); return null; }
  try { return await res.json(); } catch(e){ log('WARN', `parse ${url}: ${e.message}`); return null; }
}

async function tickLive(state) {
  const data = await pollTevi(CFG.teviLiveUrl);
  if (!data || typeof data?.data?.isLive !== 'boolean') { log('WARN','live API invalid payload'); return; }
  const isLive = data.data.isLive;
  const startupMs = Date.now() - state.startedAt;
  const sinceLastLive = Date.now() - (state.lastLiveNotifiedAt||0);
  const cooldownActive = state.wasLive && sinceLastLive < CFG.liveCooldownMs;
  log('DEBUG', `[live] isLive=${isLive} wasLive=${state.wasLive} startupMs=${Math.round(startupMs/1000)}s cooldown=${cooldownActive}`);
  if (!state.wasLive && isLive && startupMs > CFG.startupGraceMs && !cooldownActive) {
    const ok = await discordSend(CFG.liveChannelId, { content: renderLiveNotif() });
    if (ok) state.lastLiveNotifiedAt = Date.now();
    // also mirror to notif channel if different
    if (CFG.postsChannelId && CFG.postsChannelId !== CFG.liveChannelId) {
      await discordSend(CFG.postsChannelId, { content: renderLiveNotif() });
    }
  }
  state.wasLive = isLive;
}

async function tickPosts(state) {
  const sinceParam = state.lastSeenPostId ? `?since=${encodeURIComponent(state.lastSeenPostId)}` : '';
  const data = await pollTevi(`${CFG.teviPostsUrl}${sinceParam}`);
  if (!data || !Array.isArray(data?.data)) { log('WARN','posts API invalid payload'); return; }
  const posts = data.data;
  if (posts.length===0) { log('DEBUG','[posts] no new posts'); return; }
  log('INFO', `[posts] ${posts.length} new post(s)`);
  const sinceLastPost = Date.now() - (state.lastNotifiedAt||0);
  if (sinceLastPost < CFG.cooldownMs) {
    log('INFO', `[posts] cooldown active — skipping ${posts.length} post(s), next in ${Math.round((CFG.cooldownMs - sinceLastPost)/1000)}s`);
    state.lastSeenPostId = posts[posts.length-1].id;
    return;
  }
  const post = posts[posts.length-1];
  log('INFO', `[posts] sending ${post.id} type=${post.type}`);
  let ok=false;
  if (post.type==='TEXT') {
    const text = renderTextPost(post);
    if (!text) ok=true;
    else ok = await discordSend(CFG.postsChannelId, { content: text });
  } else if (post.type==='IMAGE' || post.type==='VIDEO') {
    const thumbPath = post.thumbnailUrl || post.thumbnail_url || '';
    let photoUrl=null;
    if (thumbPath.startsWith('/media/')) photoUrl = `${CFG.teviMediaBaseUrl}${thumbPath}`;
    else if (thumbPath.startsWith('http')) photoUrl = thumbPath;
    if (!photoUrl) {
      log('WARN', `[posts] ${post.id} no thumbnail, text fallback`);
      ok = await discordSend(CFG.postsChannelId, { content: renderMediaCaption(post) });
    } else {
      // For Discord, fetch image and send as attachment
      try {
        const headers = CFG.teviApiKey ? { Authorization: `Bearer ${CFG.teviApiKey}` } : {};
        const r = await fetch(photoUrl, { headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const ab = await r.arrayBuffer();
        const buf = Buffer.from(ab);
        ok = await discordSend(CFG.postsChannelId, { content: renderMediaCaption(post), files: [{ attachment: buf, name: `tevi-${post.id}.jpg` }] });
      } catch(e){
        log('WARN', `[posts] thumb fetch failed: ${e.message}, text fallback`);
        ok = await discordSend(CFG.postsChannelId, { content: renderMediaCaption(post) });
      }
    }
  } else {
    ok = await discordSend(CFG.postsChannelId, { content: renderMediaCaption(post) });
  }
  if (ok) { state.lastNotifiedAt = Date.now(); state.lastSeenPostId = post.id; }
  else log('WARN','[posts] send failed, cursor not advanced');
}

export async function tickLiveLoop() {
  const s=loadState(); try{ await tickLive(s); }catch(e){ log('ERROR', `tickLive ${e.message}`); } saveState(s);
}
export async function tickPostsLoop() {
  const s=loadState(); try{ await tickPosts(s); }catch(e){ log('ERROR', `tickPosts ${e.message}`); } saveState(s);
}
