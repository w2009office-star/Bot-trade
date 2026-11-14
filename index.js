import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';

import {
  initFeatures,
  MENU_CATEGORIES,
  ALL_COMMANDS_SET,
  formatCategoryBox,
  getUptime,
  getTodayDateString,
  getIndonesianFullDateTime,
  extractUrl,
  getServerHardwareStats,
  fetchWithTimeout,
  fetchBuffer,
  mediaBufferToWebpSticker,
  createBratSticker,
  urlOrTextToWebpSticker,
  extractAndDownloadViewOnce,
  convertLinkToHdShortVideo,
  sendInteractiveButtons,
  deteksiVirtekDanBug,
  kirimTampilanKuroSlash,
  kirimTampilanSonic,
  generateSpotifyPlayerCardBuffer,
  downloadTikTok,
  searchYouTube,
  downloadYouTube,
  downloadSocialMedia,
  getCuacaIndonesia,
  getJadwalSholatIndonesia,
  getSurahLengkap,
  FONT_MAPS,
  applyFont,
  panggilServerAISatSet,
  getSmartAIResponse,
  mulaiWeb,
} from './features.js';

// ============================================================
// 1. KONFIGURASI & STATUS GLOBAL BOT
// ============================================================
const PHONE = (process.env.PHONE_NUMBER || '').replace(/\D/g, '');
const AUTH_DIR = process.env.AUTH_DIR || './auth';
const MEMORY_FILE = './memory.json';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OWNER_NAME = process.env.OWNER_NAME || 'Maverick';
const BOT_CODE_TAG = process.env.BOT_CODE_TAG || 'WhuxenXDev';
const CHANNEL_URL = process.env.CHANNEL_URL || 'https://whatsapp.com/channel/0029Va8';
const MENU_BANNER_LINK = process.env.MENU_BANNER_LINK || '';

