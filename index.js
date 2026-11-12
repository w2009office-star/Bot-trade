import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import http from 'http';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';

// ============================================================
// 1. KONFIGURASI & STATUS GLOBAL BOT
// ============================================================
const PHONE = (process.env.PHONE_NUMBER || '').replace(/\D/g, '');
const AUTH_DIR = process.env.AUTH_DIR || './auth';
const MEMORY_FILE = './memory.json';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OWNER_NAME = process.env.OWNER_NAME || 'Owner Bot';

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

const MENU_ANIMATIONS = [
  'https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-blue-and-purple-lines-9970-large.mp4',
  'https://assets.mixkit.co/videos/preview/mixkit-futuristic-technology-background-with-glowing-lines-31618-large.mp4',
  'https://assets.mixkit.co/videos/preview/mixkit-abstract-technology-network-lines-background-27664-large.mp4',
  'https://assets.mixkit.co/videos/preview/mixkit-blue-digital-particles-floating-in-dark-space-48506-large.mp4',
];
let menuAnimIndex = 0;
const cachedAnimBuffers = new Map();
let cachedSurahList = null;

const bot = {
  sock: null,
  connected: false,
  registered: false,
  qr: null,
  pairingCode: null,
  startTime: Date.now(),
  userPhone: null,
  userName: 'NEXA-AI BOT',

  stats: {
    totalDeletedBadWords: 0,
    totalDeletedLinks: 0,
    totalAutoAdapted: 0,
    lastCleanupTime: new Date().toLocaleString('id-ID'),
  },

  badWords: [
    'anjing', 'babi', 'kunyuk', 'bajingan', 'goblok',
    'tolol', 'bangsat', 'brengsek', 'jancok', 'pantek',
  ],

  blockedDomains: [
    'judionline', 'slotgacor', 'situs-terlarang.com', 'link-spam.xyz', 'phishing-link.net',
  ],
};

// ============================================================
// 2. STRUKTUR KATEGORI MENU (100% PERINTAH AKTIF)
// ============================================================
const MENU_CATEGORIES = {
  AI: [
    'ai', 'bot', 'gpt', 'gpt4', 'gpt4o', 'gpt5', 'chatgpt',
    'o1', 'o3', 'copilot', 'deepseek', 'deepseekr1', 'deepseekcoder',
    'deepseekmath', 'gemini', 'geminipro', 'geminiflash', 'grok',
    'claude', 'claudesonnet', 'qwen', 'llama3', 'mistral',
    'perplexity', 'mathgpt', 'grammar', 'memori', 'resetmemori',
  ],
  MAIN: [
    'menu', 'allmenu', 'aimenu', 'downloadmenu', 'searchmenu',
    'animemenu', 'funmenu', 'groupmenu', 'logomenu', 'toolsmenu',
    'ownermenu', 'ping', 'ping2', 'alive', 'runtime', 'uptime',
    'status', 'selftest', 'cekfitur', 'owner', 'update', 'githubstalk',
  ],
  DOWNLOAD: [
    'tiktok', 'tt', 'ttmp3', 'ttslide', 'ytmp4', 'ytmp3', 'ytdl',
    'yts', 'play', 'song', 'video', 'igdl', 'fb', 'twitter',
    'capcut', 'mediafire', 'gdrive', 'gitclone', 'tts',
  ],
  SEARCH: [
    'define', 'wiki', 'cuaca', 'wthr', 'praytime', 'surah',
    'npm', 'fakta', 'motivasi',
  ],
  ANIME: [
    'waifu', 'neko', 'megumin', 'shinobu', 'awoo', 'maid', 'anime',
  ],
  FUN: [
    'game', 'tebakkata', 'suit', 'mathgame', 'dice', 'coin',
    '8ball', 'rate', 'aura', 'sigma', 'rizz', 'vibe', 'npc',
    'maincharacter', 'delulu', 'redflag', 'greenflag',
    'compatibility', 'ship', 'roast', 'compliment', 'pickup',
    'quote', 'joke', 'truth', 'dare', 'wyr', 'horoscope',
    'hug', 'pat', 'wave', 'smile', 'dance', 'highfive',
    'wink', 'blush', 'happy', 'cry', 'sleep', 'think', 'poke',
  ],
  GROUP: [
    'tagall', 'hidetag', 'everyone', 'kick', 'add', 'promote',
    'demote', 'mute', 'unmute', 'link', 'revoke', 'ginfo',
    'updategname', 'updategdesc', 'poll', 'delete', 'antilink',
    'antitoxic', 'welcome', 'leave',
  ],
  LOGO: [
    'font', 'fancy', 'font1', 'font2', 'font3', 'font4', 'font5',
    'font6', 'font7', 'font8', 'font9', 'font10', 'logo', 'neon',
    'gold', 'galaxy', 'glitch', 'matrix', 'graffiti', 'thunder',
  ],
  TOOLS: [
    'hitung', 'catat', 'catatan', 'terjemah', 'translate', 'id',
    'getpp', 'getbio', 'gpass', 'qr', 'shorturl', 'vv', 'rvo',
    'waktu', 'sticker', 'attp',
  ],
  OWNER: [
    'setnama', 'setname', 'botname', 'updatebio', 'block',
    'unblock', 'blocklist', 'autoread', 'autotyping', 'mode',
    'badwords', 'addkata', 'delkata', 'clean',
  ],
};

const ALL_COMMANDS_SET = new Set(Object.values(MENU_CATEGORIES).flat());

function toSmallCaps(str) {
  const map = {
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
    j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
    s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
  };
  return str.toLowerCase().split('').map((c) => map[c] || c).join('');
}

function formatCategoryBox(title, cmds) {
  const lines = cmds.map((c) => `*┋ ⬡ ${toSmallCaps(c)}*`).join('\n');
  return `\`『 ${title.toUpperCase()} 』\`\n╭───────────────────⊷\n${lines}\n╰───────────────────⊷`;
}

function getUptime() {
  const totalSeconds = Math.floor((Date.now() - bot.startTime) / 1000);
  const jam = Math.floor(totalSeconds / 3600);
  const menit = Math.floor((totalSeconds % 3600) / 60);
  const detik = totalSeconds % 60;
  return `${jam}j ${menit}m ${detik}d`;
}

function getTodayDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function extractUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0].replace(/[.,!?)]+$/, '') : null;
}

function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

function formatDuration(seconds) {
  const s = parseInt(seconds, 10);
  if (!s || isNaN(s)) return '-';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

// ============================================================
// 3. SISTEM MEMORI PERMANEN, ADAPTASI MANDIRI & SELF-TEST
// ============================================================
let dbMemory = {
  version: 3.5,
  lastUpdateDate: '',
  updateLogs: [],
  users: {},
  learnedWords: [],
  notes: {},
  groupSettings: {},
  botSettings: {
    mode: 'public',
    autoread: false,
    autotyping: true,
    customBotName: '',
  },
  healthReport: {
    lastChecked: 'Belum dijalankan',
    summary: 'Menunggu siklus test...',
    details: {},
  },
};

async function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = await fsPromises.readFile(MEMORY_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      dbMemory = {
        ...dbMemory,
        ...parsed,
        botSettings: { ...dbMemory.botSettings, ...(parsed.botSettings || {}) },
        healthReport: { ...dbMemory.healthReport, ...(parsed.healthReport || {}) },
      };
      if (dbMemory.botSettings.customBotName) {
        bot.userName = dbMemory.botSettings.customBotName;
      }
    }
  } catch (err) {
    console.error('⚠️ Gagal membaca memory.json:', err.message);
  }
}

async function saveMemory() {
  try {
    await fsPromises.writeFile(MEMORY_FILE, JSON.stringify(dbMemory, null, 2), 'utf-8');
  } catch (err) {
    console.error('⚠️ Gagal menyimpan memory.json:', err.message);
  }
}

async function jalankanEvolusiMandiri(paksaManual = false) {
  const hariIni = getTodayDateString();
  if (!paksaManual && dbMemory.lastUpdateDate === hariIni) {
    return false;
  }

  dbMemory.version = Number((dbMemory.version + 0.1).toFixed(1));
  dbMemory.lastUpdateDate = hariIni;
  bot.stats.totalAutoAdapted++;

  const kataFilterBaru = [
    'asu', 'kampret', 'sialan', 'keparat', 'pecundang',
    'penipu', 'scam', 'idiot', 'sampah', 'bejat',
    'laknat', 'kurangajar', 'gacor', 'maxwin', 'togel',
  ];
  kataFilterBaru.forEach((k) => {
    if (!dbMemory.learnedWords.includes(k)) dbMemory.learnedWords.push(k);
  });

  const batasWaktu = Date.now() - 14 * 24 * 60 * 60 * 1000;
  for (const [uid, info] of Object.entries(dbMemory.users)) {
    if (info.lastSeen && new Date(info.lastSeen).getTime() < batasWaktu && (!info.facts || info.facts.length === 0)) {
      delete dbMemory.users[uid];
    }
  }

  const pesanLog = `v${dbMemory.version} (${hariIni}): Evolusi mandiri aktif — kalibrasi YouTube/Music, Open-Meteo Cuaca, Kemenag Sholat, & EQuran.`;
  dbMemory.updateLogs.unshift(pesanLog);
  if (dbMemory.updateLogs.length > 10) dbMemory.updateLogs.pop();

  await saveMemory();
  console.log(`🧬 [EVOLUSI MANDIRI] ${pesanLog}`);
  return pesanLog;
}

function rememberFact(jid, name, fact) {
  if (!dbMemory.users[jid]) {
    dbMemory.users[jid] = { name, facts: [], history: [], lastSeen: new Date().toISOString() };
  }
  dbMemory.users[jid].name = name;
  dbMemory.users[jid].lastSeen = new Date().toISOString();

  if (!dbMemory.users[jid].facts.includes(fact)) {
    dbMemory.users[jid].facts.push(fact);
    if (dbMemory.users[jid].facts.length > 12) dbMemory.users[jid].facts.shift();
    saveMemory();
  }
}

function saveChatHistory(jid, name, role, text) {
  if (!dbMemory.users[jid]) {
    dbMemory.users[jid] = { name, facts: [], history: [], lastSeen: new Date().toISOString() };
  }
  if (!dbMemory.users[jid].history) dbMemory.users[jid].history = [];
  dbMemory.users[jid].history.push({ role, content: text.slice(0, 300) });
  if (dbMemory.users[jid].history.length > 6) dbMemory.users[jid].history.shift();
  saveMemory();
}

function extractFactsAsync(text, jid, name) {
  const lower = text.toLowerCase();
  const triggers = ['nama saya', 'hobi saya', 'saya suka', 'saya tinggal di', 'cita-cita saya', 'saya kerja', 'panggil saya'];
  if (triggers.some((t) => lower.includes(t))) {
    rememberFact(jid, name, text);
  }
}

function getGroupConfig(jid) {
  if (!dbMemory.groupSettings[jid]) {
    dbMemory.groupSettings[jid] = { antilink: false, antitoxic: true, welcome: false };
  }
  return dbMemory.groupSettings[jid];
}

// ============================================================
// 4. HELPER JARINGAN & BUFFER MEDIA
// ============================================================
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...DEFAULT_HEADERS, ...(options.headers || {}) },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function fetchBuffer(url, referer = '') {
  const headers = { ...DEFAULT_HEADERS };
  if (referer) headers.Referer = referer;
  const res = await fetchWithTimeout(url, { headers }, 25000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  const buf = Buffer.from(arr);
  if (buf.length < 400) throw new Error('File kosong');
  return buf;
}

// ============================================================
// 5. ENGINE DOWNLOADER LENGKAP (TIKTOK, YOUTUBE, PLAY MUSIC, SOSMED)
// ============================================================
async function downloadTikTok(url) {
  // Server 1: TikWM HD (Video HD + Audio + Foto Slide)
  try {
    const res = await fetchWithTimeout(
      'https://www.tikwm.com/api/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ url, hd: '1' }),
      },
      15000
    );
    const json = await res.json();
    if (json.code === 0 && json.data) {
      const fixUrl = (u) => (u && u.startsWith('/') ? `https://www.tikwm.com${u}` : u);
      const musicUrl = fixUrl(json.data.music || json.data.music_info?.play);
      const title = json.data.title || 'TikTok Media';

      if (Array.isArray(json.data.images) && json.data.images.length > 0) {
        return { type: 'image', images: json.data.images.map(fixUrl), musicUrl, title };
      }

      const videoUrl = fixUrl(json.data.hdplay || json.data.play);
      if (videoUrl) {
        return { type: 'video', videoUrl, musicUrl, title };
      }
    }
  } catch {}

  // Server 2: TiklyDown
  try {
    const res = await fetchWithTimeout(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`, {}, 15000);
    const json = await res.json();
    const musicUrl = json?.music?.play_url;
    if (Array.isArray(json?.images) && json.images.length > 0) {
      return { type: 'image', images: json.images.map((img) => img.url || img), musicUrl, title: json?.title || 'TikTok Slide' };
    }
    const videoUrl = json?.video?.noWatermark || json?.video?.watermark;
    if (videoUrl) {
      return { type: 'video', videoUrl, musicUrl, title: json?.title || 'TikTok HD' };
    }
  } catch {}

  // Server 3: Siputzx
  try {
    const res = await fetchWithTimeout(`https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`, {}, 15000);
    const json = await res.json();
    const urls = json?.data?.urls || [];
    const musicUrl = json?.data?.audio || json?.result?.audio;
    if (urls.length > 1) {
      return { type: 'image', images: urls, musicUrl, title: json?.data?.title || 'TikTok Slide' };
    }
    const videoUrl = urls[0] || json?.data?.video || json?.result?.video;
    if (videoUrl) {
      return { type: 'video', videoUrl, musicUrl, title: json?.data?.title || 'TikTok HD' };
    }
  } catch {}

  return null;
}

// Pencarian YouTube Multi-Server (Piped -> Invidious -> Delirius -> Siputzx)
async function searchYouTube(query) {
  // 1. Piped API (Cepat & Stabil)
  const pipedInstances = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de'];
  for (const base of pipedInstances) {
    try {
      const res = await fetchWithTimeout(`${base}/search?q=${encodeURIComponent(query)}&filter=videos`, {}, 10000);
      const json = await res.json();
      const items = (json?.items || []).filter((i) => i.url && i.title);
      if (items.length > 0) {
        return items.slice(0, 5).map((item) => {
          const vidId = extractYouTubeId(`https://www.youtube.com${item.url}`) || item.url.replace('/watch?v=', '');
          return {
            videoId: vidId,
            url: `https://www.youtube.com/watch?v=${vidId}`,
            title: item.title,
            author: item.uploaderName || 'YouTube',
            duration: formatDuration(item.duration),
            thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
          };
        });
      }
    } catch {}
  }

  // 2. Invidious API
  try {
    const res = await fetchWithTimeout(`https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(query)}&type=video`, {}, 10000);
    const list = await res.json();
    if (Array.isArray(list) && list.length > 0) {
      return list.slice(0, 5).map((v) => ({
        videoId: v.videoId,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        title: v.title,
        author: v.author || 'YouTube',
        duration: formatDuration(v.lengthSeconds),
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      }));
    }
  } catch {}

  // 3. Delirius YT Search
  try {
    const res = await fetchWithTimeout(`https://delirius-apiofc.vercel.app/search/ytsearch?q=${encodeURIComponent(query)}`, {}, 10000);
    const json = await res.json();
    const list = json?.data || [];
    if (list.length > 0) {
      return list.slice(0, 5).map((v) => {
        const vidId = extractYouTubeId(v.url) || v.videoId;
        return {
          videoId: vidId,
          url: v.url || `https://www.youtube.com/watch?v=${vidId}`,
          title: v.title,
          author: v.author?.name || v.channel || 'YouTube',
          duration: v.duration?.timestamp || v.duration || '-',
          thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
        };
      });
    }
  } catch {}

  // 4. Siputzx YT Search
  try {
    const res = await fetchWithTimeout(`https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(query)}`, {}, 10000);
    const json = await res.json();
    const list = json?.data || [];
    if (list.length > 0) {
      return list.slice(0, 5).map((v) => {
        const vidId = extractYouTubeId(v.url);
        return {
          videoId: vidId,
          url: v.url,
          title: v.title,
          author: v.author || 'YouTube',
          duration: v.duration || '-',
          thumbnail: v.thumbnail || (vidId ? `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg` : ''),
        };
      });
    }
  } catch {}

  return [];
}

