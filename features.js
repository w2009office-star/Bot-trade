import fsPromises from 'fs/promises';
import path from 'path';
import http from 'http';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
import {
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  downloadContentFromMessage,
  proto,
} from '@whiskeysockets/baileys';

// ============================================================
// KONFIGURASI & KONTEKS BERSAMA
// ============================================================
let ctx = {};
let cachedSurahList = null;

export function initFeatures(sharedContext) {
  ctx = sharedContext;
}

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

// ============================================================
// STRUKTUR KATEGORI MENU LENGKAP
// ============================================================
export const MENU_CATEGORIES = {
  AI: [
    'ai', 'bot', 'gpt', 'gpt4', 'gpt4o', 'gpt5', 'chatgpt',
    'o1', 'o3', 'copilot', 'deepseek', 'deepseekr1', 'deepseekcoder',
    'deepseekmath', 'gemini', 'geminipro', 'geminiflash', 'grok',
    'claude', 'claudesonnet', 'qwen', 'llama3', 'mistral',
    'perplexity', 'mathgpt', 'grammar', 'memori', 'resetmemori',
  ],
  MAIN: [
    'menu', 'allmenu', 'aimenu', 'downloadmenu', 'searchmenu',
    'animemenu', 'funmenu', 'groupmenu', 'logomenu', 'toolsmenu',
    'ownermenu', 'ping', 'ping2', 'speed', 'os', 'alive', 'runtime',
    'uptime', 'status', 'selftest', 'cekfitur', 'owner', 'update',
    'githubstalk',
  ],
  DOWNLOAD: [
    'tiktok', 'tt', 'ttmp3', 'ttslide', 'ytmp4', 'ytmp3', 'ytdl',
    'yts', 'play', 'play2', 'song', 'spotify', 'video', 'igdl', 'fb',
    'twitter', 'capcut', 'mediafire', 'gdrive', 'gitclone', 'tts',
  ],
  SEARCH: [
    'define', 'wiki', 'cuaca', 'wthr', 'praytime', 'surah',
    'npm', 'fakta', 'motivasi',
  ],
  ANIME: [
    'waifu', 'neko', 'megumin', 'shinobu', 'awoo', 'maid', 'anime',
  ],
  FUN: [
    'kuroslash', 'slash', 'sonic', 'speedydash', 'game', 'tebakkata',
    'suit', 'mathgame', 'dice', 'coin', '8ball', 'rate', 'aura',
    'sigma', 'rizz', 'vibe', 'npc', 'maincharacter', 'delulu',
    'redflag', 'greenflag', 'compatibility', 'ship', 'roast',
    'compliment', 'pickup', 'quote', 'joke', 'truth', 'dare',
    'wyr', 'horoscope', 'hug', 'pat', 'wave', 'smile', 'dance',
    'highfive', 'wink', 'blush', 'happy', 'cry', 'sleep', 'think', 'poke',
  ],
  GROUP: [
    'groupsettings', 'gsettings', 'tagall', 'hidetag', 'everyone',
    'kick', 'add', 'promote', 'demote', 'mute', 'unmute', 'link',
    'revoke', 'ginfo', 'updategname', 'updategdesc', 'poll', 'delete',
    'antilink', 'antivirtek', 'antibug', 'antitoxic', 'antispam',
    'welcome', 'leave',
  ],
  STICKER_LOGO: [
    'sticker', 'stiker', 's', 'brat', 'bratvid', 'bratvideo',
    'ttp', 'attp', 'animasi', 'linkvideo', 'font', 'fancy',
    'logo', 'neon', 'gold', 'galaxy', 'glitch', 'matrix', 'graffiti', 'thunder',
  ],
  TOOLS: [
    'rvo', 'rvop', 'vv', 'hitung', 'catat', 'catatan', 'terjemah',
    'translate', 'id', 'getpp', 'getbio', 'gpass', 'qr', 'shorturl', 'waktu',
  ],
  OWNER: [
    'setnama', 'setname', 'botname', 'updatebio', 'block',
    'unblock', 'blocklist', 'autoread', 'autotyping', 'mode',
    'badwords', 'addkata', 'delkata', 'clean',
  ],
};

export const ALL_COMMANDS_SET = new Set(Object.values(MENU_CATEGORIES).flat());

export function toSmallCaps(str) {
  const map = {
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
    j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
    s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
  };
  return str.toLowerCase().split('').map((c) => map[c] || c).join('');
}

export function formatCategoryBox(title, cmds) {
  const lines = cmds.map((c) => `*┋ ⬡ ${toSmallCaps(c)}*`).join('\n');
  return `\`『 ${title.toUpperCase()} 』\`\n╭───────────────────⊷\n${lines}\n╰───────────────────⊷`;
}

export function getUptime() {
  const start = ctx.bot?.startTime || Date.now();
  const totalSeconds = Math.floor((Date.now() - start) / 1000);
  const jam = Math.floor(totalSeconds / 3600);
  const menit = Math.floor((totalSeconds % 3600) / 60);
  const detik = totalSeconds % 60;
  return `${jam}j ${menit}m ${detik}d`;
}

export function getTodayDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

export function getIndonesianFullDateTime() {
  const now = new Date();
  const hariTanggal = now.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const jam = now
    .toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(':', '.');
  return { hariTanggal, jam, full: `${hariTanggal} | ${jam} WIB` };
}

export function extractUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0].replace(/[.,!?)]+$/, '') : null;
}

export function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

export function formatDuration(seconds) {
  const s = parseInt(seconds, 10);
  if (!s || isNaN(s)) return '3:45';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function makeAsciiBar(percent, length = 10) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * length);
  return `[${'█'.repeat(filled)}${'░'.repeat(length - filled)}]`;
}

export function getServerHardwareStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramPercent = Number(((usedMem / totalMem) * 100).toFixed(1));

  let diskUsedGB = '34.28';
  let diskTotalGB = '314.42';
  let diskPercent = 10.9;

  try {
    const dfOut = execSync('df -k /', { encoding: 'utf-8' }).trim().split('\n')[1];
    const parts = dfOut.trim().split(/\s+/);
    const totalKB = parseInt(parts[1], 10);
    const usedKB = parseInt(parts[2], 10);
    if (!isNaN(totalKB) && totalKB > 0) {
      diskTotalGB = (totalKB / (1024 * 1024)).toFixed(2);
      diskUsedGB = (usedKB / (1024 * 1024)).toFixed(2);
      diskPercent = Number(((usedKB / totalKB) * 100).toFixed(1));
    }
  } catch {}

  return {
    ramPercent,
    ramBar: makeAsciiBar(ramPercent, 10),
    diskUsedGB,
    diskTotalGB,
    diskPercent,
    diskBar: makeAsciiBar(diskPercent, 10),
  };
}

