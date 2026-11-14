import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

import {
  fetchWithTimeout,
  fetchBuffer,
  searchYouTube,
  downloadYouTube,
  generateSpotifyPlayerCardBuffer,
  sendNativeInteractiveButtons,
  panggilServerAISatSet,
} from './engines.js';

const execFileAsync = promisify(execFile);
const spotifyLiveSessions = new Map();

export const SPOTIFY_LIVE_BUTTON_IDS = new Set([
  'splive_toggle',
  'splive_next',
  'splive_prev',
  'splive_lyrics',
  'splive_mp3',
  'splive_stop',
]);

// ============================================================
// HELPER WAKTU & FORMAT PROGRESS BAR
// ============================================================
function parseDurationToSeconds(durStr) {
  if (!durStr) return 210;
  const cleaned = String(durStr).trim().replace(/\./g, ':');
  const parts = cleaned.split(':').map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1 && parts[0] > 0) return parts[0];
  return 210;
}

function formatSeconds(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function buildProgressBar(elapsed, total, width = 16) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0;
  const pos = Math.min(width - 1, Math.floor(ratio * width));
  let bar = '';
  for (let i = 0; i < width; i++) {
    bar += i === pos ? '⚪' : '─';
  }
  return `${bar}\n${formatSeconds(elapsed)}                        ${formatSeconds(total)}`;
}

function cleanSongQuery(title = '', author = '') {
  const cleanTitle = title
    .replace(/\(.*?(official|lyric|lirik|video|audio|mv|hd|4k|live|remix|cover).*?\)/gi, '')
    .replace(/\[.*?(official|lyric|lirik|video|audio|mv|hd|4k|live|remix|cover).*?\]/gi, '')
    .replace(/\|.*$/g, '')
    .trim();
  const cleanAuthor = (author || '').replace(/-\s*Topic/i, '').trim();
  return `${cleanTitle} ${cleanAuthor}`.trim();
}

