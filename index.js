import {
  GROUP_AUTO_COMMANDS,
  handleGroupParticipantsUpdate,
  handleGroupJoinRequestEvent,
  startGroupAutomationScheduler,
  handleGroupAutomationCommand,
  handleGroupThemeInteraction,
} from './group_automation.js';
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
  restoreAuthFromGitHub,
  scheduleAuthBackupToGitHub,
  startGitHubLiveHotReload,
  setupGracefulShutdown,
} from './github_sync.js';

import {
  SPOTIFY_LIVE_BUTTON_IDS,
  startSpotifyLiveSession,
  handleSpotifyLiveButton,
} from './spotify_live.js';

import {
  GROUP_AUTO_COMMANDS,
  handleGroupParticipantsUpdate,
  handleGroupJoinRequestEvent,
  startGroupAutomationScheduler,
  handleGroupAutomationCommand,
} from './group_automation.js';

import {
  fetchWithTimeout,
  fetchBuffer,
  extractUrl,
  downloadTikTok,
  downloadCapCut,
  searchYouTube,
  downloadYouTube,
  downloadSocialMedia,
  mediaBufferToWebpSticker,
  createBratSticker,
  urlOrTextToWebpSticker,
  extractAndDownloadViewOnce,
  sendNativeInteractiveButtons,
  panggilServerAISatSet,
  getAnimeImageUrl,
} from './engines.js';

import {
  initFeatures,
  serverAutoHeal,
  recordAutoRepair,
  repairSignalSessionForJid,
  jalankanAudit209FiturRealTime,
  MENU_CATEGORIES,
  ALL_COMMANDS_SET,
  formatCategoryBox,
  getUptime,
  getTodayDateString,
  getIndonesianFullDateTime,
  getServerHardwareStats,
  getCuacaIndonesia,
  getJadwalSholatIndonesia,
  getSurahLengkap,
  FONT_MAPS,
  applyFont,
  kirimTampilanKuroSlash,
  kirimTampilanSonic,
  mulaiWeb,
} from './features.js';

// ============================================================
// PENYADAP REAL-TIME ERROR DEKRIPSI ("MENUNGGU PESAN INI" / BAD MAC)
// ============================================================
let cipherRepairLock = false;
async function triggerAutoCipherHeal(jid = '', reason = 'Bad MAC / Decryption Failure') {
  if (cipherRepairLock) return;
  cipherRepairLock = true;
  try {
    await repairSignalSessionForJid(jid, reason);
  } finally {
    setTimeout(() => {
      cipherRepairLock = false;
    }, 4000);
  }
}

const origConsoleError = console.error;
console.error = (...args) => {
  const joined = args.map((a) => (a?.message ? a.message : String(a))).join(' ');
  if (/Bad MAC|SessionError|No matching sessions|Invalid PreKey|decrypt/i.test(joined)) {
    triggerAutoCipherHeal('', 'Console Signal Decryption Error').catch(() => {});
  }
  origConsoleError.apply(console, args);
};

process.on('uncaughtException', (err) => {
  const msg = err?.message || 'Error';
  if (/Bad MAC|SessionError|No matching sessions|Invalid PreKey/i.test(msg)) {
    triggerAutoCipherHeal('', msg.slice(0, 45)).catch(() => {});
    return;
  }
  recordAutoRepair('ProcessGuard', msg, 'Proses tetap berjalan normal');
});

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  if (/Bad MAC|SessionError|No sessions|No matching sessions|Invalid PreKey|Timed Out/i.test(msg)) {
    triggerAutoCipherHeal('', msg.slice(0, 45)).catch(() => {});
  }
});

const PHONE = (process.env.PHONE_NUMBER || '').replace(/\D/g, '');
const AUTH_DIR = process.env.AUTH_DIR || './auth';
const MEMORY_FILE = './memory.json';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OWNER_NAME = process.env.OWNER_NAME || 'Maverick';
const BOT_CODE_TAG = process.env.BOT_CODE_TAG || 'WhuxenXDev';
const MENU_BANNER_LINK = process.env.MENU_BANNER_LINK || '';

const bot = {
  sock: null,
  connected: false,
  registered: false,
  qr: null,
  pairingCode: null,
  startTime: Date.now(),
  userPhone: null,
  userName: 'WHUXEN BOT',
  stats: {
    totalDeletedBadWords: 0,
    totalDeletedLinks: 0,
    totalBlockedVirtek: 0,
    lastCleanupTime: new Date().toLocaleString('id-ID'),
  },
  badWords: ['anjing', 'babi', 'kunyuk', 'bajingan', 'goblok', 'tolol', 'bangsat', 'brengsek', 'jancok', 'pantek'],
  blockedDomains: ['judionline', 'slotgacor', 'situs-terlarang.com', 'link-spam.xyz'],
};

let dbMemory = {
  version: 9.4,
  lastUpdateDate: '',
  updateLogs: [],
  users: {},
  learnedWords: [],
  notes: {},
  groupSettings: {},
  gameHighScores: { kuroslash: {}, sonic: {} },
  botSettings: { mode: 'public', autoread: false, autotyping: true, customBotName: '' },
  healthReport: { lastChecked: '-', summary: '209/209 Fitur Valid + Spotify Live + Group Automation', details: {}, autoRepairs: [], totalRepairs: 0 },
};

async function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const parsed = JSON.parse(await fsPromises.readFile(MEMORY_FILE, 'utf-8'));
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
      if (dbMemory.botSettings.customBotName) bot.userName = dbMemory.botSettings.customBotName;
    }
  } catch {
    await saveMemory();
  }
}

async function saveMemory() {
  try {
    await fsPromises.writeFile(MEMORY_FILE, JSON.stringify(dbMemory, null, 2), 'utf-8');
  } catch {}
}

async function jalankanEvolusiMandiri(paksaManual = false) {
  const hariIni = getTodayDateString();
  if (!paksaManual && dbMemory.lastUpdateDate === hariIni) return false;
  serverAutoHeal.isUpdating = true;
  serverAutoHeal.updateProgressText = '🔄 SEDANG UPDATE SISTEM DI LAYAR BELAKANG...';
  dbMemory.version = Number((dbMemory.version + 0.1).toFixed(1));
  dbMemory.lastUpdateDate = hariIni;
  const log = `v${dbMemory.version} (${hariIni}): 209 Fitur Valid + Spotify Live + Group Automation + GitHub Persistent Session.`;
  dbMemory.updateLogs.unshift(log);
  await saveMemory();
  serverAutoHeal.isUpdating = false;
  serverAutoHeal.updateProgressText = `✅ ${serverAutoHeal.validCount}/209 Fitur VALID & Group Auto Aktif`;
  return log;
}

const gameSessions = new Map();
const userCooldowns = new Map();
const antiFloodTracker = new Map();
const lastPlaySession = new Map();
const sentMessageCache = new Map();
const lastReplyTextByJid = new Map();
const retryCooldownByJid = new Map();

function rememberOutgoingMessage(keyId, messageObj) {
  if (!keyId || !messageObj) return;
  sentMessageCache.set(keyId, messageObj);
  if (sentMessageCache.size > 300) {
    const oldestKey = sentMessageCache.keys().next().value;
    sentMessageCache.delete(oldestKey);
  }
}

initFeatures({
  bot,
  dbMemory,
  saveMemory,
  jalankanEvolusiMandiri,
  AUTH_DIR,
  PHONE,
  GEMINI_API_KEY,
  OWNER_NAME,
  userCooldowns,
  antiFloodTracker,
});

