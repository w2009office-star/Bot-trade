import { getReply } from './rules.js';
import { bot } from './status.js';

// Penyimpanan sesi game tebak angka per pengguna
const gameSessions = new Map();

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
        const args = text.split(' ');
        const command = args[0].toLowerCase();
        const urlInput = args[1] || '';

        // ----------------------------------------------------
        // 🎮 FITUR GAME: TEBAK ANGKA (1 - 10)
        // ----------------------------------------------------
        if (command === '!game' || command === '!tebak') {
          const angkaRahasia = Math.floor(Math.random() * 10) + 1;
          gameSessions.set(jid, angkaRahasia);
          await sock.sendMessage(jid, { 
            text: `🎮 *GAME TEBAK ANGKA*\n\nHalo ${pushName}, aku sudah memilih angka antara *1 sampai 10*.\nBalas pesan ini dengan tebakan angkamu! (Contoh ketik: *5*)` 
          }, { quoted: msg });
          continue;
        }

        // Cek jika pengguna sedang dalam sesi bermain game
        if (gameSessions.has(jid) && !text.startsWith('!')) {
          const tebakan = parseInt(text, 10);
          const target = gameSessions.get(jid);

          if (!isNaN(tebakan)) {
            if (tebakan === target) {
              gameSessions.delete(jid);
              await sock.sendMessage(jid, { text: `🎉 *SELAMAT!* Tebakanmu benar! Angkanya adalah *${target}*.` }, { quoted: msg });
            } else if (tebakan < target) {
              await sock.sendMessage(jid, { text: '❌ Tebakanmu terlalu *KECIL*. Coba angka yang lebih besar!' }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { text: '❌ Tebakanmu terlalu *BESAR*. Coba angka yang lebih kecil!' }, { quoted: msg });
            }
            continue;
          }
        }

        // ----------------------------------------------------
        // 🎵 FITUR DOWNLOADER: TIKTOK (TANPA WATERMARK / HD)
        // ----------------------------------------------------
        if (command === '!tiktok' || command === '!tt') {
          if (!urlInput.includes('tiktok.com')) {
            await sock.sendMessage(jid, { text: '⚠️ Format salah!\nContoh: `!tiktok https://vt.tiktok.com/xxxx/`' }, { quoted: msg });
            continue;
          }

          await sock.sendMessage(jid, { text: '⏳ Sedang mengunduh video TikTok HD tanpa watermark...' }, { quoted: msg });

          try {
            const apiRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(urlInput)}`);
            const json = await apiRes.json();

            if (json.code === 0 && json.data) {
              const videoUrl = json.data.hdplay || json.data.play;
              const title = json.data.title || 'Video TikTok';
              const author = json.data.author?.nickname || 'TikTok';

              await sock.sendMessage(jid, {
                video: { url: videoUrl },
                caption: `🎬 *TIKTOK DOWNLOADER HD*\n\n📌 *Judul:* ${title}\n👤 *Kreator:* ${author}\n✨ *Status:* Tanpa Watermark`
              }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { text: '❌ Gagal mengambil video TikTok. Pastikan link publik dan valid.' }, { quoted: msg });
            }
          } catch (err) {
            console.error(err);
            await sock.sendMessage(jid, { text: '❌ Terjadi kesalahan saat mengunduh video TikTok.' }, { quoted: msg });
          }
          continue;
        }

        // ----------------------------------------------------
        // 📺 FITUR DOWNLOADER: YOUTUBE (HD VIDEO)
        // ----------------------------------------------------
        if (command === '!youtube' || command === '!yt' || command === '!ytmp4') {
          if (!urlInput.includes('youtu')) {
            await sock.sendMessage(jid, { text: '⚠️ Format salah!\nContoh: `!youtube https://youtu.be/xxxx`' }, { quoted: msg });
            continue;
          }

          await sock.sendMessage(jid, { text: '⏳ Sedang memproses video YouTube HD...' }, { quoted: msg });

          try {
            const apiRes = await fetch(`https://api.vreden.web.id/api/ytmp4?url=${encodeURIComponent(urlInput)}`);
            const json = await apiRes.json();

            if (json.result && json.result.download && json.result.download.url) {
              const videoUrl = json.result.download.url;
              const title = json.result.title || 'Video YouTube';

              await sock.sendMessage(jid, {
                video: { url: videoUrl },
                caption: `🎬 *YOUTUBE DOWNLOADER HD*\n\n📌 *Judul:* ${title}\n✨ *Kualitas:* HD`
              }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { text: '❌ Gagal mengunduh video YouTube. Coba link video lainnya.' }, { quoted: msg });
            }
          } catch (err) {
            console.error(err);
            await sock.sendMessage(jid, { text: '❌ Gagal memproses unduhan YouTube.' }, { quoted: msg });
          }
          continue;
        }

        // ----------------------------------------------------
        // 📜 MENU UTAMA & DAFTAR PERINTAH
        // ----------------------------------------------------
        if (command === '!menu' || command === '!help') {
          const menuText = `╔════════════════════════╗
║    🌟 *BOT TRADE MEDIA & GAME* 🌟 ║
╚════════════════════════╝

Halo *${pushName}*! Berikut daftar perintah aktif yang bisa kamu gunakan:

📥 *Media Downloader:*
🔹 *!tiktok <link>* - Download video TikTok (No Watermark HD)
🔹 *!youtube <link>* - Download video YouTube HD

🎮 *Fitur Hiburan & Game:*
🔹 *!game* - Main Game Tebak Angka

⚙️ *Pengaturan & Status:*
🔹 *!status* - Cek status koneksi bot
🔹 *!setnama <nama>* - Ubah nama profil WhatsApp bot

💡 _Ketik perintah sesuai contoh di atas untuk menjalankannya!_`;

          await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
          continue;
        }

        if (command === '!status') {
          await sock.sendMessage(jid, { text: `🟢 *Status Bot:* Online & Aktif\n👤 *Nama Profil:* ${bot.userName || 'Bot'}\n📞 *Nomor:* ${bot.userPhone || '-'}` }, { quoted: msg });
          continue;
        }

        // Jalankan aturan balasan asli dari rules.js jika tidak ada command di atas yang cocok
        const balasan = getReply(text);
        if (balasan) {
          await sock.sendMessage(jid, { text: balasan }, { quoted: msg });
        }
      } catch (e) {
        console.log('⚠️ Gagal membalas:', e?.message || e);
      }
    }
  });
}
