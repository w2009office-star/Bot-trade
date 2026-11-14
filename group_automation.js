import { fetchWithTimeout, sendNativeInteractiveButtons, panggilServerAISatSet } from './engines.js';

export const GROUP_AUTO_COMMANDS = [
  'welcome',
  'goodbye',
  'setwelcome',
  'setgoodbye',
  'autobuka',
  'autotutup',
  'tambahkegiatan',
  'syncjadwal',
  'listkegiatan',
  'hapuskegiatan',
  'teskegiatan',
  'tessemuakegiatan',
  'testsemuakegiatan',
  'interaksi',
  'settema',
  'tutupinteraksi',
  'autoapprove',
  'setfilter',
  'blacklistmember',
  'unblacklistmember',
  'cekrequest',
  'accsemua',
  'tolaksemua',
  'panelgrup',
];

const VALID_DAYS = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu', 'setiap_hari'];
const botSentMsgIds = new Set();
const groupChatHistory = new Map();
const groupInteractionCooldown = new Map();

function trackBotMessage(sentMsg) {
  const id = sentMsg?.key?.id;
  if (!id) return;
  botSentMsgIds.add(id);
  if (botSentMsgIds.size > 500) {
    const oldest = botSentMsgIds.values().next().value;
    botSentMsgIds.delete(oldest);
  }
}

function pushGroupHistory(jid, senderName, text) {
  if (!groupChatHistory.has(jid)) groupChatHistory.set(jid, []);
  const hist = groupChatHistory.get(jid);
  hist.push({ sender: senderName, text: text.slice(0, 350) });
  if (hist.length > 10) hist.shift();
}

export function ensureGroupAutoConfig(dbMemory, jid) {
  if (!dbMemory.groupSettings[jid]) {
    dbMemory.groupSettings[jid] = {
      antilink: false,
      antivirtek: true,
      antibug: true,
      antitoxic: true,
      antispam: true,
      welcome: false,
    };
  }
  const cfg = dbMemory.groupSettings[jid];
  if (typeof cfg.goodbye !== 'boolean') cfg.goodbye = cfg.welcome;
  if (typeof cfg.welcomeText !== 'string') {
    cfg.welcomeText =
      '👋 Selamat datang @user di *@group*!\n\n📌 *Info Grup:*\n@desc\n\nTotal member sekarang: *@count* orang.';
  }
  if (typeof cfg.goodbyeText !== 'string') {
    cfg.goodbyeText = '👋 Sampai jumpa @user, terima kasih sudah pernah bergabung di *@group*.';
  }
  if (typeof cfg.autoOpenTime !== 'string') cfg.autoOpenTime = '';
  if (typeof cfg.autoCloseTime !== 'string') cfg.autoCloseTime = '';
  if (!Array.isArray(cfg.activities)) cfg.activities = [];
  if (!cfg.memberFilter) {
    cfg.memberFilter = {
      enabled: false,
      allowedPrefixes: ['62'],
      requirePhoto: false,
      blacklist: [],
    };
  }
  // Mode interaksi diskusi: 'bebas' (nimbrung sesuai tema + reply), 'reply' (khusus reply/mention), 'off'
  if (!cfg.interactiveMode) cfg.interactiveMode = 'bebas';
  if (!cfg.interactiveSession) {
    cfg.interactiveSession = {
      active: false,
      theme: '',
      lastPrompt: '',
      expiresAt: 0,
    };
  }
  return cfg;
}

function getWibTimeAndDate() {
  const now = new Date();
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
  }).format(now);
  const day = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
  })
    .format(now)
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return { time, date, day };
}

function resolveTodayTheme(cfg) {
  const now = Date.now();
  if (cfg.interactiveSession?.active && cfg.interactiveSession.theme) {
    if (!cfg.interactiveSession.expiresAt || now < cfg.interactiveSession.expiresAt) {
      return {
        theme: cfg.interactiveSession.theme,
        lastPrompt: cfg.interactiveSession.lastPrompt || '',
        isLiveSession: true,
      };
    }
  }
  const { day } = getWibTimeAndDate();
  const todayActs = (cfg.activities || []).filter(
    (a) => (a.day || '').toLowerCase() === day || (a.day || '').toLowerCase() === 'setiap_hari'
  );
  if (todayActs.length > 0) {
    const cleanTopic = todayActs[0].content.replace(/^ai:/i, '').trim();
    return {
      theme: `${day.toUpperCase()} — ${cleanTopic}`,
      lastPrompt: cfg.interactiveSession?.lastPrompt || '',
      isLiveSession: false,
    };
  }
  return {
    theme: 'Diskusi Belajar & Sharing Komunitas',
    lastPrompt: '',
    isLiveSession: false,
  };
}

function formatWelcomeTemplate(template, { userTag, groupName, groupDesc, memberCount }) {
  return template
    .replace(/@user/gi, userTag)
    .replace(/@group/gi, groupName)
    .replace(/@desc/gi, groupDesc || 'Patuhi aturan grup & saling menghormati.')
    .replace(/@count/gi, String(memberCount));
}

function isValidTimeFormat(str) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(str);
}

// ============================================================
// AI ENGINE MULTI-FALLBACK (MATERI & INTERAKSI DISKUSI)
// ============================================================
async function askAIWithFallback(prompt, systemInstruction) {
  try {
    const primary = await panggilServerAISatSet(prompt, systemInstruction);
    if (primary && primary.trim().length > 12) return primary.trim();
  } catch {}

  try {
    const combined = `${systemInstruction}\n\n${prompt}`;
    const res = await fetchWithTimeout(
      `https://text.pollinations.ai/${encodeURIComponent(combined)}?model=openai`,
      { headers: { 'User-Agent': 'WHUXEN-BOT/1.0' } },
      15000
    );
    if (res.ok) {
      const txt = await res.text();
      if (txt && txt.trim().length > 12 && !txt.includes('<!DOCTYPE')) {
        return txt.trim();
      }
    }
  } catch {}

  return null;
}