// ============================================================
// NETWORK, STICKER MAKER (FOTO, VIDEO, TEKS, BRAT, BRATVID) & RVO
// ============================================================
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...DEFAULT_HEADERS, ...(options.headers || {}) },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function fetchBuffer(url, referer = '') {
  const headers = { ...DEFAULT_HEADERS };
  if (referer) headers.Referer = referer;
  const res = await fetchWithTimeout(url, { headers }, 25000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  const buf = Buffer.from(arr);
  if (buf.length < 200) throw new Error('File kosong');
  return buf;
}

let ffmpegAvailable = null;
function hasFfmpeg() {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

/**
 * Mengonversi Buffer Foto atau Video pendek menjadi Stiker WebP WhatsApp asli
 */
export async function mediaBufferToWebpSticker(inputBuffer, isVideo = false) {
  if (!inputBuffer) return null;

  if (hasFfmpeg()) {
    const id = crypto.randomBytes(6).toString('hex');
    const tmpDir = os.tmpdir();
    const ext = isVideo ? 'mp4' : 'png';
    const inPath = path.join(tmpDir, `stk_in_${id}.${ext}`);
    const outPath = path.join(tmpDir, `stk_out_${id}.webp`);

    try {
      await fsPromises.writeFile(inPath, inputBuffer);
      const vf = isVideo
        ? 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000'
        : 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000';
      const cmd = isVideo
        ? `ffmpeg -y -i "${inPath}" -t 6 -vf "${vf}" -c:v libwebp -loop 0 -q:v 65 -an "${outPath}"`
        : `ffmpeg -y -i "${inPath}" -vf "${vf}" -c:v libwebp -lossless 0 -q:v 80 -loop 0 -an "${outPath}"`;
      execSync(cmd, { stdio: 'ignore', timeout: 20000 });
      const webpBuf = await fsPromises.readFile(outPath);
      await fsPromises.unlink(inPath).catch(() => {});
      await fsPromises.unlink(outPath).catch(() => {});
      if (webpBuf && webpBuf.length > 100) return webpBuf;
    } catch {
      await fsPromises.unlink(inPath).catch(() => {});
      await fsPromises.unlink(outPath).catch(() => {});
    }
  }

  return null;
}

/**
 * Membuat Stiker BRAT (Gambar maupun Animasi Video Ketik)
 */
export async function createBratSticker(text, animated = false) {
  const cleanText = (text || 'brat').trim().slice(0, 80);

  if (animated) {
    // 1. Coba API Brat Video langsung terlebih dahulu
    const animApis = [
      `https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(cleanText)}&isAnimated=true&delay=450`,
      `https://delirius-apiofc.vercel.app/canvas/bratvid?text=${encodeURIComponent(cleanText)}`,
    ];
    for (const apiUrl of animApis) {
      const resBuf = await fetchBuffer(apiUrl).catch(() => null);
      if (resBuf && resBuf.length > 500) {
        // Jika sudah berbentuk RIFF WEBP langsung kembalikan
        if (resBuf.slice(0, 4).toString() === 'RIFF' && resBuf.slice(8, 12).toString() === 'WEBP') {
          return resBuf;
        }
        const converted = await mediaBufferToWebpSticker(resBuf, true);
        if (converted) return converted;
      }
    }

    // 2. Render frame demi frame kata demi kata jika ffmpeg tersedia
    if (hasFfmpeg()) {
      const words = cleanText.split(/\s+/);
      const id = crypto.randomBytes(6).toString('hex');
      const tmpDir = os.tmpdir();
      const framePaths = [];

      try {
        for (let i = 0; i < words.length; i++) {
          const partial = words.slice(0, i + 1).join(' ');
          const imgUrl = `https://dummyimage.com/512x512/8ACE00/000000.png&text=${encodeURIComponent(partial)}`;
          const frameBuf = await fetchBuffer(imgUrl).catch(() => null);
          if (frameBuf) {
            const fPath = path.join(tmpDir, `brat_${id}_${String(i).padStart(3, '0')}.png`);
            await fsPromises.writeFile(fPath, frameBuf);
            framePaths.push(fPath);
          }
        }
        if (framePaths.length > 0) {
          const outWebp = path.join(tmpDir, `brat_anim_${id}.webp`);
          const pattern = path.join(tmpDir, `brat_${id}_%03d.png`);
          execSync(
            `ffmpeg -y -framerate 2.5 -i "${pattern}" -vf "scale=512:512" -c:v libwebp -loop 0 -q:v 75 "${outWebp}"`,
            { stdio: 'ignore', timeout: 15000 }
          );
          const animWebp = await fsPromises.readFile(outWebp);
          for (const fp of framePaths) await fsPromises.unlink(fp).catch(() => {});
          await fsPromises.unlink(outWebp).catch(() => {});
          if (animWebp && animWebp.length > 300) return animWebp;
        }
      } catch {
        for (const fp of framePaths) await fsPromises.unlink(fp).catch(() => {});
      }
    }
  }

  // Mode Stiker BRAT Statis (atau fallback dari animasi)
  const staticApis = [
    `https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(cleanText)}`,
    `https://delirius-apiofc.vercel.app/canvas/brat?text=${encodeURIComponent(cleanText)}`,
    `https://wsrv.nl/?url=${encodeURIComponent(`https://dummyimage.com/512x512/8ACE00/000000.png&text=${encodeURIComponent(cleanText)}`)}&output=webp&w=512&h=512`,
  ];

  for (const url of staticApis) {
    const buf = await fetchBuffer(url).catch(() => null);
    if (buf && buf.length > 300) {
      if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
        return buf;
      }
      const webpViaWsrv = await fetchBuffer(
        `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=webp&w=512&h=512`
      ).catch(() => null);
      if (webpViaWsrv) return webpViaWsrv;
      const converted = await mediaBufferToWebpSticker(buf, false);
      if (converted) return converted;
    }
  }

  return null;
}

/**
 * Mengonversi URL gambar atau teks menjadi Stiker WebP via wsrv.nl / ffmpeg
 */
export async function urlOrTextToWebpSticker(textOrUrl) {
  const targetUrl = textOrUrl.startsWith('http')
    ? textOrUrl
    : `https://dummyimage.com/512x512/0f172a/38bdf8.png&text=${encodeURIComponent(textOrUrl.slice(0, 50))}`;

  const webpBuf = await fetchBuffer(
    `https://wsrv.nl/?url=${encodeURIComponent(targetUrl)}&output=webp&w=512&h=512&fit=contain`
  ).catch(() => null);

  if (webpBuf && webpBuf.length > 200) return webpBuf;

  const rawBuf = await fetchBuffer(targetUrl).catch(() => null);
  return await mediaBufferToWebpSticker(rawBuf, false);
}

/**
 * Ekstrak media dari pesan View Once (RVO - Read View Once)
 */
export async function extractAndDownloadViewOnce(quotedMessage) {
  if (!quotedMessage) return null;

  const container =
    quotedMessage.viewOnceMessageV2?.message ||
    quotedMessage.viewOnceMessageV2Extension?.message ||
    quotedMessage.viewOnceMessage?.message ||
    quotedMessage;

  if (container?.imageMessage && (container.imageMessage.viewOnce || quotedMessage.viewOnceMessage || quotedMessage.viewOnceMessageV2 || quotedMessage.viewOnceMessageV2Extension)) {
    const stream = await downloadContentFromMessage(container.imageMessage, 'image');
    let buf = Buffer.from([]);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
    return { type: 'image', buffer: buf, caption: container.imageMessage.caption || '' };
  }

  if (container?.videoMessage && (container.videoMessage.viewOnce || quotedMessage.viewOnceMessage || quotedMessage.viewOnceMessageV2 || quotedMessage.viewOnceMessageV2Extension)) {
    const stream = await downloadContentFromMessage(container.videoMessage, 'video');
    let buf = Buffer.from([]);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
    return { type: 'video', buffer: buf, caption: container.videoMessage.caption || '' };
  }

  if (container?.audioMessage && (container.audioMessage.viewOnce || quotedMessage.viewOnceMessage || quotedMessage.viewOnceMessageV2 || quotedMessage.viewOnceMessageV2Extension)) {
    const stream = await downloadContentFromMessage(container.audioMessage, 'audio');
    let buf = Buffer.from([]);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
    return { type: 'audio', buffer: buf, caption: '' };
  }

  return null;
}

// ============================================================
// KONVERTER LINK KE VIDEO PENDEK ANIMASI HD
// ============================================================
const HD_FALLBACK_ANIMATION_MP4_URLS = [
  'https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-blue-lines-996-large.mp4',
  'https://assets.mixkit.co/videos/preview/mixkit-abstract-technology-network-lines-27667-large.mp4',
];

export async function convertLinkToHdShortVideo(sourceUrl, fallbackLabel = 'WHUXEN HD') {
  let imgBuf = null;

  if (sourceUrl && sourceUrl.startsWith('http')) {
    const isDirectImage = /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(sourceUrl) || sourceUrl.includes('dummyimage.com');
    if (isDirectImage) {
      imgBuf = await fetchBuffer(sourceUrl).catch(() => null);
    } else {
      const shotApi = `https://api.microlink.io/?url=${encodeURIComponent(sourceUrl)}&screenshot=true&meta=false&embed=screenshot.url`;
      imgBuf = await fetchBuffer(shotApi).catch(() => null);
    }
  }

  if (!imgBuf) {
    const safeLabel = encodeURIComponent(fallbackLabel.slice(0, 32));
    imgBuf = await fetchBuffer(`https://dummyimage.com/1280x720/090d16/38bdf8.png&text=${safeLabel}`).catch(() => null);
  }

  if (imgBuf && hasFfmpeg()) {
    const id = crypto.randomBytes(6).toString('hex');
    const tmpDir = os.tmpdir();
    const inPath = path.join(tmpDir, `in_${id}.png`);
    const outPath = path.join(tmpDir, `out_${id}.mp4`);

    try {
      await fsPromises.writeFile(inPath, imgBuf);
      const cmd = `ffmpeg -y -loop 1 -i "${inPath}" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0022,1.18)':d=90:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720,format=yuv420p" -t 3 -r 30 -c:v libx264 -preset ultrafast -crf 22 -movflags +faststart "${outPath}"`;
      execSync(cmd, { stdio: 'ignore', timeout: 15000 });
      const videoBuf = await fsPromises.readFile(outPath);
      await fsPromises.unlink(inPath).catch(() => {});
      await fsPromises.unlink(outPath).catch(() => {});
      if (videoBuf && videoBuf.length > 2000) return { type: 'video', buffer: videoBuf };
    } catch {
      await fsPromises.unlink(inPath).catch(() => {});
      await fsPromises.unlink(outPath).catch(() => {});
    }
  }

  for (const mp4Url of HD_FALLBACK_ANIMATION_MP4_URLS) {
    const vidBuf = await fetchBuffer(mp4Url).catch(() => null);
    if (vidBuf && vidBuf.length > 5000) return { type: 'video', buffer: vidBuf };
  }

  return imgBuf ? { type: 'image', buffer: imgBuf } : null;
}

// ============================================================
// RICH INTERACTIVE UI (DITERUSKAN + VERIFIED CARD + TOMBOL TAP)
// ============================================================
export async function sendInteractiveButtons(
  sock,
  jid,
  {
    title = '',
    body = '',
    footer = '',
    buttons = [],
    sections = [],
    listTitle = '📂 Pilih Kategori',
    imageUrl = null,
    imageBuffer = null,
    mentions = [],
    forwardedCard = false,
  },
  quotedMsg = null
) {
  try {
    if (typeof sock.assertSessions === 'function' && !jid.endsWith('@g.us')) {
      await sock.assertSessions([jid], false).catch(() => {});
    }

    const nativeButtons = [];

    if (Array.isArray(sections) && sections.length > 0) {
      nativeButtons.push({
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: listTitle,
          sections,
        }),
      });
    }

    for (const btn of buttons) {
      if (btn.url && typeof btn.url === 'string' && btn.url.startsWith('https://')) {
        nativeButtons.push({
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({
            display_text: btn.text,
            url: btn.url,
            merchant_url: btn.url,
          }),
        });
      } else if (btn.id) {
        nativeButtons.push({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({
            display_text: btn.text,
            id: btn.id,
          }),
        });
      }
    }

    let headerMedia = {};
    let hasMedia = false;
    const imgBuf = imageBuffer || (imageUrl ? await fetchBuffer(imageUrl).catch(() => null) : null);

    if (imgBuf) {
      try {
        const uploaded = await prepareWAMessageMedia(
          { image: imgBuf },
          { upload: sock.waUploadToServer }
        );
        if (uploaded?.imageMessage) {
          headerMedia = { imageMessage: uploaded.imageMessage };
          hasMedia = true;
        }
      } catch {}
    }

    const contextInfo = {
      mentionedJid: mentions,
    };

    if (forwardedCard) {
      contextInfo.forwardingScore = 999;
      contextInfo.isForwarded = true;
      contextInfo.externalAdReply = {
        title: `WhatsApp ✓`,
        body: `Kontak: ${ctx.bot?.userName || 'AI Asisten'}`,
        thumbnail: imgBuf || undefined,
        mediaType: 1,
        renderLargerThumbnail: false,
        sourceUrl: ctx.CHANNEL_URL || 'https://whatsapp.com',
      };
    }

    const interactiveMsg = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({
        text: body || ' ',
      }),
      footer: proto.Message.InteractiveMessage.Footer.create({
        text: footer || ctx.bot.userName,
      }),
      header: proto.Message.InteractiveMessage.Header.create({
        title: title || '',
        subtitle: '',
        hasMediaAttachment: hasMedia,
        ...headerMedia,
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons: nativeButtons,
      }),
      contextInfo,
    });

    const waMsg = generateWAMessageFromContent(
      jid,
      { interactiveMessage: interactiveMsg },
      { userJid: sock.user?.id, quoted: quotedMsg || undefined }
    );

    await sock.relayMessage(jid, waMsg.message, {
      messageId: waMsg.key.id,
      additionalNodes: [
        {
          tag: 'biz',
          attrs: {},
          content: [
            {
              tag: 'interactive',
              attrs: { type: 'native_flow', v: '1' },
              content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
            },
          ],
        },
      ],
    });
    return true;
  } catch {
    const btnHints = buttons
      .filter((b) => b.id)
      .map((b) => `• Ketik *${b.id}* (${b.text})`)
      .join('\n');
    const fallbackText = `${title ? `*${title}*\n\n` : ''}${body}${btnHints ? `\n\n🔘 *Kontrol Sentuh:*\n${btnHints}` : ''}`;

    if (imageBuffer) {
      await sock.sendMessage(jid, { image: imageBuffer, caption: fallbackText, mentions }, { quoted: quotedMsg || undefined });
    } else if (imageUrl) {
      await sock.sendMessage(jid, { image: { url: imageUrl }, caption: fallbackText, mentions }, { quoted: quotedMsg || undefined }).catch(async () => {
        await sock.sendMessage(jid, { text: fallbackText, mentions }, { quoted: quotedMsg || undefined });
      });
    } else {
      await sock.sendMessage(jid, { text: fallbackText, mentions }, { quoted: quotedMsg || undefined });
    }
    return false;
  }
}

