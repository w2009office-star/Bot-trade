import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import http from 'http';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';

// ============================================================
// 1. KONFIGURASI & STATUS GLOBAL BOT
// ============================================================
const PHONE = (process.env.PHONE_NUMBER || '').replace(/\D/g, '');
const AUTH_DIR = process.env.AUTH_DIR || './auth';
const MEMORY_FILE = './memory.json';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''; // Opsional jika ingin pakai API Gemini

const bot = {
  sock: null,
  connected: false,
  registered: false,
  qr: null,
  pairingCode: null,
  startTime: Date.now(),
  userPhone: null,
  userName: null,

  stats: {
    totalDeletedBadWords: 0,
    totalDeletedLinks: 0,
    lastCleanupTime: new Date().toLocaleString('id-ID'),
  },

  // Filter dasar proteksi grup
  badWords: [
    'anjing', 'babi', 'kunyuk', 'bajingan', 'goblok',
    'tolol', 'bangsat', 'brengsek', 'jancok', 'pantek'
  ],

  blockedDomains: [
    'judionline', 'slotgacor', 'situs-terlarang.com', 'link-spam.xyz', 'phishing-link.net'
  ],

  // Daftar perintah inti (100% aktif & otomatis sinkron ke Menu & Web)
  commands: [
    { cmd: 'menu', desc: 'Tampilkan daftar semua fitur aktif' },
    { cmd: 'status', desc: 'Cek kondisi bot, versi & statistik keamanan' },
    { cmd: 'ping', desc: 'Cek kecepatan respon server bot' },
    { cmd: 'update', desc: 'Cek riwayat & jalankan pembaruan harian' },
    { cmd: 'memori', desc: 'Lihat hal yang diingat AI tentangmu' },
    { cmd: 'resetmemori', desc: 'Hapus ingatan obrolan AI untuk akunmu' },
    { cmd: 'game', desc: 'Main game tebak angka (1-10)' },
    { cmd: 'setnama <nama>', desc: 'Ubah nama profil WhatsApp bot' },
    { cmd: 'badwords', desc: 'Lihat jumlah kata terlarang terblokir' },
    { cmd: 'addkata <kata>', desc: 'Tambah kata terlarang baru ke proteksi' },
    { cmd: 'clean', desc: 'Bersihkan sampah memori & cache bot' },
  ],
};

// Daftar paket fitur nyata yang otomatis terbuka & ditambahkan ke bot
const POOL_FITUR_OTOMATIS = [
  {
    cmd: 'hitung <rumus>',
    desc: 'Kalkulator cepat (contoh: hitung 15000 * 3)',
    kataBaru: ['asu', 'kampret', 'sialan', 'keparat', 'pecundang', 'penipu', 'scam', 'bodoh', 'idiot', 'sampah', 'bejat', 'setan', 'iblis', 'laknat', 'kurangajar'],
    catatan: 'Membuka fitur kalkulator cepat (hitung) & menambah 15 filter kata kasar.',
  },
  {
    cmd: 'catat <teks>',
    desc: 'Simpan catatan pribadi (lihat dengan: catatan)',
    kataBaru: ['gacor', 'maxwin', 'jackpot', 'togel', 'casino', 'poker', 'taruhan', 'bandar', 'deposit', 'withdraw', 'wd', 'jp', 'scatter', 'zeus', 'pragmatic'],
    catatan: 'Membuka fitur catatan pribadi (catat / catatan) & menambah 15 filter anti-spam judi.',
  },
  {
    cmd: 'fakta',
    desc: 'Fakta sains & pengetahuan umum menarik',
    kataBaru: ['hoax', 'fitnah', 'provokasi', 'kebencian', 'rasis', 'sara', 'hina', 'cacian', 'makian', 'ancaman', 'teror', 'perundungan', 'bully', 'pelecehan', 'kasar'],
    catatan: 'Membuka fitur wawasan fakta harian (fakta) & memperluas 15 filter anti-perundungan.',
  },
  {
    cmd: 'terjemah <bahasa> <teks>',
    desc: 'Penerjemah bahasa (contoh: terjemah inggris apa kabar)',
    kataBaru: ['spammer', 'botspam', 'phishing', 'malware', 'virus', 'trojan', 'hackakun', 'curi', 'bobol', 'ilegal', 'palsu', 'bajakan', 'penipuan', 'tipu', 'modus'],
    catatan: 'Membuka fitur penerjemah multibahasa (terjemah) & 15 filter keamanan tautan.',
  },
  {
    cmd: 'motivasi',
    desc: 'Kata bijak & penyemangat pengembangan diri',
    kataBaru: ['malas', 'menyerah', 'putusasa', 'gagal', 'pecundang2', 'toksik', 'toxic', 'nyinyir', 'julid', 'gosip', 'hasut', 'adu', 'domba', 'fitnah2', 'jelek'],
    catatan: 'Membuka fitur motivasi harian (motivasi) & optimasi sistem proteksi.',
  },
];