const bot = {
  sock: null,
  connected: false,
  registered: false,
  qr: null,
  pairingCode: null,
  startTime: Date.now(),
  userPhone: null,
  userName: 'WHUXEN ASISTEN',

  stats: {
    totalDeletedBadWords: 0,
    totalDeletedLinks: 0,
    totalBlockedVirtek: 0,
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
// 2. SISTEM MEMORI PERMANEN, HIGH SCORE GAME & SELF-TEST
// ============================================================
let dbMemory = {
  version: 7.0,
  lastUpdateDate: '',
  updateLogs: [],
  users: {},
  learnedWords: [],
  notes: {},
  groupSettings: {},
  gameHighScores: {
    kuroslash: {},
    sonic: {},
  },
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
        gameHighScores: {
          kuroslash: { ...(parsed.gameHighScores?.kuroslash || {}) },
          sonic: { ...(parsed.gameHighScores?.sonic || {}) },
        },
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
  if (!paksaManual && dbMemory.lastUpdateDate === hariIni) return false;

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

  const pesanLog = `v${dbMemory.version} (${hariIni}): Forwarded Profile Menu, In-Chat Layar Tap, Brat & BratVid Sticker, & RVO.`;
  dbMemory.updateLogs.unshift(pesanLog);
  if (dbMemory.updateLogs.length > 10) dbMemory.updateLogs.pop();

  await saveMemory();
  console.log(`🧬 [EVOLUSI MANDIRI] ${pesanLog}`);
  return pesanLog;
}

async function jalankanBackgroundSelfTest() {
  const results = {};
  const checks = [
    { name: 'AI Engine (Multi-API)', fn: async () => Boolean(await panggilServerAISatSet('Balas 1 kata: OK', 'Jawab singkat.')) },
    { name: 'TikTok HD Downloader', fn: async () => (await fetchWithTimeout('https://www.tikwm.com/api/', { method: 'POST' }, 8000)).ok },
    { name: 'Spotify & YT Music', fn: async () => (await searchYouTube('lofi hip hop')).length > 0 },
    { name: 'Brat & WebP Sticker', fn: async () => Boolean(await createBratSticker('test', false)) },
    { name: 'Cuaca Indonesia', fn: async () => Boolean((await getCuacaIndonesia('Bekasi'))?.caption) },
    { name: 'Jadwal Sholat Kemenag', fn: async () => Boolean(await getJadwalSholatIndonesia('Jakarta')) },
  ];

  let pass = 0;
  for (const t of checks) {
    try {
      const ok = await t.fn();
      results[t.name] = ok ? '✅ AKTIF' : '⚠️ LAMBAT';
      if (ok) pass++;
    } catch {
      results[t.name] = '❌ GANGGUAN';
    }
  }

  dbMemory.healthReport = {
    lastChecked: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB',
    summary: `${pass}/${checks.length} Modul Sehat`,
    details: results,
  };
  await saveMemory();
  return dbMemory.healthReport;
}

initFeatures({
  bot,
  dbMemory,
  saveMemory,
  jalankanEvolusiMandiri,
  jalankanBackgroundSelfTest,
  PHONE,
  GEMINI_API_KEY,
  OWNER_NAME,
  CHANNEL_URL,
});

function getGroupConfig(jid) {
  if (!dbMemory.groupSettings[jid]) {
    dbMemory.groupSettings[jid] = {
      antilink: false,
      antivirtek: true,
      antibug: true,
      antitoxic: true,
      antispam: true,
      welcome: false,
    };
  }
  return dbMemory.groupSettings[jid];
}

function extractFactsAsync(text, jid, name) {
  const lower = text.toLowerCase();
  const triggers = ['nama saya', 'hobi saya', 'saya suka', 'saya tinggal di', 'cita-cita saya', 'saya kerja', 'panggil saya'];
  if (triggers.some((t) => lower.includes(t))) {
    if (!dbMemory.users[jid]) {
      dbMemory.users[jid] = { name, facts: [], history: [], lastSeen: new Date().toISOString() };
    }
    if (!dbMemory.users[jid].facts.includes(text)) {
      dbMemory.users[jid].facts.push(text);
      if (dbMemory.users[jid].facts.length > 12) dbMemory.users[jid].facts.shift();
      saveMemory();
    }
  }
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
// 3. EKSTRAKTOR PESAN & KLIK TOMBOL (ANTI-EPHEMERAL & ANTI-EMOJI)
// ============================================================
function unwrapMessageContent(rawMsg) {
  let m = rawMsg || {};
  for (let i = 0; i < 5; i++) {
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    else if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    else if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
    else if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message;
    else if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
    else break;
  }
  return m;
}

function mapButtonDisplayTextToCommand(text) {
  const clean = text.replace(/^[^\w\d]+/u, '').trim().toLowerCase();
  if (clean.startsWith('buka menu') || clean.startsWith('semua perintah')) return 'allmenu';
  if (clean.startsWith('kuro slash')) return 'kuroslash';
  if (clean.startsWith('speedy dash')) return 'sonic';
  if (clean.startsWith('cek speed')) return 'ping';
  if (clean.startsWith('unduh video mp4')) return 'ytmp4';
  if (clean.startsWith('menu ')) return 'menu';
  if (clean === 'kiri') return 'kiri';
  if (clean === 'tebas') return 'tebas';
  if (clean === 'kanan') return 'kanan';
  if (clean.startsWith('ulti')) return 'ulti';
  if (clean === 'boost') return 'boost';
  if (clean === 'jump') return 'jump';
  if (clean === 'stop game') return 'stopgame';
  if (clean.startsWith('anti-link')) return 'antilink';
  if (clean.startsWith('anti-virtek')) return 'antivirtek';
  if (clean.startsWith('anti-toxic')) return 'antitoxic';
  if (clean.startsWith('welcome')) return 'welcome';
  return null;
}

function extractIncomingTextAndButton(msg) {
  const m = unwrapMessageContent(msg.message);

  const nativeResponse = m.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (nativeResponse?.paramsJson) {
    try {
      const parsed =
        typeof nativeResponse.paramsJson === 'string'
          ? JSON.parse(nativeResponse.paramsJson)
          : nativeResponse.paramsJson;
      if (parsed?.id) return String(parsed.id).trim();
    } catch {}
  }

  if (m.buttonsResponseMessage?.selectedButtonId) {
    return String(m.buttonsResponseMessage.selectedButtonId).trim();
  }
  if (m.templateButtonReplyMessage?.selectedId) {
    return String(m.templateButtonReplyMessage.selectedId).trim();
  }
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return String(m.listResponseMessage.singleSelectReply.selectedRowId).trim();
  }

  const raw = (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).trim();

  const mapped = mapButtonDisplayTextToCommand(raw);
  return mapped || raw;
}

// ============================================================
// 4. HANDLER UTAMA PESAN, GAME, STICKER, RVO & PERINTAH
// ============================================================
const gameSessions = new Map();
const userCooldowns = new Map();
const antiFloodTracker = new Map();
const lastPlaySession = new Map();
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
      try {
        if (!msg.message || msg.key.fromMe) continue;

        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast') continue;

        if (dbMemory.botSettings.autoread) {
          await sock.readMessages([msg.key]).catch(() => {});
        }

        const isGroup = jid.endsWith('@g.us');
        const senderParticipant = msg.key.participant || jid;
        const senderNum = senderParticipant.split(':')[0].replace(/\D/g, '');
        const pushName = msg.pushName || 'Member';
        const isOwner = Boolean(PHONE && senderNum === PHONE);

        if (dbMemory.botSettings.mode === 'self' && !isOwner) {
          continue;
        }

        const unwrapped = unwrapMessageContent(msg.message);
        const rawText = extractIncomingTextAndButton(msg);
        const textLower = rawText.toLowerCase();

        // ----------------------------------------------------
        // 🛡️ 1. PROTEKSI KEAMANAN GRUP LENGKAP
        // ----------------------------------------------------
        if (isGroup) {
          const gCfg = getGroupConfig(jid);
          let isSenderAdmin = isOwner;

          try {
            const meta = await sock.groupMetadata(jid);
            const sInfo = meta.participants.find(
              (p) => p.id === senderParticipant || p.id.split(':')[0].replace(/\D/g, '') === senderNum
            );
            if (sInfo?.admin === 'admin' || sInfo?.admin === 'superadmin') {
              isSenderAdmin = true;
            }
          } catch {}

          if (gCfg.antivirtek || gCfg.antibug) {
            const ancamanVirtek = deteksiVirtekDanBug(msg, rawText, isSenderAdmin);
            if (ancamanVirtek) {
              await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
              bot.stats.totalBlockedVirtek++;
              await sock.groupParticipantsUpdate(jid, [senderParticipant], 'remove').catch(() => {});
              await sock.sendMessage(jid, {
                text: `🛡️ *SISTEM KEAMANAN GRUP (${bot.userName})*\n\n🚫 Terdeteksi: *${ancamanVirtek}*\n👤 Pelaku: @${senderParticipant.split('@')[0]}\n⚡ Tindakan: Pesan dihapus & pelaku dikeluarkan otomatis!`,
                mentions: [senderParticipant],
              });
              continue;
            }
          }

          if (!rawText) continue;

          const allBadWords = [...bot.badWords, ...dbMemory.learnedWords];
          const hasBadWord = !isSenderAdmin && gCfg.antitoxic && allBadWords.some((w) => textLower.includes(w.toLowerCase()));
          const hasBlockedLink =
            !isSenderAdmin &&
            (bot.blockedDomains.some((d) => textLower.includes(d.toLowerCase())) ||
              (gCfg.antilink && /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me\/)/i.test(rawText)));

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
          const isSpamFlood = !isSenderAdmin && gCfg.antispam && floodData.count >= 4;

          if (hasBadWord || hasBlockedLink || isSpamFlood) {
            await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
            if (hasBadWord) bot.stats.totalDeletedBadWords++;
            if (hasBlockedLink) bot.stats.totalDeletedLinks++;
            if (isSpamFlood) {
              floodData.count = 0;
              continue;
            }
            await sock.sendMessage(jid, {
              text: hasBadWord
                ? `⚠️ Pesan @${senderParticipant.split('@')[0]} dihapus (kata terlarang).`
                : `🚫 *ANTI-LINK AKTIF!* Link dilarang di grup ini. Pesan @${senderParticipant.split('@')[0]} dihapus.`,
              mentions: [senderParticipant],
            });
            continue;
          }
        }

        if (!rawText) continue;

        // ----------------------------------------------------
        // 📥 2. DOWNLOADER OTOMATIS LINK TIKTOK & YOUTUBE
        // ----------------------------------------------------
        const detectedUrl = extractUrl(rawText);
        const firstWord = rawText.replace(/^[.!/#]/, '').split(/\s+/)[0].toLowerCase();

        if (detectedUrl && /tiktok\.com/i.test(detectedUrl) && !['ttmp3', 'ttslide', 'tiktok', 'tt', 'animasi', 'linkvideo'].includes(firstWord)) {
          await sock.sendPresenceUpdate('composing', jid);
          const hasilTT = await downloadTikTok(detectedUrl);
          if (hasilTT) {
            if (hasilTT.type === 'image') {
              for (let i = 0; i < Math.min(hasilTT.images.length, 10); i++) {
                const imgBuf = await fetchBuffer(hasilTT.images[i], 'https://www.tiktok.com/').catch(() => null);
                if (imgBuf) {
                  await sock.sendMessage(jid, { image: imgBuf, caption: i === 0 ? `📸 *TikTok Slide*\n${hasilTT.title}` : '' }, { quoted: i === 0 ? msg : undefined });
                }
              }
            } else if (hasilTT.videoUrl) {
              const vidBuf = await fetchBuffer(hasilTT.videoUrl, 'https://www.tiktok.com/').catch(() => null);
              if (vidBuf) {
                await sock.sendMessage(jid, { video: vidBuf, caption: `🎬 *TikTok HD*\n${hasilTT.title}` }, { quoted: msg });
              } else {
                await sock.sendMessage(jid, { video: { url: hasilTT.videoUrl }, caption: `🎬 *TikTok HD*\n${hasilTT.title}` }, { quoted: msg });
              }
            }
            if (hasilTT.musicUrl) {
              const audBuf = await fetchBuffer(hasilTT.musicUrl, 'https://www.tiktok.com/').catch(() => null);
              if (audBuf) await sock.sendMessage(jid, { audio: audBuf, mimetype: 'audio/mp4' }, { quoted: msg });
            }
          }
          continue;
        }

        if (detectedUrl && /(youtube\.com\/(watch|shorts)|youtu\.be\/)/i.test(detectedUrl) && !['ytmp3', 'ytmp4', 'ytdl', 'video'].includes(firstWord)) {
          await sock.sendPresenceUpdate('composing', jid);
          const hasilYT = await downloadYouTube(detectedUrl, false);
          if (hasilYT?.url) {
            const vidBuf = await fetchBuffer(hasilYT.url).catch(() => null);
            if (vidBuf) {
              await sock.sendMessage(jid, { video: vidBuf, caption: `🎬 *YouTube HD*\n${hasilYT.title}` }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { video: { url: hasilYT.url }, caption: `🎬 *YouTube HD*\n${hasilYT.title}` }, { quoted: msg }).catch(() => {});
            }
          }
          continue;
        }

        // ----------------------------------------------------
        // 🎮 3. KONTROL SENTUH LANGSUNG GAME DI DALAM CHAT
        // ----------------------------------------------------
        const cleanAction = textLower.replace(/^[.!/#]/, '').trim();

        if (cleanAction === 'stopgame' && gameSessions.has(jid)) {
          gameSessions.delete(jid);
          await sock.sendMessage(jid, { text: '🛑 Sesi permainan dihentikan.' }, { quoted: msg });
          continue;
        }

        if (gameSessions.has(jid)) {
          const session = gameSessions.get(jid);

          if (session.type === 'kuroslash' && ['kiri', 'tebas', 'kanan', 'ulti'].includes(cleanAction)) {
            session.wave = (session.wave || 0) + 1;
            let eventMsg = '';
            if (cleanAction === 'kiri') {
              session.lane = Math.max(0, session.lane - 1);
              session.score += 65;
              session.ulti = Math.min(100, session.ulti + 12);
              eventMsg = 'Bergerak cepat ke jalur KIRI & menghindari serangan!';
            } else if (cleanAction === 'kanan') {
              session.lane = Math.min(2, session.lane + 1);
              session.score += 65;
              session.ulti = Math.min(100, session.ulti + 12);
              eventMsg = 'Bergerak cepat ke jalur KANAN & mengambil Orb Emas (+65)!';
            } else if (cleanAction === 'tebas') {
              if (Math.random() < 0.78) {
                const pts = Math.floor(Math.random() * 140) + 120;
                session.score += pts;
                session.ulti = Math.min(100, session.ulti + 25);
                session.speed = Math.min(12.0, session.speed + 0.3);
                eventMsg = `⚔️ TEBASAN TELAK! Oni & peluru merah ter-PARRY (+${pts} skor)!`;
              } else {
                session.hp = Math.max(0, session.hp - 18);
                eventMsg = '💥 Terkena ledakan BOM saat menebas! HP berkurang -18.';
              }
            } else if (cleanAction === 'ulti') {
              if (session.ulti >= 100) {
                session.score += 450;
                session.ulti = 0;
                session.hp = Math.min(100, session.hp + 20);
                eventMsg = '🌊 GELOMBANG ULTI TERLEPAS! Semua Oni & Boss hancur (+450 skor, +20 HP)!';
              } else {
                eventMsg = `⚠️ Energi ULTI baru ${session.ulti}% (butuh 100%). Sentuh ⚔️ TEBAS untuk mengisi!`;
              }
            }

            const prevBest = dbMemory.gameHighScores.kuroslash[senderNum] || 0;
            if (session.score > prevBest) {
              dbMemory.gameHighScores.kuroslash[senderNum] = session.score;
              await saveMemory();
            }
            session.best = dbMemory.gameHighScores.kuroslash[senderNum] || session.score;

            if (session.hp <= 0) {
              gameSessions.delete(jid);
              await sock.sendMessage(jid, { text: `💀 *GAME OVER — KURO SLASH*\n🏆 Skor Akhir: *${session.score}*\n👑 Rekor Terbaik: *${session.best}*\n\nKetik *kuroslash* untuk bermain lagi!` }, { quoted: msg });
            } else {
              await kirimTampilanKuroSlash(sock, jid, senderNum, session, eventMsg, msg);
            }
            continue;
          }

          if (session.type === 'sonic' && ['boost', 'jump'].includes(cleanAction)) {
            let eventMsg = '';
            if (cleanAction === 'boost') {
              if (session.laserAlert && Math.random() < 0.45) {
                const lost = Math.max(1, Math.floor(session.rings * 0.1));
                session.rings = Math.max(0, session.rings - lost);
                session.laserAlert = false;
                eventMsg = `💥 Menabrak musuh saat Boost! Ring berkurang 10% (-${lost} rings).`;
              } else {
                const addRings = Math.floor(Math.random() * 8) + 5;
                session.rings += addRings;
                session.score += addRings * 35;
                session.speed = Math.min(15.0, session.speed + 0.4);
                session.laserAlert = Math.random() < 0.5;
                eventMsg = `⚡ SUPER BOOST! Mengumpulkan +${addRings} Gold Rings & melaju kencang!`;
              }
            } else if (cleanAction === 'jump') {
              const addRings = Math.floor(Math.random() * 6) + 4;
              session.rings += addRings;
              session.score += addRings * 40;
              session.laserAlert = false;
              eventMsg = `⬆️ LOMPATAN SEMPURNA melewati garis merah LASER (+${addRings} Rings)!`;
            }

            const prevBest = dbMemory.gameHighScores.sonic[senderNum] || 0;
            if (session.score > prevBest) {
              dbMemory.gameHighScores.sonic[senderNum] = session.score;
              await saveMemory();
            }
            session.best = dbMemory.gameHighScores.sonic[senderNum] || session.score;

            await kirimTampilanSonic(sock, jid, senderNum, session, eventMsg, msg);
            continue;
          }

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
            await sock.sendMessage(jid, { text: guess === session.answer ? `🎉 *TEPAT!* Jawabannya *${session.answer}*.` : `❌ Salah! Jawaban yang benar adalah *${session.answer}*.` }, { quoted: msg });
            continue;
          }
          if (session.type === 'kata' && !ALL_COMMANDS_SET.has(cleanAction)) {
            gameSessions.delete(jid);
            await sock.sendMessage(jid, { text: textLower === session.answer.toLowerCase() ? `🎉 *BENAR!* Jawabannya *${session.answer}*.` : `❌ Salah! Jawabannya adalah *${session.answer}*.` }, { quoted: msg });
            continue;
          }
        }

        // ----------------------------------------------------
        // 📌 4. EKSEKUSI SEMUA PERINTAH MENU
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

          // === MAIN & MENU (UNGGAHAN FORWARDED PROFILE + INFORMATION TABLE SEPERTI DI FOTO) ===
          if (cmd === 'menu' || cmd === 'help') {
            const dt = getIndonesianFullDateTime();
            const userStatusLabel = isOwner ? '👑 Owner' : '⭐ Unlimited Member';
            const bannerSource =
              MENU_BANNER_LINK ||
              `https://dummyimage.com/1000x480/1e1035/c084fc.png&text=${encodeURIComponent(bot.userName + '  •  v' + dbMemory.version)}`;

            const menuCardBody =
              `└ *${bot.userName}* ┐\n` +
              `🗓️ ${dt.full}\n\n` +
              `🏷️ *Ohayou! 🌅*\n` +
              `Berakhir besok pukul ${dt.jam}\n` +
              `Kode: \`${BOT_CODE_TAG}\`\n\n` +
              `👤 *INFORMATION*\n` +
              `• *NAMA*       : ${pushName}\n` +
              `• *STATUS*    : ${userStatusLabel}\n` +
              `• *LIMIT*        : ∞ Unlimited\n` +
              `• *BOT*          : ${bot.userName}\n` +
              `• *OWNER*     : ${OWNER_NAME}\n` +
              `• *VERSION* : v${dbMemory.version}`;

            const menuSections = [
              {
                title: '📂 KATEGORI MENU & LAYAR TAP',
                rows: [
                  { title: '📋 Semua Perintah (All Menu)', description: `Tampilkan seluruh ${ALL_COMMANDS_SET.size} perintah bot`, id: 'allmenu' },
                  { title: '⚔️ Kuro Slash (Layar Tap Chat)', description: 'Main game tebas Oni langsung di layar chat', id: 'kuroslash' },
                  { title: '🌀 Speedy Dash (Layar Tap Chat)', description: 'Main game Sonic kumpulkan Gold Rings di chat', id: 'sonic' },
                  { title: '🎨 Sticker, Brat & BratVid', description: 'Buat stiker foto/video/teks & stiker brat viral', id: 'logomenu' },
                  { title: '🎧 Spotify & YT Music Player', description: 'Putar lagu dengan kartu Spotify & download MP3', id: 'downloadmenu' },
                  { title: '🤖 Menu AI & ChatGPT/Gemini', description: 'Asisten pintar, koding, matematika & memori', id: 'aimenu' },
                  { title: '🔍 Menu Search & Islami', description: 'Cuaca BMKG, Jadwal Sholat, Al-Quran, Wiki', id: 'searchmenu' },
                  { title: '🛡️ Menu Keamanan Grup', description: 'Anti-Virtek, Anti-Bug, Anti-Link & Admin', id: 'groupmenu' },
                  { title: '👁️ Menu Tools & RVO (View Once)', description: 'Buka foto/video sekali lihat (rvo), QR, dll', id: 'toolsmenu' },
                ],
              },
            ];

            await sendInteractiveButtons(
              sock,
              jid,
              {
                title: `HOME  •  ABOUT  •  PROFILE`,
                body: menuCardBody,
                footer: `© ${bot.userName} • Ketik .allmenu untuk daftar teks lengkap`,
                imageUrl: bannerSource,
                forwardedCard: true,
                sections: menuSections,
                listTitle: '📂 Pilih Menu / Layar Tap',
                buttons: [
                  { text: '📋 Semua Perintah', id: 'allmenu' },
                  { text: '⚔️ Kuro Slash', id: 'kuroslash' },
                  { text: '🌀 Speedy Dash', id: 'sonic' },
                ],
              },
              msg
            );
            continue;
          }

          if (cmd === 'allmenu') {
            let fullMenu =
              `*╭┈───〔 ${bot.userName} - ALL MENU 〕┈───⊷*\n` +
              `*├✦ Owner:* ${OWNER_NAME}\n` +
              `*├✦ Commands:* ${ALL_COMMANDS_SET.size}\n` +
              `*├✦ Runtime:* ${getUptime()}\n` +
              `*├✦ Version:* v${dbMemory.version}\n` +
              `*╰───────────────────⊷*\n\n`;

            for (const [catName, listCmd] of Object.entries(MENU_CATEGORIES)) {
              fullMenu += formatCategoryBox(catName, listCmd) + '\n';
            }
            fullMenu += `\n> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${bot.userName}*`;

            await sock.sendMessage(
              jid,
              {
                text: fullMenu,
                contextInfo: { forwardingScore: 999, isForwarded: true },
              },
              { quoted: msg }
            );
            continue;
          }

          const subMenuMap = {
            aimenu: 'AI', downloadmenu: 'DOWNLOAD', searchmenu: 'SEARCH',
            animemenu: 'ANIME', funmenu: 'FUN', groupmenu: 'GROUP',
            logomenu: 'STICKER_LOGO', toolsmenu: 'TOOLS', ownermenu: 'OWNER',
          };
          if (subMenuMap[cmd]) {
            const catKey = subMenuMap[cmd];
            await sock.sendMessage(jid, { text: `${formatCategoryBox(catKey, MENU_CATEGORIES[catKey])}\n\n_Ketik salah satu perintah di atas untuk menggunakannya._` }, { quoted: msg });
            continue;
          }

          if (['ping', 'ping2', 'speed', 'os'].includes(cmd)) {
            const start = Date.now();
            const hw = getServerHardwareStats();
            const wibTime = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }).replace(/:/g, '.');
            const latency = Date.now() - start;

            const pingReport =
              `❖ *Speed Latency :* ${latency} ms\n` +
              `❖ *Runtime :* ${getUptime()}\n\n` +
              `❖ *RAM Usage :* ${hw.ramPercent}%\n` +
              `❖ ${hw.ramBar}\n\n` +
              `❖ *Disk Used :* ${hw.diskUsedGB}GB\n` +
              `❖ *Disk Total :* ${hw.diskTotalGB}GB\n` +
              `❖ *Disk Usage :* ${hw.diskPercent}%\n` +
              `❖ ${hw.diskBar}\n` +
              `────────────────────\n` +
              `❖ *Time :* ${wibTime} WIB\n` +
              `❖ *Owner :* ${OWNER_NAME}`;

            await sendInteractiveButtons(
              sock,
              jid,
              {
                title: `⚡ SERVER STATUS — ${bot.userName}`,
                body: pingReport,
                footer: `SEMUA FITUR ➔ ${bot.userName}`,
                forwardedCard: true,
                buttons: [
                  { text: `📋 Buka Menu ${bot.userName}`, id: 'allmenu' },
                  { text: '⚔️ Kuro Slash', id: 'kuroslash' },
                ],
              },
              msg
            );
            continue;
          }

          if (cmd === 'selftest' || cmd === 'cekfitur') {
            await sock.sendMessage(jid, { text: '🔍 Menguji seluruh modul server...' }, { quoted: msg });
            const rep = await jalankanBackgroundSelfTest();
            const detailLines = Object.entries(rep.details).map(([k, v]) => `• *${k}:* ${v}`).join('\n');
            await sock.sendMessage(jid, { text: `🩺 *HASIL SELF-TEST (${bot.userName})*\n🕒 ${rep.lastChecked}\n📊 *${rep.summary}*\n\n${detailLines}` }, { quoted: msg });
            continue;
          }

          if (cmd === 'alive' || cmd === 'runtime' || cmd === 'uptime') {
            await sock.sendMessage(jid, { text: `🟢 *${bot.userName} Aktif!*\n⏱️ Runtime: *${getUptime()}*\n📦 Versi: *v${dbMemory.version}*` }, { quoted: msg });
            continue;
          }

          if (cmd === 'owner') {
            await sock.sendMessage(jid, { text: `👤 *Owner:* ${OWNER_NAME}\n📱 *Nomor Bot:* ${bot.userPhone || '-'}` }, { quoted: msg });
            continue;
          }

          if (cmd === 'status') {
            const totalFilter = bot.badWords.length + dbMemory.learnedWords.length;
            await sock.sendMessage(jid, { text: `📊 *STATUS ${bot.userName}*\n• Versi: v${dbMemory.version}\n• Uptime: ${getUptime()}\n• Fitur: ${ALL_COMMANDS_SET.size}\n• Filter Kata: ${totalFilter}\n• Virtek/Bug Diblokir: ${bot.stats.totalBlockedVirtek}` }, { quoted: msg });
            continue;
          }

          if (cmd === 'update') {
            const hasil = await jalankanEvolusiMandiri(true);
            await sock.sendMessage(jid, { text: `🧬 *UPDATE BERHASIL*\n\n${hasil}` }, { quoted: msg });
            continue;
          }

          if (cmd === 'githubstalk') {
            if (!param) { await sock.sendMessage(jid, { text: '⚠️ Contoh: `githubstalk torvalds`' }, { quoted: msg }); continue; }
            const res = await fetchWithTimeout(`https://api.github.com/users/${encodeURIComponent(param)}`).catch(() => null);
            const u = res ? await res.json() : null;
            if (u?.login) {
              await sock.sendMessage(jid, { image: { url: u.avatar_url }, caption: `🐙 *GITHUB:* ${u.name || u.login} (@${u.login})\n• Repo: ${u.public_repos} | Followers: ${u.followers}\n• Link: ${u.html_url}` }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { text: '❌ Username GitHub tidak ditemukan.' }, { quoted: msg });
            }
            continue;
          }

          // === AI ===
          if (cmd === 'memori') {
            const userMem = dbMemory.users[jid];
            await sock.sendMessage(jid, { text: userMem?.facts?.length ? `🧠 *Ingatan AI:*\n• ${userMem.facts.join('\n• ')}` : '🧠 Belum ada catatan khusus tentangmu.' }, { quoted: msg });
            continue;
          }
          if (cmd === 'resetmemori') {
            delete dbMemory.users[jid];
            await saveMemory();
            await sock.sendMessage(jid, { text: '✅ Ingatan AI direset.' }, { quoted: msg });
            continue;
          }
          if (MENU_CATEGORIES.AI.includes(cmd)) {
            if (!param) { await sock.sendMessage(jid, { text: `⚠️ Contoh: \`${cmd} jelaskan tata surya\`` }, { quoted: msg }); continue; }
            const spec = cmd.includes('coder') ? 'coder' : cmd.includes('math') ? 'math' : cmd === 'grammar' ? 'grammar' : 'general';
            const reply = await getSmartAIResponse(param, jid, pushName, spec);
            if (reply) await sock.sendMessage(jid, { text: reply }, { quoted: msg });
            continue;
          }

          // === DOWNLOAD & SPOTIFY PLAYER UI (SEPERTI DI FOTO .play2) ===
          if (['tiktok', 'tt', 'ttmp3', 'ttslide'].includes(cmd)) {
            const linkTT = extractUrl(param);
            if (!linkTT || !/tiktok\.com/i.test(linkTT)) { await sock.sendMessage(jid, { text: `⚠️ Contoh: \`${cmd} https://vt.tiktok.com/xxxx\`` }, { quoted: msg }); continue; }
            const hasilTT = await downloadTikTok(linkTT);
            if (!hasilTT) { await sock.sendMessage(jid, { text: '❌ Gagal mengunduh TikTok.' }, { quoted: msg }); continue; }
            if (cmd === 'ttmp3' && hasilTT.musicUrl) {
              const audBuf = await fetchBuffer(hasilTT.musicUrl, 'https://www.tiktok.com/').catch(() => null);
              if (audBuf) await sock.sendMessage(jid, { audio: audBuf, mimetype: 'audio/mp4' }, { quoted: msg });
              continue;
            }
            if (hasilTT.type === 'image') {
              for (let i = 0; i < Math.min(hasilTT.images.length, 10); i++) {
                const imgBuf = await fetchBuffer(hasilTT.images[i], 'https://www.tiktok.com/').catch(() => null);
                if (imgBuf) await sock.sendMessage(jid, { image: imgBuf, caption: i === 0 ? `📸 *TikTok Slide*\n${hasilTT.title}` : '' }, { quoted: i === 0 ? msg : undefined });
              }
            } else if (hasilTT.videoUrl) {
              const vidBuf = await fetchBuffer(hasilTT.videoUrl, 'https://www.tiktok.com/').catch(() => null);
              if (vidBuf) await sock.sendMessage(jid, { video: vidBuf, caption: `🎬 *TikTok HD*\n${hasilTT.title}` }, { quoted: msg });
            }
            continue;
          }

          if (['ytmp4', 'ytmp3', 'ytdl', 'video'].includes(cmd)) {
            const linkYT = extractUrl(param) || lastPlaySession.get(jid)?.url;
            if (!linkYT || !/(youtube\.com|youtu\.be)/i.test(linkYT)) { await sock.sendMessage(jid, { text: `⚠️ Contoh: \`${cmd} https://youtu.be/xxxx\`` }, { quoted: msg }); continue; }
            const isAudio = cmd === 'ytmp3';
            const hasilYT = await downloadYouTube(linkYT, isAudio);
            if (hasilYT?.url) {
              const buf = await fetchBuffer(hasilYT.url).catch(() => null);
              if (buf) {
                await sock.sendMessage(jid, isAudio ? { audio: buf, mimetype: 'audio/mp4' } : { video: buf, caption: `🎬 *${hasilYT.title}*` }, { quoted: msg });
              } else {
                await sock.sendMessage(jid, { text: `✅ *${hasilYT.title}*\n🔗 ${hasilYT.url}` }, { quoted: msg });
              }
            } else {
              await sock.sendMessage(jid, { text: '❌ Gagal memproses media YouTube.' }, { quoted: msg });
            }
            continue;
          }

          if (['play', 'play2', 'song', 'spotify'].includes(cmd)) {
            if (!param) { await sock.sendMessage(jid, { text: `⚠️ Contoh: \`${cmd} iqro raim laode\`` }, { quoted: msg }); continue; }
            const results = await searchYouTube(param);
            const first = results[0];
            if (!first) { await sock.sendMessage(jid, { text: '❌ Lagu tidak ditemukan.' }, { quoted: msg }); continue; }

            lastPlaySession.set(jid, first);
            const spotifyCardBuf = await generateSpotifyPlayerCardBuffer(
              first.title,
              first.author,
              first.thumbnail,
              first.duration
            );

            const playerCaption =
              `🎧 *PLAYING FROM SEARCH*\n` +
              `*${first.title}*\n` +
              `${first.author}   🤍\n\n` +
              `⚪──────────────────\n` +
              `0:00                        ${first.duration}\n` +
              `   🔀      ⏮      ⏸      ⏭      🔁\n` +
              `_support terus kami yaaa_`;

            if (spotifyCardBuf) {
              await sock.sendMessage(
                jid,
                {
                  image: spotifyCardBuf,
                  caption: playerCaption,
                  contextInfo: { forwardingScore: 999, isForwarded: true },
                },
                { quoted: msg }
              );
            }

            const audioData = await downloadYouTube(first.url, true);
            if (audioData?.url) {
              const audBuf = await fetchBuffer(audioData.url).catch(() => null);
              if (audBuf) {
                await sock.sendMessage(jid, { audio: audBuf, mimetype: 'audio/mp4' }, { quoted: msg });
              } else {
                await sock.sendMessage(jid, { audio: { url: audioData.url }, mimetype: 'audio/mp4' }, { quoted: msg }).catch(() => {});
              }
            }
            continue;
          }

          if (cmd === 'yts') {
            if (!param) { await sock.sendMessage(jid, { text: '⚠️ Contoh: `yts tutorial coding`' }, { quoted: msg }); continue; }
            const list = await searchYouTube(param);
            if (list.length > 0) {
              const hasil = list.map((v, i) => `${i + 1}. *${v.title}*\n   👤 ${v.author} | ⏱️ ${v.duration}\n   🔗 ${v.url}`).join('\n\n');
              await sock.sendMessage(jid, { text: `🔎 *Hasil Pencarian:*\n\n${hasil}` }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { text: '❌ Tidak ditemukan hasil.' }, { quoted: msg });
            }
            continue;
          }

          if (['igdl', 'fb', 'twitter', 'capcut', 'mediafire', 'gdrive'].includes(cmd)) {
            const linkSosmed = extractUrl(param);
            if (!linkSosmed) { await sock.sendMessage(jid, { text: `⚠️ Contoh: \`${cmd} https://...\`` }, { quoted: msg }); continue; }
            const mediaRes = await downloadSocialMedia(linkSosmed, cmd);
            if (mediaRes?.url) {
              const buf = await fetchBuffer(mediaRes.url).catch(() => null);
              if (buf) {
                if (cmd === 'mediafire' || cmd === 'gdrive') await sock.sendMessage(jid, { document: buf, fileName: mediaRes.filename, mimetype: 'application/octet-stream' }, { quoted: msg });
                else if (mediaRes.isImage) await sock.sendMessage(jid, { image: buf, caption: `✅ *${cmd.toUpperCase()}*` }, { quoted: msg });
                else await sock.sendMessage(jid, { video: buf, caption: `✅ *${cmd.toUpperCase()}*` }, { quoted: msg });
              } else {
                await sock.sendMessage(jid, { text: `✅ *Link Unduhan:*\n${mediaRes.url}` }, { quoted: msg });
              }
            } else {
              await sock.sendMessage(jid, { text: '❌ Tautan gagal diunduh.' }, { quoted: msg });
            }
            continue;
          }

          if (cmd === 'gitclone') {
            const match = param.match(/github\.com\/([^/]+)\/([^/\s]+)/i);
            if (!match) { await sock.sendMessage(jid, { text: '⚠️ Contoh: `gitclone https://github.com/user/repo`' }, { quoted: msg }); continue; }
            const zipUrl = `https://github.com/${match[1]}/${match[2].replace(/\.git$/, '')}/archive/refs/heads/main.zip`;
            await sock.sendMessage(jid, { document: { url: zipUrl }, fileName: `${match[2]}.zip`, mimetype: 'application/zip' }, { quoted: msg });
            continue;
          }

          if (cmd === 'tts') {
            if (!param) { await sock.sendMessage(jid, { text: '⚠️ Contoh: `tts halo selamat pagi`' }, { quoted: msg }); continue; }
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(param.slice(0, 200))}&tl=id&client=tw-ob`;
            const audBuf = await fetchBuffer(ttsUrl).catch(() => null);
            if (audBuf) await sock.sendMessage(jid, { audio: audBuf, mimetype: 'audio/mp4', ptt: true }, { quoted: msg });
            continue;
          }

          // === SEARCH ===
          if (cmd === 'cuaca' || cmd === 'wthr') {
            const hasilCuaca = await getCuacaIndonesia(param || 'Jakarta');
            if (hasilCuaca) {
              const imgBuf = await fetchBuffer(hasilCuaca.imageUrl).catch(() => null);
              if (imgBuf) await sock.sendMessage(jid, { image: imgBuf, caption: hasilCuaca.caption }, { quoted: msg });
              else await sock.sendMessage(jid, { text: hasilCuaca.caption }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { text: '❌ Kota tidak ditemukan.' }, { quoted: msg });
            }
            continue;
          }

          if (cmd === 'praytime') {
            const jadwal = await getJadwalSholatIndonesia(param || 'Jakarta');
            await sock.sendMessage(jid, { text: jadwal || '❌ Jadwal sholat tidak ditemukan.' }, { quoted: msg });
            continue;
          }

          if (cmd === 'surah') {
            const hasilSurah = await getSurahLengkap(param || '1');
            if (hasilSurah) {
              await sock.sendMessage(jid, { text: hasilSurah.text }, { quoted: msg });
              if (hasilSurah.audioUrl) {
                const audBuf = await fetchBuffer(hasilSurah.audioUrl).catch(() => null);
                if (audBuf) await sock.sendMessage(jid, { audio: audBuf, mimetype: 'audio/mp4' }, { quoted: msg });
              }
            }
            continue;
          }

          if (cmd === 'wiki') {
            if (!param) { await sock.sendMessage(jid, { text: '⚠️ Contoh: `wiki Indonesia`' }, { quoted: msg }); continue; }
            const res = await fetchWithTimeout(`https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(param)}`).catch(() => null);
            const data = res ? await res.json() : null;
            await sock.sendMessage(jid, { text: data?.extract ? `📚 *${data.title}*\n\n${data.extract}` : '❌ Tidak ditemukan.' }, { quoted: msg });
            continue;
          }

          if (cmd === 'define' || cmd === 'fakta' || cmd === 'motivasi') {
            const promptMap = {
              define: `Jelaskan definisi kata "${param || 'teknologi'}" secara singkat dalam Bahasa Indonesia.`,
              fakta: 'Berikan 1 fakta sains/sejarah dunia yang menarik dalam 3 kalimat.',
              motivasi: 'Berikan 1 kutipan motivasi singkat.',
            };
            const reply = await getSmartAIResponse(promptMap[cmd], jid, pushName);
            if (reply) await sock.sendMessage(jid, { text: reply }, { quoted: msg });
            continue;
          }

          if (cmd === 'npm') {
            if (!param) continue;
            const res = await fetchWithTimeout(`https://registry.npmjs.org/${encodeURIComponent(param)}`).catch(() => null);
            const data = res ? await res.json() : null;
            await sock.sendMessage(jid, { text: data?.name ? `📦 *${data.name}* v${data['dist-tags']?.latest}\n${data.description || ''}` : '❌ Tidak ditemukan.' }, { quoted: msg });
            continue;
          }

          // === ANIME ===
          if (MENU_CATEGORIES.ANIME.includes(cmd)) {
            const ep = cmd === 'maid' || cmd === 'anime' ? 'waifu' : cmd;
            const res = await fetchWithTimeout(`https://api.waifu.pics/sfw/${ep}`).catch(() => null);
            const json = res ? await res.json() : null;
            if (json?.url) await sock.sendMessage(jid, { image: { url: json.url }, caption: `✨ *${cmd.toUpperCase()}*` }, { quoted: msg });
            continue;
          }

          // === FUN & LAYAR TAP LANGSUNG DI CHAT ===
          if (cmd === 'kuroslash' || cmd === 'slash') {
            const best = dbMemory.gameHighScores.kuroslash[senderNum] || 0;
            const state = { type: 'kuroslash', lane: 1, hp: 100, score: 0, best, ulti: 31, speed: 5.5, wave: 0 };
            gameSessions.set(jid, state);
            await kirimTampilanKuroSlash(sock, jid, senderNum, state, 'Arena Kuro Slash dimulai! Sentuh tombol di bawah langsung.', msg);
            continue;
          }

          if (cmd === 'sonic' || cmd === 'speedydash') {
            const best = dbMemory.gameHighScores.sonic[senderNum] || 0;
            const state = { type: 'sonic', rings: 10, score: 0, best, speed: 6.2, laserAlert: false };
            gameSessions.set(jid, state);
            await kirimTampilanSonic(sock, jid, senderNum, state, 'Emerald Coast Run dimulai! Sentuh BOOST atau JUMP di bawah.', msg);
            continue;
          }

          if (cmd === 'game') {
            gameSessions.set(jid, { type: 'angka', answer: Math.floor(Math.random() * 10) + 1 });
            await sock.sendMessage(jid, { text: '🎮 *Tebak Angka (1-10)*\nKirim tebakan angkamu!' }, { quoted: msg });
            continue;
          }

          if (cmd === 'mathgame') {
            const a = Math.floor(Math.random() * 20) + 5;
            const b = Math.floor(Math.random() * 20) + 5;
            gameSessions.set(jid, { type: 'math', answer: a + b });
            await sock.sendMessage(jid, { text: `🧮 Berapa hasil dari *${a} + ${b}*?` }, { quoted: msg });
            continue;
          }

          if (cmd === 'tebakkata') {
            const soal = [
              { q: 'Aku punya kota tapi tidak punya rumah, punya gunung tapi tidak punya pohon. Apakah aku?', a: 'peta' },
              { q: 'Semakin banyak diambil, semakin besar jadinya. Apakah aku?', a: 'lubang' },
              { q: 'Punya leher tapi tidak punya kepala. Apakah aku?', a: 'botol' },
            ][Math.floor(Math.random() * 3)];
            gameSessions.set(jid, { type: 'kata', answer: soal.a });
            await sock.sendMessage(jid, { text: `🧩 *Tebak Kata*\n\n${soal.q}` }, { quoted: msg });
            continue;
          }

          if (cmd === 'suit') {
            const pilih = ['batu', 'gunting', 'kertas'];
            const u = param.toLowerCase();
            if (!pilih.includes(u)) { await sock.sendMessage(jid, { text: '⚠️ Contoh: `suit batu`' }, { quoted: msg }); continue; }
            const b = pilih[Math.floor(Math.random() * 3)];
            const win = (u === 'batu' && b === 'gunting') || (u === 'gunting' && b === 'kertas') || (u === 'kertas' && b === 'batu');
            await sock.sendMessage(jid, { text: `✊✌️✋ Kamu: *${u}* | Bot: *${b}*\nHasil: *${u === b ? 'Seri!' : win ? 'Kamu Menang!' : 'Bot Menang!'}*` }, { quoted: msg });
            continue;
          }

          if (cmd === 'dice') { await sock.sendMessage(jid, { text: `🎲 Dadu: *${Math.floor(Math.random() * 6) + 1}*` }, { quoted: msg }); continue; }
          if (cmd === 'coin') { await sock.sendMessage(jid, { text: `🪙 Koin: *${Math.random() < 0.5 ? 'ANGKA' : 'GAMBAR'}*` }, { quoted: msg }); continue; }
          if (cmd === '8ball') { await sock.sendMessage(jid, { text: `🎱 *${['Ya, pasti!', 'Kemungkinan besar iya.', 'Coba tanya lagi.', 'Sepertinya tidak.'][Math.floor(Math.random() * 4)]}*` }, { quoted: msg }); continue; }

          if (['rate', 'aura', 'sigma', 'rizz', 'vibe', 'npc', 'maincharacter', 'delulu', 'redflag', 'greenflag', 'compatibility', 'ship'].includes(cmd)) {
            await sock.sendMessage(jid, { text: `📊 *${cmd.toUpperCase()} METER*\nTarget: *${param || pushName}*\nSkor: *${Math.floor(Math.random() * 101)}%*` }, { quoted: msg });
            continue;
          }

          if (['roast', 'compliment', 'pickup', 'quote', 'joke', 'truth', 'dare', 'wyr', 'horoscope'].includes(cmd)) {
            const reply = await getSmartAIResponse(`Berikan 1 ${cmd} singkat, seru, dan sopan dalam Bahasa Indonesia untuk ${param || pushName}.`, jid, pushName);
            if (reply) await sock.sendMessage(jid, { text: `✨ *${cmd.toUpperCase()}:*\n\n${reply}` }, { quoted: msg });
            continue;
          }

          if (['hug', 'pat', 'wave', 'smile', 'dance', 'highfive', 'wink', 'blush', 'happy', 'cry', 'sleep', 'think', 'poke'].includes(cmd)) {
            const res = await fetchWithTimeout(`https://api.waifu.pics/sfw/${cmd === 'think' ? 'smug' : cmd}`).catch(() => null);
            const json = res ? await res.json() : null;
            if (json?.url) await sock.sendMessage(jid, { image: { url: json.url }, caption: `*${pushName}* melakukan *${cmd}*` }, { quoted: msg });
            continue;
          }

          // === GROUP & SECURITY SETTINGS ===
          if (MENU_CATEGORIES.GROUP.includes(cmd)) {
            if (!isGroup) { await sock.sendMessage(jid, { text: '⚠️ Hanya dapat digunakan di dalam grup.' }, { quoted: msg }); continue; }
            const metadata = await sock.groupMetadata(jid);
            const participants = metadata.participants.map((p) => p.id);
            const gCfg = getGroupConfig(jid);
            const senderInfo = metadata.participants.find((p) => p.id === senderParticipant || p.id.split(':')[0].replace(/\D/g, '') === senderNum);
            const isSenderAdmin = senderInfo?.admin === 'admin' || senderInfo?.admin === 'superadmin' || isOwner;

            if (cmd === 'ginfo' || cmd === 'groupsettings' || cmd === 'gsettings') {
              const statusGrupText =
                `🛡️ *SECURITY & GROUP SETTINGS*\n` +
                `📌 *Grup:* ${metadata.subject} (${participants.length} anggota)\n\n` +
                `• *Anti-Link:* ${gCfg.antilink ? '✅ AKTIF' : '❌ NONAKTIF'}\n` +
                `• *Anti-Virtek & Bug:* ${gCfg.antivirtek ? '✅ AKTIF' : '❌ NONAKTIF'}\n` +
                `• *Anti-Toxic:* ${gCfg.antitoxic ? '✅ AKTIF' : '❌ NONAKTIF'}\n` +
                `• *Anti-Spam Flood:* ${gCfg.antispam ? '✅ AKTIF' : '❌ NONAKTIF'}\n` +
                `• *Welcome:* ${gCfg.welcome ? '✅ AKTIF' : '❌ NONAKTIF'}`;

              await sendInteractiveButtons(
                sock,
                jid,
                {
                  title: '🛡️ PENGATURAN KEAMANAN GRUP',
                  body: statusGrupText,
                  footer: 'Sentuh tombol di bawah untuk mengubah pengaturan (Admin)',
                  buttons: [
                    { text: `🔗 Anti-Link (${gCfg.antilink ? 'ON' : 'OFF'})`, id: 'antilink' },
                    { text: `☣️ Anti-Virtek/Bug (${gCfg.antivirtek ? 'ON' : 'OFF'})`, id: 'antivirtek' },
                    { text: `🤬 Anti-Toxic (${gCfg.antitoxic ? 'ON' : 'OFF'})`, id: 'antitoxic' },
                    { text: `👋 Welcome (${gCfg.welcome ? 'ON' : 'OFF'})`, id: 'welcome' },
                  ],
                },
                msg
              );
              continue;
            }

            if (!isSenderAdmin) { await sock.sendMessage(jid, { text: '⚠️ Khusus Admin Grup.' }, { quoted: msg }); continue; }

            if (cmd === 'tagall' || cmd === 'everyone') {
              await sock.sendMessage(jid, { text: `📢 *PENGUMUMAN*\n${param ? param + '\n\n' : ''}` + participants.map((p) => `• @${p.split('@')[0]}`).join('\n'), mentions: participants }, { quoted: msg });
            } else if (cmd === 'hidetag') {
              await sock.sendMessage(jid, { text: param || '📢 Perhatian!', mentions: participants });
            } else if (cmd === 'link') {
              const code = await sock.groupInviteCode(jid);
              await sock.sendMessage(jid, { text: `🔗 https://chat.whatsapp.com/${code}` }, { quoted: msg });
            } else if (cmd === 'revoke') {
              await sock.groupRevokeInvite(jid);
              await sock.sendMessage(jid, { text: '✅ Link grup direset.' }, { quoted: msg });
            } else if (cmd === 'mute') {
              await sock.groupSettingUpdate(jid, 'announcement');
              await sock.sendMessage(jid, { text: '🔒 Grup ditutup.' }, { quoted: msg });
            } else if (cmd === 'unmute') {
              await sock.groupSettingUpdate(jid, 'not_announcement');
              await sock.sendMessage(jid, { text: '🔓 Grup dibuka.' }, { quoted: msg });
            } else if (cmd === 'updategname' && param) {
              await sock.groupUpdateSubject(jid, param);
              await sock.sendMessage(jid, { text: `✅ Nama grup diubah ke *${param}*` }, { quoted: msg });
            } else if (cmd === 'updategdesc' && param) {
              await sock.groupUpdateDescription(jid, param);
              await sock.sendMessage(jid, { text: '✅ Deskripsi grup diperbarui.' }, { quoted: msg });
            } else if (cmd === 'poll') {
              const parts = param.split('|').map((s) => s.trim()).filter(Boolean);
              if (parts.length >= 3) await sock.sendMessage(jid, { poll: { name: parts[0], values: parts.slice(1), selectableCount: 1 } });
            } else if (cmd === 'delete') {
              const qInfo = unwrapped.extendedTextMessage?.contextInfo;
              if (qInfo?.stanzaId) await sock.sendMessage(jid, { delete: { remoteJid: jid, fromMe: false, id: qInfo.stanzaId, participant: qInfo.participant } });
            } else if (['kick', 'add', 'promote', 'demote'].includes(cmd)) {
              const qPart = unwrapped.extendedTextMessage?.contextInfo?.participant;
              const ment = unwrapped.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
              const target = ment || qPart || (param ? `${param.replace(/\D/g, '')}@s.whatsapp.net` : null);
              if (target) {
                const act = { kick: 'remove', add: 'add', promote: 'promote', demote: 'demote' }[cmd];
                await sock.groupParticipantsUpdate(jid, [target], act);
                await sock.sendMessage(jid, { text: `✅ Berhasil *${cmd}* @${target.split('@')[0]}`, mentions: [target] }, { quoted: msg });
              }
            } else if (cmd === 'antilink') {
              gCfg.antilink = !gCfg.antilink;
              await saveMemory();
              await sock.sendMessage(jid, { text: `🛡️ Anti-Link: *${gCfg.antilink ? 'AKTIF' : 'NONAKTIF'}*` }, { quoted: msg });
            } else if (cmd === 'antivirtek' || cmd === 'antibug') {
              gCfg.antivirtek = !gCfg.antivirtek;
              gCfg.antibug = gCfg.antivirtek;
              await saveMemory();
              await sock.sendMessage(jid, { text: `☣️ Anti-Virtek & Anti-Bug: *${gCfg.antivirtek ? 'AKTIF' : 'NONAKTIF'}*` }, { quoted: msg });
            } else if (cmd === 'antitoxic') {
              gCfg.antitoxic = !gCfg.antitoxic;
              await saveMemory();
              await sock.sendMessage(jid, { text: `🛡️ Anti-Toxic: *${gCfg.antitoxic ? 'AKTIF' : 'NONAKTIF'}*` }, { quoted: msg });
            } else if (cmd === 'antispam') {
              gCfg.antispam = !gCfg.antispam;
              await saveMemory();
              await sock.sendMessage(jid, { text: `🛡️ Anti-Spam: *${gCfg.antispam ? 'AKTIF' : 'NONAKTIF'}*` }, { quoted: msg });
            } else if (cmd === 'welcome') {
              gCfg.welcome = !gCfg.welcome;
              await saveMemory();
              await sock.sendMessage(jid, { text: `👋 Welcome: *${gCfg.welcome ? 'AKTIF' : 'NONAKTIF'}*` }, { quoted: msg });
            } else if (cmd === 'leave') {
              await sock.groupLeave(jid);
            }
            continue;
          }

          // === STICKER MAKER (FOTO, VIDEO, TEKS, BRAT, BRATVID) & LOGO ===
          if (['sticker', 'stiker', 's'].includes(cmd)) {
            const qMsg = unwrapMessageContent(unwrapped.extendedTextMessage?.contextInfo?.quotedMessage);
            const imgMsg = unwrapped.imageMessage || qMsg?.imageMessage;
            const vidMsg = unwrapped.videoMessage || qMsg?.videoMessage;

            if (imgMsg) {
              const stream = await downloadContentFromMessage(imgMsg, 'image');
              let buf = Buffer.from([]);
              for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
              const webpBuf = await mediaBufferToWebpSticker(buf, false);
              if (webpBuf) {
                await sock.sendMessage(jid, { sticker: webpBuf }, { quoted: msg });
              } else {
                await sock.sendMessage(jid, { text: '❌ Gagal mengonversi foto ke stiker (pastikan ffmpeg terpasang di server).' }, { quoted: msg });
              }
              continue;
            }

            if (vidMsg) {
              const stream = await downloadContentFromMessage(vidMsg, 'video');
              let buf = Buffer.from([]);
              for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
              const webpBuf = await mediaBufferToWebpSticker(buf, true);
              if (webpBuf) {
                await sock.sendMessage(jid, { sticker: webpBuf }, { quoted: msg });
              } else {
                await sock.sendMessage(jid, { text: '❌ Gagal mengonversi video ke stiker bergerak.' }, { quoted: msg });
              }
              continue;
            }

            if (param) {
              const webpBuf = await urlOrTextToWebpSticker(param);
              if (webpBuf) {
                await sock.sendMessage(jid, { sticker: webpBuf }, { quoted: msg });
              } else {
                await sock.sendMessage(jid, { text: '❌ Gagal membuat stiker teks.' }, { quoted: msg });
              }
              continue;
            }

            await sock.sendMessage(jid, { text: '⚠️ Kirim atau balas **foto / video pendek** dengan caption `.sticker`, atau ketik `.sticker <teks>`' }, { quoted: msg });
            continue;
          }

          if (['brat', 'bratvid', 'bratvideo'].includes(cmd)) {
            const qText =
              unwrapped.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
              unwrapped.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
              '';
            const bratText = param || qText;
            if (!bratText) {
              await sock.sendMessage(jid, { text: `⚠️ Contoh:\n• \`.brat ${pushName.toLowerCase()} lagi santai\`\n• \`.bratvid teks bergerak viral\`` }, { quoted: msg });
              continue;
            }

            const isAnim = cmd === 'bratvid' || cmd === 'bratvideo';
            const bratWebp = await createBratSticker(bratText, isAnim);
            if (bratWebp) {
              await sock.sendMessage(jid, { sticker: bratWebp }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { text: '❌ Gagal membuat stiker brat saat ini.' }, { quoted: msg });
            }
            continue;
          }

          if ((cmd === 'ttp' || cmd === 'attp') && param) {
            const webpBuf = await urlOrTextToWebpSticker(param);
            if (webpBuf) await sock.sendMessage(jid, { sticker: webpBuf }, { quoted: msg });
            continue;
          }

          if (cmd === 'animasi' || cmd === 'linkvideo') {
            const targetLink = extractUrl(param);
            const label = targetLink ? 'HD LINK ANIMATION' : param || bot.userName;
            await sock.sendMessage(jid, { text: '🎬 Mengonversi link menjadi Video Pendek Animasi HD...' }, { quoted: msg });
            const hdResult = await convertLinkToHdShortVideo(targetLink, label);
            if (hdResult?.type === 'video' && hdResult.buffer) {
              await sock.sendMessage(
                jid,
                {
                  video: hdResult.buffer,
                  gifPlayback: true,
                  mimetype: 'video/mp4',
                  caption: `✨ *Video Pendek Animasi HD*\n${targetLink ? `🔗 Sumber: ${targetLink}` : `🏷️ ${label}`}`,
                },
                { quoted: msg }
              );
            } else if (hdResult?.buffer) {
              await sock.sendMessage(jid, { image: hdResult.buffer, caption: `✨ *Kartu Visual HD*` }, { quoted: msg });
            }
            continue;
          }

          if (cmd === 'font' || cmd === 'fancy') {
            if (!param) continue;
            await sock.sendMessage(jid, { text: FONT_MAPS.map((_, idx) => `${idx + 1}. ${applyFont(param, idx)}`).join('\n') }, { quoted: msg });
            continue;
          }

          if (['logo', 'neon', 'gold', 'galaxy', 'glitch', 'matrix', 'graffiti', 'thunder'].includes(cmd)) {
            if (!param) continue;
            const colors = { logo: '0f172a/38bdf8', neon: '090d16/00ffcc', gold: '1c1917/facc15', galaxy: '1e1b4b/c084fc', glitch: '18181b/f43f5e', matrix: '022c22/4ade80', graffiti: '312e81/fb923c', thunder: '0c4a6e/fde047' };
            const logoUrl = `https://dummyimage.com/800x400/${colors[cmd]}.png&text=${encodeURIComponent(param)}`;
            const buf = await fetchBuffer(logoUrl).catch(() => null);
            await sock.sendMessage(jid, buf ? { image: buf, caption: `🎨 *${cmd.toUpperCase()}*` } : { image: { url: logoUrl } }, { quoted: msg });
            continue;
          }

          // === RVO (READ VIEW ONCE) & TOOLS ===
          if (['rvo', 'rvop', 'vv'].includes(cmd)) {
            const qRaw = unwrapped.extendedTextMessage?.contextInfo?.quotedMessage;
            const mediaVo = await extractAndDownloadViewOnce(qRaw);
            if (!mediaVo || !mediaVo.buffer || mediaVo.buffer.length < 100) {
              await sock.sendMessage(jid, { text: '⚠️ Balas pesan **Foto / Video / VN Sekali Lihat (View Once)** dengan perintah `.rvo` (kirim di sini) atau `.rvop` (kirim ke chat pribadi).' }, { quoted: msg });
              continue;
            }

            const targetChat = cmd === 'rvop' ? senderParticipant : jid;
            const cap = `👁️ *RVO (View Once Terbuka)*${mediaVo.caption ? `\n📝 ${mediaVo.caption}` : ''}`;

            if (mediaVo.type === 'image') {
              await sock.sendMessage(targetChat, { image: mediaVo.buffer, caption: cap }, { quoted: cmd === 'rvop' ? undefined : msg });
            } else if (mediaVo.type === 'video') {
              await sock.sendMessage(targetChat, { video: mediaVo.buffer, caption: cap }, { quoted: cmd === 'rvop' ? undefined : msg });
            } else if (mediaVo.type === 'audio') {
              await sock.sendMessage(targetChat, { audio: mediaVo.buffer, mimetype: 'audio/mp4', ptt: true }, { quoted: cmd === 'rvop' ? undefined : msg });
            }

            if (cmd === 'rvop' && isGroup) {
              await sock.sendMessage(jid, { text: '✅ Media View Once berhasil dikirim ke chat pribadimu!' }, { quoted: msg });
            }
            continue;
          }

          if (cmd === 'hitung' && param && /^[0-9+\-*/().\s]+$/.test(param)) {
            await sock.sendMessage(jid, { text: `🧮 *${param}* = *${Function(`"use strict"; return (${param})`)()}*` }, { quoted: msg });
            continue;
          }
          if (cmd === 'catat' && param) {
            if (!dbMemory.notes[jid]) dbMemory.notes[jid] = [];
            dbMemory.notes[jid].push(`${param} (${getTodayDateString()})`);
            await saveMemory();
            await sock.sendMessage(jid, { text: '📝 Catatan disimpan!' }, { quoted: msg });
            continue;
          }
          if (cmd === 'catatan') {
            const list = dbMemory.notes[jid] || [];
            await sock.sendMessage(jid, { text: list.length ? `📒 *CATATAN:*\n${list.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : '📭 Kosong.' }, { quoted: msg });
            continue;
          }
          if ((cmd === 'terjemah' || cmd === 'translate') && args[1] && args[2]) {
            const reply = await getSmartAIResponse(`Terjemahkan ke bahasa ${args[1]} tanpa penjelasan tambahan: "${args.slice(2).join(' ')}"`, jid, pushName);
            if (reply) await sock.sendMessage(jid, { text: `🌐 *Terjemahan:*\n${reply}` }, { quoted: msg });
            continue;
          }
          if (cmd === 'id') { await sock.sendMessage(jid, { text: `🆔 Chat: \`${jid}\`\nUser: \`${senderParticipant}\`` }, { quoted: msg }); continue; }
          if (cmd === 'getpp') {
            const target = unwrapped.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || senderParticipant;
            const pp = await sock.profilePictureUrl(target, 'image').catch(() => null);
            await sock.sendMessage(jid, pp ? { image: { url: pp } } : { text: '❌ Foto profil disembunyikan.' }, { quoted: msg });
            continue;
          }
          if (cmd === 'getbio') {
            const target = unwrapped.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || senderParticipant;
            const st = await sock.fetchStatus(target).catch(() => null);
            await sock.sendMessage(jid, { text: `📝 Bio: ${st?.status || '-'}` }, { quoted: msg });
            continue;
          }
          if (cmd === 'gpass') {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
            const len = Math.min(Math.max(parseInt(param, 10) || 12, 8), 32);
            await sock.sendMessage(jid, { text: `🔐 \`${Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')}\`` }, { quoted: msg });
            continue;
          }
          if (cmd === 'qr' && param) {
            await sock.sendMessage(jid, { image: { url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(param)}` } }, { quoted: msg });
            continue;
          }
          if (cmd === 'shorturl' && extractUrl(param)) {
            const short = await (await fetchWithTimeout(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(extractUrl(param))}`)).text();
            await sock.sendMessage(jid, { text: `🔗 ${short}` }, { quoted: msg });
            continue;
          }
          if (cmd === 'waktu') {
            await sock.sendMessage(jid, { text: `🕒 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB` }, { quoted: msg });
            continue;
          }

          // === OWNER ===
          if (['setnama', 'setname', 'botname'].includes(cmd) && param) {
            bot.userName = param;
            dbMemory.botSettings.customBotName = param;
            await saveMemory();
            await sock.updateProfileName(param).catch(() => {});
            await sock.sendMessage(jid, { text: `✅ Nama bot diubah ke *${param}*` }, { quoted: msg });
            continue;
          }
          if (cmd === 'updatebio' && param) { await sock.updateProfileStatus(param); continue; }
          if ((cmd === 'block' || cmd === 'unblock') && param) {
            await sock.updateBlockStatus(`${param.replace(/\D/g, '')}@s.whatsapp.net`, cmd);
            await sock.sendMessage(jid, { text: `✅ Berhasil ${cmd}` }, { quoted: msg });
            continue;
          }
          if (cmd === 'blocklist') {
            const list = await sock.fetchBlocklist();
            await sock.sendMessage(jid, { text: `🚫 Total diblokir: *${list.length}*` }, { quoted: msg });
            continue;
          }
          if (cmd === 'autoread') { dbMemory.botSettings.autoread = !dbMemory.botSettings.autoread; await saveMemory(); await sock.sendMessage(jid, { text: `👁️ Auto-Read: *${dbMemory.botSettings.autoread ? 'ON' : 'OFF'}*` }, { quoted: msg }); continue; }
          if (cmd === 'autotyping') { dbMemory.botSettings.autotyping = !dbMemory.botSettings.autotyping; await saveMemory(); await sock.sendMessage(jid, { text: `⌨️ Auto-Typing: *${dbMemory.botSettings.autotyping ? 'ON' : 'OFF'}*` }, { quoted: msg }); continue; }
          if (cmd === 'mode' && (param === 'public' || param === 'self')) { dbMemory.botSettings.mode = param; await saveMemory(); await sock.sendMessage(jid, { text: `⚙️ Mode: *${param.toUpperCase()}*` }, { quoted: msg }); continue; }
          if (cmd === 'badwords') { await sock.sendMessage(jid, { text: `🛡️ Total filter: *${bot.badWords.length + dbMemory.learnedWords.length} kata*` }, { quoted: msg }); continue; }
          if (cmd === 'addkata' && param) { dbMemory.learnedWords.push(param.toLowerCase()); await saveMemory(); await sock.sendMessage(jid, { text: `✅ Kata ditambahkan.` }, { quoted: msg }); continue; }
          if (cmd === 'delkata' && param) { dbMemory.learnedWords = dbMemory.learnedWords.filter((w) => w !== param.toLowerCase()); await saveMemory(); await sock.sendMessage(jid, { text: `✅ Kata dihapus.` }, { quoted: msg }); continue; }
          if (cmd === 'clean') { if (global.gc) global.gc(); await sock.sendMessage(jid, { text: '🧹 Cache dibersihkan.' }, { quoted: msg }); continue; }
        }

        // ----------------------------------------------------
        // 🤖 5. OBROLAN AI CERDAS
        // ----------------------------------------------------
        if (isGroup) {
          const contextInfo = unwrapped.extendedTextMessage?.contextInfo;
          const botIdPrefix = (bot.userPhone || sock.user?.id?.split(':')[0] || '').replace(/\D/g, '');
          const isMentioned = botIdPrefix && (contextInfo?.mentionedJid || []).some((m) => m.includes(botIdPrefix));
          const isQuotedBot = botIdPrefix && contextInfo?.participant?.includes(botIdPrefix);
          const isCalledByName = textLower.startsWith('ai ') || textLower.startsWith('bot ') || textLower.includes(bot.userName.toLowerCase());
          if (!isMentioned && !isQuotedBot && !isCalledByName) continue;
        }

        if (rawText.replace(/[^a-zA-Z0-9]/g, '').length < 2) continue;
        const lastUserChat = userCooldowns.get(senderParticipant) || 0;
        if (Date.now() - lastUserChat < 2000) continue;
        userCooldowns.set(senderParticipant, Date.now());

        if (dbMemory.botSettings.autotyping) await sock.sendPresenceUpdate('composing', jid);
        extractFactsAsync(rawText, jid, pushName);

        const reply = await getSmartAIResponse(rawText, jid, pushName, 'general');
        if (reply) {
          await sock.sendMessage(jid, { text: reply }, { quoted: msg });
        } else if (Date.now() - lastAiErrorNotice > 60000) {
          lastAiErrorNotice = Date.now();
          await sock.sendMessage(jid, { text: '⏳ Jaringan AI sedang sibuk sejenak, coba kirim ulang sebentar lagi.' }, { quoted: msg });
        }
      } catch (err) {
        console.error('⚠️ Error memproses pesan:', err?.message || err);
      }
    }
  });
}