// ============================================================
// DETEKTOR KEAMANAN GRUP: ANTI-VIRTEK, ANTI-BUG & ANTI-LINK
// ============================================================
export function deteksiVirtekDanBug(msg, rawText, isSenderAdmin) {
  if (isSenderAdmin) return null;

  if (rawText.length > 3500) return 'Virtex / Teks Panjang Ekstrem (> 3.500 karakter)';
  if ((rawText.match(/\n/g) || []).length > 85) return 'Virtex / Spam Baris Berlebih';

  const zalgoMatches = rawText.match(/[\u0300-\u036f\u0483-\u0489\u0610-\u061a\u064b-\u065f]/g) || [];
  if (zalgoMatches.length > 25) return 'Bug Unicode / Zalgo Crasher';

  const rtlMatches = rawText.match(/[\u202a-\u202e\u2066-\u2069\u200b-\u200f\ufeff]/g) || [];
  if (rtlMatches.length > 20) return 'Bug RTL / Zero-Width Crasher';

  const m = msg.message || {};
  const contextInfo =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo;
  if ((contextInfo?.mentionedJid || []).length > 25) return 'Bug Mention / Tag Massal Berlebih';
  if (m.contactsArrayMessage?.contacts?.length > 15) return 'Bug vCard / Contact Bomb';
  if (m.documentMessage && (m.documentMessage.pageCount > 99999 || (m.documentMessage.fileName || '').length > 200)) {
    return 'Bug Document Crasher';
  }
  if (m.paymentInviteMessage || m.requestPaymentMessage) return 'Bug Payment Payload';

  return null;
}