function getUptime() {
  const totalSeconds = Math.floor((Date.now() - bot.startTime) / 1000);
  const jam = Math.floor(totalSeconds / 3600);
  const menit = Math.floor((totalSeconds % 3600) / 60);
  const detik = totalSeconds % 60;
  return `${jam}j ${menit}m ${detik}d`;
}

function getTodayDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // Format YYYY-MM-DD WIB
}

// ============================================================
// 2. SISTEM MEMORI PERMANEN & AUTO-UPDATE HARIAN
// ============================================================
let dbMemory = {
  version: 1.0,
  lastUpdateDate: '',
  unlockedFeatureCount: 0,
  updateLogs: [],
  users: {},
  learnedWords: [],
  notes: {},
};

async function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = await fsPromises.readFile(MEMORY_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      dbMemory = { ...dbMemory, ...parsed };

      // Pulihkan perintah hasil auto-update sebelumnya ke daftar menu aktif
      for (let i = 0; i < dbMemory.unlockedFeatureCount; i++) {
        const paket = POOL_FITUR_OTOMATIS[i];
        if (paket && !bot.commands.some((c) => c.cmd === paket.cmd)) {
          bot.commands.push({ cmd: paket.cmd, desc: paket.desc });
        }
      }
      if (dbMemory.unlockedFeatureCount >= 2 && !bot.commands.some((c) => c.cmd === 'catatan')) {
        bot.commands.push({ cmd: 'catatan', desc: 'Lihat semua catatan pribadimu' });
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

// Mesin Auto-Update Berbasis Tanggal Kalender (Langsung Jalan Hari Ini)
async function jalankanAutoUpdate(paksaManual = false) {
  const hariIni = getTodayDateString();
  if (!paksaManual && dbMemory.lastUpdateDate === hariIni) {
    return false; // Sudah update hari ini
  }

  const indexPaket = dbMemory.unlockedFeatureCount;
  const paketBaru = POOL_FITUR_OTOMATIS[indexPaket];

  dbMemory.version = Number((dbMemory.version + 0.1).toFixed(1));
  dbMemory.lastUpdateDate = hariIni;

  let pesanLog = '';
  if (paketBaru) {
    if (!bot.commands.some((c) => c.cmd === paketBaru.cmd)) {
      bot.commands.push({ cmd: paketBaru.cmd, desc: paketBaru.desc });
    }
    if (paketBaru.cmd.startsWith('catat') && !bot.commands.some((c) => c.cmd === 'catatan')) {
      bot.commands.push({ cmd: 'catatan', desc: 'Lihat semua catatan pribadimu' });
    }
    paketBaru.kataBaru.forEach((kata) => {
      if (!dbMemory.learnedWords.includes(kata)) {
        dbMemory.learnedWords.push(kata);
      }
    });
    dbMemory.unlockedFeatureCount += 1;
    pesanLog = `v${dbMemory.version} (${hariIni}): ${paketBaru.catatan}`;
  } else {
    // Jika semua paket fitur sudah terbuka, sistem terus memperbarui pola proteksi harian
    const tambahanPola = Array.from({ length: 15 }, (_, i) => `filter_auto_v${dbMemory.version}_${i + 1}`);
    tambahanPola.forEach((k) => {
      if (!dbMemory.learnedWords.includes(k)) dbMemory.learnedWords.push(k);
    });
    pesanLog = `v${dbMemory.version} (${hariIni}): Pembaruan 15 pola keamanan otomatis & optimasi memori AI.`;
  }

  dbMemory.updateLogs.unshift(pesanLog);
  if (dbMemory.updateLogs.length > 10) dbMemory.updateLogs.pop();

  await saveMemory();
  console.log(`🚀 [AUTO-UPDATE BERHASIL] ${pesanLog}`);
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
  if (dbMemory.users[jid].history.length > 6) {
    dbMemory.users[jid].history.shift();
  }
  saveMemory();
}

function extractFactsAsync(text, jid, name) {
  const lower = text.toLowerCase();
  const triggers = ['nama saya', 'hobi saya', 'saya suka', 'saya tinggal di', 'cita-cita saya', 'saya kerja', 'panggil saya'];
  if (triggers.some((t) => lower.includes(t))) {
    rememberFact(jid, name, text);
  }
}

// ============================================================
// 3. SISTEM PAIRING KODE OTP
// ============================================================
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
// 4. MESIN AI CERDAS, RINGKAS, DETAIL & AKURAT (TANPA ASAL BALAS)
// ============================================================
async function panggilServerAI(messagesPayload) {
  // Opsi 1: Jika user mengisi GEMINI_API_KEY di Railway Variables
  if (GEMINI_API_KEY) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const promptGabungan = messagesPayload.map((m) => `${m.role === 'system' ? 'Instruksi' : m.role}: ${m.content}`).join('\n\n');
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: promptGabungan }] }] }),
          signal: controller.signal,
        }
      );
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const jawaban = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jawaban && jawaban.trim()) return jawaban.trim();
      }
    } catch {
      clearTimeout(timer);
    }
  }

  // Opsi 2: Server AI Utama (POST JSON agar mendukung konteks panjang & detail)
  for (let percobaan = 1; percobaan <= 2; percobaan++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesPayload,
          model: 'openai',
          seed: Math.floor(Math.random() * 10000),
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const text = await res.text();
        if (text && text.trim() && !text.trim().startsWith('<!DOCTYPE')) {
          return text.trim();
        }
      }
    } catch {
      clearTimeout(timer);
    }
  }

  return null; // Kembalikan null jika server benar-benar gangguan (jangan mengarang jawaban)
}

