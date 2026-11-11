export const bot = {
  sock: null,
  connected: false,
  registered: false,
  qr: null,
  pairingCode: null,
  startTime: Date.now(),
  userPhone: null,
  userName: null,
  
  // Statistik Proteksi
  stats: {
    totalDeletedBadWords: 0,
    totalDeletedPornLinks: 0,
    lastCleanupTime: new Date().toLocaleString('id-ID'),
    dailyBadwordCount: 15
  },

  // Daftar Filter Kata Kotor (Otomatis bertambah 15 kata per hari)
  badWords: [
    'anjing', 'babi', 'kunyuk', 'bajingan', 'asdf', 'kontol', 'memek', 
    'pantek', 'puki', 'goblok', 'tolol', 'bangsat', 'kampang', 'pepek', 'jancok'
  ],

  // Filter Domain Pornografi & Konten Dewasa
  pornDomains: [
    'pornhub', 'xvideos', 'xnxx', 'redtube', 'youporn', 'brazzers',
    'xhamster', 'onlyfans', 'sex', 'porn', 'bokep', 'suck', 'stripchat'
  ],

  // Daftar Semua Perintah Bot (Menu Dinamis Terupdate Otomatis)
  commands: [
    { cmd: '!menu', category: 'Umum', desc: 'Menampilkan semua daftar menu bot' },
    { cmd: '!status', category: 'Umum', desc: 'Cek keaktifan bot & sistem proteksi' },
    { cmd: '!ping', category: 'Umum', desc: 'Tes kecepatan respon bot' },
    { cmd: '!tiktok <link>', category: 'Downloader', desc: 'Download Video TikTok HD No Watermark' },
    { cmd: '!youtube <link>', category: 'Downloader', desc: 'Download Video YouTube HD' },
    { cmd: '!game', category: 'Hiburan', desc: 'Main Game Tebak Angka' },
    { cmd: '!setnama <nama>', category: 'Admin', desc: 'Ubah nama WhatsApp Bot' },
    { cmd: '!badwords', category: 'Proteksi', desc: 'Lihat daftar kata kotor yang diblokir' },
    { cmd: '!addkata <kata>', category: 'Proteksi', desc: 'Tambah kata kotor baru ke proteksi' },
    { cmd: '!clean', category: 'Sistem', desc: 'Bersihkan memori & riwayat bot manual' }
  ]
};

export function getUptime() {
  const totalSeconds = Math.floor((Date.now() - bot.startTime) / 1000);
  const jam = Math.floor(totalSeconds / 3600);
  const menit = Math.floor((totalSeconds % 3600) / 60);
  const detik = totalSeconds % 60;
  return `${jam}j ${menit}m ${detik}d`;
}
