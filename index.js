import fs from 'fs';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
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
    browser: ['Bot Trade', 'Chrome', '1.0.0'],
    printQRInTerminal: false
  });

  bot.sock = sock;
  bot.connected = false;
  bot.registered = !!sock.authState.creds.registered;

  if (!bot.registered && PHONE) {
    mintaKodePairing(sock, PHONE);
  }

  sock.ev.on('creds.update', saveCreds);
  pasangPenjawab(sock);

  // Timer batas waktu 2 menit
  const timerKoneksi = setTimeout(() => {
    if (!bot.connected) {
      console.log('⏳ Batas waktu 2 menit habis. Memuat ulang sesi...');
      bot.qr = null;
      bot.pairingCode = null;
      sock.ws.close();
    }
  }, 120000);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      bot.qr = qr; // Simpan QR untuk ditampilkan di website
      if (!PHONE) {
        console.log('\n--- SCAN QR CODE (Batas 2 Menit) ---');
        qrcodeTerminal.generate(qr, { small: true });
      }
    }

    if (connection === 'open') {
      clearTimeout(timerKoneksi);
      bot.connected = true;
      bot.registered = true;
      bot.qr = null;
      bot.pairingCode = null;
      console.log('✅ Bot terhubung ke WhatsApp');
    } else if (connection === 'close') {
      clearTimeout(timerKoneksi);
      bot.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('❌ Session Logged Out.');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
      setTimeout(start, 3000);
    }
  });
}

mulaiWeb();
start();