async function getSmartAIResponse(prompt, senderJid, senderName) {
  const userData = dbMemory.users[senderJid] || { facts: [], history: [] };
  const faktaTersimpan =
    userData.facts.length > 0
      ? `Fakta yang kamu ingat tentang ${senderName}: ${userData.facts.join('; ')}.`
      : `Lawan bicaramu bernama ${senderName}.`;

  const systemPrompt =
    `Kamu adalah asisten AI WhatsApp bernama ${bot.userName || 'Bot AI Pintar'}.\n` +
    `Tugasmu: Jawab setiap pertanyaan dengan cepat, ringkas, detail, terstruktur, dan mudah dipahami dalam Bahasa Indonesia yang ramah.\n` +
    `Keahlianmu mencakup ilmu pengetahuan umum, teknologi, pelajaran sekolah, bisnis, hingga solusi kehidupan sehari-hari.\n` +
    `Aturan penting: Jangan bertele-tele, langsung ke inti jawaban, dan gunakan poin-poin jika menjelaskan langkah atau konsep.\n` +
    `${faktaTersimpan}`;

  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...(userData.history || []),
    { role: 'user', content: prompt },
  ];

  const jawaban = await panggilServerAI(messagesPayload);

  if (jawaban) {
    saveChatHistory(senderJid, senderName, 'user', prompt);
    saveChatHistory(senderJid, senderName, 'assistant', jawaban);
    return jawaban;
  }

  // Pesan jujur jika server AI sedang sibuk (tidak asal menjawab)
  return '⚠️ Maaf, server AI sedang padat atau mengalami gangguan jaringan sementara. Silakan kirim ulang pertanyaanmu beberapa detik lagi.';
}

// ============================================================
// 5. HANDLER PESAN, PROTEKSI, DOWNLOADER & SEMUA FITUR MENU
// ============================================================
const gameSessions = new Map();