// ============================================================
// LAYAR TAP LANGSUNG DI DALAM CHAT (KURO SLASH & SPEEDY DASH)
// ============================================================
export async function kirimTampilanKuroSlash(sock, jid, senderNum, state, statusEvent, quotedMsg) {
  const laneVisuals = [
    '┃  🥷  ┃   ·   ┃   ·   ┃',
    '┃   ·   ┃  🥷  ┃   ·   ┃',
    '┃   ·   ┃   ·   ┃  🥷  ┃',
  ];
  const enemyVisuals = [
    '┃  👹  ┃  🟡  ┃   ·   ┃',
    '┃   ·   ┃  👹  ┃  💣  ┃',
    '┃  🟡  ┃   ·   ┃  👹  ┃',
  ];
  const hpBlocks = Math.max(0, Math.round(state.hp / 10));
  const hpBar = '█'.repeat(hpBlocks) + '░'.repeat(10 - hpBlocks);

  const cardText = encodeURIComponent(
    `KURO SLASH  |  SCORE: ${state.score}  |  BEST: ${state.best}\nHP ${state.hp}/100  |  ULTI ${state.ulti}%  |  SPD ${state.speed.toFixed(1)}`
  );
  const cardImgUrl = `https://dummyimage.com/900x440/18060c/f43f5e.png&text=${cardText}`;

  const bodyText =
    `⚔️ *KURO SLASH* — _LONG ROAD · ONI GARDA_\n` +
    `🏆 *SCORE:* ${state.score}   |   👑 *BEST:* ${state.best}\n` +
    `❤️ *HP:* [${hpBar}] ${state.hp}/100\n` +
    `🌊 *ULTI:* ${state.ulti}%   |   ⚡ *SPD:* ${state.speed.toFixed(1)}\n\n` +
    `┏━━━━━━━┳━━━━━━━┳━━━━━━━┓\n` +
    `${enemyVisuals[state.wave % 3]}\n` +
    `┃   ·   ┃   ·   ┃   ·   ┃\n` +
    `${laneVisuals[state.lane]}\n` +
    `┗━━━━━━━┻━━━━━━━┻━━━━━━━┛\n\n` +
    `📢 ${statusEvent}\n` +
    `_⚔️ tebas+gelombang • PARRY peluru merah • tebas BOM = defuse_`;

  await sendInteractiveButtons(
    sock,
    jid,
    {
      title: '⚔️ KURO SLASH — LAYAR TAP',
      body: bodyText,
      footer: 'Sentuh tombol di bawah untuk menggerakkan karakter langsung!',
      imageUrl: cardImgUrl,
      forwardedCard: true,
      mentions: [`${senderNum}@s.whatsapp.net`],
      buttons: [
        { text: '◀ KIRI', id: 'kiri' },
        { text: '⚔️ TEBAS', id: 'tebas' },
        { text: '▶ KANAN', id: 'kanan' },
        { text: `🌊 ULTI — ${state.ulti}%`, id: 'ulti' },
      ],
    },
    quotedMsg
  );
}

export async function kirimTampilanSonic(sock, jid, senderNum, state, statusEvent, quotedMsg) {
  const trackFrame = state.laserAlert
    ? '☁️ ☀️ ☁️\n💨 🦔💨 ─── 🔴⚡ [LASER KEDIP CEPAT!]\n🌿🟩🟩🟩🟩🟩🟩🟩🟩🟩🌿'
    : '☁️ ☀️ ☁️\n💨 🦔💨 ─── 🪙 🪙 🪙 👾\n🌿🟩🟩🟩🟩🟩🟩🟩🟩🟩🌿';

  const cardText = encodeURIComponent(
    `SPEEDY DASH  |  RINGS: ${state.rings}  |  SCORE: ${state.score}  |  BEST: ${state.best}`
  );
  const cardImgUrl = `https://dummyimage.com/900x440/07263b/38bdf8.png&text=${cardText}`;

  const bodyText =
    `🌀 *SPEEDY DASH* — _EMERALD COAST RUN_\n` +
    `🪙 *RINGS:* ${state.rings}   |   🏆 *SCORE:* ${state.score}   |   👑 *BEST:* ${state.best}\n` +
    `⚡ *SPEED:* ${state.speed.toFixed(1)}   |   🚨 *STATUS:* ${state.laserAlert ? '🔴 LASER!' : '🟢 AMAN'}\n\n` +
    `${trackFrame}\n\n` +
    `📢 ${statusEvent}\n` +
    `_Lompat saat garis merah LASER kedip cepat! • tiap 50 ring = BOSS!_`;

  await sendInteractiveButtons(
    sock,
    jid,
    {
      title: '🌀 SPEEDY DASH — LAYAR TAP',
      body: bodyText,
      footer: 'Sentuh BOOST atau JUMP langsung di bawah!',
      imageUrl: cardImgUrl,
      forwardedCard: true,
      mentions: [`${senderNum}@s.whatsapp.net`],
      buttons: [
        { text: '⚡ BOOST', id: 'boost' },
        { text: '⬆️ JUMP', id: 'jump' },
        { text: '🛑 STOP GAME', id: 'stopgame' },
      ],
    },
    quotedMsg
  );
}

// ============================================================
// DOWNLOADER (TIKTOK, YOUTUBE, SPOTIFY PLAYER CARD, SOSMED)
// ============================================================
export async function generateSpotifyPlayerCardBuffer(title, artist, thumbnailUrl, duration) {
  const canvasApis = [
    `https://api.siputzx.my.id/api/canvas/spotify?title=${encodeURIComponent(title.slice(0, 32))}&author=${encodeURIComponent(artist.slice(0, 28))}&image=${encodeURIComponent(thumbnailUrl)}&start=0:00&end=${encodeURIComponent(duration || '3:54')}`,
    `https://delirius-apiofc.vercel.app/canvas/spotify?title=${encodeURIComponent(title.slice(0, 32))}&artist=${encodeURIComponent(artist.slice(0, 28))}&image=${encodeURIComponent(thumbnailUrl)}&duration=${encodeURIComponent(duration || '3:54')}`,
  ];

  for (const url of canvasApis) {
    const buf = await fetchBuffer(url).catch(() => null);
    if (buf && buf.length > 2000) return buf;
  }

  return await fetchBuffer(thumbnailUrl).catch(() => null);
}