async function generateStudyMaterialAI(topic) {
  const prompt =
    `Buatkan materi pembuka diskusi untuk grup belajar WhatsApp dengan tema: "${topic}". ` +
    `Format:\n` +
    `1. Penjelasan inti yang ringkas & asyik\n` +
    `2. 2-3 contoh praktis / kosakata / rumus\n` +
    `3. 1 tantangan atau pertanyaan interaktif di bagian akhir agar para member langsung menjawab di chat.\n` +
    `Gunakan Bahasa Indonesia santai-edukatif dan *bintang tunggal* untuk menebalkan poin.`;

  const aiText = await askAIWithFallback(
    prompt,
    'Kamu adalah mentor sekaligus teman diskusi yang asyik di grup belajar WhatsApp.'
  );
  if (aiText) return aiText;

  return (
    `📌 *Topik Hari Ini:* ${topic}\n\n` +
    `• Yuk kita bedah bareng materi *${topic}* hari ini!\n` +
    `• Tulis jawaban, contoh kalimat, atau pertanyaanmu di bawah pesan ini nanti aku tanggapi langsung.\n\n` +
    `💬 *Tantangan Awal:* Coba sebutkan 1 hal yang paling kamu pahami atau ingin tanyakan tentang *${topic}*!`
  );
}

// ============================================================
// 1. WELCOME MASUK & KELUAR OTOMATIS
// ============================================================
export async function handleGroupParticipantsUpdate(sock, dbMemory, update) {
  try {
    const { id: jid, participants, action } = update;
    if (!jid || !jid.endsWith('@g.us') || !Array.isArray(participants)) return;
    if (action !== 'add' && action !== 'remove') return;

    const cfg = ensureGroupAutoConfig(dbMemory, jid);
    if (action === 'add' && !cfg.welcome) return;
    if (action === 'remove' && !cfg.goodbye) return;

    const meta = await sock.groupMetadata(jid).catch(() => null);
    const groupName = meta?.subject || 'Grup Ini';
    const groupDesc = meta?.desc || '';
    const memberCount = meta?.participants?.length || 0;

    for (const participant of participants) {
      const num = participant.split('@')[0].split(':')[0];
      const userTag = `@${num}`;

      if (action === 'add') {
        const text = formatWelcomeTemplate(cfg.welcomeText, {
          userTag,
          groupName,
          groupDesc,
          memberCount,
        });
        const ppUrl = await sock.profilePictureUrl(participant, 'image').catch(() => null);
        if (ppUrl) {
          const sent = await sock.sendMessage(jid, {
            image: { url: ppUrl },
            caption: text,
            mentions: [participant],
          }).catch(() => null);
          trackBotMessage(sent);
        } else {
          const sent = await sock.sendMessage(jid, { text, mentions: [participant] }).catch(() => null);
          trackBotMessage(sent);
        }
      } else if (action === 'remove') {
        const text = formatWelcomeTemplate(cfg.goodbyeText, {
          userTag,
          groupName,
          groupDesc,
          memberCount,
        });
        const sent = await sock.sendMessage(jid, { text, mentions: [participant] }).catch(() => null);
        trackBotMessage(sent);
      }
    }
  } catch {}
}

// ============================================================
// 2. PENYARINGAN & PERSETUJUAN MEMBER MASUK OTOMATIS
// ============================================================
async function evaluateAndProcessJoinRequest(sock, dbMemory, jid, participant) {
  const cfg = ensureGroupAutoConfig(dbMemory, jid);
  const filter = cfg.memberFilter;
  if (!filter?.enabled) return { handled: false };

  const cleanNum = participant.split('@')[0].split(':')[0].replace(/\D/g, '');
  let rejectReason = '';

  if (filter.blacklist.includes(cleanNum)) {
    rejectReason = 'Nomor terdaftar di blacklist grup';
  }

  if (!rejectReason && Array.isArray(filter.allowedPrefixes) && filter.allowedPrefixes.length > 0) {
    const allowed = filter.allowedPrefixes.some((pref) => cleanNum.startsWith(pref));
    if (!allowed) {
      rejectReason = `Hanya nomor berawalan ${filter.allowedPrefixes.join('/')} yang diizinkan`;
    }
  }

  if (!rejectReason && filter.requirePhoto) {
    const pp = await sock.profilePictureUrl(participant, 'image').catch(() => null);
    if (!pp) {
      rejectReason = 'Wajib memasang foto profil publik sebelum bergabung';
    }
  }

  if (rejectReason) {
    await sock.groupRequestParticipantsUpdate(jid, [participant], 'reject').catch(() => {});
    await sock.sendMessage(jid, {
      text: `🛡️ *FILTER MEMBER OTOMATIS*\n• Nomor: +${cleanNum}\n• Keputusan: ❌ *DITOLAK*\n• Alasan: ${rejectReason}`,
    }).catch(() => {});
    return { handled: true, approved: false, reason: rejectReason };
  }

  await sock.groupRequestParticipantsUpdate(jid, [participant], 'approve').catch(() => {});
  await sock.sendMessage(jid, {
    text: `🛡️ *FILTER MEMBER OTOMATIS*\n• Nomor: +${cleanNum}\n• Keputusan: ✅ *DISETUJUI OTOMATIS*`,
  }).catch(() => {});
  return { handled: true, approved: true };
}

