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
        // --- AREA UNTUK FITUR TAMBAHAN BOT ---
        // Letakkan fitur barumu di sini. Jika perintah cocok, bot akan membalas
        // dan langsung 'continue' agar tidak memicu aturan dari rules.js
        const command = text.toLowerCase();

        if (command === '!status') {
          await sock.sendMessage(jid, { text: '✅ Bot aktif. Sistem OTP 2 menit berjalan lancar.' }, { quoted: msg });
          continue; 
        }

        if (command === '!ping') {
          await sock.sendMessage(jid, { text: 'Pong! Bot aman.' }, { quoted: msg });
          continue;
        }
        // -------------------------------------

        // Jika bukan fitur tambahan di atas, gunakan rules.js bawaan aslinya (Aman & Tidak Rusak)
        const balasanAsli = getReply(text);
        if (balasanAsli) {
          await sock.sendMessage(jid, { text: balasanAsli }, { quoted: msg });
        }
      } catch (e) {
        console.log('Gagal kirim balasan:', e?.message || e);
      }
    }
  });
}