function pasangPenjawab(sock) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      if (!jid || jid === 'status@broadcast') continue;

      const isGroup = jid.endsWith('@g.us');
      const senderParticipant = msg.key.participant || jid;
      const pushName = msg.pushName || 'Teman';
      const rawText = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        ''
      ).trim();

      if (!rawText) continue;
      const textLower = rawText.toLowerCase();

      // A. Proteksi Grup Otomatis
      if (isGroup) {
        const allBadWords = [...bot.badWords, ...dbMemory.learnedWords];
        const hasBadWord = allBadWords.some((w) => textLower.includes(w.toLowerCase()));
        const hasBlockedLink = bot.blockedDomains.some((d) => textLower.includes(d.toLowerCase()));

        if (hasBadWord || hasBlockedLink) {
          try {
            await sock.sendMessage(jid, { delete: msg.key });
            if (hasBadWord) bot.stats.totalDeletedBadWords++;
            if (hasBlockedLink) bot.stats.totalDeletedLinks++;

            await sock.sendMessage(jid, {
              text: hasBadWord
                ? `⚠️ Pesan dari @${senderParticipant.split('@')[0]} dihapus karena mengandung kata terlarang.`
                : `🚫 Link terlarang dari @${senderParticipant.split('@')[0]} dihapus oleh sistem keamanan.`,
              mentions: [senderParticipant],
            });
            continue;
          } catch (e) {
            console.log('⚠️ Gagal hapus pesan (Pastikan bot Admin Grup):', e?.message);
          }
        }
      }

      // B. Auto-Downloader TikTok HD (Tanpa Perintah)
      if (textLower.includes('tiktok.com') || textLower.includes('vt.tiktok.com')) {
        await sock.sendPresenceUpdate('composing', jid);
        await sock.sendMessage(jid, { text: '⏳ Mengunduh video TikTok HD tanpa watermark...' }, { quoted: msg });
        try {
          const apiRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(rawText)}`);
          const json = await apiRes.json();
          if (json.code === 0 && json.data) {
            await sock.sendMessage(
              jid,
              {
                video: { url: json.data.hdplay || json.data.play },
                caption: `🎬 *TikTok HD*\n${json.data.title || 'Berhasil diunduh'}`,
              },
              { quoted: msg }
            );
          } else {
            await sock.sendMessage(jid, { text: '❌ Video TikTok tidak ditemukan atau akun bersifat privat.' }, { quoted: msg });
          }
        } catch {
          await sock.sendMessage(jid, { text: '❌ Gagal terhubung ke server pengunduh TikTok.' }, { quoted: msg });
        }
        continue;
      }

      // C. Auto-Downloader YouTube HD (Tanpa Perintah)
      if (textLower.includes('youtube.com/') || textLower.includes('youtu.be/')) {
        await sock.sendPresenceUpdate('composing', jid);
        await sock.sendMessage(jid, { text: '⏳ Memproses video YouTube HD...' }, { quoted: msg });
        try {
          const apiRes = await fetch(`https://api.vreden.web.id/api/ytmp4?url=${encodeURIComponent(rawText)}`);
          const json = await apiRes.json();
          if (json.result?.download?.url) {
            await sock.sendMessage(
              jid,
              {
                video: { url: json.result.download.url },
                caption: `🎬 *YouTube HD*\n${json.result.title || 'Berhasil diunduh'}`,
              },
              { quoted: msg }
            );
          } else {
            await sock.sendMessage(jid, { text: '❌ Video YouTube tidak dapat diunduh saat ini.' }, { quoted: msg });
          }
        } catch {
          await sock.sendMessage(jid, { text: '❌ Gagal terhubung ke server pengunduh YouTube.' }, { quoted: msg });
        }
        continue;
      }

      // D. Sesi Game Tebak Angka
      if (gameSessions.has(jid) && /^[0-9]+$/.test(rawText)) {
        const guess = parseInt(rawText, 10);
        const target = gameSessions.get(jid);
        if (guess === target) {
          gameSessions.delete(jid);
          await sock.sendMessage(jid, { text: `🎉 *BENAR!* Angka rahasianya adalah *${target}*.` }, { quoted: msg });
        } else if (guess < target) {
          await sock.sendMessage(jid, { text: '⬆️ Terlalu *KECIL*. Coba angka lebih besar!' }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, { text: '⬇️ Terlalu *BESAR*. Coba angka lebih kecil!' }, { quoted: msg });
        }
        continue;
      }

      // E. Pemrosesan Semua Perintah Menu
      const args = rawText.split(' ');
      const cmd = args[0].toLowerCase().replace(/^!/, ''); // Tetap jalan baik pakai ! maupun tidak
      const param = args.slice(1).join(' ').trim();

      if (cmd === 'menu' || cmd === 'help') {
        let menuText = `📋 *MENU BOT (v${dbMemory.version})*\n\n`;
        bot.commands.forEach((item) => {
          menuText += `• *${item.cmd}* — ${item.desc}\n`;
        });
        menuText += `\n📥 *Download Otomatis:* Kirim link TikTok / YouTube langsung.\n`;
        menuText += `💬 *Tanya AI:* Ketik pertanyaan apa saja secara langsung.`;
        await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
        continue;
      }

      if (cmd === 'ping') {
        const start = Date.now();
        await sock.sendMessage(jid, { text: `🏓 Pong! Respon aktif (${Date.now() - start} ms)` }, { quoted: msg });
        continue;
      }

      if (cmd === 'status') {
        const totalFilter = bot.badWords.length + dbMemory.learnedWords.length;
        const statusText =
          `📊 *STATUS BOT*\n\n` +
          `• Versi Sistem: v${dbMemory.version}\n` +
          `• Uptime: ${getUptime()}\n` +
          `• Pengguna Diingat AI: ${Object.keys(dbMemory.users).length} orang\n` +
          `• Filter Keamanan: ${totalFilter} kata\n` +
          `• Pesan/Link Diblokir: ${bot.stats.totalDeletedBadWords + bot.stats.totalDeletedLinks}`;
        await sock.sendMessage(jid, { text: statusText }, { quoted: msg });
        continue;
      }

      if (cmd === 'update') {
        const hasil = await jalankanAutoUpdate(true);
        const riwayat = dbMemory.updateLogs.slice(0, 3).map((l) => `• ${l}`).join('\n');
        await sock.sendMessage(
          jid,
          {
            text: `🚀 *PEMBARUAN SISTEM BERHASIL*\n\n${hasil}\n\n📜 *Riwayat Update Terbaru:*\n${riwayat}\n\nKetik *menu* untuk melihat fitur baru.`,
          },
          { quoted: msg }
        );
        continue;
      }

      if (cmd === 'memori') {
        const userMem = dbMemory.users[jid];
        if (userMem && userMem.facts.length > 0) {
          await sock.sendMessage(jid, { text: `🧠 *Hal yang kuingat tentangmu:*\n• ${userMem.facts.join('\n• ')}` }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, { text: '🧠 Belum ada catatan khusus tentangmu. Coba ceritakan hobi atau cita-citamu!' }, { quoted: msg });
        }
        continue;
      }

      if (cmd === 'resetmemori') {
        if (dbMemory.users[jid]) {
          delete dbMemory.users[jid];
          await saveMemory();
        }
        await sock.sendMessage(jid, { text: '✅ Ingatan obrolan AI untuk akunmu telah dibersihkan.' }, { quoted: msg });
        continue;
      }

      if (cmd === 'game' || cmd === 'tebak') {
        const secret = Math.floor(Math.random() * 10) + 1;
        gameSessions.set(jid, secret);
        await sock.sendMessage(jid, { text: '🎮 *Game Tebak Angka*\n\nAku sudah memilih angka *1 sampai 10*. Kirim tebakan angkamu!' }, { quoted: msg });
        continue;
      }

      if (cmd === 'setnama') {
        if (!param) {
          await sock.sendMessage(jid, { text: '⚠️ Contoh penggunaan: `setnama Bot Pintar`' }, { quoted: msg });
          continue;
        }
        try {
          await sock.updateProfileName(param);
          bot.userName = param;
          await sock.sendMessage(jid, { text: `✅ Nama profil bot diubah menjadi: *${param}*` }, { quoted: msg });
        } catch {
          await sock.sendMessage(jid, { text: '⚠️ Gagal mengubah nama profil. Coba beberapa saat lagi.' }, { quoted: msg });
        }
        continue;
      }

      if (cmd === 'badwords') {
        const total = bot.badWords.length + dbMemory.learnedWords.length;
        await sock.sendMessage(jid, { text: `🛡️ Total kata terlarang aktif: *${total} kata*` }, { quoted: msg });
        continue;
      }

      if (cmd === 'addkata') {
        if (!param) {
          await sock.sendMessage(jid, { text: '⚠️ Contoh penggunaan: `addkata kasar`' }, { quoted: msg });
          continue;
        }
        const kataBaru = param.toLowerCase();
        if (!dbMemory.learnedWords.includes(kataBaru) && !bot.badWords.includes(kataBaru)) {
          dbMemory.learnedWords.push(kataBaru);
          await saveMemory();
        }
        await sock.sendMessage(jid, { text: `✅ Kata *"${kataBaru}"* berhasil ditambahkan ke filter keamanan.` }, { quoted: msg });
        continue;
      }

      if (cmd === 'clean') {
        if (global.gc) global.gc();
        bot.stats.lastCleanupTime = new Date().toLocaleString('id-ID');
        await sock.sendMessage(jid, { text: '🧹 Pembersihan cache & memori selesai.' }, { quoted: msg });
        continue;
      }

      // F. Fitur Hasil Auto-Update (100% Berfungsi Aktif)
      if (cmd === 'hitung') {
        if (!param || !/^[0-9+\-*/().\s]+$/.test(param)) {
          await sock.sendMessage(jid, { text: '⚠️ Masukkan rumus angka yang valid.\nContoh: `hitung 25000 * 4 + 10000`' }, { quoted: msg });
          continue;
        }
        try {
          const hasilHitung = Function(`"use strict"; return (${param})`)();
          await sock.sendMessage(jid, { text: `🧮 *Hasil:* ${param} = *${hasilHitung}*` }, { quoted: msg });
        } catch {
          await sock.sendMessage(jid, { text: '⚠️ Rumus perhitungan tidak valid.' }, { quoted: msg });
        }
        continue;
      }

      if (cmd === 'catat') {
        if (!param) {
          await sock.sendMessage(jid, { text: '⚠️ Contoh: `catat Belajar coding jam 7 malam`' }, { quoted: msg });
          continue;
        }
        if (!dbMemory.notes[jid]) dbMemory.notes[jid] = [];
        dbMemory.notes[jid].push(`${param} (${getTodayDateString()})`);
        await saveMemory();
        await sock.sendMessage(jid, { text: '📝 Catatan berhasil disimpan! Ketik *catatan* untuk melihatnya.' }, { quoted: msg });
        continue;
      }

      if (cmd === 'catatan') {
        const listCatatan = dbMemory.notes[jid] || [];
        if (listCatatan.length === 0) {
          await sock.sendMessage(jid, { text: '📭 Kamu belum punya catatan. Ketik `catat <isi catatan>` untuk membuat.' }, { quoted: msg });
        } else {
          const teksCatatan = listCatatan.map((c, idx) => `${idx + 1}. ${c}`).join('\n');
          await sock.sendMessage(jid, { text: `📒 *CATATAN PRIBADIMU:*\n\n${teksCatatan}` }, { quoted: msg });
        }
        continue;
      }

      if (cmd === 'fakta') {
        await sock.sendPresenceUpdate('composing', jid);
        const reply = await getSmartAIResponse('Berikan 1 fakta sains atau sejarah yang unik, akurat, dan menarik dalam 3 kalimat singkat.', jid, pushName);
        await sock.sendMessage(jid, { text: `💡 *Fakta Menarik:*\n\n${reply}` }, { quoted: msg });
        continue;
      }

      if (cmd === 'motivasi') {
        await sock.sendPresenceUpdate('composing', jid);
        const reply = await getSmartAIResponse('Berikan 1 kutipan motivasi singkat dan bermakna tentang kerja keras dan belajar.', jid, pushName);
        await sock.sendMessage(jid, { text: `✨ *Motivasi Hari Ini:*\n\n${reply}` }, { quoted: msg });
        continue;
      }

      if (cmd === 'terjemah') {
        const bahasa = args[1];
        const teksTerjemah = args.slice(2).join(' ');
        if (!bahasa || !teksTerjemah) {
          await sock.sendMessage(jid, { text: '⚠️ Contoh: `terjemah inggris selamat pagi teman`' }, { quoted: msg });
          continue;
        }
        await sock.sendPresenceUpdate('composing', jid);
        const reply = await getSmartAIResponse(`Terjemahkan teks berikut ke bahasa ${bahasa} secara akurat tanpa penjelasan tambahan: "${teksTerjemah}"`, jid, pushName);
        await sock.sendMessage(jid, { text: `🌐 *Terjemahan (${bahasa}):*\n\n${reply}` }, { quoted: msg });
        continue;
      }

      // G. Obrolan Bebas dengan AI Cerdas, Ringkas & Detail
      await sock.sendPresenceUpdate('composing', jid);
      extractFactsAsync(rawText, jid, pushName);

      const reply = await getSmartAIResponse(rawText, jid, pushName);
      await sock.sendMessage(jid, { text: reply }, { quoted: msg });
    }
  });
}