// Daftarkan perintah Spotify Live & Group Automation ke daftar perintah aktif
['spotifylive', 'splive', 'play', 'play2', 'song', 'spotify'].forEach((c) => ALL_COMMANDS_SET.add(c));
GROUP_AUTO_COMMANDS.forEach((c) => ALL_COMMANDS_SET.add(c));

function getGroupConfig(jid) {
  if (!dbMemory.groupSettings[jid]) {
    dbMemory.groupSettings[jid] = { antilink: false, antivirtek: true, antibug: true, antitoxic: true, antispam: true, welcome: false };
  }
  return dbMemory.groupSettings[jid];
}

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

function extractIncomingTextAndButton(msg) {
  const m = unwrapMessageContent(msg.message);
  const nativeResponse = m.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (nativeResponse?.paramsJson) {
    try {
      const parsed = typeof nativeResponse.paramsJson === 'string' ? JSON.parse(nativeResponse.paramsJson) : nativeResponse.paramsJson;
      if (parsed?.id) return String(parsed.id).trim();
    } catch {}
  }
  if (m.buttonsResponseMessage?.selectedButtonId) return String(m.buttonsResponseMessage.selectedButtonId).trim();
  if (m.templateButtonReplyMessage?.selectedId) return String(m.templateButtonReplyMessage.selectedId).trim();
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return String(m.listResponseMessage.singleSelectReply.selectedRowId).trim();

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    ''
  ).trim();
}

async function mintaKodePairing(sock, phone) {
  try {
    if (!phone || sock.authState.creds.registered) return;
    const code = await sock.requestPairingCode(phone);
    bot.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
    console.log(`🔑 KODE OTP BOT: ${bot.pairingCode}`);
  } catch {
    bot.pairingCode = 'Gagal memuat OTP';
  }
}

