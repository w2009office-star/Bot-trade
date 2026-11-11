import { bot } from './status.js';

const gameSessions = new Map();

// Fungsi Integrasi AI Otomatis untuk Percakapan Bebas
async function getAIResponse(prompt, senderName) {
  try {
    const systemPrompt = `Kamu adalah AI Asisten WhatsApp yang ramah, sopan, dan pintar. Namamu ${bot.userName || 'Bot AI'}. Teman bicaramu bernama ${senderName}. Jawablah secara singkat, jelas, dan bermanfaat.`;
    const fullPrompt = `${systemPrompt}\n\nPengguna: ${prompt}\nAI:`;
    
    const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}`);
    if (res.ok) {
      const reply = await res.text();
      if (reply && reply.trim()) return reply.trim();
    }
  } catch (err) {
    console.error('AI Service Error:', err);
  }
  return 'Maaf, sistem AI sedang memproses data lain. Silakan coba kirim pesan lagi.';
}

export function pasangPenjawab(sock) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      const isGroup = jid.endsWith('@g.us');
      const pushName = msg.pushName || 'Teman';
      const rawText = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        ''
      ).trim();

      if (!rawText) continue;

      const textLower = rawText.toLowerCase();

      // ----------------------------------------------------
      // 🛡️ 1. PROTEKSI GRUP (KATA KOTOR & LINK PORNOGRAFI)
      // ----------------------------------------------------
      if (isGroup) {
        const hasBadWord = bot.badWords.some(w => textLower.includes(w.toLowerCase()));
        const hasPornLink = bot.pornDomains.some(d => textLower.includes(d.toLowerCase()));

        if (hasBadWord || hasPornLink) {
          try {
            await sock.sendMessage(jid, { delete: msg.key });

            if (hasBadWord) {
              bot.stats.totalDeletedBadWords++;
              await sock.sendMessage(jid, {
                text: `⚠️ Pesan dari @${msg.key.participant.split('@')[0]} dihapus karena mengandung kata kotor.`,
                mentions: [msg.key.participant]
              });
            } else if (hasPornLink) {
              bot.stats.totalDeletedPornLinks++;
              await sock.sendMessage(jid, {
                text: `🔞 Link terlarang dari @${msg.key.participant.split('@')[0]} dihapus oleh sistem keamanan.`,
                mentions: [msg.key.participant]
              });
            }
            continue;
          } catch (err) {
            console.log('⚠️ Gagal hapus pesan proteksi:', err?.message);
          }
        }
      }

      // ----------------------------------------------------
      // 📥 2. DETEKSI OTOMATIS LINK TIKTOK & YOUTUBE (TANPA PERINTAH)
      // ----------------------------------------------------
      if (textLower.includes('tiktok.com') || textLower.includes('vt.tiktok.com')) {
        await sock.sendMessage(jid, { text: '⏳ Mengunduh video TikTok HD tanpa watermark...' }, { quoted: msg });
        try {
          const apiRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(rawText)}`);
          const json = await apiRes.json();
          if (json.code === 0 && json.data) {
            await sock.sendMessage(jid, {
              video: { url: json.data.hdplay || json.data.play },
              caption: `🎬 *TikTok Downloader HD*\n📌 ${json.data.title || 'Video TikTok'}`
            }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { text: '❌ Gagal mengunduh video TikTok. Pastikan link publik.' }, { quoted: msg });
          }
        } catch {
          await sock.sendMessage(jid, { text: '❌ Terjadi kesalahan saat mengunduh TikTok.' }, { quoted: msg });
        }
        continue;
      }

      if (textLower.includes('youtube.com') || textLower.includes('youtu.be')) {
        await sock.sendMessage(jid, { text: '⏳ Memproses unduhan video YouTube HD...' }, { quoted: msg });
        try {
          const apiRes = await fetch(`https://api.vreden.web.id/api/ytmp4?url=${encodeURIComponent(rawText)}`);
          const json = await apiRes.json();
          if (json.result?.download?.url) {
            await sock.sendMessage(jid, {
              video: { url: json.result.download.url },
              caption: `🎬 *YouTube Downloader HD*\n📌 ${json.result.title || 'Video YouTube'}`
            }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { text: '❌ Gagal mengunduh video YouTube.' }, { quoted: msg });
          }
        } catch {
          await sock.sendMessage(jid, { text: '❌ Terjadi kesalahan saat mengunduh YouTube.' }, { quoted: msg });
        }
        continue;
      }

      // ----------------------------------------------------
      // 🎮 3. GAME INTERAKTIF
      // ----------------------------------------------------
      if (gameSessions.has(jid) && !isNaN(parseInt(rawText, 10))) {
        const guess = parseInt(rawText, 10);
        const target = gameSessions.get(jid);
        if (guess === target) {
          gameSessions.delete(jid);
          await sock.sendMessage(jid, { text: `🎉 Benar! Angkanya adalah ${target}.` }, { quoted: msg });
        } else if (guess < target) {
          await sock.sendMessage(jid, { text: '❌ Angkanya lebih BESAR!' }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, { text: '❌ Angkanya lebih KECIL!' }, { quoted: msg });
        }
        continue;
      }

      // ----------------------------------------------------
      // 📌 4. PERINTAH BOT TANPA AWALAN SYMBOL
      // ----------------------------------------------------
      const args = rawText.split(' ');
      const cmd = args[0].toLowerCase();
      const param = args.slice(1).join(' ');

      // PERINTAH: MENU
      if (cmd === 'menu' || cmd === 'help') {
        let menuText = `📋 *MENU UTAMA BOT*\n\n`;
        menuText += `Halo ${pushName}, berikut perintah yang tersedia:\n\n`;
        
        bot.commands.forEach(item => {
          menuText += `• *${item.cmd}* : ${item.desc}\n`;
        });

        menuText += `\n📥 *Downloader Otomatis:*\nLangsung kirim link TikTok atau YouTube di chat.\n\n`;
        menuText += `🤖 *Chat AI:*\nKirim pesan biasa untuk berdiskusi dengan AI.`;

        await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
        continue;
      }

      // PERINTAH: PING
      if (cmd === 'ping') {
        const start = Date.now();
        await sock.sendMessage(jid, { text: `🏓 Pong! Kecepatan respon: ${Date.now() - start} ms` }, { quoted: msg });
        continue;
      }

      // PERINTAH: STATUS
      if (cmd === 'status') {
        const statusText = `📊 *STATUS BOT*\n\n` +
          `• Status: Online\n` +
          `• Nama Bot: ${bot.userName || '-'}\n` +
          `• Kata Kotor Dihapus: ${bot.stats.totalDeletedBadWords}\n` +
          `• Link Pornografi Dihapus: ${bot.stats.totalDeletedPornLinks}`;
        await sock.sendMessage(jid, { text: statusText }, { quoted: msg });
        continue;
      }

      // PERINTAH: GAME
      if (cmd === 'game' || cmd === 'tebak') {
        const secret = Math.floor(Math.random() * 10) + 1;
        gameSessions.set(jid, secret);
        await sock.sendMessage(jid, { text: '🎮 *Game Tebak Angka*\n\nTebak angka dari 1 sampai 10. Kirim angkamu sekarang!' }, { quoted: msg });
        continue;
      }

      // PERINTAH: SET NAMA BOT
      if (cmd === 'setnama') {
        if (!param) {
          await sock.sendMessage(jid, { text: '⚠️ Masukkan nama baru.\nContoh: `setnama Bot Trade`' }, { quoted: msg });
          continue;
        }
        await sock.updateProfileName(param);
        bot.userName = param;
        await sock.sendMessage(jid, { text: `✅ Nama bot berhasil diubah menjadi: *${param}*` }, { quoted: msg });
        continue;
      }

      // PERINTAH: BADWORDS
      if (cmd === 'badwords') {
        await sock.sendMessage(jid, { text: `🛡️ Total kata kotor terdaftar: *${bot.badWords.length} kata*` }, { quoted: msg });
        continue;
      }

      // PERINTAH: ADD KATA
      if (cmd === 'addkata') {
        if (!param) {
          await sock.sendMessage(jid, { text: '⚠️ Masukkan kata. Contoh: `addkata kasar`' }, { quoted: msg });
          continue;
        }
        bot.badWords.push(param.toLowerCase());
        await sock.sendMessage(jid, { text: `✅ Kata *"${param}"* ditambahkan ke daftar proteksi.` }, { quoted: msg });
        continue;
      }

      // PERINTAH: CLEAN
      if (cmd === 'clean') {
        if (global.gc) global.gc();
        bot.stats.lastCleanupTime = new Date().toLocaleString('id-ID');
        await sock.sendMessage(jid, { text: '🧹 Pembersihan riwayat & memori selesai.' }, { quoted: msg });
        continue;
      }

      // ----------------------------------------------------
      // 🤖 5. JIKA BUKAN PERINTAH -> GUNAKAN AI UNTUK MENJAWAB
      // ----------------------------------------------------
      const aiResponse = await getAIResponse(rawText, pushName);
      await sock.sendMessage(jid, { text: aiResponse }, { quoted: msg });

    }
  });
}