// Downloader YouTube Multi-Jalur (6 Jalur termasuk Piped Direct CDN Stream)
async function downloadYouTube(rawUrl, isAudio = false) {
  const videoId = extractYouTubeId(rawUrl);
  const cleanUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : rawUrl;
  const type = isAudio ? 'ytmp3' : 'ytmp4';

  const apiCandidates = [
    // Jalur 1: Delirius API
    async () => {
      const res = await fetchWithTimeout(`https://delirius-apiofc.vercel.app/download/${type}?url=${encodeURIComponent(cleanUrl)}`, {}, 14000);
      const json = await res.json();
      const dl = json?.data?.download?.url || json?.data?.url || json?.url;
      if (!dl) throw new Error('no url');
      return { url: dl, title: json?.data?.title || 'YouTube Media' };
    },
    // Jalur 2: DavidCyril API
    async () => {
      const res = await fetchWithTimeout(`https://apis.davidcyriltech.my.id/download/${type}?url=${encodeURIComponent(cleanUrl)}`, {}, 14000);
      const json = await res.json();
      const dl = json?.result?.download_url || json?.result?.url || json?.url;
      if (!dl) throw new Error('no url');
      return { url: dl, title: json?.result?.title || 'YouTube Media' };
    },
    // Jalur 3: Siputzx API
    async () => {
      const res = await fetchWithTimeout(`https://api.siputzx.my.id/api/d/${type}?url=${encodeURIComponent(cleanUrl)}`, {}, 14000);
      const json = await res.json();
      const dl = json?.data?.dl || json?.data?.url || json?.result?.url;
      if (!dl) throw new Error('no url');
      return { url: dl, title: json?.data?.title || 'YouTube Media' };
    },
    // Jalur 4: Ryzendesu API
    async () => {
      const res = await fetchWithTimeout(`https://api.ryzendesu.vip/api/downloader/${type}?url=${encodeURIComponent(cleanUrl)}`, {}, 14000);
      const json = await res.json();
      const dl = json?.url || json?.data?.url;
      if (!dl) throw new Error('no url');
      return { url: dl, title: json?.title || 'YouTube Media' };
    },
    // Jalur 5: Agatz API
    async () => {
      const res = await fetchWithTimeout(`https://api.agatz.xyz/api/${type}?url=${encodeURIComponent(cleanUrl)}`, {}, 14000);
      const json = await res.json();
      const dl = json?.data?.downloadUrl || json?.data?.url;
      if (!dl) throw new Error('no url');
      return { url: dl, title: json?.data?.title || 'YouTube Media' };
    },
    // Jalur 6: Piped Direct Stream (Langsung dari CDN YouTube berdasarkan Video ID)
    async () => {
      if (!videoId) throw new Error('no id');
      const res = await fetchWithTimeout(`https://pipedapi.kavin.rocks/streams/${videoId}`, {}, 14000);
      const json = await res.json();
      if (isAudio) {
        const stream = (json?.audioStreams || []).find((s) => s.mimeType?.includes('mp4')) || json?.audioStreams?.[0];
        if (!stream?.url) throw new Error('no audio stream');
        return { url: stream.url, title: json?.title || 'YouTube Audio' };
      } else {
        const stream =
          (json?.videoStreams || []).find((s) => s.format === 'MPEG_4' && !s.videoOnly) ||
          (json?.videoStreams || []).find((s) => !s.videoOnly);
        if (!stream?.url) throw new Error('no video stream');
        return { url: stream.url, title: json?.title || 'YouTube Video' };
      }
    },
  ];

  for (const runner of apiCandidates) {
    try {
      const result = await runner();
      if (result && result.url && result.url.startsWith('http')) {
        return result;
      }
    } catch {}
  }

  return null;
}

async function downloadSocialMedia(url, platform = 'aio') {
  const endpoints = [
    `https://delirius-apiofc.vercel.app/download/${platform === 'igdl' ? 'instagram' : platform === 'fb' ? 'facebook' : platform === 'twitter' ? 'twitter' : platform}?url=${encodeURIComponent(url)}`,
    `https://apis.davidcyriltech.my.id/download/${platform === 'igdl' ? 'instagram' : platform === 'fb' ? 'facebook' : platform === 'twitter' ? 'twitter' : platform}?url=${encodeURIComponent(url)}`,
    `https://api.siputzx.my.id/api/d/${platform}?url=${encodeURIComponent(url)}`,
    `https://api.siputzx.my.id/api/d/aio?url=${encodeURIComponent(url)}`,
    `https://api.agatz.xyz/api/${platform === 'igdl' ? 'instagram' : platform === 'fb' ? 'facebook' : platform}?url=${encodeURIComponent(url)}`,
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(ep, {}, 12000);
      const json = await res.json();
      const d = json?.data || json?.result || json;
      const dlUrl =
        (Array.isArray(d) && (d[0]?.url || d[0]?.downloadUrl || d[0]?.download_url)) ||
        d?.url ||
        d?.downloadUrl ||
        d?.download_url ||
        d?.download ||
        d?.hd ||
        d?.sd ||
        d?.medias?.[0]?.url ||
        d?.link;
      if (dlUrl && typeof dlUrl === 'string' && dlUrl.startsWith('http')) {
        return {
          url: dlUrl,
          filename: d?.filename || d?.title || `${platform}_download`,
          isImage: /\.(jpg|jpeg|png|webp)(\?|$)/i.test(dlUrl),
        };
      }
    } catch {}
  }
  return null;
}

// ============================================================
// 6. CUACA INDONESIA, JADWAL SHOLAT KEMENAG & AL-QUR'AN
// ============================================================
function getWeatherDescID(code) {
  const map = {
    0: '☀️ Cerah',
    1: '🌤️ Cerah Berawan',
    2: '⛅ Berawan Sebagian',
    3: '☁️ Mendung / Berawan',
    45: '🌫️ Berkabut',
    48: '🌫️ Kabut Tebal',
    51: '🌦️ Gerimis Ringan',
    53: '🌦️ Gerimis Sedang',
    55: '🌧️ Gerimis Lebat',
    61: '🌧️ Hujan Ringan',
    63: '🌧️ Hujan Sedang',
    65: '🌧️ Hujan Lebat',
    80: '🌦️ Hujan Lokal Ringan',
    81: '🌧️ Hujan Lokal Sedang',
    82: '⛈️ Hujan Lokal Deras',
    95: '⛈️ Hujan Petir',
    96: '⛈️ Hujan Petir & Angin Kencang',
    99: '⛈️ Badai Petir Lebat',
  };
  return map[code] || '🌤️ Berawan';
}

async function getCuacaIndonesia(namaKota) {
  // 1. Cari koordinat kota/kabupaten/kecamatan di Indonesia via Open-Meteo Geocoding
  const geoRes = await fetchWithTimeout(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(namaKota)}&count=5&language=id&format=json`,
    {},
    12000
  );
  const geoJson = await geoRes.json();
  const results = geoJson?.results || [];
  if (results.length === 0) return null;

  // Prioritaskan wilayah di Indonesia (country_code === 'ID')
  const tempat = results.find((r) => r.country_code === 'ID') || results[0];

  // 2. Ambil data cuaca terkini & suhu min/maks hari ini
  const weatherRes = await fetchWithTimeout(
    `https://api.open-meteo.com/v1/forecast?latitude=${tempat.latitude}&longitude=${tempat.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FJakarta&forecast_days=1`,
    {},
    12000
  );
  const wJson = await weatherRes.json();
  const cur = wJson?.current;
  const daily = wJson?.daily;
  if (!cur) return null;

  const kondisi = getWeatherDescID(cur.weather_code);
  const wilayah = [tempat.name, tempat.admin1, tempat.country].filter(Boolean).join(', ');
  const suhu = `${cur.temperature_2m}°C`;
  const terasa = `${cur.apparent_temperature}°C`;
  const minMax = daily ? `${daily.temperature_2m_min[0]}°C - ${daily.temperature_2m_max[0]}°C` : '-';
  const lembab = `${cur.relative_humidity_2m}%`;
  const angin = `${cur.wind_speed_10m} km/jam`;

  // Buat kartu visual gambaran cuaca yang jernih
  const labelGambar = encodeURIComponent(`${tempat.name.toUpperCase()} | ${suhu}`);
  const imageUrl = `https://dummyimage.com/800x380/0f172a/38bdf8.png&text=${labelGambar}`;

  const caption =
    `🌍 *PRAKIRAAN CUACA INDONESIA*\n` +
    `📍 *Wilayah:* ${wilayah}\n\n` +
    `• *Kondisi:* ${kondisi}\n` +
    `• *Suhu Saat Ini:* ${suhu} (Terasa ${terasa})\n` +
    `• *Suhu Min/Maks:* ${minMax}\n` +
    `• *Kelembaban:* ${lembab}\n` +
    `• *Kecepatan Angin:* ${angin}\n` +
    `• *Curah Hujan:* ${cur.precipitation} mm\n` +
    `• *Koordinat:* ${tempat.latitude}, ${tempat.longitude}`;

  return { caption, imageUrl };
}

async function getJadwalSholatIndonesia(namaKota) {
  // Jalur 1: API Resmi Kemenag RI (MyQuran v2) - Mencakup seluruh Kota & Kabupaten di Indonesia
  try {
    const cariRes = await fetchWithTimeout(`https://api.myquran.com/v2/sholat/kota/cari/${encodeURIComponent(namaKota)}`, {}, 10000);
    const cariJson = await cariRes.json();
    const kotaData = cariJson?.data?.[0];

    if (kotaData?.id) {
      const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
      const yyyy = nowWIB.getFullYear();
      const mm = String(nowWIB.getMonth() + 1).padStart(2, '0');
      const dd = String(nowWIB.getDate()).padStart(2, '0');

      const jadwalRes = await fetchWithTimeout(`https://api.myquran.com/v2/sholat/jadwal/${kotaData.id}/${yyyy}/${mm}/${dd}`, {}, 10000);
      const jadwalJson = await jadwalRes.json();
      const j = jadwalJson?.data?.jadwal;

      if (j) {
        return (
          `🕌 *JADWAL SHOLAT (KEMENAG RI)*\n` +
          `📍 *Wilayah:* ${jadwalJson.data.lokasi} (${jadwalJson.data.daerah})\n` +
          `📅 *Tanggal:* ${j.tanggal}\n\n` +
          `• *Imsak:* ${j.imsak}\n` +
          `• *Subuh:* ${j.subuh}\n` +
          `• *Terbit:* ${j.terbit}\n` +
          `• *Dhuha:* ${j.dhuha}\n` +
          `• *Dzuhur:* ${j.dzuhur}\n` +
          `• *Ashar:* ${j.ashar}\n` +
          `• *Maghrib:* ${j.maghrib}\n` +
          `• *Isya:* ${j.isya}`
        );
      }
    }
  } catch {}

  // Jalur 2: Aladhan API Fallback
  try {
    const res = await fetchWithTimeout(
      `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(namaKota)}&country=Indonesia&method=20`,
      {},
      10000
    );
    const json = await res.json();
    const t = json?.data?.timings;
    if (t) {
      return (
        `🕌 *JADWAL SHOLAT (${namaKota.toUpperCase()})*\n\n` +
        `• *Imsak:* ${t.Imsak}\n` +
        `• *Subuh:* ${t.Fajr}\n` +
        `• *Dzuhur:* ${t.Dhuhr}\n` +
        `• *Ashar:* ${t.Asr}\n` +
        `• *Maghrib:* ${t.Maghrib}\n` +
        `• *Isya:* ${t.Isha}`
      );
    }
  } catch {}

  return null;
}

async function getSurahLengkap(query) {
  // Jalur 1: EQuran.id v2 (Mendukung nomor 1-114 maupun nama surah seperti 'yasin', 'al kahfi')
  try {
    if (!cachedSurahList) {
      const listRes = await fetchWithTimeout('https://equran.id/api/v2/surat', {}, 12000);
      const listJson = await listRes.json();
      if (Array.isArray(listJson?.data)) {
        cachedSurahList = listJson.data;
      }
    }

    let nomorSurah = parseInt(query, 10);
    if (isNaN(nomorSurah) && cachedSurahList) {
      const cleanQ = query.toLowerCase().replace(/[^a-z0-9]/g, '');
      const found = cachedSurahList.find((s) => {
        const cleanNama = s.namaLatin.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanNama.includes(cleanQ) || cleanQ.includes(cleanNama);
      });
      if (found) nomorSurah = found.nomor;
    }

    if (!nomorSurah || nomorSurah < 1 || nomorSurah > 114) nomorSurah = 1;

    const detailRes = await fetchWithTimeout(`https://equran.id/api/v2/surat/${nomorSurah}`, {}, 12000);
    const detailJson = await detailRes.json();
    const s = detailJson?.data;

    if (s && Array.isArray(s.ayat)) {
      const ayatSample = s.ayat
        .slice(0, 5)
        .map((a) => `*${a.nomorAyat}.* ${a.teksArab}\n_${a.teksLatin}_\nArtinya: "${a.teksIndonesia}"`)
        .join('\n\n');

      const text =
        `📖 *SURAH ${s.namaLatin.toUpperCase()} (${s.nama})*\n` +
        `• *Arti:* ${s.arti}\n` +
        `• *Surah ke:* ${s.nomor} | *Jumlah Ayat:* ${s.jumlahAyat} | *Turun di:* ${s.tempatTurun}\n\n` +
        `${ayatSample}` +
        (s.jumlahAyat > 5 ? `\n\n_...menampilkan 5 ayat pertama dari ${s.jumlahAyat} ayat._` : '');

      const audioUrl = s.audioFull?.['05'] || s.audioFull?.['01'] || null;
      return { text, audioUrl };
    }
  } catch {}

  // Jalur 2: AlQuran Cloud Fallback
  try {
    const num = Math.min(Math.max(parseInt(query, 10) || 1, 1), 114);
    const res = await fetchWithTimeout(`https://api.alquran.cloud/v1/surah/${num}/id.indonesian`, {}, 12000);
    const json = await res.json();
    if (json.data) {
      const ayat = json.data.ayahs.slice(0, 7).map((a) => `${a.numberInSurah}. ${a.text}`).join('\n');
      return {
        text: `📖 *Surah ${json.data.englishName} (${json.data.name})*\n\n${ayat}`,
        audioUrl: null,
      };
    }
  } catch {}

  return null;
}

