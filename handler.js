import { getReply } from './rules.js';
import { bot } from './status.js';

const gameSessions = new Map();

export function pasangPenjawab(sock) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      const isGroup = jid.endsWith('@g.us');
      const pushName = msg.pushName || 'Pengguna';
      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        ''
      ).trim();

      if (!text) continue;

      const textLower = text.toLowerCase();

      // ============================================================
      // 🛡️ SISTEM PROTEKSI GRUP (KATA KOTOR & LINK PORNOGRAFI)
      // ============================================================
      if (isGroup) {
        // 1. Cek Kata Kotor
        const hasBadWord = bot.badWords.some(word => textLower.includes(word.toLowerCase()));
        
        // 2. Cek Link Pornografi
        const hasPornLink = bot.pornDomains.some(domain => textLower.includes(domain.toLowerCase()));

        if (hasBadWord || hasPornLink) {
          try {
            // Hapus Pesan Pelanggar
            await sock.sendMessage(jid, { delete: msg.key });

            if (hasBadWord) {
              bot.stats.totalDeletedBadWords++;
              await sock.sendMessage(jid, { 
                text: `🚫 *PERINGATAN PROTEKSI GRUP*\n\nPesan dari @${msg.key.participant.split('@')[0]} telah dihapus otomatis karena mengandung *Kata Kotor/Toxic*.`,
                mentions: [msg.key.participant]
              });
            } else if (hasPornLink) {
              bot.stats.totalDeletedPornLinks++;
              await sock.sendMessage(jid, { 
                text: `🔞 *DILARANG MEMBAGIKAN LINK PORNOGRAFI*\n\nPesan dari @${msg.key.participant.split('@')[0]} dihapus otomatis oleh sistem keamanan bot!`,
                mentions: [msg.key.participant]
              });
            }
            continue; // Hentikan eksekusi perintah jika melanggar
          } catch (err) {
            console.log('⚠️ Gagal menghapus pesan (Pastikan bot adalah Admin Grup):', err?.message);
          }
        }
      }

      // ============================================================
      // 🎮 EXECUTION FITUR & COMMANDS
      // ============================================================
      try {
        const args = text.split(' ');
        const command = args[0].toLowerCase();
        const inputParam = args.slice(1).join(' ');

        // 📜 MENU DYNAMIC (Otomatis menampilkan semua menu yang terdaftar)
        if (command === '!menu' || command === '!help') {
          // Kelompokkan menu berdasarkan kategori
          const categories = {};
          bot.commands.forEach(c => {
            if (!categories[c.category]) categories[c.category] = [];
            categories[c.category].push(c);
          });

          let menuText = `╔════════════════════════╗\n`;
          menuText += `║    🌟 *PANEL BOT PUBLIK PRO* 🌟  ║\n`;
          menuText += `╚════════════════════════╝\n\n`;
          menuText += `Halo *${pushName}*!\nBerikut adalah daftar seluruh fitur aktif bot:\n\n`;

          for (const [cat, cmds] of Object.entries(categories)) {
            menuText += `📌 *KATEGORI ${cat.toUpperCase()}*\n`;
            cmds.forEach(item => {
              menuText += `🔹 *${item.cmd}* : _${item.desc}_\n`;
            });
            menuText += `\n`;
          }

          menuText += `🛡️ *Status Proteksi Grup:* AKTIF\n`;
          menuText += `💡 _Menu ini diperbarui secara otomatis setiap ada fitur baru!_`;

          await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
          continue;
        }

        // 🎮 GAME TEBAK ANGKA
        if (command === '!game') {
          const targetNum = Math.floor(Math.random() * 10) + 1;
          gameSessions.set(jid, targetNum);
          await sock.sendMessage(jid, { text: `🎮 *GAME TEBAK ANGKA*\n\nTebak angka antara *1 - 10*. Balas pesan ini dengan angkamu!` }, { quoted: msg });
          continue;
        }

        if (gameSessions.has(jid) && !text.startsWith('!')) {
          const guess = parseInt(text, 10);
          const target = gameSessions.get(jid);
          if (!isNaN(guess)) {
            if (guess === target) {
              gameSessions.delete(jid);
              await sock.sendMessage(jid, { text: `🎉 *BENAR!* Angkanya adalah ${target}.` }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { text: guess < target ? '❌ Terlalu KECIL!' : '❌ Terlalu BESAR!' }, { quoted: msg });
            }
            continue;
          }
        }

        // 📥 TIKTOK DOWNLOADER HD
        if (command === '!tiktok' || command === '!tt') {
          if (!inputParam.includes('tiktok.com')) {
            await sock.sendMessage(jid, { text: '⚠️ Masukkan link TikTok yang valid!' }, { quoted: msg });
            continue;
          }
          await sock.sendMessage(jid, { text: '⏳ Mengunduh video TikTok HD tanpa watermark...' }, { quoted: msg });
          try {
            const apiRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(inputParam)}`);
            const json = await apiRes.json();
            if (json.code === 0 && json.data) {
              await sock.sendMessage(jid, { video: { url: json.data.hdplay || json.data.play }, caption: `🎬 *TikTok HD No Watermark*\n\n${json.data.title || ''}` }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { text: '❌ Video gagal diunduh.' }, { quoted: msg });
            }
          } catch {
            await sock.sendMessage(jid, { text: '❌ Error downloader TikTok.' }, { quoted: msg });
          }
          continue;
        }

        // 📺 YOUTUBE DOWNLOADER HD
        if (command === '!youtube' || command === '!yt') {
          if (!inputParam.includes('youtu')) {
            await sock.sendMessage(jid, { text: '⚠️ Masukkan link YouTube yang valid!' }, { quoted: msg });
            continue;
          }
          await sock.sendMessage(jid, { text: '⏳ Memproses video YouTube HD...' }, { quoted: msg });
          try {
            const apiRes = await fetch(`https://api.vreden.web.id/api/ytmp4?url=${encodeURIComponent(inputParam)}`);
            const json = await apiRes.json();
            if (json.result?.download?.url) {
              await sock.sendMessage(jid, { video: { url: json.result.download.url }, caption: `🎬 *YouTube HD Video*` }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { text: '❌ Video gagal diunduh.' }, { quoted: msg });
            }
          } catch {
            await sock.sendMessage(jid, { text: '❌ Error downloader YouTube.' }, { quoted: msg });
          }
          continue;
        }

        // 🛡️ TAMBAH KATA TERLARANG MANUAL
        if (command === '!addkata') {
          if (!inputParam) {
            await sock.sendMessage(jid, { text: '⚠️ Format: `!addkata <kata>`' }, { quoted: msg });
            continue;
          }
          bot.badWords.push(inputParam.toLowerCase());
          await sock.sendMessage(jid, { text: `✅ Kata *"${inputParam}"* telah ditambahkan ke sistem proteksi!` }, { quoted: msg });
          continue;
        }

        if (command === '!status') {
          await sock.sendMessage(jid, { text: `🟢 *Status Bot:* Online\n🛡️ *Kata Kotor Terhapus:* ${bot.stats.totalDeletedBadWords}\n🔞 *Link Pornografi Dihapus:* ${bot.stats.totalDeletedPornLinks}` }, { quoted: msg });
          continue;
        }

        const balasan = getReply(text);
        if (balasan) {
          await sock.sendMessage(jid, { text: balasan }, { quoted: msg });
        }
      } catch (e) {
        console.log('⚠️ Error Handler:', e?.message);
      }
    }
  });
}
