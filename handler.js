import { getReply } from './rules.js';

export function pasangPenjawab(sock) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') continue;

      const pushName = msg.pushName || 'Pengguna';
      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        ''
      ).trim();

      if (!text) continue;

      try {
        const command = text.toLowerCase();

        // Fitur Menu Utama untuk Publik
        if (command === '!menu' || command === '!help' || command === 'menu') {
          const menuText = `╔════════════════════════╗
║    🌐 *BOT PUBLIK TRADE* 🌐   ║
╚════════════════════════╝

Halo *${pushName}*! Selamat datang di layanan Bot Publik.

📌 *Daftar Perintah:*
🔹 *!menu* - Menampilkan menu ini
🔹 *!status* - Cek status keaktifan bot
🔹 *!ping* - Tes kecepatan respon bot
🔹 *!info* - Informasi layanan bot

💡 _Ketik pesan atau pertanyaan kamu, bot akan membalas otomatis!_`;

          await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
          continue;
        }

        if (command === '!status') {
          await sock.sendMessage(jid, { text: `🟢 *Status Bot:* Online & Aktif\n⏱️ *Respon:* Cepat\n👥 *Tipe Layanan:* Publik 24/7` }, { quoted: msg });
          continue;
        }

        if (command === '!ping') {
          await sock.sendMessage(jid, { text: `🏓 *Pong!* Respon bot sangat lancar.` }, { quoted: msg });
          continue;
        }

        if (command === '!info') {
          await sock.sendMessage(jid, { text: `ℹ️ *Informasi Bot:* Bot ini dapat digunakan oleh siapa saja secara gratis untuk mendapatkan informasi otomatis.` }, { quoted: msg });
          continue;
        }

        // Memproses pesan biasa dengan rules buatan ayahmu
        const balasan = getReply(text);
        if (balasan) {
          await sock.sendMessage(jid, { text: balasan }, { quoted: msg });
        }
      } catch (e) {
        console.log('⚠️ Gagal membalas pesan:', e?.message || e);
      }
    }
  });
}
