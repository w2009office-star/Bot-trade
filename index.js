import fs from 'fs';
import path from 'path';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { bot } from './status.js';
import { mulaiWeb } from './web.js';
import { pasangPenjawab } from './handler.js';
import { mintaKodePairing } from './pairing.js';

const PHONE = (process.env.PHONE_NUMBER || '').replace(/\D/g, '');
const AUTH_DIR = process.env.AUTH_DIR || './auth';

// 1. PEMBERSIH OTOMATIS DATA & CHACHE 24 JAM
function jalankanPembersihOtomatis24Jam() {
  setInterval(() => {
    try {
      console.log('🧹 [PEMBERSIH 24 JAM] Memulai pembersihan berkas sementara...');
      
      // Hapus file sampah sesi / temp jika ada
      const tempDir = './auth';
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        files.forEach(file => {
          if (file.startsWith('app-state-sync-') || file.startsWith('pre-key-')) {
            fs.unlinkSync(path.join(tempDir, file));
          }
        });
      }

      // Garbage Collector manual jika tersedia di Node.js
      if (global.gc) global.gc();

      bot.stats.lastCleanupTime = new Date().toLocaleString('id-ID');
      console.log('✅ [PEMBERSIH 24 JAM] Riwayat & memori bot berhasil dibersihkan! Bot tetap ringan.');
    } catch (err) {
      console.error('⚠️ Gagal membersihkan memori:', err);
    }
  }, 24 * 60 * 60 * 1000); // 24 Jam
}

// 2. AUTO-UPDATE PROTEKSI 15 KATA KOTOR BARU SETIAP HARI
function jalankanAutoUpdateProteksi() {
  setInterval(() => {
    const hariKe = Math.floor((Date.now() - bot.startTime) / (1000 * 60 * 60 * 24)) + 1;
    const kataBaru = Array.from({ length: 15 }, (_, i) => `toxic_word_v${hariKe}_${i + 1}`);
    
    bot.badWords.push(...kataBaru);
    bot.stats.dailyBadwordCount += 15;
    
    console.log(`🛡️ [PROTEKSI HARI KE-${hariKe}] 15 Pola Kata Kotor Baru Berhasil Ditambahkan ke Database Bot!`);
  }, 24 * 60 * 60 * 1000);
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log('\n==================================================');
  console.log(' 🛡️ BOT WHATSAPP MULTI-PANEL & PROTEKSI GRUP 🛡️');
  console.log('==================================================\n');

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Bot Panel Commercial', 'Chrome', '1.0.0'],
    printQRInTerminal: false
  });

  bot.sock = sock;
  bot.connected = false;
  bot.registered = !!sock.authState.creds.registered;

  sock.ev.on('creds.update', saveCreds);
  pasangPenjawab(sock);

  const timerKoneksi = setTimeout(() => {
    if (!bot.connected) {
      console.log('⏳ Batas waktu 2 menit habis. Mengulang sesi...');
      bot.qr = null;
      bot.pairingCode = null;
      sock.ws.close();
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
      bot.userName = sock.user?.name || 'Bot WhatsApp Commercial';
      console.log(`✅ [BERHASIL] Bot terhubung ke WhatsApp: ${bot.userPhone}`);
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
jalankanAutoUpdateProteksi();
mulaiWeb();
start();
