import { sendNativeInteractiveButtons, panggilServerAISatSet } from './engines.js';

export const GROUP_AUTO_COMMANDS = [
  'welcome',
  'goodbye',
  'setwelcome',
  'setgoodbye',
  'autobuka',
  'autotutup',
  'tambahkegiatan',
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

// ============================================================
// INISIALISASI & DEFAULT KONFIGURASI GRUP
// ============================================================
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
  if (typeof cfg.autoOpenTime !== 'string') cfg.autoOpenTime = ''; // format HH:mm WIB
  if (typeof cfg.autoCloseTime !== 'string') cfg.autoCloseTime = ''; // format HH:mm WIB
  if (!Array.isArray(cfg.activities)) cfg.activities = [];
  if (!cfg.memberFilter) {
    cfg.memberFilter = {
      enabled: false,
      allowedPrefixes: ['62'], // kosongkan [] untuk izinkan semua negara
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
  return { time, date };
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
          await sock.sendMessage(jid, {
            text,
            mentions: [participant],
          }).catch(() => {});
        }
      } else if (action === 'remove') {
        const text = formatWelcomeTemplate(cfg.goodbyeText, {
          userTag,
          groupName,
          groupDesc,
          memberCount,
        });
        await sock.sendMessage(jid, {
          text,
          mentions: [participant],
        }).catch(() => {});
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

  // Cek Blacklist
  if (filter.blacklist.includes(cleanNum)) {
    rejectReason = 'Nomor terdaftar di blacklist grup';
  }

  // Cek Prefix Negara (misal wajib 62)
  if (!rejectReason && Array.isArray(filter.allowedPrefixes) && filter.allowedPrefixes.length > 0) {
    const allowed = filter.allowedPrefixes.some((pref) => cleanNum.startsWith(pref));
    if (!allowed) {
      rejectReason = `Hanya nomor berawalan ${filter.allowedPrefixes.join('/')} yang diizinkan`;
    }
  }

  // Cek Foto Profil jika diwajibkan
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
// 3. EKSEKUTOR KEGIATAN GRUP (MATERI / POLLING / JADWAL)
// ============================================================
async function executeGroupActivity(sock, jid, activity) {
  const type = (activity.type || 'jadwal').toLowerCase();
  const content = activity.content || '';

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
        `Buatkan materi singkat, terstruktur, dan bermanfaat untuk grup WhatsApp tentang: "${topic}". Gunakan poin-poin rapi agar mudah dibaca.`,
        'Kamu adalah pemateri komunitas WhatsApp yang edukatif, ringkas, dan menarik.'
      );
      if (generated) materiText = generated;
    }
    await sock.sendMessage(jid, {
      text: `📚 *MATERI OTOMATIS GRUP*\n🕒 Jadwal: ${activity.time} WIB\n\n${materiText}`,
    });
    return;
  }

  // Default: jadwal / pengumuman kegiatan
  await sock.sendMessage(jid, {
    text: `🗓️ *PENGINGAT JADWAL & KEGIATAN GRUP*\n⏰ Pukul ${activity.time} WIB\n\n${content}`,
  });
}

// ============================================================
// 4. SCHEDULER OTOMATIS (BUKA/TUTUP GRUP + KEGIATAN HARIAN)
// ============================================================
let schedulerStarted = false;
const executedLog = new Set();