export async function handleGroupJoinRequestEvent(sock, dbMemory, event) {
  try {
    const { id: jid, participant, action } = event || {};
    if (!jid || !participant || action !== 'request') return;
    await evaluateAndProcessJoinRequest(sock, dbMemory, jid, participant);
  } catch {}
}

// ============================================================
// 3. EKSEKUTOR KEGIATAN GRUP + AKTIVASI SESI INTERAKSI TEMA
// ============================================================
async function executeGroupActivity(sock, jid, activity, dbMemory = null, saveMemory = null) {
  const type = (activity.type || 'jadwal').toLowerCase();
  const content = activity.content || '';
  const dayName = (activity.day || 'setiap_hari').toUpperCase();
  const dayLabel = dayName !== 'SETIAP_HARI' ? ` (${dayName})` : '';
  const cleanTopic = content.replace(/^ai:/i, '').trim();

  let sentMain = null;
  let promptSummary = cleanTopic;

  if (type === 'poll' || type === 'polling') {
    const parts = content.split(';').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      sentMain = await sock.sendMessage(jid, {
        poll: {
          name: `📊 ${parts[0]}`,
          values: parts.slice(1, 13),
          selectableCount: 1,
        },
      });
      promptSummary = parts[0];
    }
  } else if (type === 'materi') {
    const isAi = content.toLowerCase().startsWith('ai:');

    if (/absensi/i.test(cleanTopic)) {
      await sock.sendMessage(jid, {
        poll: {
          name: `📋 ABSENSI MEMBER${dayLabel} (${activity.time} WIB)`,
          values: ['✅ Hadir & Siap Belajar', '⏳ Menyusul', '🙏 Izin'],
          selectableCount: 1,
        },
      });
      const motivText = await generateStudyMaterialAI('Motivasi belajar singkat & sapaan hangat untuk member yang absen');
      sentMain = await sock.sendMessage(jid, {
        text: `🔥 *MOTIVASI & SAPAAN${dayLabel}*\n\n${motivText}\n\n_Ceritain target belajarmu minggu ini di bawah ya!_`,
      });
      promptSummary = motivText;
    } else if (/tanya jawab|interaksi member|free time/i.test(cleanTopic)) {
      const sesiText = await generateStudyMaterialAI(
        `${cleanTopic} — buat 3 pertanyaan kuis ringan dan pemantik obrolan seru untuk member grup`
      );
      sentMain = await sock.sendMessage(jid, {
        text: `💬 *SESI INTERAKTIF${dayLabel}*\n🕒 Pukul: ${activity.time} WIB\n\n${sesiText}\n\n_Langsung balas pesan ini atau sebut namaku untuk ngobrol bareng!_`,
      });
      promptSummary = sesiText;
    } else {
      const materiText = isAi ? await generateStudyMaterialAI(cleanTopic) : cleanTopic;
      sentMain = await sock.sendMessage(jid, {
        text: `📚 *MATERI & DISKUSI TEMA*${dayLabel}\n🕒 Pukul: ${activity.time} WIB\n\n${materiText}\n\n_💬 Jawab pertanyaan di atas atau tanya langsung di chat, aku siap bantu bahas bareng!_`,
      });
      promptSummary = materiText;
    }
  } else {
    sentMain = await sock.sendMessage(jid, {
      text: `🗓️ *PENGINGAT JADWAL GRUP*${dayLabel}\n⏰ Pukul ${activity.time} WIB\n\n${content}`,
    });
  }

  trackBotMessage(sentMain);
  pushGroupHistory(jid, 'BOT', promptSummary.slice(0, 300));

  // Otomatis aktifkan sesi interaksi tematik selama 3 jam ke depan
  if (dbMemory) {
    const cfg = ensureGroupAutoConfig(dbMemory, jid);
    cfg.interactiveSession = {
      active: true,
      theme: `${dayName !== 'SETIAP_HARI' ? dayName + ' - ' : ''}${cleanTopic}`,
      lastPrompt: promptSummary.slice(0, 500),
      expiresAt: Date.now() + 3 * 60 * 60 * 1000,
    };
    if (typeof saveMemory === 'function') await saveMemory();
  }
}