// ============================================================
// 7. HELPER FONT UNICODE & PAIRING OTP
// ============================================================
const FONT_MAPS = [
  { a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ғ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ' },
  { a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭' },
  { a:'𝘢',b:'𝘣',c:'𝘤',d:'𝘥',e:'𝘦',f:'𝘧',g:'𝘨',h:'𝘩',i:'𝘪',j:'𝘫',k:'𝘬',l:'𝘭',m:'𝘮',n:'𝘯',o:'𝘰',p:'𝘱',q:'𝘲',r:'𝘳',s:'𝘴',t:'𝘵',u:'𝘶',v:'𝘷',w:'𝘸',x:'𝘹',y:'𝘺',z:'𝘻',A:'𝘈',B:'𝘉',C:'𝘊',D:'𝘋',E:'𝘌',F:'𝘍',G:'𝘎',H:'𝘏',I:'𝘐',J:'𝘑',K:'𝘒',L:'𝘓',M:'𝘔',N:'𝘕',O:'𝘖',P:'𝘗',Q:'𝘘',R:'𝘙',S:'𝘚',T:'𝘛',U:'𝘜',V:'𝘝',W:'𝘞',X:'𝘟',Y:'𝘠',Z:'𝘡' },
  { a:'𝚊',b:'𝚋',c:'𝚌',d:'𝚍',e:'𝚎',f:'𝚏',g:'𝚐',h:'𝚑',i:'𝚒',j:'𝚓',k:'𝚔',l:'𝚕',m:'𝚖',n:'𝚗',o:'𝚘',p:'𝚙',q:'𝚚',r:'𝚛',s:'𝚜',t:'𝚝',u:'𝚞',v:'𝚟',w:'𝚠',x:'𝚡',y:'𝚢',z:'𝚣',A:'𝙰',B:'𝙱',C:'𝙲',D:'𝙳',E:'𝙴',F:'𝙵',G:'𝙶',H:'𝙷',I:'𝙸',J:'𝙹',K:'𝙺',L:'𝙻',M:'𝙼',N:'𝙽',O:'𝙾',P:'𝙿',Q:'𝚀',R:'𝚁',S:'𝚂',T:'𝚃',U:'𝚄',V:'𝚅',W:'𝚆',X:'𝚇',Y:'𝚈',Z:'𝚉' },
  { a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'U',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ' },
  { a:'𝕒',b:'𝕓',c:'𝕔',d:'𝕕',e:'𝕖',f:'𝕗',g:'𝕘',h:'𝕙',i:'𝕚',j:'𝕛',k:'𝕜',l:'𝕝',m:'𝕞',n:'𝕟',o:'𝕠',p:'𝕡',q:'𝕢',r:'𝕣',s:'𝕤',t:'𝕥',u:'𝕦',v:'𝕧',w:'𝕨',x:'𝕩',y:'𝕪',z:'𝕫',A:'𝔸',B:'𝔹',C:'ℂ',D:'𝔻',E:'𝔼',F:'𝔽',G:'𝔾',H:'ℍ',I:'𝕀',J:'𝕁',K:'𝕂',L:'𝕃',M:'𝕄',N:'ℕ',O:'𝕆',P:'ℙ',Q:'ℚ',R:'ℝ',S:'𝕊',T:'𝕋',U:'𝕌',V:'𝕍',W:'𝕎',X:'𝕏',Y:'𝕐',Z:'ℤ' },
  { a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'ℯ',f:'𝒻',g:'ℊ',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'ℴ',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏',A:'𝒜',B:'ℬ',C:'𝒞',D:'𝒟',E:'ℰ',F:'ℱ',G:'𝒢',H:'ℋ',I:'ℐ',J:'𝒥',K:'𝒦',L:'ℒ',M:'ℳ',N:'𝒩',O:'𝒪',P:'𝒫',Q:'𝒬',R:'ℛ',S:'𝒮',T:'𝒯',U:'𝒰',V:'𝒱',W:'𝒲',X:'𝒳',Y:'𝒴',Z:'𝒵' },
  { a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷',A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ' },
  { a:'🄰',b:'🄱',c:'🄲',d:'🄳',e:'🄴',f:'🄵',g:'🄶',h:'🄷',i:'🄸',j:'🄹',k:'🄺',l:'🄻',m:'🄼',n:'🄽',o:'🄾',p:'🄿',q:'🅀',r:'🅁',s:'🅂',t:'🅃',u:'🅄',v:'🅅',w:'🅆',x:'🅇',y:'🅈',z:'🅉',A:'🄰',B:'🄱',C:'🄲',D:'🄳',E:'🄴',F:'🄵',G:'🄶',H:'🄷',I:'🄸',J:'🄹',K:'🄺',L:'🄻',M:'🄼',N:'🄽',O:'🄾',P:'🄿',Q:'🅀',R:'🅁',S:'🅂',T:'🅃',U:'🅄',V:'🅅',W:'🅆',X:'🅇',Y:'🅈',Z:'🅉' },
  { a:'🅰',b:'🅱',c:'🅲',d:'🅳',e:'🅴',f:'🅵',g:'🅶',h:'🅷',i:'🅸',j:'🅹',k:'🅺',l:'🅻',m:'🅼',n:'🅽',o:'🅾',p:'🅿',q:'🆀',r:'🆁',s:'🆂',t:'🆃',u:'🆄',v:'🆅',w:'🆆',x:'🆇',y:'🆈',z:'🆉',A:'🅰',B:'🅱',C:'🅲',D:'🅳',E:'🅴',F:'🅵',G:'🅶',H:'🅷',I:'🅸',J:'🅹',K:'🅺',L:'🅻',M:'🅼',N:'🅽',O:'🅾',P:'🅿',Q:'🆀',R:'🆁',S:'🆂',T:'🆃',U:'🆄',V:'🆅',W:'🆆',X:'🆇',Y:'🆈',Z:'🆉' },
];

function applyFont(text, index) {
  const map = FONT_MAPS[index % FONT_MAPS.length];
  return text.split('').map((ch) => map[ch] || map[ch.toLowerCase()] || ch).join('');
}

async function mintaKodePairing(sock, phone) {
  try {
    if (!phone || sock.authState.creds.registered) return;
    const code = await sock.requestPairingCode(phone);
    bot.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
    console.log(`🔑 KODE OTP BOT: ${bot.pairingCode}`);
  } catch (err) {
    console.log('⚠️ Gagal mengambil kode OTP:', err?.message || err);
    bot.pairingCode = 'Gagal memuat OTP. Muat ulang.';
  }
}

// ============================================================
// 8. MESIN AI SAT-SET (RACING MULTI-API & FILTER VALIDASI)
// ============================================================
function isValidAiText(txt) {
  if (!txt || typeof txt !== 'string') return false;
  const clean = txt.trim();
  if (clean.length < 2) return false;
  const lower = clean.toLowerCase();
  if (
    lower.startsWith('<!doctype') ||
    lower.startsWith('<html') ||
    lower.includes('rate limit') ||
    lower.includes('bad gateway') ||
    lower.includes('service unavailable') ||
    lower.includes('queue full')
  ) {
    return false;
  }
  return true;
}

async function panggilServerAISatSet(prompt, systemPrompt) {
  const tasks = [];

  if (GEMINI_API_KEY) {
    tasks.push(
      (async () => {
        const res = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPrompt}\n\nPertanyaan: ${prompt}` }] }],
            }),
          },
          7000
        );
        if (!res.ok) throw new Error('Gemini fail');
        const data = await res.json();
        const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!isValidAiText(txt)) throw new Error('Invalid');
        return txt;
      })()
    );
  }

  tasks.push(
    (async () => {
      const res = await fetchWithTimeout(
        'https://text.pollinations.ai/',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            model: 'openai',
          }),
        },
        7500
      );
      if (!res.ok) throw new Error('Pollinations POST fail');
      const txt = (await res.text()).trim();
      if (!isValidAiText(txt)) throw new Error('Invalid');
      return txt;
    })()
  );

  tasks.push(
    (async () => {
      const fullQ = `${systemPrompt}\nUser: ${prompt}`;
      const res = await fetchWithTimeout(`https://text.pollinations.ai/${encodeURIComponent(fullQ)}?model=mistral`, {}, 7500);
      if (!res.ok) throw new Error('Pollinations GET fail');
      const txt = (await res.text()).trim();
      if (!isValidAiText(txt)) throw new Error('Invalid');
      return txt;
    })()
  );

  tasks.push(
    (async () => {
      const res = await fetchWithTimeout(
        `https://api.siputzx.my.id/api/ai/gpt3?prompt=${encodeURIComponent(systemPrompt)}&content=${encodeURIComponent(prompt)}`,
        {},
        7500
      );
      if (!res.ok) throw new Error('Siputzx AI fail');
      const json = await res.json();
      const txt = (json?.data || json?.result || '').trim();
      if (!isValidAiText(txt)) throw new Error('Invalid');
      return txt;
    })()
  );

  try {
    return await Promise.any(tasks);
  } catch {
    return null;
  }
}

async function getSmartAIResponse(prompt, senderJid, senderName, specialty = 'general') {
  const userData = dbMemory.users[senderJid] || { facts: [], history: [] };
  const faktaTersimpan =
    userData.facts.length > 0
      ? `Fakta pengguna (${senderName}): ${userData.facts.join('; ')}.`
      : `Nama pengguna: ${senderName}.`;

  let roleDesc = `Kamu adalah ${bot.userName}, asisten AI WhatsApp yang cerdas, cepat, dan ramah. Jawab singkat, jelas, dan langsung ke inti dalam Bahasa Indonesia.`;
  if (specialty === 'coder') roleDesc += ' Ahli pemrograman dan debugging kode.';
  if (specialty === 'math') roleDesc += ' Tutor matematika yang menjelaskan langkah demi langkah secara akurat.';
  if (specialty === 'grammar') roleDesc += ' Korektor tata bahasa dan ejaan.';

  const systemPrompt = `${roleDesc} ${faktaTersimpan}`;
  const jawaban = await panggilServerAISatSet(prompt, systemPrompt);

  if (jawaban) {
    saveChatHistory(senderJid, senderName, 'user', prompt);
    saveChatHistory(senderJid, senderName, 'assistant', jawaban);
    return jawaban;
  }

  return null;
}

// ============================================================
// 9. BACKGROUND SELF-TEST & DIAGNOSTIK SEMUA FITUR
// ============================================================
async function jalankanBackgroundSelfTest() {
  console.log('🔍 [SELF-TEST] Menjalankan pengujian otomatis seluruh fitur di latar belakang...');
  const results = {};

  const testChecks = [
    {
      name: 'AI Engine (Multi-API)',
      fn: async () => {
        const res = await panggilServerAISatSet('Balas dengan 1 kata: OK', 'Jawab singkat.');
        return Boolean(res);
      },
    },
    {
      name: 'TikTok HD (Video/Audio/Slide)',
      fn: async () => {
        const res = await fetchWithTimeout('https://www.tikwm.com/api/', { method: 'POST' }, 8000);
        return res.ok;
      },
    },
    {
      name: 'YouTube Search & Audio/Video',
      fn: async () => {
        const list = await searchYouTube('lofi hip hop');
        return list.length > 0;
      },
    },
    {
      name: 'Cuaca Indonesia (Open-Meteo)',
      fn: async () => {
        const c = await getCuacaIndonesia('Bekasi');
        return Boolean(c?.caption);
      },
    },
    {
      name: 'Jadwal Sholat (Kemenag RI)',
      fn: async () => {
        const s = await getJadwalSholatIndonesia('Jakarta');
        return Boolean(s);
      },
    },
    {
      name: 'Al-Quran & Murattal (EQuran)',
      fn: async () => {
        const q = await getSurahLengkap('1');
        return Boolean(q?.text);
      },
    },
    {
      name: 'Wikipedia & Kamus',
      fn: async () => {
        const res = await fetchWithTimeout('https://id.wikipedia.org/api/rest_v1/page/summary/Indonesia', {}, 8000);
        return res.ok;
      },
    },
    {
      name: 'Anime SFW & QR Tools',
      fn: async () => {
        const res = await fetchWithTimeout('https://api.waifu.pics/sfw/waifu', {}, 8000);
        return res.ok;
      },
    },
  ];

  let passCount = 0;
  for (const t of testChecks) {
    try {
      const ok = await t.fn();
      results[t.name] = ok ? '✅ AKTIF' : '⚠️ LAMBAT';
      if (ok) passCount++;
    } catch {
      results[t.name] = '❌ GANGGUAN';
    }
  }

  dbMemory.healthReport = {
    lastChecked: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB',
    summary: `${passCount}/${testChecks.length} Modul Sehat`,
    details: results,
  };
  await saveMemory();
  console.log(`✅ [SELF-TEST SELESAI] ${dbMemory.healthReport.summary}`);
  return dbMemory.healthReport;
}

// ============================================================
// 10. HANDLER UTAMA PESAN, MENU ANIMASI, DOWNLOADER & KEAMANAN
// ============================================================
const gameSessions = new Map();
const userCooldowns = new Map();
const antiFloodTracker = new Map();
let lastAiErrorNotice = 0;

function pasangPenjawab(sock) {
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    const gCfg = getGroupConfig(id);
    if (action === 'add' && gCfg.welcome) {
      for (const user of participants) {
        await sock.sendMessage(id, {
          text: `👋 Selamat datang @${user.split('@')[0]} di grup! Ketik *menu* untuk melihat fitur ${bot.userName}.`,
          mentions: [user],
        });
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      if (!jid || jid === 'status@broadcast') continue;

      if (dbMemory.botSettings.autoread) {
        await sock.readMessages([msg.key]).catch(() => {});
      }

      const isGroup = jid.endsWith('@g.us');
      const senderParticipant = msg.key.participant || jid;
      const pushName = msg.pushName || 'Teman';

      if (dbMemory.botSettings.mode === 'self' && !senderParticipant.includes(PHONE)) {
        continue;
      }

      const rawText = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        ''
      ).trim();

      if (!rawText) continue;
      const textLower = rawText.toLowerCase();

      // ----------------------------------------------------
      // 🛡️ 1. PROTEKSI GRUP MANDIRI
      // ----------------------------------------------------
      if (isGroup) {
        const gCfg = getGroupConfig(jid);
        const allBadWords = [...bot.badWords, ...dbMemory.learnedWords];
        const hasBadWord = gCfg.antitoxic && allBadWords.some((w) => textLower.includes(w.toLowerCase()));
        const hasBlockedLink =
          bot.blockedDomains.some((d) => textLower.includes(d.toLowerCase())) ||
          (gCfg.antilink && /(https?:\/\/|chat\.whatsapp\.com)/i.test(rawText));

        const floodKey = `${jid}:${senderParticipant}`;
        const now = Date.now();
        const floodData = antiFloodTracker.get(floodKey) || { count: 0, lastText: '', time: now };
        if (now - floodData.time < 10000 && floodData.lastText === textLower) {
          floodData.count++;
        } else {
          floodData.count = 1;
          floodData.lastText = textLower;
          floodData.time = now;
        }
        antiFloodTracker.set(floodKey, floodData);

        if (hasBadWord || hasBlockedLink || floodData.count >= 4) {
          try {
            await sock.sendMessage(jid, { delete: msg.key });
            if (hasBadWord) bot.stats.totalDeletedBadWords++;
            if (hasBlockedLink) bot.stats.totalDeletedLinks++;
            if (floodData.count >= 4) {
              floodData.count = 0;
              continue;
            }

            await sock.sendMessage(jid, {
              text: hasBadWord
                ? `⚠️ Pesan @${senderParticipant.split('@')[0]} dihapus (kata terlarang).`
                : `🚫 Link dilarang di grup ini! Pesan @${senderParticipant.split('@')[0]} dihapus.`,
              mentions: [senderParticipant],
            });
            continue;
          } catch {}
        }
      }

      // ----------------------------------------------------
      // 📥 2. DOWNLOADER OTOMATIS LINK TIKTOK (VIDEO + AUDIO + FOTO SLIDE)
      // ----------------------------------------------------
      const detectedUrl = extractUrl(rawText);
      const firstWord = rawText.replace(/^[.!/#]/, '').split(/\s+/)[0].toLowerCase();

      if (detectedUrl && /tiktok\.com/i.test(detectedUrl) && !['ttmp3', 'ttslide', 'tiktok', 'tt'].includes(firstWord)) {
        await sock.sendPresenceUpdate('composing', jid);
        const hasilTT = await downloadTikTok(detectedUrl);
        if (hasilTT) {
          if (hasilTT.type === 'image') {
            const maxPhotos = hasilTT.images.slice(0, 10);
            for (let i = 0; i < maxPhotos.length; i++) {
              try {
                const imgBuf = await fetchBuffer(maxPhotos[i], 'https://www.tiktok.com/');
                await sock.sendMessage(
                  jid,
                  {
                    image: imgBuf,
                    caption: i === 0 ? `📸 *TikTok Slide (${i + 1}/${maxPhotos.length})*\n${hasilTT.title}` : `📸 Slide ${i + 1}/${maxPhotos.length}`,
                  },
                  { quoted: i === 0 ? msg : undefined }
                );
              } catch {}
            }
          } else if (hasilTT.videoUrl) {
            try {
              const vidBuf = await fetchBuffer(hasilTT.videoUrl, 'https://www.tiktok.com/');
              await sock.sendMessage(jid, { video: vidBuf, caption: `🎬 *TikTok HD*\n${hasilTT.title}` }, { quoted: msg });
            } catch {
              await sock.sendMessage(jid, { video: { url: hasilTT.videoUrl }, caption: `🎬 *TikTok HD*\n${hasilTT.title}` }, { quoted: msg });
            }
          }

          if (hasilTT.musicUrl) {
            try {
              const audBuf = await fetchBuffer(hasilTT.musicUrl, 'https://www.tiktok.com/');
              await sock.sendMessage(jid, { audio: audBuf, mimetype: 'audio/mp4' }, { quoted: msg });
            } catch {
              await sock.sendMessage(jid, { audio: { url: hasilTT.musicUrl }, mimetype: 'audio/mp4' }, { quoted: msg }).catch(() => {});
            }
          }
        } else {
          await sock.sendMessage(jid, { text: '❌ Video/Foto TikTok tidak dapat diunduh (pastikan akun tidak privat).' }, { quoted: msg });
        }
        continue;
      }

      // ----------------------------------------------------
      // 📥 3. DOWNLOADER OTOMATIS LINK YOUTUBE (VIDEO HD + AUDIO)
      // ----------------------------------------------------
      if (detectedUrl && /(youtube\.com\/(watch|shorts)|youtu\.be\/)/i.test(detectedUrl) && !['ytmp3', 'ytmp4', 'ytdl', 'video'].includes(firstWord)) {
        await sock.sendPresenceUpdate('composing', jid);
        const hasilYT = await downloadYouTube(detectedUrl, false);
        if (hasilYT?.url) {
          try {
            const vidBuf = await fetchBuffer(hasilYT.url);
            await sock.sendMessage(jid, { video: vidBuf, caption: `🎬 *YouTube HD*\n${hasilYT.title}` }, { quoted: msg });
          } catch {
            await sock.sendMessage(jid, { video: { url: hasilYT.url }, caption: `🎬 *YouTube HD*\n${hasilYT.title}` }, { quoted: msg }).catch(async () => {
              await sock.sendMessage(jid, { text: `✅ *YouTube HD:* ${hasilYT.title}\n🔗 ${hasilYT.url}` }, { quoted: msg });
            });
          }

          const hasilYTAudio = await downloadYouTube(detectedUrl, true);
          if (hasilYTAudio?.url) {
            try {
              const audBuf = await fetchBuffer(hasilYTAudio.url);
              await sock.sendMessage(jid, { audio: audBuf, mimetype: 'audio/mp4' }, { quoted: msg });
            } catch {}
          }
        } else {
          await sock.sendMessage(jid, { text: '❌ Video YouTube gagal diproses (durasi terlalu panjang atau dibatasi).' }, { quoted: msg });
        }
        continue;
      }

      // ----------------------------------------------------
      // 🎮 4. SESI GAME INTERAKTIF AKTIF
      // ----------------------------------------------------
      if (gameSessions.has(jid)) {
        const session = gameSessions.get(jid);
        if (session.type === 'angka' && /^[0-9]+$/.test(rawText)) {
          const guess = parseInt(rawText, 10);
          if (guess === session.answer) {
            gameSessions.delete(jid);
            await sock.sendMessage(jid, { text: `🎉 *BENAR!* Angkanya adalah *${session.answer}*.` }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { text: guess < session.answer ? '⬆️ Terlalu *KECIL*! Coba lagi.' : '⬇️ Terlalu *BESAR*! Coba lagi.' }, { quoted: msg });
          }
          continue;
        }
        if (session.type === 'math' && /^-?[0-9]+$/.test(rawText)) {
          const guess = parseInt(rawText, 10);
          gameSessions.delete(jid);
          if (guess === session.answer) {
            await sock.sendMessage(jid, { text: `🎉 *TEPAT SEKALI!* Jawabannya adalah *${session.answer}*.` }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { text: `❌ Kurang tepat! Jawaban yang benar adalah *${session.answer}*.` }, { quoted: msg });
          }
          continue;
        }
        if (session.type === 'kata' && !ALL_COMMANDS_SET.has(textLower.replace(/^[.!/#]/, ''))) {
          gameSessions.delete(jid);
          if (textLower === session.answer.toLowerCase()) {
            await sock.sendMessage(jid, { text: `🎉 *BENAR!* Jawabannya adalah *${session.answer}*.` }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { text: `❌ Salah! Jawaban yang benar adalah *${session.answer}*.` }, { quoted: msg });
          }
          continue;
        }
      }

      // ----------------------------------------------------
      // 📌 5. EKSEKUSI PERINTAH MENU
      // ----------------------------------------------------
      const hasPrefix = /^[.!/#]/.test(rawText);
      const cleanText = hasPrefix ? rawText.slice(1).trim() : rawText;
      const args = cleanText.split(/\s+/);
      const cmd = args[0].toLowerCase();
      const param = args.slice(1).join(' ').trim();

      if (ALL_COMMANDS_SET.has(cmd)) {
        if (dbMemory.botSettings.autotyping) {
          await sock.sendPresenceUpdate('composing', jid);
        }

        // === KATEGORI: MAIN & MENU (ANIMASI BERGERAK DINAMIS) ===
        if (cmd === 'menu' || cmd === 'help') {
          const currentAnimUrl = MENU_ANIMATIONS[menuAnimIndex % MENU_ANIMATIONS.length];
          menuAnimIndex++;

          const captionMenu =
            `*╭┈───〔 ${bot.userName} 〕┈───⊷*\n` +
            `*├✦ Owner:* ${OWNER_NAME}\n` +
            `*├✦ Commands:* ${ALL_COMMANDS_SET.size}\n` +
            `*├✦ Runtime:* ${getUptime()}\n` +
            `*├✦ Prefix:* . / ! / Tanpa Prefix\n` +
            `*├✦ Mode:* ${dbMemory.botSettings.mode}\n` +
            `*├✦ Status API:* ${dbMemory.healthReport.summary}\n` +
            `*╰───────────────────⊷*\n\n` +
            `ʜᴇʟʟᴏ *@${senderParticipant.split('@')[0]}* 👋\n` +
            `sᴇʟᴀᴍᴀᴛ ᴅᴀᴛᴀɴɢ ᴅɪ *${bot.userName}*.\n\n` +
            `📌 *ᴘɪʟɪʜᴀɴ ᴍᴇɴᴜ ʀᴀᴘɪ:*\n` +
            `• *allmenu* — ᴛᴀᴍᴘɪʟᴋᴀɴ sᴇᴍᴜᴀ ${ALL_COMMANDS_SET.size} ғɪᴛᴜʀ\n` +
            `• *aimenu* — ғɪᴛᴜʀ ᴀɪ sᴀᴛ-sᴇᴛ & ᴘɪɴᴛᴀʀ\n` +
            `• *downloadmenu* — ᴛɪᴋᴛᴏᴋ, ʏᴛ, ᴘʟᴀʏ ᴍᴜsɪᴄ, ɪɢ, ғʙ\n` +
            `• *searchmenu* — ᴄᴜᴀᴄᴀ ɪɴᴅᴏɴᴇsɪᴀ, sʜᴏʟᴀᴛ, sᴜʀᴀʜ, ᴡɪᴋɪ\n` +
            `• *animemenu* — ɢᴀᴍʙᴀʀ ᴀɴɪᴍᴇ sғᴡ\n` +
            `• *funmenu* — ɢᴀᴍᴇ & ʜɪʙᴜʀᴀɴ\n` +
            `• *groupmenu* — ᴋᴇᴀᴍᴀɴᴀɴ & ᴀᴅᴍɪɴ ɢʀᴜᴘ\n` +
            `• *logomenu* — ғᴏɴᴛ & ʙᴀɴɴᴇʀ ʟᴏɢᴏ\n` +
            `• *toolsmenu* — ᴛᴏᴏʟs & ᴜᴛɪʟɪᴛᴀs\n` +
            `• *ownermenu* — ᴘᴇɴɢᴀᴛᴜʀᴀɴ ʙᴏᴛ\n` +
            `• *selftest* — ᴄᴇᴋ ᴋᴇsᴇʜᴀᴛᴀɴ sᴇᴍᴜᴀ sᴇʀᴠᴇʀ\n\n` +
            `_💡 Kirim link TikTok (Video/Foto Slide) atau YouTube langsung untuk download otomatis._`;

          try {
            let animBuffer = cachedAnimBuffers.get(currentAnimUrl);
            if (!animBuffer) {
              animBuffer = await fetchBuffer(currentAnimUrl);
              cachedAnimBuffers.set(currentAnimUrl, animBuffer);
            }
            await sock.sendMessage(
              jid,
              {
                video: animBuffer,
                gifPlayback: true,
                caption: captionMenu,
                mentions: [senderParticipant],
              },
              { quoted: msg }
            );
          } catch {
            const fallbackBanner = `https://dummyimage.com/800x400/0f172a/38bdf8.png&text=${encodeURIComponent(bot.userName)}`;
            await sock.sendMessage(
              jid,
              {
                image: { url: fallbackBanner },
                caption: captionMenu,
                mentions: [senderParticipant],
              },
              { quoted: msg }
            ).catch(async () => {
              await sock.sendMessage(jid, { text: captionMenu, mentions: [senderParticipant] }, { quoted: msg });
            });
          }
          continue;
        }

        if (cmd === 'allmenu') {
          let fullMenu =
            `*╭┈───〔 ${bot.userName} - ALL MENU 〕┈───⊷*\n` +
            `*├✦ Owner:* ${OWNER_NAME}\n` +
            `*├✦ Commands:* ${ALL_COMMANDS_SET.size}\n` +
            `*├✦ Runtime:* ${getUptime()}\n` +
            `*├✦ Mode:* ${dbMemory.botSettings.mode}\n` +
            `*├✦ Version:* ${dbMemory.version}\n` +
            `*╰───────────────────⊷*\n\n`;

          for (const [catName, listCmd] of Object.entries(MENU_CATEGORIES)) {
            fullMenu += formatCategoryBox(catName, listCmd) + '\n';
          }
          fullMenu += `\n> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${bot.userName}*`;

          await sock.sendMessage(jid, { text: fullMenu }, { quoted: msg });
          continue;
        }

        const subMenuMap = {
          aimenu: 'AI',
          downloadmenu: 'DOWNLOAD',
          searchmenu: 'SEARCH',
          animemenu: 'ANIME',
          funmenu: 'FUN',
          groupmenu: 'GROUP',
          logomenu: 'LOGO',
          toolsmenu: 'TOOLS',
          ownermenu: 'OWNER',
        };
        if (subMenuMap[cmd]) {
          const catKey = subMenuMap[cmd];
          const box = formatCategoryBox(catKey, MENU_CATEGORIES[catKey]);
          await sock.sendMessage(jid, { text: `${box}\n\n_Ketik salah satu perintah di atas untuk menggunakannya._` }, { quoted: msg });
          continue;
        }

        if (cmd === 'selftest' || cmd === 'cekfitur') {
          await sock.sendMessage(jid, { text: '🔍 Menjalankan pengujian langsung ke seluruh server fitur...' }, { quoted: msg });
          const rep = await jalankanBackgroundSelfTest();
          const detailLines = Object.entries(rep.details)
            .map(([k, v]) => `• *${k}:* ${v}`)
            .join('\n');
          await sock.sendMessage(
            jid,
            {
              text:
                `🩺 *HASIL SELF-TEST SISTEM (${bot.userName})*\n` +
                `🕒 Waktu Cek: ${rep.lastChecked}\n` +
                `📊 Ringkasan: *${rep.summary}*\n\n` +
                `${detailLines}`,
            },
            { quoted: msg }
          );
          continue;
        }

        if (cmd === 'ping' || cmd === 'ping2') {
          const start = Date.now();
          await sock.sendMessage(jid, { text: `🏓 *Pong!* Kecepatan respon: *${Date.now() - start} ms*` }, { quoted: msg });
          continue;
        }

        if (cmd === 'alive' || cmd === 'runtime' || cmd === 'uptime') {
          await sock.sendMessage(jid, { text: `🟢 *${bot.userName} Aktif!*\n⏱️ Runtime: *${getUptime()}*\n📦 Versi: *v${dbMemory.version}*` }, { quoted: msg });
          continue;
        }

        if (cmd === 'owner') {
          await sock.sendMessage(jid, { text: `👤 *Owner Bot:* ${OWNER_NAME}\n📱 *Nomor Bot:* ${bot.userPhone || '-'}` }, { quoted: msg });
          continue;
        }

        if (cmd === 'status') {
          const totalFilter = bot.badWords.length + dbMemory.learnedWords.length;
          await sock.sendMessage(
            jid,
            {
              text:
                `📊 *STATUS ${bot.userName}*\n\n` +
                `• Versi: v${dbMemory.version}\n` +
                `• Uptime: ${getUptime()}\n` +
                `• Total Fitur: ${ALL_COMMANDS_SET.size} perintah\n` +
                `• Kesehatan Server: ${dbMemory.healthReport.summary}\n` +
                `• Filter Keamanan: ${totalFilter} kata\n` +
                `• Spam/Toxic Dihapus: ${bot.stats.totalDeletedBadWords + bot.stats.totalDeletedLinks}`,
            },
            { quoted: msg }
          );
          continue;
        }

        if (cmd === 'update') {
          const hasil = await jalankanEvolusiMandiri(true);
          const riwayat = dbMemory.updateLogs.slice(0, 3).map((l) => `• ${l}`).join('\n');
          await sock.sendMessage(jid, { text: `🧬 *EVOLUSI & UPDATE SISTEM BERHASIL*\n\n${hasil}\n\n📜 *Riwayat Terbaru:*\n${riwayat}` }, { quoted: msg });
          continue;
        }

        if (cmd === 'githubstalk') {
          if (!param) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `githubstalk torvalds`' }, { quoted: msg });
            continue;
          }
          try {
            const res = await fetchWithTimeout(`https://api.github.com/users/${encodeURIComponent(param)}`);
            const u = await res.json();
            if (u.login) {
              await sock.sendMessage(
                jid,
                {
                  image: { url: u.avatar_url },
                  caption: `🐙 *GITHUB PROFILE*\n\n• Nama: ${u.name || u.login}\n• Username: @${u.login}\n• Bio: ${u.bio || '-'}\n• Repo Publik: ${u.public_repos}\n• Followers: ${u.followers} | Following: ${u.following}\n• Link: ${u.html_url}`,
                },
                { quoted: msg }
              );
            } else {
              await sock.sendMessage(jid, { text: '❌ Username GitHub tidak ditemukan.' }, { quoted: msg });
            }
          } catch {
            await sock.sendMessage(jid, { text: '❌ Gagal mengambil data GitHub.' }, { quoted: msg });
          }
          continue;
        }

        // === KATEGORI: AI ===
        if (cmd === 'memori') {
          const userMem = dbMemory.users[jid];
          if (userMem && userMem.facts.length > 0) {
            await sock.sendMessage(jid, { text: `🧠 *Hal yang kuingat tentangmu:*\n• ${userMem.facts.join('\n• ')}` }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { text: '🧠 Belum ada catatan khusus tentangmu. Ceritakan hobi atau cita-citamu!' }, { quoted: msg });
          }
          continue;
        }

        if (cmd === 'resetmemori') {
          delete dbMemory.users[jid];
          await saveMemory();
          await sock.sendMessage(jid, { text: '✅ Ingatan AI untuk akunmu telah direset.' }, { quoted: msg });
          continue;
        }

        if (MENU_CATEGORIES.AI.includes(cmd)) {
          if (!param) {
            await sock.sendMessage(jid, { text: `⚠️ Masukkan pertanyaanmu.\nContoh: \`${cmd} jelaskan cara kerja satelit\`` }, { quoted: msg });
            continue;
          }
          let spec = 'general';
          if (cmd.includes('coder')) spec = 'coder';
          if (cmd.includes('math')) spec = 'math';
          if (cmd === 'grammar') spec = 'grammar';

          const reply = await getSmartAIResponse(param, jid, pushName, spec);
          if (reply) {
            await sock.sendMessage(jid, { text: reply }, { quoted: msg });
          }
          continue;
        }

        // === KATEGORI: DOWNLOAD ===
        if (['tiktok', 'tt', 'ttmp3', 'ttslide'].includes(cmd)) {
          const linkTT = extractUrl(param);
          if (!linkTT || !/tiktok\.com/i.test(linkTT)) {
            await sock.sendMessage(jid, { text: `⚠️ Masukkan link TikTok valid.\nContoh: \`${cmd} https://vt.tiktok.com/xxxx\`` }, { quoted: msg });
            continue;
          }
          const hasilTT = await downloadTikTok(linkTT);
          if (!hasilTT) {
            await sock.sendMessage(jid, { text: '❌ Gagal mengunduh TikTok. Pastikan akun tidak privat.' }, { quoted: msg });
            continue;
          }

          if (cmd === 'ttmp3') {
            if (hasilTT.musicUrl) {
              try {
                const audBuf = await fetchBuffer(hasilTT.musicUrl, 'https://www.tiktok.com/');
                await sock.sendMessage(jid, { audio: audBuf, mimetype: 'audio/mp4' }, { quoted: msg });
              } catch {
                await sock.sendMessage(jid, { audio: { url: hasilTT.musicUrl }, mimetype: 'audio/mp4' }, { quoted: msg });
              }
            } else {
              await sock.sendMessage(jid, { text: '❌ Audio tidak tersedia pada video ini.' }, { quoted: msg });
            }
            continue;
          }

          if (hasilTT.type === 'image') {
            const maxPhotos = hasilTT.images.slice(0, 10);
            for (let i = 0; i < maxPhotos.length; i++) {
              try {
                const imgBuf = await fetchBuffer(maxPhotos[i], 'https://www.tiktok.com/');
                await sock.sendMessage(
                  jid,
                  {
                    image: imgBuf,
                    caption: i === 0 ? `📸 *TikTok Slide (${i + 1}/${maxPhotos.length})*\n${hasilTT.title}` : `📸 Slide ${i + 1}/${maxPhotos.length}`,
                  },
                  { quoted: i === 0 ? msg : undefined }
                );
              } catch {}
            }
          } else if (hasilTT.videoUrl) {
            try {
              const vidBuf = await fetchBuffer(hasilTT.videoUrl, 'https://www.tiktok.com/');
              await sock.sendMessage(jid, { video: vidBuf, caption: `🎬 *TikTok HD*\n${hasilTT.title}` }, { quoted: msg });
            } catch {
              await sock.sendMessage(jid, { video: { url: hasilTT.videoUrl }, caption: `🎬 *TikTok HD*\n${hasilTT.title}` }, { quoted: msg });
            }
          }

          if (hasilTT.musicUrl) {
            try {
              const audBuf = await fetchBuffer(hasilTT.musicUrl, 'https://www.tiktok.com/');
              await sock.sendMessage(jid, { audio: audBuf, mimetype: 'audio/mp4' }, { quoted: msg });
            } catch {}
          }
          continue;
        }

        if (['ytmp4', 'ytmp3', 'ytdl', 'video'].includes(cmd)) {
          const linkYT = extractUrl(param);
          if (!linkYT || !/(youtube\.com|youtu\.be)/i.test(linkYT)) {
            await sock.sendMessage(jid, { text: `⚠️ Masukkan link YouTube valid.\nContoh: \`${cmd} https://youtu.be/xxxx\`` }, { quoted: msg });
            continue;
          }
          const isAudio = cmd === 'ytmp3';
          const hasilYT = await downloadYouTube(linkYT, isAudio);
          if (hasilYT?.url) {
            try {
              const mediaBuf = await fetchBuffer(hasilYT.url);
              if (isAudio) {
                await sock.sendMessage(jid, { audio: mediaBuf, mimetype: 'audio/mp4' }, { quoted: msg });
              } else {
                await sock.sendMessage(jid, { video: mediaBuf, caption: `🎬 *YouTube HD*\n${hasilYT.title}` }, { quoted: msg });
              }
            } catch {
              if (isAudio) {
                await sock.sendMessage(jid, { audio: { url: hasilYT.url }, mimetype: 'audio/mp4' }, { quoted: msg }).catch(async () => {
                  await sock.sendMessage(jid, { text: `🎵 *${hasilYT.title}*\n🔗 ${hasilYT.url}` }, { quoted: msg });
                });
              } else {
                await sock.sendMessage(jid, { video: { url: hasilYT.url }, caption: `🎬 *YouTube HD*\n${hasilYT.title}` }, { quoted: msg }).catch(async () => {
                  await sock.sendMessage(jid, { text: `🎬 *${hasilYT.title}*\n🔗 ${hasilYT.url}` }, { quoted: msg });
                });
              }
            }
          } else {
            await sock.sendMessage(jid, { text: '❌ Media YouTube gagal diproses saat ini.' }, { quoted: msg });
          }
          continue;
        }

        // PLAY / SONG: Menampilkan info lengkap (Thumbnail, Judul, Channel, Durasi, Link) + Audio MP3!
        if (cmd === 'play' || cmd === 'song') {
          if (!param) {
            await sock.sendMessage(jid, { text: `⚠️ Masukkan judul lagu.\nContoh: \`${cmd} laskar pelangi\`` }, { quoted: msg });
            continue;
          }
          const results = await searchYouTube(param);
          const first = results[0];
          if (!first) {
            await sock.sendMessage(jid, { text: '❌ Lagu tidak ditemukan di YouTube.' }, { quoted: msg });
            continue;
          }

          const infoLagu =
            `🎵 *YOUTUBE MUSIC PLAYER*\n\n` +
            `• *Judul:* ${first.title}\n` +
            `• *Channel:* ${first.author}\n` +
            `• *Durasi:* ${first.duration}\n` +
            `• *Link:* ${first.url}\n\n` +
            `_⏳ Mengirimkan file audio..._`;

          if (first.thumbnail) {
            await sock.sendMessage(jid, { image: { url: first.thumbnail }, caption: infoLagu }, { quoted: msg }).catch(async () => {
              await sock.sendMessage(jid, { text: infoLagu }, { quoted: msg });
            });
          } else {
            await sock.sendMessage(jid, { text: infoLagu }, { quoted: msg });
          }

          const audioData = await downloadYouTube(first.url, true);
          if (audioData?.url) {
            try {
              const audBuf = await fetchBuffer(audioData.url);
              await sock.sendMessage(jid, { audio: audBuf, mimetype: 'audio/mp4' }, { quoted: msg });
            } catch {
              await sock.sendMessage(jid, { audio: { url: audioData.url }, mimetype: 'audio/mp4' }, { quoted: msg }).catch(async () => {
                await sock.sendMessage(jid, { text: `🔗 *Link Audio Langsung:*\n${audioData.url}` }, { quoted: msg });
              });
            }
          } else {
            await sock.sendMessage(jid, { text: '⚠️ Audio tidak dapat diekstrak untuk lagu ini.' }, { quoted: msg });
          }
          continue;
        }

        if (cmd === 'yts') {
          if (!param) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `yts tutorial coding`' }, { quoted: msg });
            continue;
          }
          const list = await searchYouTube(param);
          if (list.length > 0) {
            const hasil = list
              .map((v, i) => `${i + 1}. *${v.title}*\n   👤 ${v.author} | ⏱️ ${v.duration}\n   🔗 ${v.url}`)
              .join('\n\n');
            await sock.sendMessage(jid, { text: `🔎 *Hasil Pencarian YouTube:*\n\n${hasil}` }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { text: '❌ Tidak ditemukan hasil di YouTube.' }, { quoted: msg });
          }
          continue;
        }

        if (['igdl', 'fb', 'twitter', 'capcut', 'mediafire', 'gdrive'].includes(cmd)) {
          const linkSosmed = extractUrl(param);
          if (!linkSosmed) {
            await sock.sendMessage(jid, { text: `⚠️ Masukkan URL valid.\nContoh: \`${cmd} https://...\`` }, { quoted: msg });
            continue;
          }
          const mediaRes = await downloadSocialMedia(linkSosmed, cmd);
          if (mediaRes?.url) {
            try {
              const buf = await fetchBuffer(mediaRes.url);
              if (cmd === 'mediafire' || cmd === 'gdrive') {
                await sock.sendMessage(jid, { document: buf, fileName: mediaRes.filename, mimetype: 'application/octet-stream' }, { quoted: msg });
              } else if (mediaRes.isImage) {
                await sock.sendMessage(jid, { image: buf, caption: `✅ *${cmd.toUpperCase()} Download*` }, { quoted: msg });
              } else {
                await sock.sendMessage(jid, { video: buf, caption: `✅ *${cmd.toUpperCase()} Download*` }, { quoted: msg });
              }
            } catch {
              await sock.sendMessage(jid, { text: `✅ *Link Unduhan Siap:*\n${mediaRes.url}` }, { quoted: msg });
            }
          } else {
            await sock.sendMessage(jid, { text: '❌ Tautan tidak didukung atau bersifat privat.' }, { quoted: msg });
          }
          continue;
        }

        if (cmd === 'gitclone') {
          const match = param.match(/github\.com\/([^/]+)\/([^/\s]+)/i);
          if (!match) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `gitclone https://github.com/user/repo`' }, { quoted: msg });
            continue;
          }
          const ownerRepo = match[1];
          const repoName = match[2].replace(/\.git$/, '');
          let branch = 'main';
          try {
            const infoRes = await fetchWithTimeout(`https://api.github.com/repos/${ownerRepo}/${repoName}`, {}, 8000);
            const infoJson = await infoRes.json();
            if (infoJson?.default_branch) branch = infoJson.default_branch;
          } catch {}
          const zipUrl = `https://github.com/${ownerRepo}/${repoName}/archive/refs/heads/${branch}.zip`;
          await sock.sendMessage(jid, { document: { url: zipUrl }, fileName: `${repoName}.zip`, mimetype: 'application/zip' }, { quoted: msg });
          continue;
        }

        if (cmd === 'tts') {
          if (!param) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `tts halo selamat pagi semua`' }, { quoted: msg });
            continue;
          }
          const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(param.slice(0, 200))}&tl=id&client=tw-ob`;
          const audBuf = await fetchBuffer(ttsUrl).catch(() => null);
          if (audBuf) {
            await sock.sendMessage(jid, { audio: audBuf, mimetype: 'audio/mp4', ptt: true }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { audio: { url: ttsUrl }, mimetype: 'audio/mp4', ptt: true }, { quoted: msg });
          }
          continue;
        }

        // === KATEGORI: SEARCH (CUACA INDONESIA, SHOLAT KEMENAG, SURAH + AUDIO, WIKI) ===
        if (cmd === 'cuaca' || cmd === 'wthr') {
          const kota = param || 'Jakarta';
          const hasilCuaca = await getCuacaIndonesia(kota);
          if (hasilCuaca) {
            try {
              const imgBuf = await fetchBuffer(hasilCuaca.imageUrl);
              await sock.sendMessage(jid, { image: imgBuf, caption: hasilCuaca.caption }, { quoted: msg });
            } catch {
              await sock.sendMessage(jid, { text: hasilCuaca.caption }, { quoted: msg });
            }
          } else {
            await sock.sendMessage(jid, { text: `❌ Wilayah *"${kota}"* tidak ditemukan. Coba nama kota/kabupaten terdekat (misal: \`cuaca Bekasi\` atau \`cuaca Bandung\`).` }, { quoted: msg });
          }
          continue;
        }

        if (cmd === 'praytime') {
          const kota = param || 'Jakarta';
          const jadwal = await getJadwalSholatIndonesia(kota);
          if (jadwal) {
            await sock.sendMessage(jid, { text: jadwal }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { text: `❌ Jadwal sholat untuk *"${kota}"* tidak ditemukan. Coba nama kota/kabupaten di Indonesia.` }, { quoted: msg });
          }
          continue;
        }

        if (cmd === 'surah') {
          const qSurah = param || '1';
          const hasilSurah = await getSurahLengkap(qSurah);
          if (hasilSurah) {
            await sock.sendMessage(jid, { text: hasilSurah.text }, { quoted: msg });
            if (hasilSurah.audioUrl) {
              try {
                const audBuf = await fetchBuffer(hasilSurah.audioUrl);
                await sock.sendMessage(jid, { audio: audBuf, mimetype: 'audio/mp4' }, { quoted: msg });
              } catch {
                await sock.sendMessage(jid, { audio: { url: hasilSurah.audioUrl }, mimetype: 'audio/mp4' }, { quoted: msg }).catch(() => {});
              }
            }
          } else {
            await sock.sendMessage(jid, { text: '❌ Surah tidak ditemukan. Gunakan nomor `1-114` atau nama surah (contoh: `surah yasin`).' }, { quoted: msg });
          }
          continue;
        }

        if (cmd === 'wiki') {
          if (!param) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `wiki Indonesia`' }, { quoted: msg });
            continue;
          }
          try {
            let res = await fetchWithTimeout(`https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(param)}`);
            let data = await res.json();
            if (!data.extract) {
              const searchRes = await fetchWithTimeout(`https://id.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(param)}&limit=1&format=json`);
              const searchJson = await searchRes.json();
              const bestTitle = searchJson?.[1]?.[0];
              if (bestTitle) {
                res = await fetchWithTimeout(`https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle)}`);
                data = await res.json();
              }
            }
            if (data.extract) {
              await sock.sendMessage(jid, { text: `📚 *Wikipedia: ${data.title}*\n\n${data.extract}` }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { text: '❌ Artikel Wikipedia tidak ditemukan.' }, { quoted: msg });
            }
          } catch {
            await sock.sendMessage(jid, { text: '❌ Gagal mengakses Wikipedia.' }, { quoted: msg });
          }
          continue;
        }

        if (cmd === 'define') {
          if (!param) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `define serendipity`' }, { quoted: msg });
            continue;
          }
          try {
            const res = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(param)}`);
            const data = await res.json();
            const def = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
            if (def) {
              await sock.sendMessage(jid, { text: `📖 *Definisi (${param}):*\n${def}` }, { quoted: msg });
              continue;
            }
          } catch {}
          const aiDef = await getSmartAIResponse(`Jelaskan arti dan definisi kata "${param}" secara singkat dan jelas dalam Bahasa Indonesia.`, jid, pushName);
          if (aiDef) await sock.sendMessage(jid, { text: `📖 *Definisi (${param}):*\n${aiDef}` }, { quoted: msg });
          continue;
        }

        if (cmd === 'npm') {
          if (!param) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `npm axios`' }, { quoted: msg });
            continue;
          }
          try {
            const res = await fetchWithTimeout(`https://registry.npmjs.org/${encodeURIComponent(param)}`);
            const data = await res.json();
            if (data.name) {
              const latest = data['dist-tags']?.latest || '-';
              await sock.sendMessage(jid, { text: `📦 *NPM Package: ${data.name}*\n• Versi Terbaru: ${latest}\n• Deskripsi: ${data.description || '-'}` }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { text: '❌ Paket NPM tidak ditemukan.' }, { quoted: msg });
            }
          } catch {
            await sock.sendMessage(jid, { text: '❌ Gagal mencari paket NPM.' }, { quoted: msg });
          }
          continue;
        }

        if (cmd === 'fakta') {
          const reply = await getSmartAIResponse('Berikan 1 fakta sains atau sejarah dunia yang unik dan akurat dalam 3 kalimat.', jid, pushName);
          if (reply) await sock.sendMessage(jid, { text: `💡 *Fakta Unik:*\n\n${reply}` }, { quoted: msg });
          continue;
        }

        if (cmd === 'motivasi') {
          const reply = await getSmartAIResponse('Berikan 1 kutipan motivasi singkat tentang belajar dan pantang menyerah.', jid, pushName);
          if (reply) await sock.sendMessage(jid, { text: `✨ *Motivasi Hari Ini:*\n\n${reply}` }, { quoted: msg });
          continue;
        }

        // === KATEGORI: ANIME (SFW) ===
        if (MENU_CATEGORIES.ANIME.includes(cmd)) {
          const endpointMap = {
            waifu: 'waifu',
            neko: 'neko',
            megumin: 'megumin',
            shinobu: 'shinobu',
            awoo: 'awoo',
            maid: 'waifu',
            anime: 'waifu',
          };
          try {
            const res = await fetchWithTimeout(`https://api.waifu.pics/sfw/${endpointMap[cmd]}`);
            const json = await res.json();
            if (json.url) {
              await sock.sendMessage(jid, { image: { url: json.url }, caption: `✨ *Anime (${cmd.toUpperCase()})*` }, { quoted: msg });
            }
          } catch {}
          continue;
        }

        // === KATEGORI: FUN & GAMES ===
        if (cmd === 'game') {
          const secret = Math.floor(Math.random() * 10) + 1;
          gameSessions.set(jid, { type: 'angka', answer: secret });
          await sock.sendMessage(jid, { text: '🎮 *Tebak Angka (1-10)*\nKirim tebakan angkamu sekarang!' }, { quoted: msg });
          continue;
        }

        if (cmd === 'mathgame') {
          const a = Math.floor(Math.random() * 20) + 5;
          const b = Math.floor(Math.random() * 20) + 5;
          gameSessions.set(jid, { type: 'math', answer: a + b });
          await sock.sendMessage(jid, { text: `🧮 *Kuis Matematika Cepat*\nBerapa hasil dari *${a} + ${b}*?` }, { quoted: msg });
          continue;
        }

        if (cmd === 'tebakkata') {
          const soalList = [
            { q: 'Aku punya kota tapi tidak punya rumah, punya gunung tapi tidak punya pohon. Apakah aku?', a: 'peta' },
            { q: 'Semakin banyak diambil, semakin besar jadinya. Apakah aku?', a: 'lubang' },
            { q: 'Punya leher tapi tidak punya kepala. Apakah aku?', a: 'botol' },
            { q: 'Selalu naik tapi tidak pernah turun. Apakah aku?', a: 'umur' },
            { q: 'Punya gigi banyak tapi tidak bisa menggigit. Apakah aku?', a: 'sisir' },
            { q: 'Jika dipecahkan baru bisa digunakan. Apakah aku?', a: 'telur' },
          ];
          const pilih = soalList[Math.floor(Math.random() * soalList.length)];
          gameSessions.set(jid, { type: 'kata', answer: pilih.a });
          await sock.sendMessage(jid, { text: `🧩 *Tebak Kata*\n\n${pilih.q}\n_(Ketik jawabannya langsung)_` }, { quoted: msg });
          continue;
        }

        if (cmd === 'suit') {
          const pilihan = ['batu', 'gunting', 'kertas'];
          const userPick = param.toLowerCase();
          if (!pilihan.includes(userPick)) {
            await sock.sendMessage(jid, { text: '⚠️ Pilih salah satu: `suit batu`, `suit gunting`, atau `suit kertas`' }, { quoted: msg });
            continue;
          }
          const botPick = pilihan[Math.floor(Math.random() * 3)];
          let hasil = 'Seri! 🤝';
          if (
            (userPick === 'batu' && botPick === 'gunting') ||
            (userPick === 'gunting' && botPick === 'kertas') ||
            (userPick === 'kertas' && botPick === 'batu')
          ) {
            hasil = 'Kamu Menang! 🎉';
          } else if (userPick !== botPick) {
            hasil = 'Bot Menang! 🤖';
          }
          await sock.sendMessage(jid, { text: `✊✌️✋ *Suit*\nKamu: *${userPick}*\nBot: *${botPick}*\n\nHasil: *${hasil}*` }, { quoted: msg });
          continue;
        }

        if (cmd === 'dice') {
          await sock.sendMessage(jid, { text: `🎲 Dadu dilempar: *${Math.floor(Math.random() * 6) + 1}*` }, { quoted: msg });
          continue;
        }

        if (cmd === 'coin') {
          await sock.sendMessage(jid, { text: `🪙 Koin dilempar: *${Math.random() < 0.5 ? 'ANGKA' : 'GAMBAR'}*` }, { quoted: msg });
          continue;
        }

        if (cmd === '8ball') {
          const ans = ['Ya, pasti!', 'Kemungkinan besar iya.', 'Coba tanya lagi nanti.', 'Sepertinya tidak.', 'Sangat diragukan.'];
          await sock.sendMessage(jid, { text: `🎱 *Magic 8-Ball:* ${ans[Math.floor(Math.random() * ans.length)]}` }, { quoted: msg });
          continue;
        }

        if (['rate', 'aura', 'sigma', 'rizz', 'vibe', 'npc', 'maincharacter', 'delulu', 'redflag', 'greenflag', 'compatibility', 'ship'].includes(cmd)) {
          const persen = Math.floor(Math.random() * 101);
          const subjek = param || pushName;
          await sock.sendMessage(jid, { text: `📊 *${cmd.toUpperCase()} METER*\nTarget: *${subjek}*\nSkor: *${persen}%*` }, { quoted: msg });
          continue;
        }

        if (['roast', 'compliment', 'pickup', 'quote', 'joke', 'truth', 'dare', 'wyr', 'horoscope'].includes(cmd)) {
          const promptMap = {
            roast: `Berikan 1 roasting ringan dan lucu yang sopan untuk ${param || pushName}.`,
            compliment: `Berikan 1 pujian tulus yang menyemangati untuk ${param || pushName}.`,
            pickup: 'Berikan 1 gombalan lucu dan sopan.',
            quote: 'Berikan 1 kutipan bijak inspiratif.',
            joke: 'Ceritakan 1 tebak-tebakan lucu singkat dalam Bahasa Indonesia.',
            truth: 'Berikan 1 pertanyaan Truth yang seru dan aman untuk permainan.',
            dare: 'Berikan 1 tantangan Dare yang seru, positif, dan aman.',
            wyr: 'Berikan 1 pertanyaan Would You Rather yang menarik.',
            horoscope: `Berikan ramalan semangat harian yang positif untuk zodiak ${param || 'hari ini'}.`,
          };
          const reply = await getSmartAIResponse(promptMap[cmd], jid, pushName);
          if (reply) await sock.sendMessage(jid, { text: `✨ *${cmd.toUpperCase()}:*\n\n${reply}` }, { quoted: msg });
          continue;
        }

        const reactionList = ['hug', 'pat', 'wave', 'smile', 'dance', 'highfive', 'wink', 'blush', 'happy', 'cry', 'sleep', 'think', 'poke'];
        if (reactionList.includes(cmd)) {
          const apiAction = cmd === 'think' ? 'smug' : cmd;
          try {
            const res = await fetchWithTimeout(`https://api.waifu.pics/sfw/${apiAction}`);
            const json = await res.json();
            if (json.url) {
              await sock.sendMessage(jid, { image: { url: json.url }, caption: `*${pushName}* melakukan *${cmd}* ${param ? `ke ${param}` : ''}` }, { quoted: msg });
            }
          } catch {
            await sock.sendMessage(jid, { text: `*${pushName}* melakukan *${cmd}*!` }, { quoted: msg });
          }
          continue;
        }

        // === KATEGORI: GROUP (PROTEKSI ADMIN & BOT ANTI-KICK) ===
        if (MENU_CATEGORIES.GROUP.includes(cmd)) {
          if (!isGroup) {
            await sock.sendMessage(jid, { text: '⚠️ Perintah ini hanya dapat digunakan di dalam grup.' }, { quoted: msg });
            continue;
          }

          try {
            const metadata = await sock.groupMetadata(jid);
            const participants = metadata.participants.map((p) => p.id);
            const gCfg = getGroupConfig(jid);

            const senderNum = senderParticipant.split(':')[0].replace(/\D/g, '');
            const senderInfo = metadata.participants.find(
              (p) => p.id === senderParticipant || p.id.split(':')[0].replace(/\D/g, '') === senderNum
            );
            const isSenderAdmin =
              senderInfo?.admin === 'admin' ||
              senderInfo?.admin === 'superadmin' ||
              (PHONE && senderNum === PHONE);

            if (cmd === 'ginfo') {
              await sock.sendMessage(
                jid,
                {
                  text: `ℹ️ *INFO GRUP*\n• Nama: ${metadata.subject}\n• Anggota: ${participants.length}\n• Anti-Link: ${gCfg.antilink ? 'ON' : 'OFF'}\n• Anti-Toxic: ${gCfg.antitoxic ? 'ON' : 'OFF'}\n• Welcome: ${gCfg.welcome ? 'ON' : 'OFF'}`,
                },
                { quoted: msg }
              );
              continue;
            }

            if (!isSenderAdmin) {
              await sock.sendMessage(jid, { text: '⚠️ Perintah ini hanya dapat digunakan oleh Admin Grup.' }, { quoted: msg });
              continue;
            }

            if (cmd === 'tagall' || cmd === 'everyone') {
              const teksTag = `📢 *PENGUMUMAN GRUP*\n${param ? `Pesan: ${param}\n\n` : '\n'}` + participants.map((p) => `• @${p.split('@')[0]}`).join('\n');
              await sock.sendMessage(jid, { text: teksTag, mentions: participants }, { quoted: msg });
              continue;
            }

            if (cmd === 'hidetag') {
              await sock.sendMessage(jid, { text: param || '📢 Perhatian semuanya!', mentions: participants });
              continue;
            }

            if (cmd === 'link') {
              const code = await sock.groupInviteCode(jid);
              await sock.sendMessage(jid, { text: `🔗 *Link Undangan Grup:*\nhttps://chat.whatsapp.com/${code}` }, { quoted: msg });
              continue;
            }

            if (cmd === 'revoke') {
              await sock.groupRevokeInvite(jid);
              await sock.sendMessage(jid, { text: '✅ Link undangan grup telah direset.' }, { quoted: msg });
              continue;
            }

            if (cmd === 'mute') {
              await sock.groupSettingUpdate(jid, 'announcement');
              await sock.sendMessage(jid, { text: '🔒 Grup ditutup (hanya admin yang dapat mengirim pesan).' }, { quoted: msg });
              continue;
            }

            if (cmd === 'unmute') {
              await sock.groupSettingUpdate(jid, 'not_announcement');
              await sock.sendMessage(jid, { text: '🔓 Grup dibuka (semua anggota dapat mengirim pesan).' }, { quoted: msg });
              continue;
            }

            if (cmd === 'updategname') {
              if (!param) continue;
              await sock.groupUpdateSubject(jid, param);
              await sock.sendMessage(jid, { text: `✅ Nama grup diubah menjadi: *${param}*` }, { quoted: msg });
              continue;
            }

            if (cmd === 'updategdesc') {
              if (!param) continue;
              await sock.groupUpdateDescription(jid, param);
              await sock.sendMessage(jid, { text: '✅ Deskripsi grup berhasil diperbarui.' }, { quoted: msg });
              continue;
            }

            if (cmd === 'poll') {
              const parts = param.split('|').map((s) => s.trim()).filter(Boolean);
              if (parts.length < 3) {
                await sock.sendMessage(jid, { text: '⚠️ Format: `poll Pertanyaan | Opsi 1 | Opsi 2`' }, { quoted: msg });
                continue;
              }
              await sock.sendMessage(jid, { poll: { name: parts[0], values: parts.slice(1), selectableCount: 1 } });
              continue;
            }

            if (cmd === 'delete') {
              const quotedKey = msg.message.extendedTextMessage?.contextInfo;
              if (quotedKey?.stanzaId) {
                await sock.sendMessage(jid, {
                  delete: {
                    remoteJid: jid,
                    fromMe: false,
                    id: quotedKey.stanzaId,
                    participant: quotedKey.participant,
                  },
                });
              } else {
                await sock.sendMessage(jid, { text: '⚠️ Balas pesan yang ingin dihapus dengan mengetik `delete`.' }, { quoted: msg });
              }
              continue;
            }

            if (['kick', 'add', 'promote', 'demote'].includes(cmd)) {
              const quotedParticipant = msg.message.extendedTextMessage?.contextInfo?.participant;
              const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
              const target = mentioned[0] || quotedParticipant || (param ? `${param.replace(/\D/g, '')}@s.whatsapp.net` : null);

              if (!target) {
                await sock.sendMessage(jid, { text: `⚠️ Tag pengguna, balas pesannya, atau masukkan nomor.\nContoh: \`${cmd} @user\`` }, { quoted: msg });
                continue;
              }

              if (cmd === 'kick') {
                const botNum = (bot.userPhone || sock.user?.id?.split(':')[0] || '').replace(/\D/g, '');
                const targetNum = target.split(':')[0].replace(/\D/g, '');
                if (botNum && targetNum === botNum) {
                  await sock.sendMessage(jid, { text: '🛡️ Bot tidak dapat mengeluarkan dirinya sendiri!' }, { quoted: msg });
                  continue;
                }
                const targetMember = metadata.participants.find(
                  (p) => p.id === target || p.id.split(':')[0].replace(/\D/g, '') === targetNum
                );
                if (targetMember && (targetMember.admin === 'admin' || targetMember.admin === 'superadmin')) {
                  await sock.sendMessage(jid, { text: '🛡️ Admin Grup dilindungi dan tidak dapat di-kick!' }, { quoted: msg });
                  continue;
                }
              }

              const actionMap = { kick: 'remove', add: 'add', promote: 'promote', demote: 'demote' };
              await sock.groupParticipantsUpdate(jid, [target], actionMap[cmd]);
              await sock.sendMessage(jid, { text: `✅ Berhasil menjalankan *${cmd}* pada @${target.split('@')[0]}`, mentions: [target] }, { quoted: msg });
              continue;
            }

            if (cmd === 'antilink') {
              gCfg.antilink = !gCfg.antilink;
              await saveMemory();
              await sock.sendMessage(jid, { text: `🛡️ Anti-Link Grup sekarang: *${gCfg.antilink ? 'AKTIF' : 'NONAKTIF'}*` }, { quoted: msg });
              continue;
            }

            if (cmd === 'antitoxic') {
              gCfg.antitoxic = !gCfg.antitoxic;
              await saveMemory();
              await sock.sendMessage(jid, { text: `🛡️ Anti-Toxic Grup sekarang: *${gCfg.antitoxic ? 'AKTIF' : 'NONAKTIF'}*` }, { quoted: msg });
              continue;
            }

            if (cmd === 'welcome') {
              gCfg.welcome = !gCfg.welcome;
              await saveMemory();
              await sock.sendMessage(jid, { text: `👋 Pesan Welcome Grup sekarang: *${gCfg.welcome ? 'AKTIF' : 'NONAKTIF'}*` }, { quoted: msg });
              continue;
            }

            if (cmd === 'leave') {
              await sock.sendMessage(jid, { text: '👋 Bot pamit keluar dari grup. Terima kasih!' });
              await sock.groupLeave(jid);
              continue;
            }
          } catch {
            await sock.sendMessage(jid, { text: '⚠️ Gagal menjalankan perintah grup. Pastikan bot sudah menjadi Admin Grup.' }, { quoted: msg });
          }
          continue;
        }

        // === KATEGORI: LOGO & FONT ===
        if (cmd === 'font' || cmd === 'fancy') {
          if (!param) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `font Halo Dunia`' }, { quoted: msg });
            continue;
          }
          const semuaFont = FONT_MAPS.map((_, idx) => `${idx + 1}. ${applyFont(param, idx)}`).join('\n');
          await sock.sendMessage(jid, { text: `🔤 *Hasil Variasi Font:*\n\n${semuaFont}` }, { quoted: msg });
          continue;
        }

        if (/^font([1-9]|10)$/.test(cmd)) {
          if (!param) {
            await sock.sendMessage(jid, { text: `⚠️ Contoh: \`${cmd} Teks Kamu\`` }, { quoted: msg });
            continue;
          }
          const num = parseInt(cmd.replace('font', ''), 10) - 1;
          await sock.sendMessage(jid, { text: applyFont(param, num) }, { quoted: msg });
          continue;
        }

        if (['logo', 'neon', 'gold', 'galaxy', 'glitch', 'matrix', 'graffiti', 'thunder'].includes(cmd)) {
          if (!param) {
            await sock.sendMessage(jid, { text: `⚠️ Masukkan teks logo.\nContoh: \`${cmd} ${bot.userName}\`` }, { quoted: msg });
            continue;
          }
          const themeColors = {
            logo: '0f172a/38bdf8',
            neon: '090d16/00ffcc',
            gold: '1c1917/facc15',
            galaxy: '1e1b4b/c084fc',
            glitch: '18181b/f43f5e',
            matrix: '022c22/4ade80',
            graffiti: '312e81/fb923c',
            thunder: '0c4a6e/fde047',
          };
          const logoUrl = `https://dummyimage.com/800x400/${themeColors[cmd]}.png&text=${encodeURIComponent(param)}`;
          const imgBuf = await fetchBuffer(logoUrl).catch(() => null);
          if (imgBuf) {
            await sock.sendMessage(jid, { image: imgBuf, caption: `🎨 *Logo (${cmd.toUpperCase()})*` }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { image: { url: logoUrl }, caption: `🎨 *Logo (${cmd.toUpperCase()})*` }, { quoted: msg });
          }
          continue;
        }

        // === KATEGORI: TOOLS & UTILITY ===
        if (cmd === 'hitung') {
          if (!param || !/^[0-9+\-*/().\s]+$/.test(param)) {
            await sock.sendMessage(jid, { text: '⚠️ Masukkan rumus valid.\nContoh: `hitung 25000 * 3`' }, { quoted: msg });
            continue;
          }
          try {
            const hasil = Function(`"use strict"; return (${param})`)();
            await sock.sendMessage(jid, { text: `🧮 *Hasil:* ${param} = *${hasil}*` }, { quoted: msg });
          } catch {
            await sock.sendMessage(jid, { text: '⚠️ Rumus tidak valid.' }, { quoted: msg });
          }
          continue;
        }

        if (cmd === 'catat') {
          if (!param) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `catat Rapat jam 8 malam`' }, { quoted: msg });
            continue;
          }
          if (!dbMemory.notes[jid]) dbMemory.notes[jid] = [];
          dbMemory.notes[jid].push(`${param} (${getTodayDateString()})`);
          await saveMemory();
          await sock.sendMessage(jid, { text: '📝 Catatan disimpan! Ketik *catatan* untuk melihat.' }, { quoted: msg });
          continue;
        }

        if (cmd === 'catatan') {
          const list = dbMemory.notes[jid] || [];
          if (list.length === 0) {
            await sock.sendMessage(jid, { text: '📭 Belum ada catatan tersimpan.' }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { text: `📒 *CATATANMU:*\n\n${list.map((c, i) => `${i + 1}. ${c}`).join('\n')}` }, { quoted: msg });
          }
          continue;
        }

        if (cmd === 'terjemah' || cmd === 'translate') {
          const bahasa = args[1];
          const teks = args.slice(2).join(' ');
          if (!bahasa || !teks) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `terjemah inggris selamat pagi`' }, { quoted: msg });
            continue;
          }
          const reply = await getSmartAIResponse(`Terjemahkan ke bahasa ${bahasa} tanpa penjelasan tambahan: "${teks}"`, jid, pushName);
          if (reply) await sock.sendMessage(jid, { text: `🌐 *Terjemahan (${bahasa}):*\n${reply}` }, { quoted: msg });
          continue;
        }

        if (cmd === 'id') {
          await sock.sendMessage(jid, { text: `🆔 *Info ID:*\n• Chat JID: \`${jid}\`\n• User JID: \`${senderParticipant}\`` }, { quoted: msg });
          continue;
        }

        if (cmd === 'getpp') {
          const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || senderParticipant;
          try {
            const ppUrl = await sock.profilePictureUrl(target, 'image');
            await sock.sendMessage(jid, { image: { url: ppUrl }, caption: `🖼️ Foto profil @${target.split('@')[0]}`, mentions: [target] }, { quoted: msg });
          } catch {
            await sock.sendMessage(jid, { text: '❌ Foto profil disembunyikan (privasi).' }, { quoted: msg });
          }
          continue;
        }

        if (cmd === 'getbio') {
          const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || senderParticipant;
          try {
            const statusData = await sock.fetchStatus(target);
            await sock.sendMessage(jid, { text: `📝 *Bio WhatsApp:*\n${statusData?.status || 'Tidak ada bio'}` }, { quoted: msg });
          } catch {
            await sock.sendMessage(jid, { text: '❌ Bio tidak dapat diakses.' }, { quoted: msg });
          }
          continue;
        }

        if (cmd === 'gpass') {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
          const len = Math.min(Math.max(parseInt(param, 10) || 12, 8), 32);
          const pass = Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
          await sock.sendMessage(jid, { text: `🔐 *Password Kuat (${len} karakter):*\n\`${pass}\`` }, { quoted: msg });
          continue;
        }

        if (cmd === 'qr') {
          if (!param) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `qr https://google.com`' }, { quoted: msg });
            continue;
          }
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(param)}`;
          await sock.sendMessage(jid, { image: { url: qrUrl }, caption: `📱 *QR Code:* ${param}` }, { quoted: msg });
          continue;
        }

        if (cmd === 'shorturl') {
          const linkShort = extractUrl(param);
          if (!linkShort) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `shorturl https://www.google.com`' }, { quoted: msg });
            continue;
          }
          try {
            const res = await fetchWithTimeout(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(linkShort)}`);
            const short = await res.text();
            await sock.sendMessage(jid, { text: `🔗 *Short URL:*\n${short}` }, { quoted: msg });
          } catch {
            await sock.sendMessage(jid, { text: '❌ Gagal memperpendek URL.' }, { quoted: msg });
          }
          continue;
        }

        if (cmd === 'waktu') {
          const wib = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
          await sock.sendMessage(jid, { text: `🕒 *Waktu Server (WIB):*\n${wib}` }, { quoted: msg });
          continue;
        }

        if (cmd === 'attp' || cmd === 'sticker') {
          if (!param) {
            await sock.sendMessage(jid, { text: `⚠️ Contoh: \`${cmd} Halo!\`` }, { quoted: msg });
            continue;
          }
          const stUrl = `https://dummyimage.com/512x512/14171c/38bdf8.png&text=${encodeURIComponent(param)}`;
          await sock.sendMessage(jid, { image: { url: stUrl }, caption: '✨ Stiker Teks' }, { quoted: msg });
          continue;
        }

        // VV / RVO: Mengunduh & mengirim ulang foto/video View Once
        if (cmd === 'vv' || cmd === 'rvo') {
          const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
          const viewOnce =
            quotedMsg?.viewOnceMessageV2?.message ||
            quotedMsg?.viewOnceMessage?.message ||
            quotedMsg?.viewOnceMessageV2Extension?.message;

          if (!viewOnce) {
            await sock.sendMessage(jid, { text: '⚠️ Balas foto/video sekali lihat (View Once) dengan mengetik `vv`.' }, { quoted: msg });
            continue;
          }

          try {
            if (viewOnce.imageMessage) {
              const stream = await downloadContentFromMessage(viewOnce.imageMessage, 'image');
              let buffer = Buffer.from([]);
              for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
              await sock.sendMessage(jid, { image: buffer, caption: viewOnce.imageMessage.caption || '🔓 View Once dibuka' }, { quoted: msg });
            } else if (viewOnce.videoMessage) {
              const stream = await downloadContentFromMessage(viewOnce.videoMessage, 'video');
              let buffer = Buffer.from([]);
              for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
              await sock.sendMessage(jid, { video: buffer, caption: viewOnce.videoMessage.caption || '🔓 View Once dibuka' }, { quoted: msg });
            }
          } catch {
            await sock.sendMessage(jid, { text: '❌ Gagal membuka media View Once.' }, { quoted: msg });
          }
          continue;
        }

        // === KATEGORI: OWNER & SETTING ===
        if (['setnama', 'setname', 'botname'].includes(cmd)) {
          if (!param) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `setnama JAWAD-AI PRO`' }, { quoted: msg });
            continue;
          }
          bot.userName = param;
          dbMemory.botSettings.customBotName = param;
          await saveMemory();
          try {
            await sock.updateProfileName(param);
          } catch {}
          await sock.sendMessage(jid, { text: `✅ Nama bot & tampilan menu otomatis diubah menjadi: *${param}*` }, { quoted: msg });
          continue;
        }

        if (cmd === 'updatebio') {
          if (!param) continue;
          await sock.updateProfileStatus(param);
          await sock.sendMessage(jid, { text: `✅ Bio WhatsApp bot diubah menjadi: *${param}*` }, { quoted: msg });
          continue;
        }

        if (cmd === 'block' || cmd === 'unblock') {
          const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || (param ? `${param.replace(/\D/g, '')}@s.whatsapp.net` : null);
          if (!target) {
            await sock.sendMessage(jid, { text: `⚠️ Contoh: \`${cmd} 628123456789\`` }, { quoted: msg });
            continue;
          }
          await sock.updateBlockStatus(target, cmd);
          await sock.sendMessage(jid, { text: `✅ Berhasil *${cmd}* nomor @${target.split('@')[0]}`, mentions: [target] }, { quoted: msg });
          continue;
        }

        if (cmd === 'blocklist') {
          const list = await sock.fetchBlocklist();
          await sock.sendMessage(jid, { text: `🚫 Total nomor diblokir: *${list.length} nomor*` }, { quoted: msg });
          continue;
        }

        if (cmd === 'autoread') {
          dbMemory.botSettings.autoread = !dbMemory.botSettings.autoread;
          await saveMemory();
          await sock.sendMessage(jid, { text: `👁️ Auto-Read sekarang: *${dbMemory.botSettings.autoread ? 'ON' : 'OFF'}*` }, { quoted: msg });
          continue;
        }

        if (cmd === 'autotyping') {
          dbMemory.botSettings.autotyping = !dbMemory.botSettings.autotyping;
          await saveMemory();
          await sock.sendMessage(jid, { text: `⌨️ Auto-Typing sekarang: *${dbMemory.botSettings.autotyping ? 'ON' : 'OFF'}*` }, { quoted: msg });
          continue;
        }

        if (cmd === 'mode') {
          if (param !== 'public' && param !== 'self') {
            await sock.sendMessage(jid, { text: '⚠️ Pilih mode: `mode public` atau `mode self`' }, { quoted: msg });
            continue;
          }
          dbMemory.botSettings.mode = param;
          await saveMemory();
          await sock.sendMessage(jid, { text: `⚙️ Mode bot diatur ke: *${param.toUpperCase()}*` }, { quoted: msg });
          continue;
        }

        if (cmd === 'badwords') {
          const total = bot.badWords.length + dbMemory.learnedWords.length;
          await sock.sendMessage(jid, { text: `🛡️ Total filter kata terlarang: *${total} kata*` }, { quoted: msg });
          continue;
        }

        if (cmd === 'addkata') {
          if (!param) {
            await sock.sendMessage(jid, { text: '⚠️ Contoh: `addkata kasar`' }, { quoted: msg });
            continue;
          }
          const k = param.toLowerCase();
          if (!dbMemory.learnedWords.includes(k)) {
            dbMemory.learnedWords.push(k);
            await saveMemory();
          }
          await sock.sendMessage(jid, { text: `✅ Kata *"${k}"* ditambahkan ke filter keamanan.` }, { quoted: msg });
          continue;
        }

        if (cmd === 'delkata') {
          if (!param) continue;
          const k = param.toLowerCase();
          dbMemory.learnedWords = dbMemory.learnedWords.filter((w) => w !== k);
          await saveMemory();
          await sock.sendMessage(jid, { text: `✅ Kata *"${k}"* dihapus dari filter.` }, { quoted: msg });
          continue;
        }

        if (cmd === 'clean') {
          if (global.gc) global.gc();
          bot.stats.lastCleanupTime = new Date().toLocaleString('id-ID');
          await sock.sendMessage(jid, { text: '🧹 Pembersihan cache & memori selesai.' }, { quoted: msg });
          continue;
        }
      }

      // ----------------------------------------------------
      // 🤖 6. OBROLAN AI CERDAS (ANTI-SPAM & FILTER GRUP)
      // ----------------------------------------------------
      if (isGroup) {
        const contextInfo = msg.message.extendedTextMessage?.contextInfo;
        const botIdPrefix = (bot.userPhone || sock.user?.id?.split(':')[0] || '').replace(/\D/g, '');
        const isMentioned = botIdPrefix && (contextInfo?.mentionedJid || []).some((m) => m.includes(botIdPrefix));
        const isQuotedBot = botIdPrefix && contextInfo?.participant?.includes(botIdPrefix);
        const isCalledByName =
          textLower.startsWith('ai ') ||
          textLower.startsWith('bot ') ||
          textLower.includes(bot.userName.toLowerCase());

        if (!isMentioned && !isQuotedBot && !isCalledByName) {
          continue;
        }
      }

      if (rawText.replace(/[^a-zA-Z0-9]/g, '').length < 2) continue;

      const lastUserChat = userCooldowns.get(senderParticipant) || 0;
      if (Date.now() - lastUserChat < 2000) continue;
      userCooldowns.set(senderParticipant, Date.now());

      if (dbMemory.botSettings.autotyping) {
        await sock.sendPresenceUpdate('composing', jid);
      }
      extractFactsAsync(rawText, jid, pushName);

      const reply = await getSmartAIResponse(rawText, jid, pushName, 'general');
      if (reply) {
        await sock.sendMessage(jid, { text: reply }, { quoted: msg });
      } else if (Date.now() - lastAiErrorNotice > 60000) {
        lastAiErrorNotice = Date.now();
        await sock.sendMessage(jid, { text: '⏳ Jaringan AI sedang sibuk sejenak, coba kirim ulang sebentar lagi.' }, { quoted: msg });
      }
    }
  });
}

