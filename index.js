import fs from 'fs';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { bot } from './status.js';
import { mulaiWeb } from './web.js';
import { pasangPenjawab } from './handler.js';
import { mintaKodePairing } from './pairing.js';

const PHONE = (process.env.PHONE_NUMBER || '').replace(/\D/g, '');
const AUTH_DIR = process.env.AUTH_DIR || './auth';

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  // Tampilan Header Terminal yang Elegan
  console.log('\n=========================================');
  console.log(' 🌟 MEMULAI SISTEM BOT WHATSAPP TRADE 🌟');
  console.log('=========================================\n');

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }), // Menyembunyikan log rumit bawaan Baileys
    browser: ['Bot Trade Pro', 'Chrome', '1.0.0'],
    printQRInTerminal: !PHONE
  });

  bot.sock = sock;
  bot.connected = false;
  bot.registered = !!sock.authState.creds.registered;
  
  if (!bot.registered && PHONE) {
    console.log(`📡 Meminta kode OTP untuk nomor: ${PHONE}...`);
    mintaKodePairing(sock, PHONE);
  }

  sock.ev.on('creds.update', saveCreds);
  pasangPenjawab(sock);

  // Timer 2 menit (120.000 ms) yang dikemas lebih informatif
  const timerKoneksi = setTimeout(() => {
    if (!bot.connected) {
      console.log('\n⏳ [WAKTU HABIS] Batas waktu 2 menit telah lewat.');
      console.log('🔄 Memuat ulang sistem untuk mendapatkan sesi baru...\n');
      sock.ws.close(); 
    }
  }, 120000);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr && !PHONE) {
      console.log('\n📌 [TINDAKAN DIPERLUKAN]');
      console.log('Silakan scan QR Code di bawah ini menggunakan WhatsApp.');
      console.log('Batas waktu scan: 2 Menit.\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      clearTimeout(timerKoneksi);
      bot.connected = true;
      bot.registered = true;
      console.log('\n✅ [BERHASIL] Bot telah terhubung ke WhatsApp!');
      console.log('✨ Sistem siap digunakan.\n');
    } else if (connection === 'close') {
      clearTimeout(timerKoneksi);
      bot.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      
      if (code === DisconnectReason.loggedOut) {
        console.log('\n❌ [LOGOUT] Sesi terputus. Menghapus data sesi lama...');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      } else {
        console.log('\n⚠️ [TERPUTUS] Koneksi hilang. Mencoba menyambung ulang...\n');
      }
      start();
    }
  });
}

mulaiWeb();
start();
