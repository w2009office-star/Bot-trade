import { sendNativeInteractiveButtons, panggilServerAISatSet } from './engines.js';

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
          await sock.sendMessage(jid, {
            image: { url: ppUrl },
            caption: text,
            mentions: [participant],
          }).catch(() => {});
        } else {
          await sock.sendMessage(jid, { text, mentions: [participant] }).catch(() => {});
        }
      } else if (action === 'remove') {
        const text = formatWelcomeTemplate(cfg.goodbyeText, {
          userTag,
          groupName,
          groupDesc,
          memberCount,
        });
        await sock.sendMessage(jid, { text, mentions: [participant] }).catch(() => {});
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
// 3. EKSEKUTOR KEGIATAN GRUP (MATERI AI / POLLING / JADWAL)
// ============================================================
async function executeGroupActivity(sock, jid, activity) {
  const type = (activity.type || 'jadwal').toLowerCase();
  const content = activity.content || '';
  const dayLabel = activity.day && activity.day !== 'setiap_hari' ? ` (${activity.day.toUpperCase()})` : '';

  if (type === 'poll' || type === 'polling') {
    const parts = content.split(';').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      await sock.sendMessage(jid, {
        poll: {
          name: `📊 ${parts[0]}`,
          values: parts.slice(1, 13),
          selectableCount: 1,
        },
      });
    }
    return;
  }

  if (type === 'materi') {
    let materiText = content;
    if (content.toLowerCase().startsWith('ai:')) {
      const topic = content.slice(3).trim();
      const generated = await panggilServerAISatSet(
        `Buatkan materi belajar yang terstruktur, jelas, dan interaktif untuk grup belajar WhatsApp tentang topik: "${topic}". Sertakan penjelasan singkat, contoh praktis, dan 1 pertanyaan latihan di akhir agar member aktif berdiskusi.`,
        'Kamu adalah tutor cerdas komunitas belajar WhatsApp. Gunakan format poin-poin yang rapi dan mudah dibaca di HP.'
      );
      if (generated) materiText = generated;
    }
    await sock.sendMessage(jid, {
      text: `📚 *MATERI TERJADWAL AI*${dayLabel}\n🕒 Pukul: ${activity.time} WIB\n\n${materiText}`,
    });
    return;
  }

  await sock.sendMessage(jid, {
    text: `🗓️ *PENGINGAT JADWAL GRUP*${dayLabel}\n⏰ Pukul ${activity.time} WIB\n\n${content}`,
  });
}

// ============================================================
// 4. SCHEDULER OTOMATIS (BUKA/TUTUP GRUP + KEGIATAN PER HARI)
// ============================================================
let schedulerStarted = false;
const executedLog = new Set();

export function startGroupAutomationScheduler(sock, dbMemory) {
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
              await executeGroupActivity(sock, jid, act).catch(() => {});
            }
          }
        }
      }

      if (executedLog.size > 500) executedLog.clear();
    } catch {}
  }, 25 * 1000);
}

// ============================================================
// 5. HANDLER PERINTAH ADMIN GRUP
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

  if (cmd === 'panelgrup') {
    await sendNativeInteractiveButtons(
      sock,
      jid,
      {
        title: '⚙️ PANEL OTOMATISASI GRUP',
        body:
          `📌 *Grup:* ${meta?.subject || 'Grup'}\n` +
          `• *Welcome Masuk:* ${cfg.welcome ? 'ON ✅' : 'OFF ❌'}\n` +
          `• *Goodbye Keluar:* ${cfg.goodbye ? 'ON ✅' : 'OFF ❌'}\n` +
          `• *Auto Buka:* ${cfg.autoOpenTime || 'Nonaktif'}\n` +
          `• *Auto Tutup:* ${cfg.autoCloseTime || 'Nonaktif'}\n` +
          `• *Filter & ACC Member:* ${cfg.memberFilter.enabled ? 'ON ✅' : 'OFF ❌'} (Prefix: ${cfg.memberFilter.allowedPrefixes.join(',') || 'Semua'})\n` +
          `• *Kegiatan Terjadwal:* ${cfg.activities.length} jadwal`,
        footer: 'Ketik listkegiatan atau syncjadwal 19:00 untuk kelola materi AI',
        buttons: [
          { text: '📋 List Kegiatan', id: 'listkegiatan' },
          { text: '👋 Toggle Welcome', id: 'welcome' },
          { text: '🛡️ Toggle Filter Member', id: 'autoapprove' },
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

  // AUTO-SYNC JADWAL DARI DESKRIPSI GRUP
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
      { text: `✅ *${found.length} JADWAL MATERI AI BERHASIL DIAKTIFKAN DARI DESKRIPSI GRUP!*\n\n${summary}\n\nKetik \`teskegiatan 1\` untuk uji coba langsung.` },
      { quoted: msg }
    );
    return true;
  }

  // TAMBAH KEGIATAN MANUAL (SUPPORT HARI SPESIFIK ATAU SETIAP HARI)
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

  if (cmd === 'teskegiatan') {
    const idx = parseInt(param, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= cfg.activities.length) {
      await sock.sendMessage(jid, { text: '⚠️ Masukkan nomor kegiatan yang valid. Contoh: `teskegiatan 1`' }, { quoted: msg });
      return true;
    }
    await executeGroupActivity(sock, jid, cfg.activities[idx]);
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