// ============================================================
// 5. PEMBERSIH 24 JAM & STARTUP UTAMA
// ============================================================
function jalankanPembersihOtomatis24Jam() {
  setInterval(() => {
    try {
      if (fs.existsSync(AUTH_DIR)) {
        fs.readdirSync(AUTH_DIR).forEach((file) => {
          if (file.startsWith('app-state-sync-') || file.startsWith('pre-key-')) {
            fs.unlinkSync(path.join(AUTH_DIR, file));
          }
        });
      }
      userCooldowns.clear();
      antiFloodTracker.clear();
      if (global.gc) global.gc();
      bot.stats.lastCleanupTime = new Date().toLocaleString('id-ID');
    } catch {}
  }, 24 * 60 * 60 * 1000);
}

async function start() {
  await loadMemory();
  await jalankanEvolusiMandiri(false);
  setInterval(() => jalankanEvolusiMandiri(false), 60 * 60 * 1000);

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
    browser: ['WHUXEN Bot', 'Chrome', '7.0.0'],
    printQRInTerminal: false,
  });

  bot.sock = sock;
  bot.connected = false;
  bot.registered = !!sock.authState.creds.registered;

  sock.ev.on('creds.update', saveCreds);
  pasangPenjawab(sock);

  const timerKoneksi = setTimeout(() => {
    if (!bot.connected) {
      bot.qr = null;
      bot.pairingCode = null;
      try { sock.end(new Error('Timeout 2 menit')); } catch {}
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
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
      setTimeout(start, 3000);
    }
  });
}

jalankanPembersihOtomatis24Jam();
mulaiWeb();
start();
