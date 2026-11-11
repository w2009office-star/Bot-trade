// Aturan balasan otomatis. Ubah teks di sini sesukamu.
export const FALLBACK = 'Maaf, aku belum paham 🙏 Ketik *menu* untuk melihat pilihan.';

export const RULES = [
  { keywords: ['halo', 'hai', 'hi', 'assalamualaikum'], reply: 'Halo! 👋 Ini balasan otomatis. Ketik *menu* untuk melihat pilihan.' },
  { keywords: ['menu'], reply: '📋 *MENU*\n1. Ketik *info* untuk informasi\n2. Ketik *jam* untuk jam layanan\n3. Ketik *admin* untuk bicara dengan admin' },
  { keywords: ['info'], reply: 'ℹ️ Ini bot otomatis. Edit teks ini di rules.js sesuai kebutuhanmu.' },
  { keywords: ['jam'], reply: '🕘 Jam layanan: Senin–Sabtu, 09.00–17.00 WIB.' },
  { keywords: ['admin'], reply: '🙏 Pesanmu sudah diteruskan. Admin akan membalas secepatnya.' },
];

export function getReply(text) {
  const t = text.toLowerCase().trim();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => t === k || t.startsWith(k + ' '))) return rule.reply;
  }
  return FALLBACK;
}