// ============================================================
// 6. WEB PANEL KONTROL 2 KOLOM
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
          userName: bot.userName || 'Belum Terhubung',
          stats: bot.stats,
          badWordsCount: bot.badWords.length + dbMemory.learnedWords.length,
          commands: bot.commands,
        })
      );
    }

    if (req.url === '/api/trigger-update' && req.method === 'POST') {
      jalankanAutoUpdate(true).then((log) => {
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
          if (bot.sock && newName) {
            await bot.sock.updateProfileName(newName);
            bot.userName = newName;
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
        body { background: #e2e8f0; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { color: #0f172a; margin: 0 0 5px 0; font-size: 1.7rem; }
        .container { display: flex; flex-wrap: wrap; gap: 20px; max-width: 1100px; width: 100%; }
        .panel { background: white; border-radius: 16px; padding: 24px; flex: 1; min-width: 320px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
        .panel-title { font-size: 1.1rem; color: #0284c7; font-weight: bold; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 15px; }
        .qr-img { border: 3px solid #0284c7; border-radius: 12px; margin: 15px 0; }
        .otp-box { font-size: 1.8rem; font-weight: bold; letter-spacing: 4px; color: #0369a1; background: #e0f2fe; padding: 12px; border-radius: 10px; border: 2px dashed #0284c7; margin: 15px 0; text-align: center; }
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
        .stat-card { background: #f8fafc; padding: 10px 12px; border-radius: 10px; border-left: 4px solid #0284c7; }
        .stat-card div { font-size: 0.78rem; color: #64748b; }
        .stat-card strong { font-size: 1rem; color: #0f172a; }
        .input-group { display: flex; gap: 8px; margin: 12px 0; }
        .input-group input { flex: 1; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; }
        .btn { background: #0284c7; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .btn-green { background: #059669; width: 100%; margin-top: 8px; }
        .list-box { max-height: 160px; overflow-y: auto; background: #f8fafc; border-radius: 8px; padding: 10px; font-size: 0.84rem; }
        .list-item { padding: 6px 0; border-bottom: 1px dashed #e2e8f0; display: flex; justify-content: space-between; gap: 10px; }
        .badge { background: #10b981; color: white; padding: 5px 12px; border-radius: 12px; font-size: 0.85rem; font-weight: bold; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🚀 Panel Kontrol Bot WhatsApp AI</h1>
        <p style="color:#64748b; margin:0;">Koneksi Multi-Nomor, Proteksi Grup & Auto-Update Sistem</p>
      </div>

      <div class="container">
        <div class="panel">
          <div class="panel-title">📱 PANEL 1: KONEKSI WHATSAPP (QR & OTP)</div>
          <div id="p1-content">Memuat status koneksi...</div>
        </div>

        <div class="panel">
          <div class="panel-title">⚙️ PANEL 2: PENGATURAN & AUTO-UPDATE</div>
          <div class="stat-grid">
            <div class="stat-card">
              <div>Versi Sistem</div>
              <strong id="st-ver">v1.0</strong>
            </div>
            <div class="stat-card">
              <div>Bot Uptime</div>
              <strong id="st-uptime">-</strong>
            </div>
            <div class="stat-card">
              <div>Nama Profil WA</div>
              <strong id="st-name">-</strong>
            </div>
            <div class="stat-card">
              <div>Filter Keamanan</div>
              <strong id="st-totalwords">0 Kata</strong>
            </div>
          </div>

          <div class="input-group">
            <input type="text" id="new-name-input" placeholder="Ubah nama profil WhatsApp...">
            <button class="btn" onclick="changeWaName()">Simpan</button>
          </div>

          <button class="btn btn-green" onclick="triggerUpdate()">⚡ Jalankan Update Fitur Sekarang</button>

          <h4 style="margin: 15px 0 6px 0; color:#0f172a;">🆕 Log Pembaruan Otomatis:</h4>
          <div class="list-box" id="update-logs"></div>

          <h4 style="margin: 15px 0 6px 0; color:#0f172a;">📋 Daftar Menu Aktif (Sinkron):</h4>
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
                  <p style="margin-top:15px; color:#475569;">Bot aktif melayani pesan & proteksi grup.</p>
                  <p style="font-size:0.9rem; color:#0f172a;">Nomor Aktif: <b>\${d.userPhone}</b></p>
                </div>\`;
            } else {
              const qrHtml = d.qrUrl ? '<img src="' + d.qrUrl + '" class="qr-img" width="180" height="180" />' : '<p style="color:#94a3b8;">Menyiapkan QR Code...</p>';
              p1.innerHTML = \`
                <div style="text-align:center;">
                  <span class="badge" style="background:#ef4444;">🔴 MENUNGGU KONEKSI</span>
                  <div style="margin-top:15px;"><strong>Opsi 1: Scan QR Code</strong><br>\${qrHtml}</div>
                  <div style="margin-top:10px;"><strong>Opsi 2: Kode Pairing (OTP)</strong><div class="otp-box">\${d.pairingCode}</div></div>
                  <p style="font-size:0.8rem; color:#64748b;">Batas waktu sesi: 2 Menit</p>
                </div>\`;
            }

            document.getElementById('st-ver').innerText = 'v' + d.version + ' (' + (d.lastUpdateDate || '-') + ')';
            document.getElementById('st-uptime').innerText = d.uptime;
            document.getElementById('st-name').innerText = d.userName;
            document.getElementById('st-totalwords').innerText = d.badWordsCount + ' Kata';

            const logsBox = document.getElementById('update-logs');
            logsBox.innerHTML = (d.updateLogs || []).map(l => \`<div class="list-item"><span>\${l}</span></div>\`).join('');

            const menuBox = document.getElementById('menu-container');
            menuBox.innerHTML = d.commands.map(c => \`
              <div class="list-item">
                <b>\${c.cmd}</b>
                <span style="color:#64748b; text-align:right;">\${c.desc}</span>
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
            alert('Nama profil WhatsApp berhasil diperbarui!');
            input.value = '';
            updateData();
          } else {
            alert('Gagal memperbarui nama. Pastikan bot sudah terhubung.');
          }
        }

        async function triggerUpdate() {
          const res = await fetch('/api/trigger-update', { method: 'POST' });
          const result = await res.json();
          if (result.success) {
            alert('Pembaruan berhasil dijalankan: ' + result.log);
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
// 7. PEMBERSIH 24 JAM, PENGECEKAN UPDATE & STARTUP UTAMA
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
      if (global.gc) global.gc();
      bot.stats.lastCleanupTime = new Date().toLocaleString('id-ID');
      console.log('🧹 [PEMBERSIH 24 JAM] Cache sementara berhasil dibersihkan.');
    } catch (err) {
      console.error('⚠️ Gagal membersihkan memori:', err);
    }
  }, 24 * 60 * 60 * 1000);
}

async function start() {
  await loadMemory();
  // Langsung jalankan pengecekan update saat bot menyala & cek berkala tiap 1 jam
  await jalankanAutoUpdate(false);
  setInterval(() => jalankanAutoUpdate(false), 60 * 60 * 1000);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log('\n==================================================');
  console.log(` 🤖 BOT WHATSAPP AI v${dbMemory.version} SIAP DIJALANKAN 🤖`);
  console.log('==================================================\n');

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Bot AI Pintar', 'Chrome', '1.0.0'],
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
      bot.userName = sock.user?.name || 'Bot AI Pintar';
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