export function startGroupAutomationScheduler(sock, dbMemory) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setInterval(async () => {
    try {
      const { time: nowWib, date: todayWib } = getWibTimeAndDate();
      const groupJids = Object.keys(dbMemory.groupSettings || {});

      for (const jid of groupJids) {
        if (!jid.endsWith('@g.us')) continue;
        const cfg = ensureGroupAutoConfig(dbMemory, jid);

        // A. Buka Grup Otomatis
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

        // B. Tutup Grup Otomatis
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

        // C. Kegiatan Grup Otomatis (Materi, Polling, Jadwal)
        for (let i = 0; i < cfg.activities.length; i++) {
          const act = cfg.activities[i];
          if (act.time === nowWib) {
            const actKey = `act:${jid}:${i}:${todayWib}:${nowWib}`;
            if (!executedLog.has(actKey)) {
              executedLog.add(actKey);
              await executeGroupActivity(sock, jid, act).catch(() => {});
            }
          }
        }
      }

      // Bersihkan cache eksekusi lama agar hemat RAM
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

  // Cek hak akses Admin Grup atau Owner
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

  // PANEL KONTROL INTERAKTIF GRUP
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
        footer: 'Gunakan tombol cepat atau ketik perintah pengaturan',
        buttons: [
          { text: '👋 Toggle Welcome', id: 'welcome' },
          { text: '🚪 Toggle Goodbye', id: 'goodbye' },
          { text: '🛡️ Toggle Filter Member', id: 'autoapprove' },
        ],
      },
      msg
    );
    return true;
  }

  // WELCOME & GOODBYE
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
      await sock.sendMessage(
        jid,
        { text: '⚠️ Contoh:\n`setwelcome Halo @user, selamat datang di @group! Member ke-@count`' },
        { quoted: msg }
      );
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
      await sock.sendMessage(
        jid,
        { text: '⚠️ Contoh:\n`setgoodbye Dadah @user, semoga sukses selalu!`' },
        { quoted: msg }
      );
      return true;
    }
    cfg.goodbyeText = param;
    cfg.goodbye = true;
    await saveMemory();
    await sock.sendMessage(jid, { text: '✅ Teks Goodbye berhasil disimpan & diaktifkan.' }, { quoted: msg });
    return true;
  }

  // BUKA & TUTUP GRUP OTOMATIS
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
    await sock.sendMessage(jid, { text: `🔓 Grup diatur **BUKA OTOMATIS** setiap pukul *${param} WIB*.` }, { quoted: msg });
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
    await sock.sendMessage(jid, { text: `🔒 Grup diatur **TUTUP OTOMATIS** setiap pukul *${param} WIB*.` }, { quoted: msg });
    return true;
  }

  // KEGIATAN GRUP OTOMATIS (MATERI / POLLING / JADWAL)
  if (cmd === 'tambahkegiatan') {
    const parts = param.split('|').map((s) => s.trim());
    if (parts.length < 3 || !isValidTimeFormat(parts[0])) {
      await sock.sendMessage(
        jid,
        {
          text:
            '⚠️ *Format Salah!* Gunakan:\n' +
            '`tambahkegiatan <HH:mm> | <materi/poll/jadwal> | <isi>`\n\n' +
            '*Contoh Materi AI:*\n`tambahkegiatan 08:00 | materi | ai:Tips belajar bahasa Inggris`\n' +
            '*Contoh Polling:*\n`tambahkegiatan 12:00 | poll | Jam berapa mabar? ; 19.00 WIB ; 21.00 WIB`\n' +
            '*Contoh Jadwal:*\n`tambahkegiatan 19:30 | jadwal | Diskusi rutin malam ini dimulai!`',
        },
        { quoted: msg }
      );
      return true;
    }

    const time = parts[0];
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

    cfg.activities.push({ time, type: type === 'polling' ? 'poll' : type, content });
    await saveMemory();
    await sock.sendMessage(
      jid,
      { text: `✅ Kegiatan otomatis ditambahkan!\n• Jam: *${time} WIB*\n• Jenis: *${type.toUpperCase()}*\n• Total jadwal: *${cfg.activities.length}*` },
      { quoted: msg }
    );
    return true;
  }

  if (cmd === 'listkegiatan') {
    if (!cfg.activities.length) {
      await sock.sendMessage(jid, { text: '📭 Belum ada jadwal kegiatan otomatis di grup ini.' }, { quoted: msg });
      return true;
    }
    const listText = cfg.activities
      .map((a, idx) => `*${idx + 1}.* [${a.time} WIB] *(${a.type.toUpperCase()})*\n    ${a.content.slice(0, 80)}`)
      .join('\n\n');
    await sock.sendMessage(jid, { text: `🗓️ *DAFTAR KEGIATAN OTOMATIS GRUP*\n\n${listText}` }, { quoted: msg });
    return true;
  }

  if (cmd === 'hapuskegiatan') {
    const idx = parseInt(param, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= cfg.activities.length) {
      await sock.sendMessage(jid, { text: '⚠️ Masukkan nomor kegiatan yang valid. Cek di `listkegiatan`.' }, { quoted: msg });
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

  // SARING & PERSETUJUAN MEMBER MASUK
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
        cfg.memberFilter.allowedPrefixes = val
          .split(',')
          .map((p) => p.replace(/\D/g, ''))
          .filter(Boolean);
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