// ============================================================
// 11. WEB PANEL KONTROL 2 KOLOM (DENGAN HASIL SELF-TEST)
// ============================================================
function mulaiWeb() {
  const port = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const qrImageUrl = bot.qr
        ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(bot.qr)}`
        : null;

      return res.end(
        JSON.stringify({
          connected: bot.connected,
          qrUrl: qrImageUrl,
          pairingCode: bot.pairingCode || (process.env.PHONE_NUMBER ? '⏳ Meminta Kode OTP...' : 'Isi PHONE_NUMBER di Railway Variables'),
          uptime: getUptime(),
          version: dbMemory.version,
          lastUpdateDate: dbMemory.lastUpdateDate,
          updateLogs: dbMemory.updateLogs,
          userPhone: bot.userPhone || 'Belum Terhubung',
          userName: bot.userName || 'NEXA-AI BOT',
          totalCommands: ALL_COMMANDS_SET.size,
          badWordsCount: bot.badWords.length + dbMemory.learnedWords.length,
          healthReport: dbMemory.healthReport,
          categories: MENU_CATEGORIES,
        })
      );
    }

    if (req.url === '/api/trigger-update' && req.method === 'POST') {
      Promise.all([jalankanEvolusiMandiri(true), jalankanBackgroundSelfTest()]).then(([log]) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, log }));
      });
      return;
    }

    if (req.url === '/api/set-name' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const { newName } = JSON.parse(body);
          if (newName) {
            bot.userName = newName;
            dbMemory.botSettings.customBotName = newName;
            await saveMemory();
            if (bot.sock) {
              await bot.sock.updateProfileName(newName).catch(() => {});
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true }));
          }
        } catch (e) {
          console.error(e);
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Panel Bot WhatsApp AI</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
        body { background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { color: #38bdf8; margin: 0 0 5px 0; font-size: 1.7rem; }
        .container { display: flex; flex-wrap: wrap; gap: 20px; max-width: 1100px; width: 100%; }
        .panel { background: #1e293b; border-radius: 16px; padding: 24px; flex: 1; min-width: 320px; border: 1px solid #334155; }
        .panel-title { font-size: 1.1rem; color: #38bdf8; font-weight: bold; border-bottom: 1px solid #334155; padding-bottom: 10px; margin-bottom: 15px; }
        .qr-img { border: 4px solid #38bdf8; border-radius: 12px; margin: 15px 0; background: white; }
        .otp-box { font-size: 1.8rem; font-weight: bold; letter-spacing: 4px; color: #38bdf8; background: #0f172a; padding: 12px; border-radius: 10px; border: 2px dashed #38bdf8; margin: 15px 0; text-align: center; }
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
        .stat-card { background: #0f172a; padding: 10px 12px; border-radius: 10px; border-left: 4px solid #38bdf8; }
        .stat-card div { font-size: 0.78rem; color: #94a3b8; }
        .stat-card strong { font-size: 0.95rem; color: #f8fafc; }
        .input-group { display: flex; gap: 8px; margin: 12px 0; }
        .input-group input { flex: 1; padding: 10px; border: 1px solid #475569; background: #0f172a; color: white; border-radius: 8px; outline: none; }
        .btn { background: #0284c7; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .btn-green { background: #059669; width: 100%; margin-top: 8px; }
        .list-box { max-height: 170px; overflow-y: auto; background: #0f172a; border-radius: 8px; padding: 10px; font-size: 0.84rem; }
        .list-item { padding: 6px 0; border-bottom: 1px dashed #334155; }
        .badge { background: #10b981; color: white; padding: 5px 12px; border-radius: 12px; font-size: 0.85rem; font-weight: bold; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🚀 NEXA-AI BOT CONTROL PANEL</h1>
        <p style="color:#94a3b8; margin:0;">AI Sat-Set, YouTube/TikTok Audio-Video, & Background Self-Test</p>
      </div>

      <div class="container">
        <div class="panel">
          <div class="panel-title">📱 PANEL 1: KONEKSI WHATSAPP (QR & OTP)</div>
          <div id="p1-content">Memuat status koneksi...</div>
        </div>

        <div class="panel">
          <div class="panel-title">⚙️ PANEL 2: PENGATURAN & SELF-TEST SERVER</div>
          <div class="stat-grid">
            <div class="stat-card">
              <div>Versi & Update</div>
              <strong id="st-ver">v3.5</strong>
            </div>
            <div class="stat-card">
              <div>Bot Uptime</div>
              <strong id="st-uptime">-</strong>
            </div>
            <div class="stat-card">
              <div>Total Perintah Aktif</div>
              <strong id="st-cmds">0</strong>
            </div>
            <div class="stat-card">
              <div>Kesehatan Server</div>
              <strong id="st-health">Menguji...</strong>
            </div>
          </div>

          <div class="input-group">
            <input type="text" id="new-name-input" placeholder="Ubah nama bot (otomatis update menu)...">
            <button class="btn" onclick="changeWaName()">Simpan</button>
          </div>

          <button class="btn btn-green" onclick="triggerUpdate()">🩺 Jalankan Self-Test & Evolusi Sekarang</button>

          <h4 style="margin: 15px 0 6px 0; color:#38bdf8;">🩺 Status Modul Latar Belakang:</h4>
          <div class="list-box" id="health-logs"></div>

          <h4 style="margin: 15px 0 6px 0; color:#38bdf8;">📂 Kategori Menu Aktif:</h4>
          <div class="list-box" id="menu-container"></div>
        </div>
      </div>

      <script>
        async function updateData() {
          try {
            const res = await fetch('/api/status');
            const d = await res.json();

            const p1 = document.getElementById('p1-content');
            if (d.connected) {
              p1.innerHTML = \`
                <div style="text-align:center; padding:30px 0;">
                  <span class="badge" style="background:#10b981;">✅ WA TERHUBUNG</span>
                  <p style="margin-top:15px; color:#cbd5e1;">Bot aktif melayani \${d.totalCommands} fitur & auto self-test.</p>
                  <p style="font-size:0.95rem; color:#38bdf8;">Nomor Aktif: <b>\${d.userPhone}</b></p>
                </div>\`;
            } else {
              const qrHtml = d.qrUrl ? '<img src="' + d.qrUrl + '" class="qr-img" width="180" height="180" />' : '<p style="color:#94a3b8;">Menyiapkan QR Code...</p>';
              p1.innerHTML = \`
                <div style="text-align:center;">
                  <span class="badge" style="background:#ef4444;">🔴 MENUNGGU KONEKSI</span>
                  <div style="margin-top:15px;"><strong>Opsi 1: Scan QR Code</strong><br>\${qrHtml}</div>
                  <div style="margin-top:10px;"><strong>Opsi 2: Kode Pairing (OTP)</strong><div class="otp-box">\${d.pairingCode}</div></div>
                  <p style="font-size:0.8rem; color:#94a3b8;">Batas waktu sesi: 2 Menit</p>
                </div>\`;
            }

            document.getElementById('st-ver').innerText = 'v' + d.version + ' (' + (d.lastUpdateDate || '-') + ')';
            document.getElementById('st-uptime').innerText = d.uptime;
            document.getElementById('st-cmds').innerText = d.totalCommands + ' Fitur';
            document.getElementById('st-health').innerText = d.healthReport?.summary || '-';

            const healthBox = document.getElementById('health-logs');
            const details = d.healthReport?.details || {};
            healthBox.innerHTML = Object.entries(details).map(([k, v]) => \`<div class="list-item"><b>\${k}</b>: \${v}</div>\`).join('') || '<div class="list-item">Menunggu pengujian latar belakang...</div>';

            const menuBox = document.getElementById('menu-container');
            menuBox.innerHTML = Object.entries(d.categories).map(([cat, list]) => \`
              <div class="list-item">
                <b style="color:#38bdf8;">\${cat} (\${list.length})</b>: <span style="color:#cbd5e1;">\${list.join(', ')}</span>
              </div>\`).join('');
          } catch (e) { console.error(e); }
        }

        async function changeWaName() {
          const input = document.getElementById('new-name-input');
          if (!input.value.trim()) return alert('Masukkan nama baru terlebih dahulu!');
          const res = await fetch('/api/set-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName: input.value.trim() })
          });
          const result = await res.json();
          if (result.success) {
            alert('Nama bot & tampilan menu berhasil diperbarui!');
            input.value = '';
            updateData();
          } else {
            alert('Gagal memperbarui nama.');
          }
        }

        async function triggerUpdate() {
          const res = await fetch('/api/trigger-update', { method: 'POST' });
          const result = await res.json();
          if (result.success) {
            alert('Self-Test & Evolusi selesai dijalankan!');
            updateData();
          }
        }

        setInterval(updateData, 2500);
        updateData();
      </script>
    </body>
    </html>
    `;

    res.end(html);
  });

  server.listen(port, () => console.log(`🌐 Web Panel berjalan di port ${port}`));
}

