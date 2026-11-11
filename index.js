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

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['WA Bot', 'Chrome', '1.0.0'],
  });

  bot.sock = sock;
  bot.connected = false;
  bot.registered = !!sock.authState.creds.registered;
  if (!bot.registered && PHONE) mintaKodePairing(sock, PHONE);

  sock.ev.on('creds.update', saveCreds);
  pasangPenjawab(sock);

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      bot.connected = true;
      bot.registered = true;
      console.log('✅ Bot terhubung ke WhatsApp');
    } else if (connection === 'close') {
      bot.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('❌ Logout. Sesi dihapus, hubungkan ulang lewat halaman web.');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
      start();
    }
  });
}

mulaiWeb();
start();
