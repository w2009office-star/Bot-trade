import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
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

  if (!sock.authState.creds.registered) {
    if (!PHONE) {
      console.log('Isi variable PHONE_NUMBER (contoh: 628123456789) lalu deploy ulang.');
      process.exit(1);
    }
    mintaKodePairing(sock, PHONE);
  }

  sock.ev.on('creds.update', saveCreds);
  pasangPenjawab(sock);

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('✅ Bot terhubung ke WhatsApp');
    } else if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('❌ Logout. Hapus folder auth lalu pairing ulang.');
        process.exit(1);
      } else {
        console.log('Koneksi putus, mencoba lagi...');
        start();
      }
    }
  });
}

start();