// ============================================================
// 1. AMBIL LIRIK TERSINKRONISASI (LRC REAL-TIME)
// ============================================================
function parseLrcText(lrcRaw) {
  const lines = [];
  const regex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)/;
  for (const rawLine of lrcRaw.split('\n')) {
    const match = rawLine.match(regex);
    if (!match) continue;
    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) / 1000 : 0;
    const text = match[4].trim();
    if (text) lines.push({ time: min * 60 + sec + ms, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

function distributePlainLyrics(plainText, durationSec) {
  const rawLines = plainText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\[.*\]$/.test(l));
  if (!rawLines.length) return [{ time: 0, text: '♪ Instrumental / Lirik tidak tersedia ♪' }];

  const usableDuration = Math.max(30, durationSec - 10);
  const step = usableDuration / rawLines.length;
  return rawLines.map((text, idx) => ({
    time: Math.floor(8 + idx * step),
    text,
  }));
}

async function fetchSyncedLyrics(title, author, durationSec) {
  const query = cleanSongQuery(title, author);
  try {
    const res = await fetchWithTimeout(
      `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': 'WHUXEN-BOT/1.0' } },
      8000
    );
    if (res.ok) {
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        const withSync = results.find((r) => r.syncedLyrics);
        if (withSync?.syncedLyrics) {
          const parsed = parseLrcText(withSync.syncedLyrics);
          if (parsed.length > 0) return parsed;
        }
        const withPlain = results.find((r) => r.plainLyrics);
        if (withPlain?.plainLyrics) {
          return distributePlainLyrics(withPlain.plainLyrics, durationSec);
        }
      }
    }
  } catch {}

  // Fallback AI jika database LRC belum punya lagunya
  try {
    const aiLyrics = await panggilServerAISatSet(
      `Tuliskan lirik lagu "${query}" baris demi baris tanpa penjelasan tambahan.`,
      'Kamu adalah database lirik lagu akurat. Tulis liriknya saja per baris.'
    );
    if (aiLyrics && aiLyrics.length > 20) {
      return distributePlainLyrics(aiLyrics, durationSec);
    }
  } catch {}

  return [{ time: 0, text: `🎵 Memutar: ${title}` }];
}

// ============================================================
// 2. AMBIL POTONGAN VIDEO KLIP LAGU (SPOTIFY LIVE CANVAS)
// ============================================================
async function fetchSongVideoClipBuffer(videoUrl) {
  const tmpId = `splive_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
  const outMp4 = path.join(os.tmpdir(), `${tmpId}.mp4`);

  // Jalur 1: yt-dlp + ffmpeg potong 12 detik bagian tengah lagu (ringan & cepat)
  try {
    const { stdout } = await execFileAsync(
      'yt-dlp',
      ['-f', 'best[height<=480][ext=mp4]/best[ext=mp4]', '--no-playlist', '-g', videoUrl],
      { timeout: 15000 }
    );
    const streamUrl = stdout.trim().split('\n')[0];
    if (streamUrl && streamUrl.startsWith('http')) {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-ss', '00:00:35',
          '-t', '12',
          '-i', streamUrl,
          '-vf', 'scale=480:-2',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-an',
          '-movflags', '+faststart',
          outMp4,
        ],
        { timeout: 25000 }
      );
      if (fs.existsSync(outMp4)) {
        const buf = await fsPromises.readFile(outMp4);
        await fsPromises.unlink(outMp4).catch(() => {});
        if (buf.length > 10000) return buf;
      }
    }
  } catch {
    await fsPromises.unlink(outMp4).catch(() => {});
  }

  // Jalur 2: Mirror API MP4 ringan jika yt-dlp/ffmpeg tidak terpasang di server
  const videoMirrors = [
    `https://api.vreden.my.id/api/ytmp4?url=${encodeURIComponent(videoUrl)}`,
    `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(videoUrl)}`,
    `https://api.agatz.xyz/api/ytmp4?url=${encodeURIComponent(videoUrl)}`,
  ];

  for (const api of videoMirrors) {
    try {
      const r = await fetchWithTimeout(api, {}, 10000);
      if (!r.ok) continue;
      const data = await r.json();
      const dlUrl =
        data?.result?.download?.url ||
        data?.result?.url ||
        data?.data?.dl ||
        data?.data?.url;
      if (dlUrl) {
        const buf = await fetchBuffer(dlUrl).catch(() => null);
        // Batasi maksimal 9 MB agar pengiriman cepat
        if (buf && buf.length > 15000 && buf.length < 9 * 1024 * 1024) {
          return buf;
        }
      }
    } catch {}
  }

  return null;
}

// ============================================================
// 3. DOWNLOAD AUDIO MP3 ANTI-GAGAL (MULTI-MIRROR)
// ============================================================
async function fetchResilientAudioBuffer(videoUrl) {
  // Coba engine bawaan dulu
  try {
    const primary = await downloadYouTube(videoUrl, true);
    if (primary?.buffer && primary.buffer.length > 10000) return primary.buffer;
  } catch {}

  // Jalur cadangan 1: yt-dlp lokal jika tersedia
  const tmpMp3 = path.join(os.tmpdir(), `splive_aud_${Date.now()}.mp3`);
  try {
    await execFileAsync(
      'yt-dlp',
      ['-x', '--audio-format', 'mp3', '--audio-quality', '128K', '--no-playlist', '-o', tmpMp3, videoUrl],
      { timeout: 25000 }
    );
    if (fs.existsSync(tmpMp3)) {
      const buf = await fsPromises.readFile(tmpMp3);
      await fsPromises.unlink(tmpMp3).catch(() => {});
      if (buf.length > 10000) return buf;
    }
  } catch {
    await fsPromises.unlink(tmpMp3).catch(() => {});
  }

  // Jalur cadangan 2: Public MP3 Mirrors
  const audioMirrors = [
    `https://api.vreden.my.id/api/ytmp3?url=${encodeURIComponent(videoUrl)}`,
    `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(videoUrl)}`,
    `https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(videoUrl)}`,
  ];

  for (const api of audioMirrors) {
    try {
      const r = await fetchWithTimeout(api, {}, 12000);
      if (!r.ok) continue;
      const data = await r.json();
      const dlUrl =
        data?.result?.download?.url ||
        data?.result?.url ||
        data?.data?.dl ||
        data?.data?.url;
      if (dlUrl) {
        const buf = await fetchBuffer(dlUrl).catch(() => null);
        if (buf && buf.length > 10000) return buf;
      }
    } catch {}
  }

  return null;
}

// ============================================================
// 4. RENDER TAMPILAN SPOTIFY LIVE & LIRIK BERJALAN
// ============================================================
function renderLiveLyricsCard(session) {
  const song = session.queue[session.index];
  const { elapsed, durationSec, lyrics, isPlaying, stopped } = session;

  let activeIdx = 0;
  for (let i = 0; i < lyrics.length; i++) {
    if (elapsed >= lyrics[i].time) activeIdx = i;
    else break;
  }

  const prevLine = activeIdx > 0 ? `_${lyrics[activeIdx - 1].text}_` : '_♪ ..._';
  const currLine = `▶ *${lyrics[activeIdx]?.text || '♪ ...'}*`;
  const nextLine = lyrics[activeIdx + 1] ? `_${lyrics[activeIdx + 1].text}_` : '_♪ Akhir lagu_';

  const statusBadge = stopped
    ? '⏹️ *SPOTIFY LIVE • STOPPED*'
    : isPlaying
    ? '🟢 *SPOTIFY LIVE • PLAYING*'
    : '⏸️ *SPOTIFY LIVE • PAUSED*';

  return (
    `${statusBadge}\n` +
    `*${song.title}*\n` +
    `${song.author} 🤍\n\n` +
    `📜 *LIRIK BERJALAN:*\n` +
    `${prevLine}\n` +
    `${currLine}\n` +
    `${nextLine}\n\n` +
    `${buildProgressBar(elapsed, durationSec)}\n` +
    `   🔀      ⏮      ${isPlaying ? '⏸' : '▶️'}      ⏭      🔁`
  );
}

function stopSessionTimer(jid) {
  const existing = spotifyLiveSessions.get(jid);
  if (existing?.timer) {
    clearInterval(existing.timer);
    existing.timer = null;
  }
}

async function sendControlButtons(sock, jid, session, quotedMsg) {
  const song = session.queue[session.index];
  await sendNativeInteractiveButtons(
    sock,
    jid,
    {
      title: '🎛️ KONTROL SPOTIFY LIVE',
      body: `Lagu aktif: *${song.title}* (${session.index + 1}/${session.queue.length})`,
      footer: 'Tekan tombol untuk Pause/Play, Ganti Lagu, atau Lihat Lirik',
      listTitle: '🎵 Opsi Tambahan',
      sections: [
        {
          title: 'FITUR SPOTIFY LIVE',
          rows: [
            { title: '📜 Tampilkan Lirik Lengkap', description: 'Kirim seluruh lirik lagu ini', id: 'splive_lyrics' },
            { title: '🎧 Kirim Ulang Audio MP3', description: 'Unduh file audio lagu ini', id: 'splive_mp3' },
            { title: '⏹️ Hentikan Lirik Berjalan', description: 'Matikan pemutar Spotify Live', id: 'splive_stop' },
          ],
        },
      ],
      buttons: [
        { text: session.isPlaying ? '⏸️ Pause' : '▶️ Play', id: 'splive_toggle' },
        { text: '⏮️ Prev', id: 'splive_prev' },
        { text: '⏭️ Next', id: 'splive_next' },
      ],
    },
    quotedMsg
  );
}

// ============================================================
// 5. MULAI SESI SPOTIFY LIVE (POTONGAN VIDEO + LIRIK + TOMBOL)
// ============================================================
export async function startSpotifyLiveSession(sock, jid, query, quotedMsg, existingQueue = null, startIndex = 0) {
  stopSessionTimer(jid);

  let queue = existingQueue;
  if (!queue || !queue.length) {
    queue = await searchYouTube(query);
  }

  const song = queue?.[startIndex];
  if (!song) {
    await sock.sendMessage(jid, { text: '❌ Lagu tidak ditemukan.' }, { quoted: quotedMsg });
    return null;
  }

  const durationSec = parseDurationToSeconds(song.duration);

  // Ambil lirik tersinkronisasi + potongan video klip secara paralel biar cepat
  const [lyrics, clipBuffer] = await Promise.all([
    fetchSyncedLyrics(song.title, song.author, durationSec),
    fetchSongVideoClipBuffer(song.url),
  ]);

  const session = {
    queue,
    index: startIndex,
    isPlaying: true,
    stopped: false,
    elapsed: 0,
    durationSec,
    lyrics,
    lyricsMsgKey: null,
    timer: null,
  };
  spotifyLiveSessions.set(jid, session);

  // 1. Kirim Potongan Video Klip Lagu (Spotify Canvas)
  const canvasCaption = `🎬 *SPOTIFY LIVE CANVAS*\n*${song.title}* — ${song.author}`;
  if (clipBuffer) {
    await sock.sendMessage(
      jid,
      {
        video: clipBuffer,
        gifPlayback: true,
        caption: canvasCaption,
        contextInfo: { forwardingScore: 999, isForwarded: true },
      },
      { quoted: quotedMsg }
    );
  } else {
    const cardBuf = await generateSpotifyPlayerCardBuffer(song.title, song.author, song.thumbnail, song.duration);
    if (cardBuf) {
      await sock.sendMessage(
        jid,
        { image: cardBuf, caption: canvasCaption, contextInfo: { forwardingScore: 999, isForwarded: true } },
        { quoted: quotedMsg }
      );
    }
  }

  // 2. Kirim Pesan Lirik Berjalan Live (akan di-edit otomatis tiap 4 detik)
  const sentLyricsMsg = await sock.sendMessage(
    jid,
    { text: renderLiveLyricsCard(session) },
    { quoted: quotedMsg }
  );
  session.lyricsMsgKey = sentLyricsMsg?.key || null;

  // 3. Kirim Tombol Kontrol Interaktif yang Berfungsi
  await sendControlButtons(sock, jid, session, quotedMsg);

  // 4. Jalankan Timer Lirik Berjalan (Update Live Setiap 4 Detik)
  session.timer = setInterval(async () => {
    const current = spotifyLiveSessions.get(jid);
    if (!current || current !== session || current.stopped) {
      clearInterval(session.timer);
      return;
    }
    if (!current.isPlaying) return;

    current.elapsed += 4;
    if (current.elapsed >= current.durationSec) {
      current.elapsed = current.durationSec;
      current.isPlaying = false;
      current.stopped = true;
      clearInterval(current.timer);
    }

    if (current.lyricsMsgKey) {
      await sock.sendMessage(jid, {
        text: renderLiveLyricsCard(current),
        edit: current.lyricsMsgKey,
      }).catch(() => {});
    }
  }, 4000);

  // 5. Kirim Audio MP3 di latar belakang agar langsung bisa diputar
  fetchResilientAudioBuffer(song.url)
    .then(async (audioBuf) => {
      if (audioBuf) {
        await sock.sendMessage(jid, { audio: audioBuf, mimetype: 'audio/mpeg', ptt: false }, { quoted: quotedMsg });
      } else {
        await sock.sendMessage(jid, { text: `🔗 *Link Streaming Langsung:* ${song.url}` }, { quoted: quotedMsg });
      }
    })
    .catch(() => {});

  return song;
}

// ============================================================
// 6. EKSEKUTOR TOMBOL KONTROL SPOTIFY LIVE
// ============================================================
export async function handleSpotifyLiveButton(sock, jid, actionId, quotedMsg) {
  const session = spotifyLiveSessions.get(jid);
  if (!session) {
    await sock.sendMessage(jid, { text: '⚠️ Tidak ada sesi Spotify Live aktif. Ketik `play <judul lagu>` dulu.' }, { quoted: quotedMsg });
    return true;
  }

  if (actionId === 'splive_toggle') {
    session.isPlaying = !session.isPlaying;
    session.stopped = false;
    if (session.lyricsMsgKey) {
      await sock.sendMessage(jid, {
        text: renderLiveLyricsCard(session),
        edit: session.lyricsMsgKey,
      }).catch(() => {});
    }
    await sendControlButtons(sock, jid, session, quotedMsg);
    return true;
  }

  if (actionId === 'splive_next') {
    const nextIdx = (session.index + 1) % session.queue.length;
    await startSpotifyLiveSession(sock, jid, '', quotedMsg, session.queue, nextIdx);
    return true;
  }

  if (actionId === 'splive_prev') {
    if (session.elapsed > 10) {
      session.elapsed = 0;
      session.isPlaying = true;
      if (session.lyricsMsgKey) {
        await sock.sendMessage(jid, {
          text: renderLiveLyricsCard(session),
          edit: session.lyricsMsgKey,
        }).catch(() => {});
      }
    } else {
      const prevIdx = (session.index - 1 + session.queue.length) % session.queue.length;
      await startSpotifyLiveSession(sock, jid, '', quotedMsg, session.queue, prevIdx);
    }
    return true;
  }

  if (actionId === 'splive_lyrics') {
    const song = session.queue[session.index];
    const fullText = session.lyrics.map((l) => l.text).join('\n');
    await sock.sendMessage(
      jid,
      { text: `📜 *LIRIK LENGKAP — ${song.title}*\n\n${fullText}` },
      { quoted: quotedMsg }
    );
    return true;
  }

  if (actionId === 'splive_mp3') {
    const song = session.queue[session.index];
    await sock.sendMessage(jid, { text: '⏳ *Mengambil audio MP3...*' }, { quoted: quotedMsg });
    const audioBuf = await fetchResilientAudioBuffer(song.url);
    if (audioBuf) {
      await sock.sendMessage(jid, { audio: audioBuf, mimetype: 'audio/mpeg', ptt: false }, { quoted: quotedMsg });
    } else {
      await sock.sendMessage(jid, { text: `🔗 *Tonton / Dengarkan di:* ${song.url}` }, { quoted: quotedMsg });
    }
    return true;
  }

  if (actionId === 'splive_stop') {
    session.isPlaying = false;
    session.stopped = true;
    stopSessionTimer(jid);
    if (session.lyricsMsgKey) {
      await sock.sendMessage(jid, {
        text: renderLiveLyricsCard(session),
        edit: session.lyricsMsgKey,
      }).catch(() => {});
    }
    spotifyLiveSessions.delete(jid);
    await sock.sendMessage(jid, { text: '⏹️ Pemutar Spotify Live dihentikan.' }, { quoted: quotedMsg });
    return true;
  }

  return false;
}
