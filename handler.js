import { bot } from './status.js';
import { loadMemory, rememberFact } from './memory.js';

let dbMemory = { users: {}, learnedWords: [], conversations: {} };

// Inisialisasi memori
loadMemory().then(data => { dbMemory = data; });

const gameSessions = new Map();

// AI Engine Tingkat Tinggi: Pintar, Detail, dan Empatis
async function getAdvancedAIResponse(prompt, senderJid, senderName) {
  const userMemory = dbMemory.users[senderJid] || { facts: [] };
  const memoryContext = userMemory.facts.length > 0
    ? `Fakta & konteks tentang ${senderName}: [${userMemory.facts.join('; ')}].`
    : `Pengguna bernama ${senderName}.`;

  // System Prompt Baru: Wawasan Luas, Detail, & Nyaman Diajak Ngobrol
  const systemInstruction = 
    `Kamu adalah AI Asisten Cerdas bernama ${bot.userName || 'Bot Trade AI'}. ` +
    `Kamu memiliki wawasan yang sangat luas dan mendalam di berbagai bidang ilmu (sains, teknologi, sejarah, filsafat, seni) maupun kehidupan nyata (psikologi, hubungan, motivasi, dan kehidupan sehari-hari).\n` +
    `Gaya bicaramu hangat, santai, empatis, dan sangat nyaman diajak berdiskusi. ` +
    `Jika pengguna bertanya topik kompleks, berikan penjelasan yang detail, logis, dan mudah dipahami. ` +
    `Jika pengguna hanya ingin curhat atau ngobrol santai, jadilah pendengar yang baik dan berikan respon yang mendukung.\n` +
    `${memoryContext}`;

  const fullPrompt = `${systemInstruction}\n\n${senderName}: ${prompt}\nAI:`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const text = await res.text();
      if (text && text.trim()) return text.trim();
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.log('⚡ Mengalihkan ke mesin pemroses cadangan...');
  }

  // Jalur Cadangan Berbasis Pengetahuan Umum
  try {
    const fallbackRes = await fetch(`https://api.simsimi.vn/v1/simtalk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text: prompt, lc: 'id' })
    });
    const json = await fallbackRes.json();
    if (json.message) return json.message;
  } catch {
    // Abaikan jika fallback sibuk
  }

  return `Menarik sekali topik ini, ${senderName}! Mari kita bedah lebih dalam. Apa sudut pandangmu mengenai hal ini?`;
}

// Analisis Latar Belakang Informasi Penting
function extractFactsAsync(text, jid, name) {
  const lower = text.toLowerCase();
  const triggers = ['nama saya', 'hobi saya', 'saya suka', 'saya tinggal di', 'cita-cita saya', 'saya merasa', 'saya kerja'];
  if (triggers.some(t => lower.includes(t))) {
    rememberFact(dbMemory, jid, name, text);
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
      // 🛡️ 1. PROTEKSI GRUP OTOMATIS
      // ----------------------------------------------------
      if (isGroup) {
        const allBadWords = [...bot.badWords, ...dbMemory.learnedWords];
        const hasBadWord = allBadWords.some(w => textLower.includes(w.toLowerCase()));
        const hasPornLink = bot.pornDomains.some(d => textLower.includes(d.toLowerCase()));

        if (hasBadWord || hasPornLink) {
          try {
            await sock.sendMessage(jid, { delete: msg.key });
            await sock.sendMessage(jid, {
              text: hasBadWord 
                ? `⚠️ Pesan dihapus otomatis (Mengandung kata kotor).` 
                : `🔞 Link terlarang dihapus otomatis oleh sistem proteksi.`,
              mentions: [msg.key.participant]
            });
            continue;
          } catch (e) {
            console.log('⚠️ Gagal proteksi:', e?.message);
          }
        }
      }

      // ----------------------------------------------------
      // 📥 2. DOWNLOADER OTOMATIS (TIKTOK & YOUTUBE)
      // ----------------------------------------------------
      if (textLower.includes('tiktok.com') || textLower.includes('vt.tiktok.com')) {
        await sock.sendPresenceUpdate('composing', jid);
        await sock.sendMessage(jid, { text: '⏳ Mengunduh video TikTok HD...' }, { quoted: msg });
        try {
          const apiRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(rawText)}`);
          const json = await apiRes.json();
          if (json.code === 0 && json.data) {
            await sock.sendMessage(jid, {
              video: { url: json.data.hdplay || json.data.play },
              caption: `🎬 *TikTok HD Video*`
            }, { quoted: msg });
          }
        } catch {
          await sock.sendMessage(jid, { text: '❌ Gagal unduh TikTok.' }, { quoted: msg });
        }
        continue;
      }

      if (textLower.includes('youtube.com') || textLower.includes('youtu.be')) {
        await sock.sendPresenceUpdate('composing', jid);
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
          await sock.sendMessage(jid, { text: '❌ Gagal unduh YouTube.' }, { quoted: msg });
        }
        continue;
      }

      // ----------------------------------------------------
      // 📌 3. PERINTAH DENGAN RESPON KONTAN
      // ----------------------------------------------------
      const args = rawText.split(' ');
      const cmd = args[0].toLowerCase();

      if (cmd === 'menu' || cmd === 'help') {
        let menuText = `📋 *MENU UTAMA BOT*\n\n`;
        bot.commands.forEach(item => {
          menuText += `• *${item.cmd}* : ${item.desc}\n`;
        });
        menuText += `\n🧠 *Pengguna Terdaftar Memori:* ${Object.keys(dbMemory.users).length}`;
        await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
        continue;
      }

      if (cmd === 'memori') {
        const userMem = dbMemory.users[jid];
        if (userMem && userMem.facts.length > 0) {
          await sock.sendMessage(jid, { text: `🧠 *Fakta yang kuingat tentangmu:*\n- ${userMem.facts.join('\n- ')}` }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, { text: '🧠 Belum ada fakta khusus yang kucatat. Coba ceritakan cita-cita atau hobimu!' }, { quoted: msg });
        }
        continue;
      }

      if (cmd === 'ping') {
        await sock.sendMessage(jid, { text: `🏓 Pong! Sistem AI pintar aktif.` }, { quoted: msg });
        continue;
      }

      if (cmd === 'status') {
        await sock.sendMessage(jid, { text: `🟢 *Status:* Online & AI Multitalenta Aktif` }, { quoted: msg });
        continue;
      }

      // ----------------------------------------------------
      // 🤖 4. PEMROSES CHAT AI DETAIL & CERDAS
      // ----------------------------------------------------
      await sock.sendPresenceUpdate('composing', jid);
      extractFactsAsync(rawText, jid, pushName);

      const reply = await getAdvancedAIResponse(rawText, jid, pushName);
      await sock.sendMessage(jid, { text: reply }, { quoted: msg });
    }
  });
}
