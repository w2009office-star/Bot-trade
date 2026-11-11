import { bot } from './status.js';
import { loadMemory, saveMemory, rememberFact, autoLearnBadWord } from './memory.js';

// Muat database memori saat handler pertama kali dijalankan
const dbMemory = loadMemory();
const gameSessions = new Map();

// AI Engine dengan Konteks Memori Jangka Panjang
async function getAIResponseWithMemory(prompt, senderJid, senderName) {
  try {
    const userMemory = dbMemory.users[senderJid] || { facts: [] };
    const knownFacts = userMemory.facts.length > 0 
      ? `Hal yang kamu ingat tentang ${senderName}: ${userMemory.facts.join(', ')}.` 
      : `Kamu baru pertama kali mengobrol intensif dengan ${senderName}.`;

    const systemPrompt = `Kamu adalah AI WhatsApp pintar yang bisa berpikir dan belajar sendiri. Namamu ${bot.userName || 'Bot AI'}.\n${knownFacts}\nJawablah pesan berikut secara alami, ramah, dan ringkas.`;
    const fullPrompt = `${systemPrompt}\n\n${senderName}: ${prompt}\nAI:`;

    const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}`);
    if (res.ok) {
      const reply = await res.text();
      return reply ? reply.trim() : null;
    }
  } catch (err) {
    console.error('AI Memory Error:', err);
  }
  return 'Maaf, otak AI sedang menyinkronkan data memori. Coba kirim pesan lagi.';
}

// Analisis Latar Belakang AI untuk Belajar Fakta Pengguna
async function extractAndLearnFacts(prompt, senderJid, senderName) {
  // Hanya proses jika pesan mengandung informasi personal
  const lower = prompt.toLowerCase();
  if (lower.includes('nama saya') || lower.includes('suka') || lower.includes('hobi') || lower.includes('tinggal di')) {
    rememberFact(dbMemory, senderJid, senderName, prompt);
  }
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
      // 🛡️ 1. PROTEKSI GRUP (KATA KOTOR NATIVE + HASIL BELAJAR)
      // ----------------------------------------------------
      if (isGroup) {
        const allBadWords = [...bot.badWords, ...dbMemory.learnedWords];
        const hasBadWord = allBadWords.some(w => textLower.includes(w.toLowerCase()));
        const hasPornLink = bot.pornDomains.some(d => textLower.includes(d.toLowerCase()));

        if (hasBadWord || hasPornLink) {
          try {
            await sock.sendMessage(jid, { delete: msg.key });
            if (hasBadWord) {
              bot.stats.totalDeletedBadWords++;
              await sock.sendMessage(jid, {
                text: `⚠️ Pesan terhapus otomatis! Mengandung kata toxic terdeteksi.`,
                mentions: [msg.key.participant]
              });
            } else if (hasPornLink) {
              bot.stats.totalDeletedPornLinks++;
              await sock.sendMessage(jid, {
                text: `🔞 Link terlarang terhapus otomatis oleh proteksi bot!`,
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
      // 📥 2. DETEKSI OTOMATIS LINK MEDIA (TIKTOK / YT)
      // ----------------------------------------------------
      if (textLower.includes('tiktok.com') || textLower.includes('vt.tiktok.com')) {
        await sock.sendMessage(jid, { text: '⏳ Mengunduh video TikTok HD...' }, { quoted: msg });
        try {
          const apiRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(rawText)}`);
          const json = await apiRes.json();
          if (json.code === 0 && json.data) {
            await sock.sendMessage(jid, {
              video: { url: json.data.hdplay || json.data.play },
              caption: `🎬 *TikTok HD No Watermark*`
            }, { quoted: msg });
          }
        } catch {
          await sock.sendMessage(jid, { text: '❌ Gagal mengunduh TikTok.' }, { quoted: msg });
        }
        continue;
      }

      if (textLower.includes('youtube.com') || textLower.includes('youtu.be')) {
        await sock.sendMessage(jid, { text: '⏳ Memproses video YouTube HD...' }, { quoted: msg });
        try {
          const apiRes = await fetch(`https://api.vreden.web.id/api/ytmp4?url=${encodeURIComponent(rawText)}`);
          const json = await apiRes.json();
          if (json.result?.download?.url) {
            await sock.sendMessage(jid, {
              video: { url: json.result.download.url },
              caption: `🎬 *YouTube HD Video*`
            }, { quoted: msg });
          }
        } catch {
          await sock.sendMessage(jid, { text: '❌ Gagal mengunduh YouTube.' }, { quoted: msg });
        }
        continue;
      }

      // ----------------------------------------------------
      // 📌 3. PERINTAH DENGAN RESPON AKTIF
      // ----------------------------------------------------
      const args = rawText.split(' ');
      const cmd = args[0].toLowerCase();
      const param = args.slice(1).join(' ');

      if (cmd === 'menu' || cmd === 'help') {
        let menuText = `📋 *MENU BOT PINTAR*\n\n`;
        bot.commands.forEach(item => {
          menuText += `• *${item.cmd}* : ${item.desc}\n`;
        });
        menuText += `\n🧠 *Memori Dipelajari:* ${Object.keys(dbMemory.users).length} Pengguna Terrekam`;
        menuText += `\n🛡️ *Kata Baru Dipelajari:* ${dbMemory.learnedWords.length} Kata`;
        await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
        continue;
      }

      if (cmd === 'memori') {
        const userMem = dbMemory.users[jid];
        if (userMem && userMem.facts.length > 0) {
          await sock.sendMessage(jid, { text: `🧠 *Memori Bot tentang kamu:*\n- ${userMem.facts.join('\n- ')}` }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, { text: '🧠 Aku belum merekam fakta khusus tentangmu. Coba ceritakan kesukaan atau hobimu!' }, { quoted: msg });
        }
        continue;
      }

      if (cmd === 'ping') {
        await sock.sendMessage(jid, { text: `🏓 Pong! Sistem memori & AI aktif.` }, { quoted: msg });
        continue;
      }

      if (cmd === 'status') {
        await sock.sendMessage(jid, { 
          text: `📊 *STATUS BOT PINTAR*\n• Status: Online & Learning Engine Active\n• Pengguna Diingat: ${Object.keys(dbMemory.users).length}\n• Kata Otomatis Dipelajari: ${dbMemory.learnedWords.length}` 
        }, { quoted: msg });
        continue;
      }

      // ----------------------------------------------------
      // 🧠 4. PEMBELAJARAN OTOMATIS & RESPON CHAT AI
      // ----------------------------------------------------
      // Ekstrak fakta pengguna untuk disimpan ke memory.json
      extractAndLearnFacts(rawText, jid, pushName);

      // Dapatkan jawaban dari AI yang memanfaatkan memori masa lalu
      const aiResponse = await getAIResponseWithMemory(rawText, jid, pushName);
      await sock.sendMessage(jid, { text: aiResponse }, { quoted: msg });
    }
  });
}
