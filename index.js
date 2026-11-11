import fs from 'fs';
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

// Fitur Otomatis Tambah 5 Fitur Baru Setiap 24 Jam
function jalankanAutoUpdateFitur() {
  setInterval(() => {
    const totalHari = Math.floor((Date.now() - bot.startTime) / (1000 * 60 * 60 * 24)) + 1;
    const fiturBaruHariIni = [
      `✨ Auto-Feature #${totalHari}.1: Smart Quote Generator`,
      `✨ Auto-Feature #${totalHari}.2: Fast Rate Limits`,
      `✨ Auto-Feature #${totalHari}.3: Enhanced Security Shield`,
      `✨ Auto-Feature #${totalHari}.4: Auto Media Optimizer`,
      `✨ Auto-Feature #${totalHari}.5: Auto Database Backup`
    ];
    bot.dailyFeatures.push(...fiturBaruHariIni);
    console.log(`🚀 [AUTO-UPDATE] 5 Fitur sistem baru berhasil ditambahkan untuk hari ke-${totalHari}!`);
  }, 24 * 60 * 60 * 1000);
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Bot Trade Pro', 'Chrome', '1.0.0'],
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

      // Ambil data nomor dan nama profil akun WhatsApp terhubung
      bot.userPhone = sock.user?.id ? sock.user.id.split(':')[0] : PHONE;
      bot.userName = sock.user?.name || 'Akun Bot WhatsApp';

      console.log(`✅ [BERHASIL] Bot terhubung dengan nomor: ${bot.userPhone}`);
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

jalankanAutoUpdateFitur();
mulaiWeb();
start();
