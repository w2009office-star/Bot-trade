export const bot = {
  sock: null,
  connected: false,
  registered: false,
  qr: null,
  pairingCode: null,
  startTime: Date.now(),
  userPhone: null,
  userName: null,
  // Fitur Bawaan + Fitur Otomatis Bertambah Setiap Hari
  baseCommands: ['!menu', '!status', '!ping', '!info', '!setnama'],
  dailyFeatures: [
    '🤖 Auto-Reply AI V1',
    '📊 Bot Analytics Tracker',
    '⏱️ Anti-Delay Message Queue',
    '🛡️ Anti-Spam Auto Block',
    '⚡ Quick Response Engine'
  ]
};

// Fungsi menghitung waktu berjalan (Uptime)
export function getUptime() {
  const totalSeconds = Math.floor((Date.now() - bot.startTime) / 1000);
  const jam = Math.floor(totalSeconds / 3600);
  const menit = Math.floor((totalSeconds % 3600) / 60);
  const detik = totalSeconds % 60;
  return `${jam}j ${menit}m ${detik}d`;
}
