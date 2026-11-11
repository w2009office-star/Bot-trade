export const bot = {
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
    totalDeletedPornLinks: 0,
    lastCleanupTime: new Date().toLocaleString('id-ID'),
    dailyBadwordCount: 15
  },

  badWords: [
    'anjing', 'babi', 'kunyuk', 'bajingan', 'kontol', 'memek', 
    'pantek', 'puki', 'goblok', 'tolol', 'bangsat', 'pepek', 'jancok'
  ],

  pornDomains: [
    'pornhub', 'xvideos', 'xnxx', 'redtube', 'youporn', 'brazzers',
    'xhamster', 'onlyfans', 'stripchat'
  ],

  // Daftar Perintah Resmi Tanpa Prefix
  commands: [
    { cmd: 'menu', category: 'Umum', desc: 'Menampilkan semua fitur bot' },
    { cmd: 'status', category: 'Umum', desc: 'Cek status aktif bot & proteksi' },
    { cmd: 'ping', category: 'Umum', desc: 'Cek kecepatan respon bot' },
    { cmd: 'game', category: 'Hiburan', desc: 'Main game tebak angka' },
    { cmd: 'setnama <nama>', category: 'Admin', desc: 'Ubah nama akun bot' },
    { cmd: 'badwords', category: 'Proteksi', desc: 'Daftar kata kotor yang diblokir' },
    { cmd: 'addkata <kata>', category: 'Proteksi', desc: 'Tambah kata kotor baru' },
    { cmd: 'clean', category: 'Sistem', desc: 'Bersihkan memori bot' }
  ]
};

export function getUptime() {
  const totalSeconds = Math.floor((Date.now() - bot.startTime) / 1000);
  const jam = Math.floor(totalSeconds / 3600);
  const menit = Math.floor((totalSeconds % 3600) / 60);
  const detik = totalSeconds % 60;
  return `${jam}j ${menit}m ${detik}d`;
}