// ============================================================
// 4. INTERAKSI AKTIF BOT DENGAN MEMBER SESUAI TEMA JADWAL
// ============================================================
export async function handleGroupThemeInteraction({
  sock,
  jid,
  senderParticipant,
  pushName,
  rawText,
  unwrapped,
  msg,
  dbMemory,
  bot,
}) {
  try {
    if (!jid || !jid.endsWith('@g.us')) return false;
    if (!rawText || rawText.length < 2) return false;

    const cfg = ensureGroupAutoConfig(dbMemory, jid);
    pushGroupHistory(jid, pushName, rawText);

    if (cfg.interactiveMode === 'off') return false;

    const ctxInfo = unwrapped?.extendedTextMessage?.contextInfo;
    const quotedId = ctxInfo?.stanzaId || '';
    const quotedParticipant = ctxInfo?.participant || '';
    const mentionedJids = ctxInfo?.mentionedJid || [];

    const botNum = (sock.user?.id || '').split(':')[0].split('@')[0].replace(/\D/g, '');
    const botNameLower = (bot?.userName || 'whuxen').toLowerCase();
    const textLower = rawText.toLowerCase();

    const isReplyToBot =
      (quotedId && botSentMsgIds.has(quotedId)) ||
      (botNum && quotedParticipant.includes(botNum));
    const isMentioningBot =
      (botNum && mentionedJids.some((m) => m.includes(botNum))) ||
      new RegExp(`\\b(${botNameLower.split(/\s+/)[0]}|bot|tutor|min|kak bot)\\b`, 'i').test(textLower);

    const { theme, lastPrompt, isLiveSession } = resolveTodayTheme(cfg);

    // Jika mode 'reply', hanya merespons kalau di-reply atau dipanggil
    if (cfg.interactiveMode === 'reply' && !isReplyToBot && !isMentioningBot) {
      return false;
    }

    // Jika mode 'bebas', merespons jika di-reply/dipanggil ATAU saat sesi tema sedang aktif
    if (!isReplyToBot && !isMentioningBot && !isLiveSession) {
      return false;
    }

    // Anti-spam cooldown 4 detik per grup
    const lastHit = groupInteractionCooldown.get(jid) || 0;
    if (Date.now() - lastHit < 4000) return false;
    groupInteractionCooldown.set(jid, Date.now());

    const recentChat = (groupChatHistory.get(jid) || [])
      .map((m) => `${m.sender}: ${m.text}`)
      .join('\n');

    const systemPrompt =
      `Kamu adalah ${bot?.userName || 'WHUXEN BOT'}, teman diskusi sekaligus fasilitator aktif di grup belajar WhatsApp.\n` +
      `TEMA JADWAL SAAT INI: "${theme}"\n` +
      (lastPrompt ? `KONTEKS MATERI/PERTANYAAN TERAKHIR YANG KAMU KIRIM:\n"${lastPrompt.slice(0, 350)}"\n\n` : '') +
      `ATURAN INTERAKSI:\n` +
      `1. Bersikaplah hangat, akrab, suportif, dan interaktif (bukan kaku seperti dosen/robot).\n` +
      `2. Jika member menjawab soal/tantangan, apresiasi jawabannya, koreksi dengan ramah jika ada yang kurang tepat, lalu beri pertanyaan lanjutan atau ajak member lain ikut menanggapi.\n` +
      `3. Sesuaikan gaya dengan tema hari itu (misal: jika tema Bahasa Jepang N5, selipkan kosakata Jepang + romaji + artinya; jika Bahasa Jerman A2, selipkan frasa Jerman + artinya; jika Matematika, bimbing langkah demi langkah; jika Free Time/Sharing, ngobrol santai & seru).\n` +
      `4. Jika pesan member hanya obrolan singkat yang tidak nyambung dengan tema dan bukan ditujukan kepadamu, balas tepat dengan kata: SKIP\n` +
      `5. Jaga jawaban tetap ringkas (maksimal 3-5 kalimat pendek) agar enak dibaca di grup chat.`;

    const userPrompt =
      `Riwayat obrolan terakhir di grup:\n${recentChat}\n\n` +
      `Pesan terbaru dari ${pushName}: "${rawText}"\n` +
      `Tanggapi ${pushName} secara natural sesuai tema "${theme}":`;

    await sock.sendPresenceUpdate('composing', jid).catch(() => {});
    const reply = await askAIWithFallback(userPrompt, systemPrompt);

    if (!reply || /^skip$/i.test(reply.trim())) return false;

    const sent = await sock.sendMessage(
      jid,
      {
        text: reply,
        mentions: [senderParticipant],
      },
      { quoted: msg }
    );
    trackBotMessage(sent);
    pushGroupHistory(jid, 'BOT', reply);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// 5. SCHEDULER OTOMATIS (BUKA/TUTUP GRUP + KEGIATAN PER HARI)
// ============================================================
let schedulerStarted = false;
const executedLog = new Set();

export function startGroupAutomationScheduler(sock, dbMemory, saveMemory = null) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setInterval(async () => {
    try {
      const { time: nowWib, date: todayWib, day: todayDay } = getWibTimeAndDate();
      const groupJids = Object.keys(dbMemory.groupSettings || {});

      for (const jid of groupJids) {
        if (!jid.endsWith('@g.us')) continue;
        const cfg = ensureGroupAutoConfig(dbMemory, jid);

        if (cfg.autoOpenTime && cfg.autoOpenTime === nowWib) {
          const runKey = `open:${jid}:${todayWib}:${nowWib}`;
          if (!executedLog.has(runKey)) {
            executedLog.add(runKey);
            await sock.groupSettingUpdate(jid, 'not_announcement').catch(() => {});
            await sock.sendMessage(jid, {
              text: `🔓 *GRUP DIBUKA OTOMATIS* (${nowWib} WIB)\nSemua anggota sekarang dapat mengirim pesan kembali.`,
            }).catch(() => {});
          }
        }

        if (cfg.autoCloseTime && cfg.autoCloseTime === nowWib) {
          const runKey = `close:${jid}:${todayWib}:${nowWib}`;
          if (!executedLog.has(runKey)) {
            executedLog.add(runKey);
            await sock.groupSettingUpdate(jid, 'announcement').catch(() => {});
            await sock.sendMessage(jid, {
              text: `🔒 *GRUP DITUTUP OTOMATIS* (${nowWib} WIB)\nSementara hanya admin yang dapat mengirim pesan hingga jadwal buka berikutnya.`,
            }).catch(() => {});
          }
        }

        for (let i = 0; i < cfg.activities.length; i++) {
          const act = cfg.activities[i];
          const actDay = (act.day || 'setiap_hari').toLowerCase();
          const isDayMatch = actDay === 'setiap_hari' || actDay === todayDay;

          if (isDayMatch && act.time === nowWib) {
            const actKey = `act:${jid}:${i}:${todayWib}:${nowWib}`;
            if (!executedLog.has(actKey)) {
              executedLog.add(actKey);
              await executeGroupActivity(sock, jid, act, dbMemory, saveMemory).catch(() => {});
            }
          }
        }
      }

      if (executedLog.size > 500) executedLog.clear();
    } catch {}
  }, 25 * 1000);
}

// ============================================================
// 6. HANDLER PERINTAH ADMIN GRUP
// ============================================================
export async function handleGroupAutomationCommand({
  sock,
  jid,
  isGroup,
  senderParticipant,
  senderNum,
  isOwner,
  cmd,
  param,
  msg,
  dbMemory,
  saveMemory,
}) {
  if (!GROUP_AUTO_COMMANDS.includes(cmd)) return false;

  if (!isGroup) {
    await sock.sendMessage(jid, { text: '⚠️ Perintah ini hanya bisa digunakan di dalam grup.' }, { quoted: msg });
    return true;
  }

  let isAdmin = isOwner;
  let meta = null;
  try {
    meta = await sock.groupMetadata(jid);
    const pInfo = meta.participants.find(
      (p) => p.id === senderParticipant || p.id.split(':')[0].replace(/\D/g, '') === senderNum
    );
    if (pInfo?.admin === 'admin' || pInfo?.admin === 'superadmin') isAdmin = true;
  } catch {}

  if (!isAdmin) {
    await sock.sendMessage(jid, { text: '⛔ Perintah ini khusus Admin Grup.' }, { quoted: msg });
    return true;
  }

  const cfg = ensureGroupAutoConfig(dbMemory, jid);

  // KONTROL MODE INTERAKSI TEMATIK
  if (cmd === 'interaksi') {
    const mode = param.toLowerCase();
    if (!['bebas', 'reply', 'off'].includes(mode)) {
      const cur = resolveTodayTheme(cfg);
      await sock.sendMessage(
        jid,
        {
          text:
            `💬 *PENGATURAN INTERAKSI BOT DI GRUP*\n` +
            `• Mode Saat Ini: *${cfg.interactiveMode.toUpperCase()}*\n` +
            `• Tema Aktif: *${cur.theme}*\n\n` +
            `*Pilihan Mode:*\n` +
            `• \`interaksi bebas\` — Bot aktif nimbrung diskusi saat sesi tema berjalan + saat di-reply/dipanggil\n` +
            `• \`interaksi reply\` — Bot hanya membalas jika pesan bot di-reply atau namanya disebut\n` +
            `• \`interaksi off\` — Matikan obrolan AI di grup\n` +
            `• \`settema <judul>\` — Mulai sesi diskusi tema sekarang secara manual`,
        },
        { quoted: msg }
      );
      return true;
    }
    cfg.interactiveMode = mode;
    await saveMemory();
    await sock.sendMessage(
      jid,
      { text: `✅ Mode interaksi bot diubah menjadi: *${mode.toUpperCase()}*` },
      { quoted: msg }
    );
    return true;
  }

  if (cmd === 'settema') {
    if (!param) {
      await sock.sendMessage(
        jid,
        { text: '⚠️ Contoh: `settema Bahasa Jepang N5 - Percakapan Sehari-hari`' },
        { quoted: msg }
      );
      return true;
    }
    cfg.interactiveMode = cfg.interactiveMode === 'off' ? 'bebas' : cfg.interactiveMode;
    cfg.interactiveSession = {
      active: true,
      theme: param,
      lastPrompt: `Sesi diskusi manual dengan tema: ${param}`,
      expiresAt: Date.now() + 3 * 60 * 60 * 1000,
    };
    await saveMemory();

    const opener = await askAIWithFallback(
      `Sapa para member grup WhatsApp dengan ramah dan buka sesi diskusi interaktif bertema "${param}". Ajukan 1 pertanyaan pembuka yang seru agar member langsung ikut nimbrung.`,
      'Kamu adalah moderator sekaligus teman belajar yang seru di grup WhatsApp.'
    );

    const sent = await sock.sendMessage(
      jid,
      {
        text:
          `🎯 *SESI DISKUSI TEMA AKTIF (3 JAM)*\n` +
          `📌 Tema: *${param}*\n\n` +
          `${opener || `Halo semuanya! Yuk kita ngobrol dan diskusi bareng seputar *${param}*. Ada yang mau mulai duluan?`}`,
      },
      { quoted: msg }
    );
    trackBotMessage(sent);
    return true;
  }

  if (cmd === 'tutupinteraksi') {
    cfg.interactiveSession = { active: false, theme: '', lastPrompt: '', expiresAt: 0 };
    await saveMemory();
    await sock.sendMessage(jid, { text: '🛑 Sesi diskusi tema aktif telah ditutup.' }, { quoted: msg });
    return true;
  }

  if (cmd === 'panelgrup') {
    const cur = resolveTodayTheme(cfg);
    await sendNativeInteractiveButtons(
      sock,
      jid,
      {
        title: '⚙️ PANEL OTOMATISASI GRUP',
        body:
          `📌 *Grup:* ${meta?.subject || 'Grup'}\n` +
          `• *Mode Interaksi:* ${cfg.interactiveMode.toUpperCase()} (${cur.isLiveSession ? 'Sesi Live 🟢' : 'Standby'})\n` +
          `• *Tema Hari Ini:* ${cur.theme}\n` +
          `• *Welcome / Goodbye:* ${cfg.welcome ? 'ON' : 'OFF'} / ${cfg.goodbye ? 'ON' : 'OFF'}\n` +
          `• *Auto Buka / Tutup:* ${cfg.autoOpenTime || '-'} / ${cfg.autoCloseTime || '-'}\n` +
          `• *Filter & ACC Member:* ${cfg.memberFilter.enabled ? 'ON ✅' : 'OFF ❌'}\n` +
          `• *Kegiatan Terjadwal:* ${cfg.activities.length} jadwal`,
        footer: 'Gunakan settema <topik> atau teskegiatan semua',
        buttons: [
          { text: '🚀 Tes Semua Kegiatan', id: 'tessemuakegiatan' },
          { text: '📋 List Kegiatan', id: 'listkegiatan' },
          { text: '👋 Toggle Welcome', id: 'welcome' },
        ],
      },
      msg
    );
    return true;
  }

  if (cmd === 'welcome') {
    cfg.welcome = !cfg.welcome;
    await saveMemory();
    await sock.sendMessage(jid, { text: `👋 Welcome Masuk: *${cfg.welcome ? 'AKTIF ✅' : 'NONAKTIF ❌'}*` }, { quoted: msg });
    return true;
  }

  if (cmd === 'goodbye') {
    cfg.goodbye = !cfg.goodbye;
    await saveMemory();
    await sock.sendMessage(jid, { text: `🚪 Goodbye Keluar: *${cfg.goodbye ? 'AKTIF ✅' : 'NONAKTIF ❌'}*` }, { quoted: msg });
    return true;
  }

  if (cmd === 'setwelcome') {
    if (!param) {
      await sock.sendMessage(jid, { text: '⚠️ Contoh:\n`setwelcome Halo @user, selamat datang di @group! Member ke-@count`' }, { quoted: msg });
      return true;
    }
    cfg.welcomeText = param;
    cfg.welcome = true;
    await saveMemory();
    await sock.sendMessage(jid, { text: '✅ Teks Welcome berhasil disimpan & diaktifkan.' }, { quoted: msg });
    return true;
  }

  if (cmd === 'setgoodbye') {
    if (!param) {
      await sock.sendMessage(jid, { text: '⚠️ Contoh:\n`setgoodbye Dadah @user, semoga sukses selalu!`' }, { quoted: msg });
      return true;
    }
    cfg.goodbyeText = param;
    cfg.goodbye = true;
    await saveMemory();
    await sock.sendMessage(jid, { text: '✅ Teks Goodbye berhasil disimpan & diaktifkan.' }, { quoted: msg });
    return true;
  }

  if (cmd === 'autobuka') {
    if (!param) {
      await sock.sendMessage(jid, { text: '⚠️ Contoh: `autobuka 06:00` atau `autobuka off`' }, { quoted: msg });
      return true;
    }
    if (param.toLowerCase() === 'off') {
      cfg.autoOpenTime = '';
      await saveMemory();
      await sock.sendMessage(jid, { text: '✅ Jadwal buka grup otomatis dimatikan.' }, { quoted: msg });
      return true;
    }
    if (!isValidTimeFormat(param)) {
      await sock.sendMessage(jid, { text: '❌ Format jam harus `HH:mm` (24 jam), contoh: `06:30`' }, { quoted: msg });
      return true;
    }
    cfg.autoOpenTime = param;
    await saveMemory();
    await sock.sendMessage(jid, { text: `🔓 Grup diatur *BUKA OTOMATIS* setiap pukul *${param} WIB*.` }, { quoted: msg });
    return true;
  }

  if (cmd === 'autotutup') {
    if (!param) {
      await sock.sendMessage(jid, { text: '⚠️ Contoh: `autotutup 22:00` atau `autotutup off`' }, { quoted: msg });
      return true;
    }
    if (param.toLowerCase() === 'off') {
      cfg.autoCloseTime = '';
      await saveMemory();
      await sock.sendMessage(jid, { text: '✅ Jadwal tutup grup otomatis dimatikan.' }, { quoted: msg });
      return true;
    }
    if (!isValidTimeFormat(param)) {
      await sock.sendMessage(jid, { text: '❌ Format jam harus `HH:mm` (24 jam), contoh: `22:00`' }, { quoted: msg });
      return true;
    }
    cfg.autoCloseTime = param;
    await saveMemory();
    await sock.sendMessage(jid, { text: `🔒 Grup diatur *TUTUP OTOMATIS* setiap pukul *${param} WIB*.` }, { quoted: msg });
    return true;
  }

  if (cmd === 'syncjadwal') {
    const targetTime = isValidTimeFormat(param) ? param : '19:00';
    const desc = meta?.desc || '';
    const dayRegex = /(senin|selasa|rabu|kamis|jumat|sabtu|minggu)[^:\n]*:\s*([^\n]+)/gi;
    const found = [];
    let match;
    while ((match = dayRegex.exec(desc)) !== null) {
      const dayName = match[1].toLowerCase();
      const topic = match[2].replace(/[`*]/g, '').trim();
      if (topic) found.push({ day: dayName, topic });
    }

    if (!found.length) {
      await sock.sendMessage(
        jid,
        { text: '⚠️ Tidak ditemukan format jadwal `HARI : TOPIK` di deskripsi grup.' },
        { quoted: msg }
      );
      return true;
    }

    for (const item of found) {
      cfg.activities.push({
        day: item.day,
        time: targetTime,
        type: 'materi',
        content: `ai:${item.topic}`,
      });
    }
    await saveMemory();

    const summary = found.map((f) => `• *${f.day.toUpperCase()}* (${targetTime} WIB) → ${f.topic}`).join('\n');
    await sock.sendMessage(
      jid,
      { text: `✅ *${found.length} JADWAL MATERI AI BERHASIL DIAKTIFKAN DARI DESKRIPSI GRUP!*\n\n${summary}\n\nKetik \`teskegiatan semua\` untuk uji coba langsung.` },
      { quoted: msg }
    );
    return true;
  }

  if (cmd === 'tambahkegiatan') {
    const parts = param.split('|').map((s) => s.trim());
    if (parts.length < 3) {
      await sock.sendMessage(
        jid,
        {
          text:
            '⚠️ *Format Salah!* Gunakan:\n' +
            '`tambahkegiatan [hari] <HH:mm> | <materi/poll/jadwal> | <isi>`\n\n' +
            '*Contoh Per Hari:*\n`tambahkegiatan selasa 19:00 | materi | ai:Matematika Dasar`\n' +
            '*Contoh Setiap Hari:*\n`tambahkegiatan 08:00 | materi | ai:Motivasi belajar pagi`',
        },
        { quoted: msg }
      );
      return true;
    }

    const firstTokens = parts[0].toLowerCase().split(/\s+/);
    let day = 'setiap_hari';
    let time = '';

    if (firstTokens.length === 2 && VALID_DAYS.includes(firstTokens[0])) {
      day = firstTokens[0];
      time = firstTokens[1];
    } else {
      time = firstTokens[0];
    }

    if (!isValidTimeFormat(time)) {
      await sock.sendMessage(jid, { text: '❌ Format jam harus `HH:mm` (24 jam), contoh: `19:00` atau `selasa 19:00`' }, { quoted: msg });
      return true;
    }

    const type = parts[1].toLowerCase();
    const content = parts.slice(2).join(' | ');

    if (!['materi', 'poll', 'polling', 'jadwal'].includes(type)) {
      await sock.sendMessage(jid, { text: '❌ Jenis kegiatan harus: `materi`, `poll`, atau `jadwal`.' }, { quoted: msg });
      return true;
    }

    if ((type === 'poll' || type === 'polling') && content.split(';').filter((x) => x.trim()).length < 3) {
      await sock.sendMessage(
        jid,
        { text: '❌ Polling minimal punya 1 pertanyaan dan 2 pilihan dipisah tanda `;`\nContoh: `Pertanyaan ; Opsi 1 ; Opsi 2`' },
        { quoted: msg }
      );
      return true;
    }

    cfg.activities.push({ day, time, type: type === 'polling' ? 'poll' : type, content });
    await saveMemory();
    await sock.sendMessage(
      jid,
      {
        text:
          `✅ Kegiatan otomatis ditambahkan!\n` +
          `• Hari: *${day.toUpperCase()}*\n` +
          `• Jam: *${time} WIB*\n` +
          `• Jenis: *${type.toUpperCase()}*\n` +
          `• Total jadwal: *${cfg.activities.length}*`,
      },
      { quoted: msg }
    );
    return true;
  }

  if (cmd === 'listkegiatan') {
    if (!cfg.activities.length) {
      await sock.sendMessage(jid, { text: '📭 Belum ada jadwal kegiatan otomatis. Ketik `syncjadwal 19:00` untuk aktifkan dari deskripsi grup.' }, { quoted: msg });
      return true;
    }
    const listText = cfg.activities
      .map((a, idx) => {
        const d = (a.day || 'setiap_hari').toUpperCase();
        return `*${idx + 1}.* [${d} • ${a.time} WIB] *(${a.type.toUpperCase()})*\n    ${a.content.slice(0, 80)}`;
      })
      .join('\n\n');
    await sock.sendMessage(jid, { text: `🗓️ *DAFTAR KEGIATAN OTOMATIS GRUP*\n\n${listText}` }, { quoted: msg });
    return true;
  }

  if (cmd === 'hapuskegiatan') {
    if (param.toLowerCase() === 'semua') {
      cfg.activities = [];
      await saveMemory();
      await sock.sendMessage(jid, { text: '🗑️ Semua jadwal kegiatan berhasil dihapus.' }, { quoted: msg });
      return true;
    }
    const idx = parseInt(param, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= cfg.activities.length) {
      await sock.sendMessage(jid, { text: '⚠️ Masukkan nomor kegiatan yang valid (atau `hapuskegiatan semua`).' }, { quoted: msg });
      return true;
    }
    const removed = cfg.activities.splice(idx, 1)[0];
    await saveMemory();
    await sock.sendMessage(jid, { text: `🗑️ Kegiatan *[${removed.time} WIB] ${removed.type}* dihapus.` }, { quoted: msg });
    return true;
  }

  if (cmd === 'teskegiatan' || cmd === 'tessemuakegiatan' || cmd === 'testsemuakegiatan') {
    if (!cfg.activities.length) {
      await sock.sendMessage(
        jid,
        { text: '📭 Belum ada jadwal kegiatan yang tersimpan. Jalankan `syncjadwal 19:00` atau `tambahkegiatan` dulu.' },
        { quoted: msg }
      );
      return true;
    }

    const runAll =
      cmd === 'tessemuakegiatan' ||
      cmd === 'testsemuakegiatan' ||
      param.toLowerCase() === 'semua' ||
      param.toLowerCase() === 'all';

    if (runAll) {
      await sock.sendMessage(
        jid,
        { text: `🚀 *Menjalankan tes untuk ${cfg.activities.length} kegiatan terjadwal...*` },
        { quoted: msg }
      );
      for (let i = 0; i < cfg.activities.length; i++) {
        await executeGroupActivity(sock, jid, cfg.activities[i], dbMemory, saveMemory).catch(() => {});
        if (i < cfg.activities.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 3500));
        }
      }
      await sock.sendMessage(jid, { text: '✅ *Semua kegiatan terjadwal berhasil dites!*' }, { quoted: msg });
      return true;
    }

    const idx = parseInt(param, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= cfg.activities.length) {
      await sock.sendMessage(
        jid,
        { text: '⚠️ Masukkan nomor kegiatan atau ketik `teskegiatan semua`.\nContoh: `teskegiatan 1` atau `teskegiatan semua`' },
        { quoted: msg }
      );
      return true;
    }
    await executeGroupActivity(sock, jid, cfg.activities[idx], dbMemory, saveMemory);
    return true;
  }

  if (cmd === 'autoapprove') {
    cfg.memberFilter.enabled = !cfg.memberFilter.enabled;
    await saveMemory();
    await sock.sendMessage(
      jid,
      {
        text:
          `🛡️ *Filter & ACC Member Otomatis:* ${cfg.memberFilter.enabled ? 'AKTIF ✅' : 'NONAKTIF ❌'}\n` +
          `• Prefix Diizinkan: *${cfg.memberFilter.allowedPrefixes.join(', ') || 'Semua Negara'}*\n` +
          `• Wajib Foto Profil: *${cfg.memberFilter.requirePhoto ? 'Ya' : 'Tidak'}*\n` +
          `• Total Blacklist: *${cfg.memberFilter.blacklist.length} nomor*`,
      },
      { quoted: msg }
    );
    return true;
  }

  if (cmd === 'setfilter') {
    const [sub, val] = param.split(/\s+/);
    if (!sub || !val) {
      await sock.sendMessage(
        jid,
        {
          text:
            '⚠️ *Pengaturan Filter Member:*\n' +
            '• `setfilter prefix 62` (hanya nomor +62)\n' +
            '• `setfilter prefix 62,60` (nomor +62 & +60)\n' +
            '• `setfilter prefix all` (semua negara)\n' +
            '• `setfilter pp on` / `setfilter pp off` (wajib foto profil)',
        },
        { quoted: msg }
      );
      return true;
    }

    if (sub.toLowerCase() === 'prefix') {
      if (val.toLowerCase() === 'all') {
        cfg.memberFilter.allowedPrefixes = [];
      } else {
        cfg.memberFilter.allowedPrefixes = val.split(',').map((p) => p.replace(/\D/g, '')).filter(Boolean);
      }
      cfg.memberFilter.enabled = true;
      await saveMemory();
      await sock.sendMessage(
        jid,
        { text: `✅ Filter prefix disimpan: *${cfg.memberFilter.allowedPrefixes.join(', ') || 'Semua Negara'}*` },
        { quoted: msg }
      );
      return true;
    }

    if (sub.toLowerCase() === 'pp') {
      cfg.memberFilter.requirePhoto = val.toLowerCase() === 'on';
      cfg.memberFilter.enabled = true;
      await saveMemory();
      await sock.sendMessage(
        jid,
        { text: `✅ Wajib foto profil: *${cfg.memberFilter.requirePhoto ? 'AKTIF' : 'NONAKTIF'}*` },
        { quoted: msg }
      );
      return true;
    }
  }

  if (cmd === 'blacklistmember') {
    const num = param.replace(/\D/g, '');
    if (!num) {
      await sock.sendMessage(jid, { text: '⚠️ Contoh: `blacklistmember 628123456789`' }, { quoted: msg });
      return true;
    }
    if (!cfg.memberFilter.blacklist.includes(num)) cfg.memberFilter.blacklist.push(num);
    await saveMemory();
    await sock.sendMessage(jid, { text: `🚫 Nomor *+${num}* ditambahkan ke blacklist grup.` }, { quoted: msg });
    return true;
  }

  if (cmd === 'unblacklistmember') {
    const num = param.replace(/\D/g, '');
    cfg.memberFilter.blacklist = cfg.memberFilter.blacklist.filter((n) => n !== num);
    await saveMemory();
    await sock.sendMessage(jid, { text: `✅ Nomor *+${num}* dihapus dari blacklist.` }, { quoted: msg });
    return true;
  }

  if (cmd === 'cekrequest') {
    const pending = await sock.groupRequestParticipantsList(jid).catch(() => []);
    if (!pending || !pending.length) {
      await sock.sendMessage(jid, { text: '📭 Tidak ada permintaan bergabung yang menunggu persetujuan.' }, { quoted: msg });
      return true;
    }
    const daftar = pending.map((p, i) => `${i + 1}. +${p.jid.split('@')[0]}`).join('\n');
    await sendNativeInteractiveButtons(
      sock,
      jid,
      {
        title: `📥 PERMINTAAN GABUNG (${pending.length})`,
        body: daftar,
        footer: 'Pilih tindakan untuk seluruh antrean',
        buttons: [
          { text: '✅ Terima Semua', id: 'accsemua' },
          { text: '❌ Tolak Semua', id: 'tolaksemua' },
        ],
      },
      msg
    );
    return true;
  }

  if (cmd === 'accsemua' || cmd === 'tolaksemua') {
    const pending = await sock.groupRequestParticipantsList(jid).catch(() => []);
    if (!pending || !pending.length) {
      await sock.sendMessage(jid, { text: '📭 Antrean permintaan kosong.' }, { quoted: msg });
      return true;
    }
    const targets = pending.map((p) => p.jid);
    const act = cmd === 'accsemua' ? 'approve' : 'reject';
    await sock.groupRequestParticipantsUpdate(jid, targets, act).catch(() => {});
    await sock.sendMessage(
      jid,
      { text: `${act === 'approve' ? '✅ Berhasil menyetujui' : '❌ Berhasil menolak'} *${targets.length}* permintaan bergabung.` },
      { quoted: msg }
    );
    return true;
  }

  return true;
}
