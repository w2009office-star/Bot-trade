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
        await sock.sendMessage(jid, { text: getReply(text) }, { quoted: msg });
      } catch (e) {
        console.log('Gagal kirim balasan:', e?.message || e);
      }
    }
  });
}
