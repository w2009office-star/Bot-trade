import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';

// ====== PENGATURAN (diisi lewat Variables di Railway) ======
const PHONE_NUMBER = (process.env.PHONE_NUMBER || '').replace(/\D/g, ''); // contoh: 628123456789
const AUTH_DIR = process.env.AUTH_DIR || './auth'; // di Railway: /data/auth (pakai Volume)

// ====== ATURAN BALASAN OTOMATIS (ubah sesukamu) ======
const RULES = [
  { keywords: ['halo', 'hai', 'hi', 'assalamualaikum'], reply: 'Halo! 👋 Ini balasan otomatis. Ketik *menu* untuk melihat pilihan.' },
  { keywords: ['menu'], reply: '📋 *MENU*\n1. Ketik *info* untuk informasi\n2. Ketik *jam* untuk jam layanan\n3. Ketik *admin* untuk bicara dengan admin' },
  { keywords: ['info'], reply: 'ℹ️ Ini bot otomatis. Edit teks ini di index.js sesuai kebutuhanmu.' },
  { keywords: ['jam'], reply: '🕘 Jam layanan: Senin–Sabtu, 09.00–17.00 WIB.' },
  { keywords: ['admin'], reply: '🙏 Pesanmu sudah diteruskan. Admin akan membalas secepatnya.' },
];
const FALLBACK = 'Maaf, aku belum paham 🙏 Ketik *menu* untuk melihat pilihan.';

function getReply(text) {
  const t = text.toLowerCase().trim();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => t === k || t.startsWith(k + ' '))) return rule.reply;
  }
  return FALLBACK;
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['WA Bot', 'Chrome', '1.0.0'],
  });

  // Login pertama kali pakai kode pairing (lihat di Deploy Logs Railway)
  if (!sock.authState.creds.registered) {
    if (!PHONE_NUMBER) {
      console.log('Isi variable PHONE_NUMBER (contoh: 628123456789) lalu deploy ulang.');
      process.exit(1);
    }
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(PHONE_NUMBER);
        console.log('=================================');
        console.log('KODE PAIRING:', code);
        console.log('WhatsApp > Perangkat tertaut > Tautkan dengan nomor telepon');
        console.log('=================================');
      } catch (e) {
        console.log('Gagal minta kode pairing:', e?.message || e);