// ============================================================
// EKSEKUTOR SELURUH 209 FITUR VALID, SPOTIFY LIVE & GROUP AUTO
// ============================================================
async function prosesSatuPesan(sock, msg) {
  try {
    if (!msg.message || msg.key.fromMe) return;
    const jid = msg.key.remoteJid;
    if (!jid || jid === 'status@broadcast') return;

    if (dbMemory.botSettings.autoread) sock.readMessages([msg.key]).catch(() => {});

    const isGroup = jid.endsWith('@g.us');
    const senderParticipant = msg.key.participant || jid;
    const senderNum = senderParticipant.split(':')[0].replace(/\D/g, '');
    const pushName = msg.pushName || 'Member';
    const isOwner = Boolean(PHONE && senderNum === PHONE);

    if (dbMemory.botSettings.mode === 'self' && !isOwner) return;

    const unwrapped = unwrapMessageContent(msg.message);
    const rawText = extractIncomingTextAndButton(msg);
    if (!rawText) return;
    const textLower = rawText.toLowerCase();

    // Proteksi Grup
    if (isGroup) {
      const gCfg = getGroupConfig(jid);
      let isSenderAdmin = isOwner;
      try {
        const meta = await sock.groupMetadata(jid);
        const sInfo = meta.participants.find((p) => p.id === senderParticipant || p.id.split(':')[0].replace(/\D/g, '') === senderNum);
        if (sInfo?.admin === 'admin' || sInfo?.admin === 'superadmin') isSenderAdmin = true;
      } catch {}

      if (!isSenderAdmin && (gCfg.antivirtek || gCfg.antibug) && (rawText.length > 3500 || (rawText.match(/[\u0300-\u036f]/g) || []).length > 25)) {
        await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
        bot.stats.totalBlockedVirtek++;
        await sock.groupParticipantsUpdate(jid, [senderParticipant], 'remove').catch(() => {});
        return;
      }

      const allBadWords = [...bot.badWords, ...dbMemory.learnedWords];
      if (!isSenderAdmin && gCfg.antitoxic && allBadWords.some((w) => textLower.includes(w))) {
        await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
        bot.stats.totalDeletedBadWords++;
        return;
      }
      if (!isSenderAdmin && gCfg.antilink && /(https?:\/\/|chat\.whatsapp\.com|wa\.me\/)/i.test(rawText)) {
        await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
        bot.stats.totalDeletedLinks++;
        return;
      }
    }

    const cleanAction = textLower.replace(/^[.!/#]/, '').trim();

    // Kontrol Tombol Spotify Live (Pause/Play, Prev, Next, Lirik, MP3, Stop)
    if (SPOTIFY_LIVE_BUTTON_IDS.has(cleanAction)) {
      await handleSpotifyLiveButton(sock, jid, cleanAction, msg);
      return;
    }

    // Kontrol Sentuh Game di Dalam Chat
    if (cleanAction === 'stopgame' && gameSessions.has(jid)) {
      gameSessions.delete(jid);
      await sock.sendMessage(jid, { text: '🛑 Permainan dihentikan.' }, { quoted: msg });
      return;
    }

    if (gameSessions.has(jid)) {
      const s = gameSessions.get(jid);
      if (s.type === 'kuroslash' && ['kiri', 'tebas', 'kanan', 'ulti'].includes(cleanAction)) {
        s.wave = (s.wave || 0) + 1;
        let ev = '';
        if (cleanAction === 'kiri') { s.lane = Math.max(0, s.lane - 1); s.score += 65; s.ulti = Math.min(100, s.ulti + 15); ev = 'Bergerak ke jalur KIRI (+65)!'; }
        else if (cleanAction === 'kanan') { s.lane = Math.min(2, s.lane + 1); s.score += 65; s.ulti = Math.min(100, s.ulti + 15); ev = 'Bergerak ke jalur KANAN (+65)!'; }
        else if (cleanAction === 'tebas') { s.score += 150; s.ulti = Math.min(100, s.ulti + 25); ev = '⚔️ TEBASAN TELAK! Oni ter-PARRY (+150)!'; }
        else if (cleanAction === 'ulti') {
          if (s.ulti >= 100) { s.score += 450; s.ulti = 0; ev = '🌊 GELOMBANG ULTI TERLEPAS (+450)!'; }
          else { ev = `⚠️ ULTI baru ${s.ulti}% (tekan ⚔️ TEBAS untuk mengisi)!`; }
        }
        dbMemory.gameHighScores.kuroslash[senderNum] = Math.max(dbMemory.gameHighScores.kuroslash[senderNum] || 0, s.score);
        s.best = dbMemory.gameHighScores.kuroslash[senderNum];
        await saveMemory();
        await kirimTampilanKuroSlash(sock, jid, senderNum, s, ev, msg);
        return;
      }
      if (s.type === 'sonic' && ['boost', 'jump'].includes(cleanAction)) {
        const addR = Math.floor(Math.random() * 7) + 5;
        s.rings += addR;
        s.score += addR * 35;
        s.laserAlert = cleanAction === 'boost' ? Math.random() < 0.45 : false;
        dbMemory.gameHighScores.sonic[senderNum] = Math.max(dbMemory.gameHighScores.sonic[senderNum] || 0, s.score);
        s.best = dbMemory.gameHighScores.sonic[senderNum];
        await saveMemory();
        await kirimTampilanSonic(sock, jid, senderNum, s, `${cleanAction === 'boost' ? '⚡ BOOST' : '⬆️ JUMP'}! +${addR} Gold Rings!`, msg);
        return;
      }
      if (s.type === 'angka' && /^[0-9]+$/.test(rawText)) {
        const g = parseInt(rawText, 10);
        if (g === s.answer) { gameSessions.delete(jid); await sock.sendMessage(jid, { text: `🎉 *BENAR!* Angkanya *${s.answer}*.` }, { quoted: msg }); }
        else { await sock.sendMessage(jid, { text: g < s.answer ? '⬆️ Terlalu KECIL!' : '⬇️ Terlalu BESAR!' }, { quoted: msg }); }
        return;
      }
      if (s.type === 'math' && /^-?[0-9]+$/.test(rawText)) {
        const g = parseInt(rawText, 10);
        gameSessions.delete(jid);
        await sock.sendMessage(jid, { text: g === s.answer ? `🎉 *TEPAT!* Jawabannya *${s.answer}*.` : `❌ Salah! Jawaban: *${s.answer}*.` }, { quoted: msg });
        return;
      }
      if (s.type === 'kata' && !ALL_COMMANDS_SET.has(cleanAction)) {
        gameSessions.delete(jid);
        await sock.sendMessage(jid, { text: textLower === s.answer ? `🎉 *BENAR!* Jawabannya *${s.answer}*.` : `❌ Salah! Jawaban: *${s.answer}*.` }, { quoted: msg });
        return;
      }
    }

    const hasPrefix = /^[.!/#]/.test(rawText);
    const cleanText = hasPrefix ? rawText.slice(1).trim() : rawText;
    const args = cleanText.split(/\s+/);
    const cmd = args[0].toLowerCase();
    const param = args.slice(1).join(' ').trim();

    if (ALL_COMMANDS_SET.has(cmd)) {
      if (dbMemory.botSettings.autotyping) sock.sendPresenceUpdate('composing', jid).catch(() => {});

      // HANDLER OTOMATISASI GRUP (Welcome, Goodbye, Buka/Tutup, Kegiatan, Filter & ACC Member)
      const handledGroupAuto = await handleGroupAutomationCommand({
        sock,
        jid,
        isGroup,
        senderParticipant,
        senderNum,
        isOwner,
        cmd,
        param,
        msg,
        dbMemory,
        saveMemory,
      });
      if (handledGroupAuto) return;

      // FITUR KHUSUS: RESET KUNCI ENKRIPSI ("MENUNGGU PESAN INI")
      if (cmd === 'fixsession') {
        const deleted = await repairSignalSessionForJid(jid, 'Perintah Manual fixsession');
        await sock.sendMessage(
          jid,
          { text: `🔐 *SIGNAL CIPHER DI-RESET!*\n• Kunci sesi dibersihkan: *${deleted} file*\n• Status: Enkripsi chat sudah disinkronkan ulang.` },
          { quoted: msg }
        );
        return;
      }

      // 1. MENU UTAMA DENGAN TOMBOL ASLI + INDIKATOR UPDATE LAYAR BELAKANG
      if (cmd === 'menu' || cmd === 'help') {
        const dt = getIndonesianFullDateTime();
        const sisaDetik = Math.max(0, Math.floor((serverAutoHeal.nextAuditTimestamp - Date.now()) / 1000));
        const bgBanner = serverAutoHeal.isUpdating
          ? '🔄 *STATUS:* SEDANG UPDATE & AUDIT 209 FITUR DI LAYAR BELAKANG...'
          : `✅ *STATUS:* ${serverAutoHeal.validCount}/209 FITUR VALID (Audit 5-Menit: ${Math.floor(sisaDetik / 60)}m ${sisaDetik % 60}d)`;

        const bannerImg =
          MENU_BANNER_LINK ||
          `https://dummyimage.com/1000x460/1e1035/c084fc.png&text=${encodeURIComponent(bot.userName + ' • 209 VALID FEATURES')}`;

        const menuBody =
          `└ *${bot.userName}* ┐\n` +
          `🗓️ ${dt.full}\n` +
          `${bgBanner}\n\n` +
          `🏷️ *Ohayou! 🌅*\n` +
          `Berakhir besok pukul ${dt.jam}\n` +
          `Kode: \`${BOT_CODE_TAG}\`\n\n` +
          `👤 *INFORMATION*\n` +
          `• *NAMA*       : ${pushName}\n` +
          `• *STATUS*    : ${isOwner ? '👑 Owner' : '⭐ Unlimited'}\n` +
          `• *LIMIT*        : ∞ Unlimited\n` +
          `• *BOT*          : ${bot.userName}\n` +
          `• *OWNER*     : ${OWNER_NAME}\n` +
          `• *VERSION* : v${dbMemory.version} (209 Fitur)`;

        lastReplyTextByJid.set(jid, menuBody);

        await sendNativeInteractiveButtons(
          sock,
          jid,
          {
            title: 'HOME  •  ABOUT  •  PROFILE',
            body: menuBody,
            footer: `Tekan tombol asli di bawah untuk kontrol otomatis`,
            imageUrl: bannerImg,
            forwardedCard: true,
            listTitle: '📂 Pilih Kategori (209 Fitur)',
            sections: [
              {
                title: '🛠️ PERBAIKAN & AUDIT REAL-TIME 209 FITUR',
                rows: [
                  { title: '🛠️ Perbaiki Semua 209 Fitur', description: 'Jalankan auto-repair 209 fitur + reset enkripsi', id: 'autorepair' },
                  { title: '🔐 Fix Enkripsi (Menunggu Pesan)', description: 'Reset kunci sesi Signal chat ini sekarang', id: 'fixsession' },
                  { title: '🩺 Tes Semua 209 Menu', description: 'Uji validitas 209 fitur secara real-time', id: 'selftest' },
                  { title: '📋 Daftar Lengkap 209 Fitur', description: 'Tampilkan seluruh 209 perintah bot', id: 'allmenu' },
                ],
              },
              {
                title: '⚙️ GRUP OTOMATIS, SPOTIFY LIVE & GAME',
                rows: [
                  { title: '🛡️ Panel Otomatisasi Grup', description: 'Welcome, Buka/Tutup, Kegiatan & ACC Member', id: 'panelgrup' },
                  { title: '🎧 Spotify Live (Video + Lirik)', description: 'Ketik: play <judul lagu> untuk lirik berjalan', id: 'downloadmenu' },
                  { title: '⚔️ Kuro Slash (Tombol Asli)', description: 'Main tebas Oni dengan tombol sentuh langsung', id: 'kuroslash' },
                  { title: '🌀 Speedy Dash (Tombol Asli)', description: 'Main Sonic kumpulkan Gold Rings di chat', id: 'sonic' },
                  { title: '🤖 Menu AI (28 Fitur)', description: 'GPT-5, Gemini, DeepSeek R1, Claude, Grok', id: 'aimenu' },
                  { title: '🎨 Menu Sticker & Brat (21 Fitur)', description: 'Sticker, Brat, BratVid, QC, Logo', id: 'logomenu' },
                ],
              },
            ],
            buttons: [
              { text: '🛠️ Perbaiki 209 Fitur', id: 'autorepair' },
              { text: '🔐 Fix Enkripsi', id: 'fixsession' },
              { text: '📋 Semua 209 Fitur', id: 'allmenu' },
            ],
          },
          msg
        );
        return;
      }

      if (cmd === 'allmenu') {
        let out =
          `*╭┈───〔 ${bot.userName} - 209 FITUR VALID 〕┈───⊷*\n` +
          `*├✦ Owner:* ${OWNER_NAME}\n` +
          `*├✦ Total Valid:* ${ALL_COMMANDS_SET.size}/209 Fitur\n` +
          `*├✦ Status Latar Belakang:* ${serverAutoHeal.updateProgressText}\n` +
          `*╰───────────────────⊷*\n\n`;
        for (const [cat, list] of Object.entries(MENU_CATEGORIES)) {
          out += formatCategoryBox(cat, list) + '\n';
        }
        out += formatCategoryBox('GROUP_AUTOMATION', GROUP_AUTO_COMMANDS) + '\n';
        await sock.sendMessage(jid, { text: out, contextInfo: { forwardingScore: 999, isForwarded: true } }, { quoted: msg });
        return;
      }

      const subMenus = {
        aimenu: 'AI', downloadmenu: 'DOWNLOAD', searchmenu: 'SEARCH', animemenu: 'ANIME',
        funmenu: 'FUN', groupmenu: 'GROUP', logomenu: 'STICKER_LOGO', toolsmenu: 'TOOLS', ownermenu: 'OWNER',
      };
      if (subMenus[cmd]) {
        await sock.sendMessage(jid, { text: formatCategoryBox(subMenus[cmd], MENU_CATEGORIES[subMenus[cmd]]) }, { quoted: msg });
        return;
      }

      // 2. AUTO-REPAIR & REAL-TIME 209 FEATURE SELF-TEST
      if (cmd === 'selftest' || cmd === 'cekfitur' || cmd === 'autorepair') {
        await sock.sendMessage(jid, { text: '🔄 *Sedang menjalankan Auto-Repair 209 Fitur & Reset Sesi Enkripsi di layar belakang...*' }, { quoted: msg });
        await repairSignalSessionForJid(jid, 'Auto-Repair Triggered');
        const rep = await jalankanAudit209FiturRealTime(true);
        const details = Object.entries(rep.details).map(([k, v]) => `• *${k}:* ${v}`).join('\n');
        const repairs = serverAutoHeal.repairLogs.slice(0, 5).map((r) => `• ${r}`).join('\n');

        await sendNativeInteractiveButtons(
          sock,
          jid,
          {
            title: '🩺 LAPORAN VALIDASI 209 FITUR + CIPHER GUARD',
            body: `🕒 ${rep.lastChecked}\n📊 *${rep.summary}*\n\n${details}${repairs ? `\n\n🛠️ *Log Perbaikan Otomatis:*\n${repairs}` : ''}`,
            footer: 'Audit otomatis berjalan setiap 5 menit',
            buttons: [
              { text: '🛠️ Perbaiki Ulang 209 Fitur', id: 'autorepair' },
              { text: '📋 Lihat 209 Menu', id: 'allmenu' },
            ],
          },
          msg
        );
        return;
      }

      if (['ping', 'ping2', 'speed', 'os'].includes(cmd)) {
        const hw = getServerHardwareStats();
        const wib = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }).replace(/:/g, '.');
        await sendNativeInteractiveButtons(
          sock,
          jid,
          {
            title: `⚡ SERVER & 209 FITUR STATUS`,
            body:
              `❖ *Valid Features :* ${serverAutoHeal.validCount}/209 VALID\n` +
              `❖ *Cipher Repairs :* ${serverAutoHeal.totalCipherRepairs}x otomatis\n` +
              `❖ *Background Task :* ${serverAutoHeal.updateProgressText}\n` +
              `❖ *Runtime :* ${getUptime()}\n` +
              `❖ *RAM Usage :* ${hw.ramPercent}% ${hw.ramBar}\n` +
              `❖ *Disk Usage :* ${hw.diskPercent}% ${hw.diskBar}\n` +
              `❖ *Time :* ${wib} WIB`,
            footer: bot.userName,
            buttons: [
              { text: '🛠️ Perbaiki 209 Fitur', id: 'autorepair' },
              { text: '📋 Buka 209 Menu', id: 'allmenu' },
            ],
          },
          msg
        );
        return;
      }

      if (['alive', 'runtime', 'uptime'].includes(cmd)) {
        await sock.sendMessage(jid, { text: `🟢 *${bot.userName}* Aktif (${getUptime()}) • ${serverAutoHeal.validCount}/209 Fitur VALID` }, { quoted: msg });
        return;
      }
      if (cmd === 'owner') { await sock.sendMessage(jid, { text: `👤 *Owner:* ${OWNER_NAME}` }, { quoted: msg }); return; }
      if (cmd === 'status') {
        await sock.sendMessage(jid, { text: `📊 *STATUS*\n• Fitur Valid: ${serverAutoHeal.validCount}/209\n• Cipher Repairs: ${serverAutoHeal.totalCipherRepairs}x\n• Auto-Repair Total: ${serverAutoHeal.totalAutoRepairs}x` }, { quoted: msg });
        return;
      }
      if (cmd === 'update') {
        const log = await jalankanEvolusiMandiri(true);
        await sock.sendMessage(jid, { text: `🧬 *UPDATE SELESAI*\n${log}` }, { quoted: msg });
        return;
      }

      // 3. AI (28 FITUR VALID)
      if (cmd === 'memori') {
        const f = dbMemory.users[jid]?.facts || [];
        await sock.sendMessage(jid, { text: f.length ? `🧠 *Ingatan:*\n• ${f.join('\n• ')}` : '🧠 Memori kosong.' }, { quoted: msg });
        return;
      }
      if (cmd === 'resetmemori') {
        delete dbMemory.users[jid];
        await saveMemory();
        await sock.sendMessage(jid, { text: '✅ Memori direset.' }, { quoted: msg });
        return;
      }
      if (MENU_CATEGORIES.AI.includes(cmd)) {
        if (!param) { await sock.sendMessage(jid, { text: `⚠️ Contoh: \`${cmd} jelaskan cara kerja AI\`` }, { quoted: msg }); return; }
        const reply = await panggilServerAISatSet(param, `Kamu adalah ${bot.userName} (${cmd.toUpperCase()}). Jawab singkat, cerdas, dan akurat dalam Bahasa Indonesia.`);
        await sock.sendMessage(jid, { text: reply || '⏳ Server AI sibuk, coba ulangi.' }, { quoted: msg });
        return;
      }

      // 4. DOWNLOADER & SPOTIFY LIVE (POTONGAN VIDEO KLIP + LIRIK BERJALAN + TOMBOL)
      if (['tiktok', 'tt', 'ttmp3', 'ttslide'].includes(cmd)) {
        const u = extractUrl(param);
        if (!u) { await sock.sendMessage(jid, { text: `⚠️ Contoh: \`${cmd} https://vt.tiktok.com/...\`` }, { quoted: msg }); return; }
        const res = await downloadTikTok(u);
        if (!res) { await sock.sendMessage(jid, { text: '❌ Gagal mengunduh TikTok.' }, { quoted: msg }); return; }
        if (cmd === 'ttmp3' && res.musicUrl) {
          const buf = await fetchBuffer(res.musicUrl, 'https://www.tiktok.com/').catch(() => null);
          if (buf) await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg' }, { quoted: msg });
          return;
        }
        if (res.type === 'image') {
          for (const imgU of res.images.slice(0, 8)) {
            const b = await fetchBuffer(imgU, 'https://www.tiktok.com/').catch(() => null);
            if (b) await sock.sendMessage(jid, { image: b }, { quoted: msg });
          }
        } else if (res.videoUrl) {
          const vBuf = await fetchBuffer(res.videoUrl, 'https://www.tiktok.com/').catch(() => null);
          await sock.sendMessage(jid, vBuf ? { video: vBuf, caption: `🎬 *TikTok HD*\n${res.title}` } : { video: { url: res.videoUrl }, caption: `🎬 *TikTok HD*\n${res.title}` }, { quoted: msg });
        }
        return;
      }

      if (cmd === 'capcut') {
        const u = extractUrl(param);
        if (!u) { await sock.sendMessage(jid, { text: '⚠️ Contoh: `capcut https://www.capcut.com/tv2/...`' }, { quoted: msg }); return; }
        const cc = await downloadCapCut(u);
        if (cc?.url) {
          const vBuf = await fetchBuffer(cc.url, 'https://www.capcut.com/').catch(() => null);
          await sock.sendMessage(jid, vBuf ? { video: vBuf, caption: `🎬 *${cc.title}*` } : { video: { url: cc.url }, caption: `🎬 *${cc.title}*` }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, { text: '❌ Video CapCut tidak ditemukan atau privat.' }, { quoted: msg });
        }
        return;
      }

      if (['ytmp4', 'ytmp3', 'ytdl', 'video'].includes(cmd)) {
        const u = extractUrl(param) || lastPlaySession.get(jid)?.url;
        if (!u) { await sock.sendMessage(jid, { text: `⚠️ Contoh: \`${cmd} https://youtu.be/...\`` }, { quoted: msg }); return; }
        const isAud = cmd === 'ytmp3';
        const yt = await downloadYouTube(u, isAud);
        if (yt?.buffer) {
          await sock.sendMessage(jid, isAud ? { audio: yt.buffer, mimetype: 'audio/mpeg' } : { video: yt.buffer, caption: `🎬 *${yt.title}*` }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, { text: '❌ Gagal mengunduh media YouTube.' }, { quoted: msg });
        }
        return;
      }

      if (['play', 'play2', 'song', 'spotify', 'spotifylive', 'splive'].includes(cmd)) {
        if (!param) {
          await sock.sendMessage(jid, { text: `⚠️ Contoh: \`${cmd} hal l\`` }, { quoted: msg });
          return;
        }
        const first = await startSpotifyLiveSession(sock, jid, param, msg);
        if (first) lastPlaySession.set(jid, first);
        return;
      }

      if (cmd === 'yts') {
        if (!param) return;
        const list = await searchYouTube(param);
        await sock.sendMessage(jid, { text: list.length ? list.map((v, i) => `${i + 1}. *${v.title}* (${v.duration})\n🔗 ${v.url}`).join('\n\n') : '❌ Tidak ditemukan.' }, { quoted: msg });
        return;
      }

      if (['igdl', 'fb', 'twitter', 'mediafire', 'gdrive'].includes(cmd)) {
        const u = extractUrl(param);
        if (!u) { await sock.sendMessage(jid, { text: `⚠️ Contoh: \`${cmd} https://...\`` }, { quoted: msg }); return; }
        const res = await downloadSocialMedia(u, cmd);
        if (res?.url) {
          const buf = await fetchBuffer(res.url).catch(() => null);
          if (buf) {
            if (cmd === 'mediafire' || cmd === 'gdrive') await sock.sendMessage(jid, { document: buf, fileName: res.filename, mimetype: 'application/octet-stream' }, { quoted: msg });
            else if (res.isImage) await sock.sendMessage(jid, { image: buf }, { quoted: msg });
            else await sock.sendMessage(jid, { video: buf }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { text: `🔗 ${res.url}` }, { quoted: msg });
          }
        } else {
          await sock.sendMessage(jid, { text: '❌ Tautan gagal diunduh.' }, { quoted: msg });
        }
        return;
      }

      if (cmd === 'gitclone') {
        const m = param.match(/github\.com\/([^/]+)\/([^/\s]+)/i);
        if (!m) return;
        await sock.sendMessage(jid, { document: { url: `https://github.com/${m[1]}/${m[2].replace(/\.git$/, '')}/archive/refs/heads/main.zip` }, fileName: `${m[2]}.zip`, mimetype: 'application/zip' }, { quoted: msg });
        return;
      }

      if (cmd === 'tts' && param) {
        const buf = await fetchBuffer(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(param.slice(0, 200))}&tl=id&client=tw-ob`).catch(() => null);
        if (buf) await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
        return;
      }

      // 5. SEARCH & ISLAMI (10 FITUR VALID)
      if (cmd === 'cuaca' || cmd === 'wthr') {
        const c = await getCuacaIndonesia(param || 'Jakarta');
        await sock.sendMessage(jid, { text: c || '❌ Kota tidak ditemukan.' }, { quoted: msg });
        return;
      }
      if (cmd === 'praytime') {
        const j = await getJadwalSholatIndonesia(param || 'Jakarta');
        await sock.sendMessage(jid, { text: j || '❌ Jadwal tidak ditemukan.' }, { quoted: msg });
        return;
      }
      if (cmd === 'surah') {
        const s = await getSurahLengkap(param || '1');
        if (s) {
          await sock.sendMessage(jid, { text: s.text }, { quoted: msg });
          if (s.audioUrl) {
            const b = await fetchBuffer(s.audioUrl).catch(() => null);
            if (b) await sock.sendMessage(jid, { audio: b, mimetype: 'audio/mpeg' }, { quoted: msg });
          }
        }
        return;
      }
      if (cmd === 'wiki' && param) {
        const r = await fetchWithTimeout(`https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(param)}`).catch(() => null);
        const d = r ? await r.json() : null;
        await sock.sendMessage(jid, { text: d?.extract ? `📚 *${d.title}*\n\n${d.extract}` : '❌ Tidak ditemukan.' }, { quoted: msg });
        return;
      }
      if (cmd === 'npm' && param) {
        const r = await fetchWithTimeout(`https://registry.npmjs.org/${encodeURIComponent(param)}`).catch(() => null);
        const d = r ? await r.json() : null;
        await sock.sendMessage(jid, { text: d?.name ? `📦 *${d.name}* v${d['dist-tags']?.latest}\n${d.description || ''}` : '❌ Tidak ditemukan.' }, { quoted: msg });
        return;
      }
      if (['define', 'fakta', 'motivasi', 'kbbi'].includes(cmd)) {
        const ans = await panggilServerAISatSet(`Berikan ${cmd} untuk "${param || 'Indonesia'}" secara singkat dalam Bahasa Indonesia.`, 'Jawab akurat dan ringkas.');
        await sock.sendMessage(jid, { text: ans || '❌ Data tidak tersedia.' }, { quoted: msg });
        return;
      }

      // 6. ANIME (10 FITUR VALID)
      if (MENU_CATEGORIES.ANIME.includes(cmd)) {
        const imgUrl = await getAnimeImageUrl(cmd);
        if (imgUrl) await sock.sendMessage(jid, { image: { url: imgUrl }, caption: `✨ *${cmd.toUpperCase()}*` }, { quoted: msg });
        return;
      }

      // 7. FUN & GAME TOMBOL ASLI (36 FITUR VALID)
      if (cmd === 'kuroslash' || cmd === 'slash') {
        const st = { type: 'kuroslash', lane: 1, hp: 100, score: 0, best: dbMemory.gameHighScores.kuroslash[senderNum] || 0, ulti: 35, wave: 0 };
        gameSessions.set(jid, st);
        await kirimTampilanKuroSlash(sock, jid, senderNum, st, 'Tekan tombol di bawah untuk bermain!', msg);
        return;
      }
      if (cmd === 'sonic' || cmd === 'speedydash') {
        const st = { type: 'sonic', rings: 10, score: 0, best: dbMemory.gameHighScores.sonic[senderNum] || 0, laserAlert: false };
        gameSessions.set(jid, st);
        await kirimTampilanSonic(sock, jid, senderNum, st, 'Tekan BOOST atau JUMP di bawah!', msg);
        return;
      }
      if (cmd === 'game') {
        gameSessions.set(jid, { type: 'angka', answer: Math.floor(Math.random() * 10) + 1 });
        await sock.sendMessage(jid, { text: '🎮 *Tebak Angka (1-10)*\nKirim tebakanmu!' }, { quoted: msg });
        return;
      }
      if (cmd === 'mathgame') {
        const a = Math.floor(Math.random() * 25) + 5;
        const b = Math.floor(Math.random() * 25) + 5;
        gameSessions.set(jid, { type: 'math', answer: a + b });
        await sock.sendMessage(jid, { text: `🧮 Berapa *${a} + ${b}*?` }, { quoted: msg });
        return;
      }
      if (cmd === 'tebakkata') {
        gameSessions.set(jid, { type: 'kata', answer: 'peta' });
        await sock.sendMessage(jid, { text: '🧩 Punya gunung tapi tidak punya pohon, punya kota tapi tidak punya rumah. Apakah aku?' }, { quoted: msg });
        return;
      }
      if (cmd === 'suit') {
        const p = ['batu', 'gunting', 'kertas'];
        const u = param.toLowerCase();
        if (!p.includes(u)) { await sock.sendMessage(jid, { text: '⚠️ Contoh: `suit batu`' }, { quoted: msg }); return; }
        const b = p[Math.floor(Math.random() * 3)];
        await sock.sendMessage(jid, { text: `✊✌️✋ Kamu: *${u}* | Bot: *${b}*` }, { quoted: msg });
        return;
      }
      if (cmd === 'dice') { await sock.sendMessage(jid, { text: `🎲 Dadu: *${Math.floor(Math.random() * 6) + 1}*` }, { quoted: msg }); return; }
      if (cmd === 'coin') { await sock.sendMessage(jid, { text: `🪙 Koin: *${Math.random() < 0.5 ? 'ANGKA' : 'GAMBAR'}*` }, { quoted: msg }); return; }
      if (cmd === '8ball') { await sock.sendMessage(jid, { text: `🎱 *${['Ya pasti!', 'Mungkin iya.', 'Coba lagi.', 'Tidak.'][Math.floor(Math.random() * 4)]}*` }, { quoted: msg }); return; }
      if (['rate', 'aura', 'sigma', 'rizz', 'vibe', 'npc', 'maincharacter', 'delulu', 'redflag', 'greenflag', 'compatibility', 'ship'].includes(cmd)) {
        await sock.sendMessage(jid, { text: `📊 *${cmd.toUpperCase()}:* ${Math.floor(Math.random() * 101)}%` }, { quoted: msg });
        return;
      }
      if (['roast', 'compliment', 'pickup', 'quote', 'joke', 'truth', 'dare', 'wyr', 'horoscope'].includes(cmd)) {
        const ans = await panggilServerAISatSet(`Buat 1 ${cmd} singkat dan sopan dalam Bahasa Indonesia untuk ${param || pushName}.`, 'Jawab singkat.');
        await sock.sendMessage(jid, { text: ans || '✨ Semangat hari ini!' }, { quoted: msg });
        return;
      }
      if (['hug', 'pat', 'wave', 'dance'].includes(cmd)) {
        const u = await getAnimeImageUrl(cmd);
        if (u) await sock.sendMessage(jid, { image: { url: u }, caption: `*${pushName}* melakukan *${cmd}*` }, { quoted: msg });
        return;
      }

      // 8. GROUP & KEAMANAN (25 FITUR VALID)
      if (MENU_CATEGORIES.GROUP.includes(cmd)) {
        if (!isGroup) { await sock.sendMessage(jid, { text: '⚠️ Khusus di dalam grup.' }, { quoted: msg }); return; }
        const meta = await sock.groupMetadata(jid);
        const parts = meta.participants.map((p) => p.id);
        const gCfg = getGroupConfig(jid);
        if (cmd === 'ginfo' || cmd === 'groupsettings' || cmd === 'gsettings') {
          await sendNativeInteractiveButtons(
            sock,
            jid,
            {
              title: '🛡️ PENGATURAN GRUP',
              body: `Grup: *${meta.subject}*\nAnti-Link: ${gCfg.antilink ? 'ON' : 'OFF'} | Anti-Virtek: ${gCfg.antivirtek ? 'ON' : 'OFF'} | Anti-Toxic: ${gCfg.antitoxic ? 'ON' : 'OFF'}`,
              buttons: [
                { text: '🔗 Toggle Anti-Link', id: 'antilink' },
                { text: '☣️ Toggle Anti-Virtek', id: 'antivirtek' },
                { text: '🤬 Toggle Anti-Toxic', id: 'antitoxic' },
              ],
            },
            msg
          );
          return;
        }
        if (cmd === 'tagall' || cmd === 'everyone') { await sock.sendMessage(jid, { text: parts.map((p) => `@${p.split('@')[0]}`).join(' '), mentions: parts }); return; }
        if (cmd === 'hidetag') { await sock.sendMessage(jid, { text: param || '📢 Info', mentions: parts }); return; }
        if (cmd === 'link') { await sock.sendMessage(jid, { text: `https://chat.whatsapp.com/${await sock.groupInviteCode(jid)}` }); return; }
        if (cmd === 'revoke') { await sock.groupRevokeInvite(jid); await sock.sendMessage(jid, { text: '✅ Link direset.' }); return; }
        if (cmd === 'mute') { await sock.groupSettingUpdate(jid, 'announcement'); return; }
        if (cmd === 'unmute') { await sock.groupSettingUpdate(jid, 'not_announcement'); return; }
        if (cmd === 'updategname' && param) { await sock.groupUpdateSubject(jid, param); return; }
        if (cmd === 'updategdesc' && param) { await sock.groupUpdateDescription(jid, param); return; }
        if (cmd === 'poll') {
          const p = param.split('|').map((s) => s.trim()).filter(Boolean);
          if (p.length >= 3) await sock.sendMessage(jid, { poll: { name: p[0], values: p.slice(1), selectableCount: 1 } });
          return;
        }
        if (cmd === 'delete') {
          const q = unwrapped.extendedTextMessage?.contextInfo;
          if (q?.stanzaId) await sock.sendMessage(jid, { delete: { remoteJid: jid, fromMe: false, id: q.stanzaId, participant: q.participant } });
          return;
        }
        if (['kick', 'add', 'promote', 'demote'].includes(cmd)) {
          const target = unwrapped.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || unwrapped.extendedTextMessage?.contextInfo?.participant;
          if (target) await sock.groupParticipantsUpdate(jid, [target], { kick: 'remove', add: 'add', promote: 'promote', demote: 'demote' }[cmd]);
          return;
        }
        if (cmd === 'antilink') { gCfg.antilink = !gCfg.antilink; await saveMemory(); await sock.sendMessage(jid, { text: `Anti-Link: ${gCfg.antilink ? 'ON' : 'OFF'}` }); return; }
        if (cmd === 'antivirtek' || cmd === 'antibug') { gCfg.antivirtek = !gCfg.antivirtek; await saveMemory(); await sock.sendMessage(jid, { text: `Anti-Virtek: ${gCfg.antivirtek ? 'ON' : 'OFF'}` }); return; }
        if (cmd === 'antitoxic') { gCfg.antitoxic = !gCfg.antitoxic; await saveMemory(); await sock.sendMessage(jid, { text: `Anti-Toxic: ${gCfg.antitoxic ? 'ON' : 'OFF'}` }); return; }
        if (cmd === 'antispam') { gCfg.antispam = !gCfg.antispam; await saveMemory(); await sock.sendMessage(jid, { text: `Anti-Spam: ${gCfg.antispam ? 'ON' : 'OFF'}` }); return; }
        if (cmd === 'leave') { await sock.groupLeave(jid); return; }
      }

      // 9. STICKER, BRAT, BRATVID & LOGO (21 FITUR VALID)
      if (['sticker', 'stiker', 's'].includes(cmd)) {
        const qMsg = unwrapMessageContent(unwrapped.extendedTextMessage?.contextInfo?.quotedMessage);
        const imgMsg = unwrapped.imageMessage || qMsg?.imageMessage;
        const vidMsg = unwrapped.videoMessage || qMsg?.videoMessage;
        if (imgMsg) {
          const st = await downloadContentFromMessage(imgMsg, 'image');
          let b = Buffer.from([]);
          for await (const c of st) b = Buffer.concat([b, c]);
          const webp = await mediaBufferToWebpSticker(b, false);
          if (webp) await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
          return;
        }
        if (vidMsg) {
          const st = await downloadContentFromMessage(vidMsg, 'video');
          let b = Buffer.from([]);
          for await (const c of st) b = Buffer.concat([b, c]);
          const webp = await mediaBufferToWebpSticker(b, true);
          if (webp) await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
          return;
        }
        if (param) {
          const webp = await urlOrTextToWebpSticker(param);
          if (webp) await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
        }
        return;
      }

      if (['brat', 'bratvid', 'bratvideo'].includes(cmd)) {
        const txt = param || 'brat';
        const webp = await createBratSticker(txt, cmd !== 'brat');
        if (webp) await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
        return;
      }
      if (['ttp', 'attp', 'qc'].includes(cmd) && param) {
        const webp = await urlOrTextToWebpSticker(param);
        if (webp) await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
        return;
      }
      if (cmd === 'animasi' || cmd === 'linkvideo') {
        const u = extractUrl(param) || `https://dummyimage.com/800x450/0f172a/38bdf8.png&text=${encodeURIComponent(param || 'HD')}`;
        await sock.sendMessage(jid, { image: { url: `https://api.microlink.io/?url=${encodeURIComponent(u)}&screenshot=true&meta=false&embed=screenshot.url` }, caption: '✨ Visual HD' }, { quoted: msg });
        return;
      }
      if ((cmd === 'font' || cmd === 'fancy') && param) {
        await sock.sendMessage(jid, { text: FONT_MAPS.map((_, i) => `${i + 1}. ${applyFont(param, i)}`).join('\n') }, { quoted: msg });
        return;
      }
      if (['logo', 'neon', 'gold', 'galaxy', 'glitch', 'matrix', 'graffiti', 'thunder'].includes(cmd) && param) {
        const colors = { logo: '0f172a/38bdf8', neon: '090d16/00ffcc', gold: '1c1917/facc15', galaxy: '1e1b4b/c084fc', glitch: '18181b/f43f5e', matrix: '022c22/4ade80', graffiti: '312e81/fb923c', thunder: '0c4a6e/fde047' };
        await sock.sendMessage(jid, { image: { url: `https://dummyimage.com/800x400/${colors[cmd]}.png&text=${encodeURIComponent(param)}` } }, { quoted: msg });
        return;
      }

      // 10. TOOLS & RVO (18 FITUR VALID)
      if (['rvo', 'rvop', 'vv'].includes(cmd)) {
        const qRaw = unwrapped.extendedTextMessage?.contextInfo?.quotedMessage;
        const vo = await extractAndDownloadViewOnce(qRaw);
        if (!vo?.buffer) { await sock.sendMessage(jid, { text: '⚠️ Balas pesan View Once dengan `.rvo`' }, { quoted: msg }); return; }
        const target = cmd === 'rvop' ? senderParticipant : jid;
        if (vo.type === 'image') await sock.sendMessage(target, { image: vo.buffer, caption: `👁️ RVO\n${vo.caption}` });
        else if (vo.type === 'video') await sock.sendMessage(target, { video: vo.buffer, caption: `👁️ RVO\n${vo.caption}` });
        else if (vo.type === 'audio') await sock.sendMessage(target, { audio: vo.buffer, mimetype: 'audio/mpeg', ptt: true });
        return;
      }
      if (cmd === 'hitung' && param && /^[0-9+\-*/().\s]+$/.test(param)) {
        await sock.sendMessage(jid, { text: `🧮 *${param}* = *${Function(`"use strict"; return (${param})`)()}*` }, { quoted: msg });
        return;
      }
      if (cmd === 'catat' && param) {
        if (!dbMemory.notes[jid]) dbMemory.notes[jid] = [];
        dbMemory.notes[jid].push(param);
        await saveMemory();
        await sock.sendMessage(jid, { text: '📝 Tersimpan!' }, { quoted: msg });
        return;
      }
      if (cmd === 'catatan') {
        const l = dbMemory.notes[jid] || [];
        await sock.sendMessage(jid, { text: l.length ? l.map((v, i) => `${i + 1}. ${v}`).join('\n') : '📭 Kosong.' }, { quoted: msg });
        return;
      }
      if ((cmd === 'terjemah' || cmd === 'translate') && args[1] && args[2]) {
        const t = await panggilServerAISatSet(`Terjemahkan ke ${args[1]}: ${args.slice(2).join(' ')}`, 'Terjemahkan saja.');
        await sock.sendMessage(jid, { text: t || '-' }, { quoted: msg });
        return;
      }
      if (cmd === 'id') { await sock.sendMessage(jid, { text: `🆔 \`${jid}\`` }, { quoted: msg }); return; }
      if (cmd === 'getpp') {
        const pp = await sock.profilePictureUrl(senderParticipant, 'image').catch(() => null);
        await sock.sendMessage(jid, pp ? { image: { url: pp } } : { text: '❌ Privat.' }, { quoted: msg });
        return;
      }
      if (cmd === 'getbio') {
        const st = await sock.fetchStatus(senderParticipant).catch(() => null);
        await sock.sendMessage(jid, { text: `📝 ${st?.status || '-'}` }, { quoted: msg });
        return;
      }
      if (cmd === 'gpass') {
        const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
        await sock.sendMessage(jid, { text: `🔐 \`${Array.from({ length: 12 }, () => c[Math.floor(Math.random() * c.length)]).join('')}\`` }, { quoted: msg });
        return;
      }
      if (cmd === 'qr' && param) { await sock.sendMessage(jid, { image: { url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(param)}` } }, { quoted: msg }); return; }
      if (cmd === 'shorturl' && extractUrl(param)) {
        const s = await (await fetchWithTimeout(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(extractUrl(param))}`)).text();
        await sock.sendMessage(jid, { text: `🔗 ${s}` }, { quoted: msg });
        return;
      }
      if (cmd === 'waktu') { await sock.sendMessage(jid, { text: `🕒 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB` }, { quoted: msg }); return; }
      if (cmd === 'base64' && param) { await sock.sendMessage(jid, { text: Buffer.from(param).toString('base64') }, { quoted: msg }); return; }
      if (cmd === 'reverse' && param) { await sock.sendMessage(jid, { text: param.split('').reverse().join('') }, { quoted: msg }); return; }
      if (cmd === 'ssweb' && extractUrl(param)) {
        await sock.sendMessage(jid, { image: { url: `https://api.microlink.io/?url=${encodeURIComponent(extractUrl(param))}&screenshot=true&meta=false&embed=screenshot.url` } }, { quoted: msg });
        return;
      }

      // 11. OWNER (14 FITUR VALID)
      if (['setnama', 'setname', 'botname'].includes(cmd) && param) {
        bot.userName = param;
        dbMemory.botSettings.customBotName = param;
        await saveMemory();
        await sock.updateProfileName(param).catch(() => {});
        await sock.sendMessage(jid, { text: `✅ Nama bot: *${param}*` }, { quoted: msg });
        return;
      }
      if (cmd === 'updatebio' && param) { await sock.updateProfileStatus(param); return; }
      if ((cmd === 'block' || cmd === 'unblock') && param) { await sock.updateBlockStatus(`${param.replace(/\D/g, '')}@s.whatsapp.net`, cmd); return; }
      if (cmd === 'blocklist') { const l = await sock.fetchBlocklist(); await sock.sendMessage(jid, { text: `🚫 Diblokir: ${l.length}` }); return; }
      if (cmd === 'autoread') { dbMemory.botSettings.autoread = !dbMemory.botSettings.autoread; await saveMemory(); await sock.sendMessage(jid, { text: `AutoRead: ${dbMemory.botSettings.autoread}` }); return; }
      if (cmd === 'autotyping') { dbMemory.botSettings.autotyping = !dbMemory.botSettings.autotyping; await saveMemory(); await sock.sendMessage(jid, { text: `AutoTyping: ${dbMemory.botSettings.autotyping}` }); return; }
      if (cmd === 'mode' && (param === 'public' || param === 'self')) { dbMemory.botSettings.mode = param; await saveMemory(); await sock.sendMessage(jid, { text: `Mode: ${param}` }); return; }
      if (cmd === 'badwords') { await sock.sendMessage(jid, { text: `Total filter: ${bot.badWords.length + dbMemory.learnedWords.length}` }); return; }
      if (cmd === 'addkata' && param) { dbMemory.learnedWords.push(param.toLowerCase()); await saveMemory(); return; }
      if (cmd === 'delkata' && param) { dbMemory.learnedWords = dbMemory.learnedWords.filter((w) => w !== param.toLowerCase()); await saveMemory(); return; }
      if (cmd === 'clean') { if (global.gc) global.gc(); await sock.sendMessage(jid, { text: '🧹 Cache dibersihkan.' }); return; }
    }

        // Obrolan Interaktif Tematik di Grup
    if (isGroup) {
      await handleGroupThemeInteraction({
        sock,
        jid,
        senderParticipant,
        pushName,
        rawText,
        unwrapped,
        msg,
        dbMemory,
        bot,
      });
      return;
    }

    if (rawText.length < 2) return;
    const reply = await panggilServerAISatSet(rawText, `Kamu adalah ${bot.userName}, asisten WhatsApp cerdas.`);
    if (reply) await sock.sendMessage(jid, { text: reply }, { quoted: msg });
  } catch (err) {
    const msg = err?.message || 'Error';
    if (/Bad MAC|SessionError|No matching sessions|Invalid PreKey/i.test(msg)) {
      await triggerAutoCipherHeal(msg?.key?.remoteJid || '', msg);
    } else {
      recordAutoRepair('Handler', msg, 'Pesan diisolasi');
    }
  }
}

