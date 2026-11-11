import fs from 'fs';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal'; // Pastikan install: npm install qrcode-terminal
import { bot } from './status.js';
import { mulaiWeb } from './web.js';
import { pasangPenjawab } from './handler.js';
import { mintaKodePairing } from './pairing.js';

const PHONE = (process.env.PHONE_NUMBER || '').replace(/\D/g, '');
const AUTH_DIR = process.env.AUTH_DIR || './auth';

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['WA Bot', 'Chrome', '1.0.0'],
    printQRInTerminal: !PHONE // Jangan print QR bawaan Baileys jika ada nomor HP
  });

  bot.sock = sock;
  bot.connected = false;
  bot.registered = !!sock.authState.creds.registered;
  
  if (!bot.registered && PHONE) {
    mintaKodePairing(sock, PHONE);
  }

  sock.ev.on('creds.update', saveCreds);
  pasangPenjawab(sock);

  // Timer 2 menit (120.000 ms) untuk mengulang proses OTP/QR
  const timerKoneksi = setTimeout(() => {
    if (!bot.connected) {
      console.log('⏳ Batas waktu 2 menit habis! Memuat ulang kode OTP / QR...');
      sock.ws.close(); // Memaksa tutup socket agar masuk ke event 'close' dan merestart
    }
  }, 120000);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    // Memunculkan QR Code di terminal jika tidak menggunakan fitur OTP/Phone
    if (qr && !PHONE) {
      console.log('\n--- SCAN QR CODE (Batas Waktu 2 Menit) ---');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      clearTimeout(timerKoneksi); // Hentikan timer jika bot berhasil masuk
      bot.connected = true;
      bot.registered = true;
      console.log('✅ Bot terhubung ke WhatsApp');
    } else if (connection === 'close') {
      clearTimeout(timerKoneksi); // Hentikan timer jika koneksi terputus
      bot.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('❌ Logout. Sesi dihapus, hubungkan ulang lewat halaman web.');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
      start(); // Mulai ulang koneksi
    }
  });
}

mulaiWeb();
start();
