import { getReply } from './rules.js';

export function pasangPenjawab(sock) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') continue;
      
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '';
      
      if (!text) continue;

      try {
        const command = text.toLowerCase();

        // --- TAMPILAN MENU YANG ELEGAN UNTUK PENGGUNA ---
        if (command === '!menu' || command === '!help') {
          const menuText = `╔════════════════════════╗
║      🌟 *BOT TRADE PRO* 🌟     ║
╚════════════════════════╝

👋 Halo! Berikut adalah daftar perintah yang bisa digunakan:

🔸 *!status* - Cek keadaan bot
🔸 *!ping* - Uji kecepatan respon
🔸 *!menu* - Menampilkan daftar ini

_Bot ini dirancang untuk mempermudah pekerjaanmu._ ✨`;
          
          await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
          continue; 
        }

        if (command === '!status') {
          await sock.sendMessage(jid, { text: '✅ *Status:* Bot Aktif\n⏳ *Sistem:* OTP 2 Menit & Auto-Retry berjalan lancar.' }, { quoted: msg });
          continue;
        }

        if (command === '!ping') {
          await sock.sendMessage(jid, { text: '🏓 *Pong!* Sistem berjalan mulus.' }, { quoted: msg });
          continue;
        }
        // ------------------------------------------------

        // Balasan asli dari ayahmu tetap aman dan berfungsi
        const balasanAsli = getReply(text);
        if (balasanAsli) {
          await sock.sendMessage(jid, { text: balasanAsli }, { quoted: msg });
        }
      } catch (e) {
        console.log('⚠️ Gagal kirim balasan:', e?.message || e);
      }
    }
  });
}
