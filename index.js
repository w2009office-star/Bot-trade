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

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log('\n=========================================');
  console.log(' 🚀 MEMULAI BOT WHATSAPP PUBLIK TRADE 🚀');
  console.log('=========================================\n');

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Bot Trade Public', 'Chrome', '1.0.0'],
    printQRInTerminal: false
  });

  bot.sock = sock;
  bot.connected = false;
  bot.registered = !!sock.authState.creds.registered;

  sock.ev.on('creds.update', saveCreds);
  pasangPenjawab(sock);

  // Batas waktu 2 menit untuk menghubungkan nomor bot pertama kali
  const timerKoneksi = setTimeout(() => {
    if (!bot.connected) {
      console.log('⏳ [TIMER 2 MENIT] Batas waktu habis. Mengulang sesi...');
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
      console.log('✅ [BERHASIL] Bot Aktif & Siap Melayani Publik!');
    } else if (connection === 'close') {
      clearTimeout(timerKoneksi);
      bot.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('❌ [LOGOUT] Sesi dihapus. Membuka sesi baru...');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
      setTimeout(start, 3000);
    }
  });
}

mulaiWeb();
start();