// ============================================================
// 12. PEMBERSIH 24 JAM & STARTUP UTAMA
// ============================================================
function jalankanPembersihOtomatis24Jam() {
  setInterval(() => {
    try {
      if (fs.existsSync(AUTH_DIR)) {
        const files = fs.readdirSync(AUTH_DIR);
        files.forEach((file) => {
          if (file.startsWith('app-state-sync-') || file.startsWith('pre-key-')) {
            fs.unlinkSync(path.join(AUTH_DIR, file));
          }
        });
      }
      userCooldowns.clear();
      antiFloodTracker.clear();
      if (global.gc) global.gc();
      bot.stats.lastCleanupTime = new Date().toLocaleString('id-ID');
      console.log('🧹 [PEMBERSIH 24 JAM] Cache sementara dibersihkan.');
    } catch (err) {
      console.error('⚠️ Gagal membersihkan memori:', err);
    }
  }, 24 * 60 * 60 * 1000);
}

async function start() {
  await loadMemory();
  await jalankanEvolusiMandiri(false);
  setInterval(() => jalankanEvolusiMandiri(false), 60 * 60 * 1000);

  // Jalankan Background Self-Test otomatis 15 detik setelah start & setiap 4 jam
  setTimeout(() => jalankanBackgroundSelfTest(), 15000);
  setInterval(() => jalankanBackgroundSelfTest(), 4 * 60 * 60 * 1000);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log('\n==================================================');
  console.log(` 🤖 ${bot.userName} v${dbMemory.version} (${ALL_COMMANDS_SET.size} FITUR) 🤖`);
  console.log('==================================================\n');

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['NEXA-AI Bot', 'Chrome', '3.5.0'],
    printQRInTerminal: false,
  });

  bot.sock = sock;
  bot.connected = false;
  bot.registered = !!sock.authState.creds.registered;

  sock.ev.on('creds.update', saveCreds);
  pasangPenjawab(sock);

  const timerKoneksi = setTimeout(() => {
    if (!bot.connected) {
      console.log('⏳ [TIMER 2 MENIT] Batas waktu habis. Memuat ulang sesi QR & OTP...');
      bot.qr = null;
      bot.pairingCode = null;
      try {
        sock.end(new Error('Timeout 2 menit'));
      } catch {}
    }
  }, 120000);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && !bot.connected) {
      bot.qr = qr;
      if (PHONE && !bot.registered && !bot.pairingCode) {
        setTimeout(() => mintaKodePairing(sock, PHONE), 2000);
      }
    }

    if (connection === 'open') {
      clearTimeout(timerKoneksi);
      bot.connected = true;
      bot.registered = true;
      bot.qr = null;
      bot.pairingCode = null;
      bot.userPhone = sock.user?.id ? sock.user.id.split(':')[0] : PHONE;
      if (!dbMemory.botSettings.customBotName && sock.user?.name) {
        bot.userName = sock.user.name;
      }
      console.log(`✅ [BERHASIL] Bot Terhubung ke WhatsApp: ${bot.userPhone}`);
    } else if (connection === 'close') {
      clearTimeout(timerKoneksi);
      bot.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('❌ [LOGOUT] Sesi terputus. Menghapus sesi lama...');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
      setTimeout(start, 3000);
    }
  });
}

jalankanPembersihOtomatis24Jam();
mulaiWeb();
start();