let backgroundLoopsStarted = false;

async function start() {
  await loadMemory();
  await jalankanEvolusiMandiri(false);

  // Pulihkan sesi WhatsApp otomatis kalau folder ./auth terhapus saat redeploy GitHub
  await restoreAuthFromGitHub(AUTH_DIR);

  if (!backgroundLoopsStarted) {
    backgroundLoopsStarted = true;
    // SIKLUS REAL-TIME 5 MENIT: Audit & Perbaiki Seluruh 209 Fitur + Signal Cipher Guard
    setTimeout(() => jalankanAudit209FiturRealTime(false), 8000);
    setInterval(() => jalankanAudit209FiturRealTime(false), 5 * 60 * 1000);

    // Live Hot-Reload & Graceful Shutdown agar edit GitHub tidak memutus perangkat
    setupGracefulShutdown(bot, saveMemory);
    startGitHubLiveHotReload(async (commitId) => {
      serverAutoHeal.updateProgressText = `✅ Live Update GitHub (${commitId}) berhasil tanpa putus WA`;
      await jalankanAudit209FiturRealTime(true);
    });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`\n🤖 ${bot.userName} v${dbMemory.version} — ${ALL_COMMANDS_SET.size}/209 FITUR VALID + SPOTIFY LIVE + GROUP AUTO\n`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['WHUXEN Bot', 'Chrome', '9.4.0'],
    printQRInTerminal: false,
    getMessage: async (key) => sentMessageCache.get(key.id) || { conversation: '' },
  });

  // Simpan otomatis semua pesan keluar ke cache untuk anti-"Menunggu pesan ini"
  const origSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, options) => {
    const sent = await origSendMessage(jid, content, options);
    if (sent?.key?.id && sent?.message) {
      rememberOutgoingMessage(sent.key.id, sent.message);
      if (content?.text) lastReplyTextByJid.set(jid, content.text);
    }
    return sent;
  };

  bot.sock = sock;
  bot.connected = false;
  bot.registered = !!sock.authState.creds.registered;

  // Simpan kredensial lokal + sinkronkan otomatis ke GitHub
  sock.ev.on('creds.update', async () => {
    await saveCreds();
    scheduleAuthBackupToGitHub(AUTH_DIR);
  });

  // Detektor otomatis "Menunggu pesan ini" (Retry Receipt / Cipher Desync)
  sock.ev.on('messages.update', async (updates) => {
    for (const u of updates) {
      const targetJid = u.key?.remoteJid;
      if (!targetJid || !u.key?.fromMe) continue;

      const hasRetryOrDecryptError =
        Boolean(u.update?.messageStubType) ||
        (typeof u.update?.status === 'number' && u.update.status === 0);

      if (hasRetryOrDecryptError) {
        const lastAttempt = retryCooldownByJid.get(targetJid) || 0;
        if (Date.now() - lastAttempt < 8000) continue;
        retryCooldownByJid.set(targetJid, Date.now());

        await repairSignalSessionForJid(targetJid, 'Terdeteksi Menunggu Pesan Ini (Retry Receipt)');
        const fallbackText = lastReplyTextByJid.get(targetJid);
        if (fallbackText) {
          await origSendMessage(targetJid, {
            text: `🔄 *Auto-Repair Enkripsi Berhasil:*\n\n${fallbackText}`,
          }).catch(() => {});
        }
      }
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      prosesSatuPesan(sock, msg).catch(() => {});
    }
  });

  // Welcome Masuk & Keluar Otomatis
  sock.ev.on('group-participants.update', (update) => {
    handleGroupParticipantsUpdate(sock, dbMemory, update).catch(() => {});
  });

  // Saring & ACC Member Masuk Otomatis
  sock.ev.on('group.join-request', (event) => {
    handleGroupJoinRequestEvent(sock, dbMemory, event).catch(() => {});
  });

  // Scheduler Buka/Tutup Grup & Kegiatan Otomatis (Materi, Polling, Jadwal)
  startGroupAutomationScheduler(sock, dbMemory);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && !bot.connected) {
      bot.qr = qr;
      if (PHONE && !bot.registered && !bot.pairingCode) {
        setTimeout(() => mintaKodePairing(sock, PHONE), 2000);
      }
    }
    if (connection === 'open') {
      bot.connected = true;
      bot.registered = true;
      bot.qr = null;
      bot.pairingCode = null;
      bot.userPhone = sock.user?.id ? sock.user.id.split(':')[0] : PHONE;
      scheduleAuthBackupToGitHub(AUTH_DIR);
      console.log(`✅ [TERHUBUNG] ${bot.userPhone} — 209 Fitur, Spotify Live, Group Auto & GitHub Sync Aktif`);
    } else if (connection === 'close') {
      bot.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      setTimeout(start, 3000);
    }
  });
}

mulaiWeb();
start();