export async function downloadTikTok(url) {
  try {
    const res = await fetchWithTimeout(
      'https://www.tikwm.com/api/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ url, hd: '1' }),
      },
      15000
    );
    const json = await res.json();
    if (json.code === 0 && json.data) {
      const fixUrl = (u) => (u && u.startsWith('/') ? `https://www.tikwm.com${u}` : u);
      const musicUrl = fixUrl(json.data.music || json.data.music_info?.play);
      const title = json.data.title || 'TikTok Media';

      if (Array.isArray(json.data.images) && json.data.images.length > 0) {
        return { type: 'image', images: json.data.images.map(fixUrl), musicUrl, title };
      }

      const videoUrl = fixUrl(json.data.hdplay || json.data.play);
      if (videoUrl) {
        return { type: 'video', videoUrl, musicUrl, title };
      }
    }
  } catch {}

  try {
    const res = await fetchWithTimeout(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`, {}, 15000);
    const json = await res.json();
    const musicUrl = json?.music?.play_url;
    if (Array.isArray(json?.images) && json.images.length > 0) {
      return { type: 'image', images: json.images.map((img) => img.url || img), musicUrl, title: json?.title || 'TikTok Slide' };
    }
    const videoUrl = json?.video?.noWatermark || json?.video?.watermark;
    if (videoUrl) {
      return { type: 'video', videoUrl, musicUrl, title: json?.title || 'TikTok HD' };
    }
  } catch {}

  return null;
}

export async function searchYouTube(query) {
  const pipedInstances = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de'];
  for (const base of pipedInstances) {
    try {
      const res = await fetchWithTimeout(`${base}/search?q=${encodeURIComponent(query)}&filter=videos`, {}, 10000);
      const json = await res.json();
      const items = (json?.items || []).filter((i) => i.url && i.title);
      if (items.length > 0) {
        return items.slice(0, 5).map((item) => {
          const vidId = extractYouTubeId(`https://www.youtube.com${item.url}`) || item.url.replace('/watch?v=', '');
          return {
            videoId: vidId,
            url: `https://www.youtube.com/watch?v=${vidId}`,
            title: item.title,
            author: item.uploaderName || 'YouTube',
            duration: formatDuration(item.duration),
            thumbnail: `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
          };
        });
      }
    } catch {}
  }

  try {
    const res = await fetchWithTimeout(`https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(query)}&type=video`, {}, 10000);
    const list = await res.json();
    if (Array.isArray(list) && list.length > 0) {
      return list.slice(0, 5).map((v) => ({
        videoId: v.videoId,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        title: v.title,
        author: v.author || 'YouTube',
        duration: formatDuration(v.lengthSeconds),
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      }));
    }
  } catch {}

  try {
    const res = await fetchWithTimeout(`https://delirius-apiofc.vercel.app/search/ytsearch?q=${encodeURIComponent(query)}`, {}, 10000);
    const json = await res.json();
    const list = json?.data || [];
    if (list.length > 0) {
      return list.slice(0, 5).map((v) => {
        const vidId = extractYouTubeId(v.url) || v.videoId;
        return {
          videoId: vidId,
          url: v.url || `https://www.youtube.com/watch?v=${vidId}`,
          title: v.title,
          author: v.author?.name || v.channel || 'YouTube',
          duration: v.duration?.timestamp || v.duration || '3:45',
          thumbnail: `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
        };
      });
    }
  } catch {}

  return [];
}

export async function downloadYouTube(rawUrl, isAudio = false) {
  const videoId = extractYouTubeId(rawUrl);
  const cleanUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : rawUrl;
  const type = isAudio ? 'ytmp3' : 'ytmp4';

  const apiCandidates = [
    async () => {
      const res = await fetchWithTimeout(`https://delirius-apiofc.vercel.app/download/${type}?url=${encodeURIComponent(cleanUrl)}`, {}, 14000);
      const json = await res.json();
      const dl = json?.data?.download?.url || json?.data?.url || json?.url;
      if (!dl) throw new Error('no url');
      return { url: dl, title: json?.data?.title || 'YouTube Media' };
    },
    async () => {
      const res = await fetchWithTimeout(`https://apis.davidcyriltech.my.id/download/${type}?url=${encodeURIComponent(cleanUrl)}`, {}, 14000);
      const json = await res.json();
      const dl = json?.result?.download_url || json?.result?.url || json?.url;
      if (!dl) throw new Error('no url');
      return { url: dl, title: json?.result?.title || 'YouTube Media' };
    },
    async () => {
      const res = await fetchWithTimeout(`https://api.siputzx.my.id/api/d/${type}?url=${encodeURIComponent(cleanUrl)}`, {}, 14000);
      const json = await res.json();
      const dl = json?.data?.dl || json?.data?.url || json?.result?.url;
      if (!dl) throw new Error('no url');
      return { url: dl, title: json?.data?.title || 'YouTube Media' };
    },
    async () => {
      if (!videoId) throw new Error('no id');
      const res = await fetchWithTimeout(`https://pipedapi.kavin.rocks/streams/${videoId}`, {}, 14000);
      const json = await res.json();
      if (isAudio) {
        const stream = (json?.audioStreams || []).find((s) => s.mimeType?.includes('mp4')) || json?.audioStreams?.[0];
        if (!stream?.url) throw new Error('no audio stream');
        return { url: stream.url, title: json?.title || 'YouTube Audio' };
      } else {
        const stream =
          (json?.videoStreams || []).find((s) => s.format === 'MPEG_4' && !s.videoOnly) ||
          (json?.videoStreams || []).find((s) => !s.videoOnly);
        if (!stream?.url) throw new Error('no video stream');
        return { url: stream.url, title: json?.title || 'YouTube Video' };
      }
    },
  ];

  for (const runner of apiCandidates) {
    try {
      const result = await runner();
      if (result && result.url && result.url.startsWith('http')) {
        return result;
      }
    } catch {}
  }

  return null;
}

export async function downloadSocialMedia(url, platform = 'aio') {
  const endpoints = [
    `https://delirius-apiofc.vercel.app/download/${platform === 'igdl' ? 'instagram' : platform === 'fb' ? 'facebook' : platform === 'twitter' ? 'twitter' : platform}?url=${encodeURIComponent(url)}`,
    `https://apis.davidcyriltech.my.id/download/${platform === 'igdl' ? 'instagram' : platform === 'fb' ? 'facebook' : platform === 'twitter' ? 'twitter' : platform}?url=${encodeURIComponent(url)}`,
    `https://api.siputzx.my.id/api/d/${platform}?url=${encodeURIComponent(url)}`,
    `https://api.siputzx.my.id/api/d/aio?url=${encodeURIComponent(url)}`,
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(ep, {}, 12000);
      const json = await res.json();
      const d = json?.data || json?.result || json;
      const dlUrl =
        (Array.isArray(d) && (d[0]?.url || d[0]?.downloadUrl || d[0]?.download_url)) ||
        d?.url ||
        d?.downloadUrl ||
        d?.download_url ||
        d?.download ||
        d?.hd ||
        d?.sd ||
        d?.medias?.[0]?.url ||
        d?.link;
      if (dlUrl && typeof dlUrl === 'string' && dlUrl.startsWith('http')) {
        return {
          url: dlUrl,
          filename: d?.filename || d?.title || `${platform}_download`,
          isImage: /\.(jpg|jpeg|png|webp)(\?|$)/i.test(dlUrl),
        };
      }
    } catch {}
  }
  return null;
}

// ============================================================
// CUACA INDONESIA, JADWAL SHOLAT & AL-QUR'AN
// ============================================================
function getWeatherDescID(code) {
  const map = {
    0: '☀️ Cerah', 1: '🌤️ Cerah Berawan', 2: '⛅ Berawan Sebagian', 3: '☁️ Mendung / Berawan',
    45: '🌫️ Berkabut', 48: '🌫️ Kabut Tebal', 51: '🌦️ Gerimis Ringan', 53: '🌦️ Gerimis Sedang',
    55: '🌧️ Gerimis Lebat', 61: '🌧️ Hujan Ringan', 63: '🌧️ Hujan Sedang', 65: '🌧️ Hujan Lebat',
    80: '🌦️ Hujan Lokal Ringan', 81: '🌧️ Hujan Lokal Sedang', 82: '⛈️ Hujan Lokal Deras',
    95: '⛈️ Hujan Petir', 96: '⛈️ Hujan Petir & Angin Kencang', 99: '⛈️ Badai Petir Lebat',
  };
  return map[code] || '🌤️ Berawan';
}

export async function getCuacaIndonesia(namaKota) {
  const geoRes = await fetchWithTimeout(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(namaKota)}&count=5&language=id&format=json`,
    {},
    12000
  );
  const geoJson = await geoRes.json();
  const results = geoJson?.results || [];
  if (results.length === 0) return null;

  const tempat = results.find((r) => r.country_code === 'ID') || results[0];
  const weatherRes = await fetchWithTimeout(
    `https://api.open-meteo.com/v1/forecast?latitude=${tempat.latitude}&longitude=${tempat.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FJakarta&forecast_days=1`,
    {},
    12000
  );
  const wJson = await weatherRes.json();
  const cur = wJson?.current;
  const daily = wJson?.daily;
  if (!cur) return null;

  const kondisi = getWeatherDescID(cur.weather_code);
  const wilayah = [tempat.name, tempat.admin1, tempat.country].filter(Boolean).join(', ');
  const suhu = `${cur.temperature_2m}°C`;
  const terasa = `${cur.apparent_temperature}°C`;
  const minMax = daily ? `${daily.temperature_2m_min[0]}°C - ${daily.temperature_2m_max[0]}°C` : '-';
  const labelGambar = encodeURIComponent(`${tempat.name.toUpperCase()} | ${suhu}`);
  const imageUrl = `https://dummyimage.com/800x380/0f172a/38bdf8.png&text=${labelGambar}`;

  const caption =
    `🌍 *PRAKIRAAN CUACA INDONESIA*\n` +
    `📍 *Wilayah:* ${wilayah}\n\n` +
    `• *Kondisi:* ${kondisi}\n` +
    `• *Suhu Saat Ini:* ${suhu} (Terasa ${terasa})\n` +
    `• *Suhu Min/Maks:* ${minMax}\n` +
    `• *Kelembaban:* ${cur.relative_humidity_2m}%\n` +
    `• *Kecepatan Angin:* ${cur.wind_speed_10m} km/jam\n` +
    `• *Curah Hujan:* ${cur.precipitation} mm`;

  return { caption, imageUrl };
}

export async function getJadwalSholatIndonesia(namaKota) {
  try {
    const cariRes = await fetchWithTimeout(`https://api.myquran.com/v2/sholat/kota/cari/${encodeURIComponent(namaKota)}`, {}, 10000);
    const cariJson = await cariRes.json();
    const kotaData = cariJson?.data?.[0];

    if (kotaData?.id) {
      const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
      const yyyy = nowWIB.getFullYear();
      const mm = String(nowWIB.getMonth() + 1).padStart(2, '0');
      const dd = String(nowWIB.getDate()).padStart(2, '0');

      const jadwalRes = await fetchWithTimeout(`https://api.myquran.com/v2/sholat/jadwal/${kotaData.id}/${yyyy}/${mm}/${dd}`, {}, 10000);
      const jadwalJson = await jadwalRes.json();
      const j = jadwalJson?.data?.jadwal;

      if (j) {
        return (
          `🕌 *JADWAL SHOLAT (KEMENAG RI)*\n` +
          `📍 *Wilayah:* ${jadwalJson.data.lokasi} (${jadwalJson.data.daerah})\n` +
          `📅 *Tanggal:* ${j.tanggal}\n\n` +
          `• *Imsak:* ${j.imsak}\n• *Subuh:* ${j.subuh}\n• *Terbit:* ${j.terbit}\n• *Dhuha:* ${j.dhuha}\n` +
          `• *Dzuhur:* ${j.dzuhur}\n• *Ashar:* ${j.ashar}\n• *Maghrib:* ${j.maghrib}\n• *Isya:* ${j.isya}`
        );
      }
    }
  } catch {}
  return null;
}

export async function getSurahLengkap(query) {
  try {
    if (!cachedSurahList) {
      const listRes = await fetchWithTimeout('https://equran.id/api/v2/surat', {}, 12000);
      const listJson = await listRes.json();
      if (Array.isArray(listJson?.data)) cachedSurahList = listJson.data;
    }

    let nomorSurah = parseInt(query, 10);
    if (isNaN(nomorSurah) && cachedSurahList) {
      const cleanQ = query.toLowerCase().replace(/[^a-z0-9]/g, '');
      const found = cachedSurahList.find((s) => {
        const cleanNama = s.namaLatin.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanNama.includes(cleanQ) || cleanQ.includes(cleanNama);
      });
      if (found) nomorSurah = found.nomor;
    }

    if (!nomorSurah || nomorSurah < 1 || nomorSurah > 114) nomorSurah = 1;

    const detailRes = await fetchWithTimeout(`https://equran.id/api/v2/surat/${nomorSurah}`, {}, 12000);
    const detailJson = await detailRes.json();
    const s = detailJson?.data;

    if (s && Array.isArray(s.ayat)) {
      const ayatSample = s.ayat
        .slice(0, 5)
        .map((a) => `*${a.nomorAyat}.* ${a.teksArab}\n_${a.teksLatin}_\nArtinya: "${a.teksIndonesia}"`)
        .join('\n\n');

      const text =
        `📖 *SURAH ${s.namaLatin.toUpperCase()} (${s.nama})*\n` +
        `• *Arti:* ${s.arti} | *Ayat:* ${s.jumlahAyat}\n\n${ayatSample}`;

      const audioUrl = s.audioFull?.['05'] || s.audioFull?.['01'] || null;
      return { text, audioUrl };
    }
  } catch {}
  return null;
}

// ============================================================
// FONT & AI ENGINE MULTI-API
// ============================================================
export const FONT_MAPS = [
  { a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ғ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ' },
  { a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭' },
  { a:'𝘢',b:'𝘣',c:'𝘤',d:'𝘥',e:'𝘦',f:'𝘧',g:'𝘨',h:'𝘩',i:'𝘪',j:'𝘫',k:'𝘬',l:'𝘭',m:'𝘮',n:'𝘯',o:'𝘰',p:'𝘱',q:'𝘲',r:'𝘳',s:'𝘴',t:'𝘵',u:'𝘶',v:'𝘷',w:'𝘸',x:'𝘹',y:'𝘺',z:'𝘻',A:'𝘈',B:'𝘉',C:'𝘊',D:'𝘋',E:'𝘌',F:'𝘍',G:'𝘎',H:'𝘏',I:'𝘐',J:'𝘑',K:'𝘒',L:'𝘓',M:'𝘔',N:'𝘕',O:'𝘖',P:'𝘗',Q:'𝘘',R:'𝘙',S:'𝘚',T:'𝘛',U:'𝘜',V:'𝘝',W:'𝘞',X:'𝘟',Y:'𝘠',Z:'𝘡' },
  { a:'𝚊',b:'𝚋',c:'𝚌',d:'𝚍',e:'𝚎',f:'𝚏',g:'𝚐',h:'𝚑',i:'𝚒',j:'𝚓',k:'𝚔',l:'𝚕',m:'𝚖',n:'𝚗',o:'𝚘',p:'𝚙',q:'𝚚',r:'𝚛',s:'𝚜',t:'𝚝',u:'𝚞',v:'𝚟',w:'𝚠',x:'𝚡',y:'𝚢',z:'𝚣',A:'𝙰',B:'𝙱',C:'𝙲',D:'𝙳',E:'𝙴',F:'𝙵',G:'𝙶',H:'𝙷',I:'𝙸',J:'𝙹',K:'𝙺',L:'𝙻',M:'𝙼',N:'𝙽',O:'𝙾',P:'𝙿',Q:'𝚀',R:'𝚁',S:'𝚂',T:'𝚃',U:'𝚄',V:'𝚅',W:'𝚆',X:'𝚇',Y:'𝚈',Z:'𝚉' },
  { a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'U',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ' },
  { a:'𝕒',b:'𝕓',c:'𝕔',d:'𝕕',e:'𝕖',f:'𝕗',g:'𝕘',h:'𝕙',i:'𝕚',j:'𝕛',k:'𝕜',l:'𝕝',m:'𝕞',n:'𝕟',o:'𝕠',p:'𝕡',q:'𝕢',r:'𝕣',s:'𝕤',t:'𝕥',u:'𝕦',v:'𝕧',w:'𝕨',x:'𝕩',y:'𝕪',z:'𝕫',A:'𝔸',B:'𝔹',C:'ℂ',D:'𝔻',E:'𝔼',F:'𝔽',G:'𝔾',H:'ℍ',I:'𝕀',J:'𝕁',K:'𝕂',L:'𝕃',M:'𝕄',N:'ℕ',O:'𝕆',P:'ℙ',Q:'ℚ',R:'ℝ',S:'𝕊',T:'𝕋',U:'𝕌',V:'𝕍',W:'𝕎',X:'𝕏',Y:'𝕐',Z:'ℤ' },
  { a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'ℯ',f:'𝒻',g:'ℊ',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'ℴ',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏',A:'𝒜',B:'ℬ',C:'𝒞',D:'𝒟',E:'ℰ',F:'ℱ',G:'𝒢',H:'ℋ',I:'ℐ',J:'𝒥',K:'𝒦',L:'ℒ',M:'ℳ',N:'𝒩',O:'𝒪',P:'𝒫',Q:'𝒬',R:'ℛ',S:'𝒮',T:'𝒯',U:'𝒰',V:'𝒱',W:'𝒲',X:'𝒳',Y:'𝒴',Z:'𝒵' },
  { a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷',A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ' },
  { a:'🄰',b:'🄱',c:'🄲',d:'🄳',e:'🄴',f:'🄵',g:'🄶',h:'🄷',i:'🄸',j:'🄹',k:'🄺',l:'🄻',m:'🄼',n:'🄽',o:'🄾',p:'🄿',q:'🅀',r:'🅁',s:'🅂',t:'🅃',u:'🅄',v:'🅅',w:'🅆',x:'🅇',y:'🅈',z:'🅉',A:'🄰',B:'🄱',C:'🄲',D:'🄳',E:'🄴',F:'🄵',G:'🄶',H:'🄷',I:'🄸',J:'🄹',K:'🄺',L:'🄻',M:'🄼',N:'🄽',O:'🄾',P:'🄿',Q:'🅀',R:'🅁',S:'🅂',T:'🅃',U:'🅄',V:'🅅',W:'🅆',X:'🅇',Y:'🅈',Z:'🅉' },
  { a:'🅰',b:'🅱',c:'🅲',d:'🅳',e:'🅴',f:'🅵',g:'🅶',h:'🅷',i:'🅸',j:'🅹',k:'🅺',l:'🅻',m:'🅼',n:'🅽',o:'🅾',p:'🅿',q:'🆀',r:'🆁',s:'🆂',t:'🆃',u:'🆄',v:'🆅',w:'🆆',x:'🆇',y:'🆈',z:'🆉',A:'🅰',B:'🅱',C:'🅲',D:'🅳',E:'🅴',F:'🅵',G:'🅶',H:'🅷',I:'🅸',J:'🅹',K:'🅺',L:'🅻',M:'🅼',N:'🅽',O:'🅾',P:'🅿',Q:'🆀',R:'🆁',S:'🆂',T:'🆃',U:'🆄',V:'🆅',W:'🆆',X:'🆇',Y:'🆈',Z:'🆉' },
];

export function applyFont(text, index) {
  const map = FONT_MAPS[index % FONT_MAPS.length];
  return text.split('').map((ch) => map[ch] || map[ch.toLowerCase()] || ch).join('');
}

function isValidAiText(txt) {
  if (!txt || typeof txt !== 'string') return false;
  const clean = txt.trim();
  if (clean.length < 2) return false;
  const lower = clean.toLowerCase();
  return !(
    lower.startsWith('<!doctype') ||
    lower.startsWith('<html') ||
    lower.includes('rate limit') ||
    lower.includes('bad gateway') ||
    lower.includes('service unavailable') ||
    lower.includes('queue full')
  );
}

export async function panggilServerAISatSet(prompt, systemPrompt) {
  const tasks = [];

  if (ctx.GEMINI_API_KEY) {
    tasks.push(
      (async () => {
        const res = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${ctx.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPrompt}\n\nPertanyaan: ${prompt}` }] }],
            }),
          },
          7000
        );
        if (!res.ok) throw new Error('Gemini fail');
        const data = await res.json();
        const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!isValidAiText(txt)) throw new Error('Invalid');
        return txt;
      })()
    );
  }

  tasks.push(
    (async () => {
      const res = await fetchWithTimeout(
        'https://text.pollinations.ai/',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            model: 'openai',
          }),
        },
        7500
      );
      if (!res.ok) throw new Error('Pollinations POST fail');
      const txt = (await res.text()).trim();
      if (!isValidAiText(txt)) throw new Error('Invalid');
      return txt;
    })()
  );

  tasks.push(
    (async () => {
      const res = await fetchWithTimeout(
        `https://api.siputzx.my.id/api/ai/gpt3?prompt=${encodeURIComponent(systemPrompt)}&content=${encodeURIComponent(prompt)}`,
        {},
        7500
      );
      if (!res.ok) throw new Error('Siputzx AI fail');
      const json = await res.json();
      const txt = (json?.data || json?.result || '').trim();
      if (!isValidAiText(txt)) throw new Error('Invalid');
      return txt;
    })()
  );

  try {
    return await Promise.any(tasks);
  } catch {
    return null;
  }
}

export async function getSmartAIResponse(prompt, senderJid, senderName, specialty = 'general') {
  const userData = ctx.dbMemory.users[senderJid] || { facts: [], history: [] };
  const faktaTersimpan =
    userData.facts.length > 0
      ? `Fakta pengguna (${senderName}): ${userData.facts.join('; ')}.`
      : `Nama pengguna: ${senderName}.`;

  let roleDesc = `Kamu adalah ${ctx.bot.userName}, asisten AI WhatsApp yang cerdas, cepat, dan ramah. Jawab singkat, jelas, dan langsung ke inti dalam Bahasa Indonesia.`;
  if (specialty === 'coder') roleDesc += ' Ahli pemrograman dan debugging kode.';
  if (specialty === 'math') roleDesc += ' Tutor matematika yang menjelaskan langkah demi langkah secara akurat.';
  if (specialty === 'grammar') roleDesc += ' Korektor tata bahasa dan ejaan.';

  const systemPrompt = `${roleDesc} ${faktaTersimpan}`;
  const jawaban = await panggilServerAISatSet(prompt, systemPrompt);

  if (jawaban) {
    if (!ctx.dbMemory.users[senderJid]) {
      ctx.dbMemory.users[senderJid] = { name: senderName, facts: [], history: [], lastSeen: new Date().toISOString() };
    }
    ctx.dbMemory.users[senderJid].history.push({ role: 'user', content: prompt.slice(0, 300) });
    ctx.dbMemory.users[senderJid].history.push({ role: 'assistant', content: jawaban.slice(0, 300) });
    if (ctx.dbMemory.users[senderJid].history.length > 6) {
      ctx.dbMemory.users[senderJid].history = ctx.dbMemory.users[senderJid].history.slice(-6);
    }
    ctx.saveMemory();
    return jawaban;
  }
  return null;
}

// ============================================================
// WEB PANEL KONEKSI & STATUS SERVER
// ============================================================
export function mulaiWeb() {
  const port = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://localhost:${port}`);

    if (parsedUrl.pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const qrImageUrl = ctx.bot.qr
        ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(ctx.bot.qr)}`
        : null;

      return res.end(
        JSON.stringify({
          connected: ctx.bot.connected,
          qrUrl: qrImageUrl,
          pairingCode: ctx.bot.pairingCode || (process.env.PHONE_NUMBER ? '⏳ Meminta Kode OTP...' : 'Isi PHONE_NUMBER di Variables'),
          uptime: getUptime(),
          version: ctx.dbMemory.version,
          lastUpdateDate: ctx.dbMemory.lastUpdateDate,
          userPhone: ctx.bot.userPhone || 'Belum Terhubung',
          userName: ctx.bot.userName || 'WHUXEN BOT',
          totalCommands: ALL_COMMANDS_SET.size,
          healthReport: ctx.dbMemory.healthReport,
          categories: MENU_CATEGORIES,
        })
      );
    }

    if (parsedUrl.pathname === '/api/trigger-update' && req.method === 'POST') {
      Promise.all([ctx.jalankanEvolusiMandiri(true), ctx.jalankanBackgroundSelfTest()]).then(([log]) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, log }));
      });
      return;
    }

    if (parsedUrl.pathname === '/api/set-name' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const { newName } = JSON.parse(body);
          if (newName) {
            ctx.bot.userName = newName;
            ctx.dbMemory.botSettings.customBotName = newName;
            await ctx.saveMemory();
            if (ctx.bot.sock) await ctx.bot.sock.updateProfileName(newName).catch(() => {});
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true }));
          }
        } catch {}
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Panel Bot WhatsApp AI</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
        body { background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { color: #38bdf8; margin: 0 0 5px 0; font-size: 1.7rem; }
        .container { display: flex; flex-wrap: wrap; gap: 20px; max-width: 1100px; width: 100%; }
        .panel { background: #1e293b; border-radius: 16px; padding: 24px; flex: 1; min-width: 320px; border: 1px solid #334155; }
        .panel-title { font-size: 1.1rem; color: #38bdf8; font-weight: bold; border-bottom: 1px solid #334155; padding-bottom: 10px; margin-bottom: 15px; }
        .qr-img { border: 4px solid #38bdf8; border-radius: 12px; margin: 15px 0; background: white; }
        .otp-box { font-size: 1.8rem; font-weight: bold; letter-spacing: 4px; color: #38bdf8; background: #0f172a; padding: 12px; border-radius: 10px; border: 2px dashed #38bdf8; margin: 15px 0; text-align: center; }
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
        .stat-card { background: #0f172a; padding: 10px 12px; border-radius: 10px; border-left: 4px solid #38bdf8; }
        .stat-card div { font-size: 0.78rem; color: #94a3b8; }
        .stat-card strong { font-size: 0.95rem; color: #f8fafc; }
        .input-group { display: flex; gap: 8px; margin: 12px 0; }
        .input-group input { flex: 1; padding: 10px; border: 1px solid #475569; background: #0f172a; color: white; border-radius: 8px; outline: none; }
        .btn { background: #0284c7; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .btn-green { background: #059669; width: 100%; margin-top: 8px; }
        .list-box { max-height: 170px; overflow-y: auto; background: #0f172a; border-radius: 8px; padding: 10px; font-size: 0.84rem; }
        .list-item { padding: 6px 0; border-bottom: 1px dashed #334155; }
        .badge { background: #10b981; color: white; padding: 5px 12px; border-radius: 12px; font-size: 0.85rem; font-weight: bold; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🚀 WHUXEN BOT CONTROL PANEL</h1>
        <p style="color:#94a3b8; margin:0;">Forwarded Profile Menu, Direct In-Chat Layar Tap, Brat Sticker & RVO</p>
      </div>
      <div class="container">
        <div class="panel">
          <div class="panel-title">📱 PANEL 1: KONEKSI WHATSAPP (QR & OTP)</div>
          <div id="p1-content">Memuat status koneksi...</div>
        </div>
        <div class="panel">
          <div class="panel-title">⚙️ PANEL 2: PENGATURAN & SELF-TEST SERVER</div>
          <div class="stat-grid">
            <div class="stat-card"><div>Versi & Update</div><strong id="st-ver">v7.0</strong></div>
            <div class="stat-card"><div>Bot Uptime</div><strong id="st-uptime">-</strong></div>
            <div class="stat-card"><div>Total Perintah Aktif</div><strong id="st-cmds">0</strong></div>
            <div class="stat-card"><div>Kesehatan Server</div><strong id="st-health">Menguji...</strong></div>
          </div>
          <div class="input-group">
            <input type="text" id="new-name-input" placeholder="Ubah nama bot...">
            <button class="btn" onclick="changeWaName()">Simpan</button>
          </div>
          <button class="btn btn-green" onclick="triggerUpdate()">🩺 Jalankan Self-Test & Evolusi Sekarang</button>
          <h4 style="margin: 15px 0 6px 0; color:#38bdf8;">🩺 Status Modul Latar Belakang:</h4>
          <div class="list-box" id="health-logs"></div>
          <h4 style="margin: 15px 0 6px 0; color:#38bdf8;">📂 Kategori Menu Aktif:</h4>
          <div class="list-box" id="menu-container"></div>
        </div>
      </div>
      <script>
        async function updateData() {
          try {
            const res = await fetch('/api/status');
            const d = await res.json();
            const p1 = document.getElementById('p1-content');
            if (d.connected) {
              p1.innerHTML = '<div style="text-align:center; padding:30px 0;"><span class="badge">✅ WA TERHUBUNG</span><p style="margin-top:15px; color:#cbd5e1;">Bot aktif melayani ' + d.totalCommands + ' fitur.</p><p style="color:#38bdf8;">Nomor Aktif: <b>' + d.userPhone + '</b></p></div>';
            } else {
              const qrHtml = d.qrUrl ? '<img src="' + d.qrUrl + '" class="qr-img" width="180" height="180" />' : '<p style="color:#94a3b8;">Menyiapkan QR Code...</p>';
              p1.innerHTML = '<div style="text-align:center;"><span class="badge" style="background:#ef4444;">🔴 MENUNGGU KONEKSI</span><div style="margin-top:15px;"><strong>Opsi 1: Scan QR Code</strong><br>' + qrHtml + '</div><div style="margin-top:10px;"><strong>Opsi 2: Kode Pairing (OTP)</strong><div class="otp-box">' + d.pairingCode + '</div></div></div>';
            }
            document.getElementById('st-ver').innerText = 'v' + d.version + ' (' + (d.lastUpdateDate || '-') + ')';
            document.getElementById('st-uptime').innerText = d.uptime;
            document.getElementById('st-cmds').innerText = d.totalCommands + ' Fitur';
            document.getElementById('st-health').innerText = d.healthReport?.summary || '-';
            const details = d.healthReport?.details || {};
            document.getElementById('health-logs').innerHTML = Object.entries(details).map(([k, v]) => '<div class="list-item"><b>' + k + '</b>: ' + v + '</div>').join('');
            document.getElementById('menu-container').innerHTML = Object.entries(d.categories).map(([cat, list]) => '<div class="list-item"><b style="color:#38bdf8;">' + cat + ' (' + list.length + ')</b>: ' + list.join(', ') + '</div>').join('');
          } catch {}
        }
        async function changeWaName() {
          const input = document.getElementById('new-name-input');
          if (!input.value.trim()) return;
          const res = await fetch('/api/set-name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newName: input.value.trim() }) });
          if ((await res.json()).success) { input.value = ''; updateData(); }
        }
        async function triggerUpdate() {
          const res = await fetch('/api/trigger-update', { method: 'POST' });
          if ((await res.json()).success) updateData();
        }
        setInterval(updateData, 2500);
        updateData();
      </script>
    </body>
    </html>`);
  });

  server.listen(port, () => console.log(`🌐 Web Panel berjalan di port ${port}`));
}
