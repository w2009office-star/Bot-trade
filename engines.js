import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
import {
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  downloadContentFromMessage,
  proto,
} from '@whiskeysockets/baileys';

let sharedCtx = {};

export function bindEngineContext(context) {
  sharedCtx = context;
}

export const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

let ffmpegStatus = null;
export function hasFfmpeg() {
  if (ffmpegStatus !== null) return ffmpegStatus;
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    ffmpegStatus = true;
  } catch {
    ffmpegStatus = false;
  }
  return ffmpegStatus;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 11000) {
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

export async function fetchBuffer(url, referer = '', timeoutMs = 15000) {
  const headers = { ...DEFAULT_HEADERS };
  if (referer) headers.Referer = referer;
  const res = await fetchWithTimeout(url, { headers, redirect: 'follow' }, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  const buf = Buffer.from(arr);
  if (buf.length < 250) throw new Error('Buffer terlalu kecil');
  return buf;
}

export async function resolveFinalUrl(shortUrl) {
  try {
    const res = await fetchWithTimeout(shortUrl, { method: 'GET', redirect: 'follow' }, 9000);
    return res.url || shortUrl;
  } catch {
    return shortUrl;
  }
}

export function extractUrl(text) {
  const match = (text || '').match(/https?:\/\/[^\s]+/i);
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

// ============================================================
// 1. VALIDATOR & KONVERTER AUDIO MP3 ASLI (FIX 0:00 ERROR)
// ============================================================
export async function ensureValidMp3Buffer(rawBuffer) {
  if (!rawBuffer || rawBuffer.length < 2000) return null;

  const headText = rawBuffer.slice(0, 120).toString('utf-8').trim().toLowerCase();
  if (headText.startsWith('<!doctype') || headText.startsWith('<html') || headText.startsWith('{')) {
    return null;
  }

  if (hasFfmpeg()) {
    const id = crypto.randomBytes(6).toString('hex');
    const tmpDir = os.tmpdir();
    const inPath = path.join(tmpDir, `aud_in_${id}.bin`);
    const outPath = path.join(tmpDir, `aud_out_${id}.mp3`);
    try {
      await fsPromises.writeFile(inPath, rawBuffer);
      execSync(
        `ffmpeg -y -i "${inPath}" -vn -ar 44100 -ac 2 -b:a 128k -f mp3 "${outPath}"`,
        { stdio: 'ignore', timeout: 20000 }
      );
      const mp3Buf = await fsPromises.readFile(outPath);
      await fsPromises.unlink(inPath).catch(() => {});
      await fsPromises.unlink(outPath).catch(() => {});
      if (mp3Buf && mp3Buf.length > 3000) return mp3Buf;
    } catch {
      await fsPromises.unlink(inPath).catch(() => {});
      await fsPromises.unlink(outPath).catch(() => {});
    }
  }

  return rawBuffer;
}

// ============================================================
// 2. DOWNLOADER TIKTOK, CAPCUT, YOUTUBE & SOSMED (VALIDATED)
// ============================================================
export async function downloadTikTok(rawUrl) {
  const expandedUrl = await resolveFinalUrl(rawUrl);
  const candidates = Array.from(new Set([expandedUrl, rawUrl]));

  for (const targetUrl of candidates) {
    try {
      const res = await fetchWithTimeout(
        'https://www.tikwm.com/api/',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams({ url: targetUrl, hd: '1' }),
        },
        12000
      );
      const json = await res.json();
      if (json.code === 0 && json.data) {
        const fix = (u) => (u && u.startsWith('/') ? `https://www.tikwm.com${u}` : u);
        const musicUrl = fix(json.data.music || json.data.music_info?.play);
        const title = json.data.title || 'TikTok Video HD';
        if (Array.isArray(json.data.images) && json.data.images.length > 0) {
          return { type: 'image', images: json.data.images.map(fix), musicUrl, title };
        }
        const videoUrl = fix(json.data.hdplay || json.data.play || json.data.wmplay);
        if (videoUrl) return { type: 'video', videoUrl, musicUrl, title };
      }
    } catch {}

    try {
      const res = await fetchWithTimeout(
        `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(targetUrl)}`,
        {},
        11000
      );
      const json = await res.json();
      const d = json?.data || json?.result;
      const vid = d?.urls?.[0] || d?.video || d?.play || d?.hd;
      if (vid && typeof vid === 'string' && vid.startsWith('http')) {
        return { type: 'video', videoUrl: vid, musicUrl: d?.music || null, title: d?.title || 'TikTok HD' };
      }
    } catch {}
  }

  // Direct HTML Rehydration Scraper Fallback
  try {
    const htmlRes = await fetchWithTimeout(expandedUrl, {}, 10000);
    const html = await htmlRes.text();
    const m = html.match(/"playAddr":"([^"]+)"/);
    if (m && m[1]) {
      const cleanVid = m[1].replace(/\\u002F/g, '/');
      if (cleanVid.startsWith('http')) {
        return { type: 'video', videoUrl: cleanVid, musicUrl: null, title: 'TikTok Direct HD' };
      }
    }
  } catch {}

  return null;
}

export async function downloadCapCut(rawUrl) {
  const expandedUrl = await resolveFinalUrl(rawUrl);
  const candidates = Array.from(new Set([expandedUrl, rawUrl]));

  for (const targetUrl of candidates) {
    const apis = [
      `https://api.siputzx.my.id/api/d/capcut?url=${encodeURIComponent(targetUrl)}`,
      `https://delirius-apiofc.vercel.app/download/capcut?url=${encodeURIComponent(targetUrl)}`,
      `https://apis.davidcyriltech.my.id/download/capcut?url=${encodeURIComponent(targetUrl)}`,
    ];
    for (const ep of apis) {
      try {
        const res = await fetchWithTimeout(ep, {}, 10000);
        const json = await res.json();
        const d = json?.data || json?.result || json;
        const vidUrl = d?.videoUrl || d?.video || d?.url || d?.download_url || d?.originalVideoUrl;
        if (vidUrl && typeof vidUrl === 'string' && vidUrl.startsWith('http')) {
          return { url: vidUrl, title: d?.title || 'CapCut Template HD' };
        }
      } catch {}
    }
  }

  // Direct CapCut HTML Page Scraper
  try {
    const pageRes = await fetchWithTimeout(expandedUrl, {}, 10000);
    const html = await pageRes.text();
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/"video_url"\s*:\s*"([^"]+\.mp4[^"]*)"/i) ||
      html.match(/(https:\/\/[^"'\s\\]+\.capcutcdn\.com\/[^"'\s\\]+\.mp4[^"'\s\\]*)/i);
    if (ogMatch && ogMatch[1]) {
      const cleanUrl = ogMatch[1].replace(/\\u002F/g, '/').replace(/&amp;/g, '&');
      return { url: cleanUrl, title: 'CapCut Template HD' };
    }
  } catch {}

  return null;
}

export async function searchYouTube(query) {
  try {
    const res = await fetchWithTimeout(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=id&gl=ID`,
      {},
      9000
    );
    const html = await res.text();
    const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});<\/script>/);
    if (match && match[1]) {
      const data = JSON.parse(match[1]);
      const sections =
        data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
      const found = [];
      for (const sec of sections) {
        const items = sec?.itemSectionRenderer?.contents || [];
        for (const item of items) {
          const vr = item?.videoRenderer;
          if (vr?.videoId) {
            found.push({
              videoId: vr.videoId,
              url: `https://www.youtube.com/watch?v=${vr.videoId}`,
              title: vr.title?.runs?.map((r) => r.text).join('') || query,
              author: vr.ownerText?.runs?.[0]?.text || 'YouTube Music',
              duration: vr.lengthText?.simpleText || '3:45',
              thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
            });
            if (found.length >= 5) break;
          }
        }
        if (found.length >= 5) break;
      }
      if (found.length > 0) return found;
    }
  } catch {}

  const mirrorTasks = [
    async () => {
      const r = await fetchWithTimeout(`https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(query)}`, {}, 8000);
      const j = await r.json();
      if (!Array.isArray(j?.data) || !j.data.length) throw new Error('empty');
      return j.data.slice(0, 5).map((v) => {
        const id = extractYouTubeId(v.url) || v.videoId;
        return {
          videoId: id,
          url: v.url || `https://www.youtube.com/watch?v=${id}`,
          title: v.title || query,
          author: v.author?.name || 'YouTube',
          duration: v.timestamp || '3:45',
          thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        };
      });
    },
    async () => {
      const r = await fetchWithTimeout(`https://delirius-apiofc.vercel.app/search/ytsearch?q=${encodeURIComponent(query)}`, {}, 8000);
      const j = await r.json();
      if (!Array.isArray(j?.data) || !j.data.length) throw new Error('empty');
      return j.data.slice(0, 5).map((v) => {
        const id = extractYouTubeId(v.url) || v.videoId;
        return {
          videoId: id,
          url: v.url || `https://www.youtube.com/watch?v=${id}`,
          title: v.title || query,
          author: v.author?.name || 'YouTube',
          duration: v.duration?.timestamp || '3:45',
          thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        };
      });
    },
  ];

  try {
    return await Promise.any(mirrorTasks.map((fn) => fn()));
  } catch {
    return [];
  }
}

export async function downloadYouTube(rawUrl, isAudio = false) {
  const videoId = extractYouTubeId(rawUrl);
  const cleanUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : rawUrl;
  const type = isAudio ? 'ytmp3' : 'ytmp4';

  const candidates = [
    async () => {
      const res = await fetchWithTimeout(`https://api.siputzx.my.id/api/d/${type}?url=${encodeURIComponent(cleanUrl)}`, {}, 11000);
      const json = await res.json();
      const dl = json?.data?.dl || json?.data?.url || json?.result?.url;
      if (!dl) throw new Error('no url');
      return { url: dl, title: json?.data?.title || 'YouTube Media' };
    },
    async () => {
      const res = await fetchWithTimeout(`https://delirius-apiofc.vercel.app/download/${type}?url=${encodeURIComponent(cleanUrl)}`, {}, 11000);
      const json = await res.json();
      const dl = json?.data?.download?.url || json?.data?.url || json?.url;
      if (!dl) throw new Error('no url');
      return { url: dl, title: json?.data?.title || 'YouTube Media' };
    },
    async () => {
      const res = await fetchWithTimeout(`https://apis.davidcyriltech.my.id/download/${type}?url=${encodeURIComponent(cleanUrl)}`, {}, 11000);
      const json = await res.json();
      const dl = json?.result?.download_url || json?.result?.url || json?.url;
      if (!dl) throw new Error('no url');
      return { url: dl, title: json?.result?.title || 'YouTube Media' };
    },
    async () => {
      if (!videoId) throw new Error('no id');
      const res = await fetchWithTimeout(`https://pipedapi.kavin.rocks/streams/${videoId}`, {}, 11000);
      const json = await res.json();
      if (isAudio) {
        const stream = (json?.audioStreams || []).find((s) => s.mimeType?.includes('mp4')) || json?.audioStreams?.[0];
        if (!stream?.url) throw new Error('no stream');
        return { url: stream.url, title: json?.title || 'YouTube Audio' };
      }
      const stream = (json?.videoStreams || []).find((s) => !s.videoOnly);
      if (!stream?.url) throw new Error('no stream');
      return { url: stream.url, title: json?.title || 'YouTube Video' };
    },
  ];

  for (const run of candidates) {
    try {
      const out = await run();
      if (out?.url?.startsWith('http')) {
        const rawBuf = await fetchBuffer(out.url, 'https://www.youtube.com/', 16000).catch(() => null);
        if (isAudio && rawBuf) {
          const validMp3 = await ensureValidMp3Buffer(rawBuf);
          if (validMp3) return { ...out, buffer: validMp3 };
        } else if (!isAudio && rawBuf && rawBuf.length > 5000) {
          return { ...out, buffer: rawBuf };
        }
      }
    } catch {}
  }

  return null;
}

export async function downloadSocialMedia(url, platform = 'aio') {
  if (platform === 'capcut' || /capcut\.com/i.test(url)) {
    const cc = await downloadCapCut(url);
    return cc ? { url: cc.url, filename: 'capcut_hd.mp4', isImage: false } : null;
  }

  const expanded = await resolveFinalUrl(url);
  const endpoints = [
    `https://api.siputzx.my.id/api/d/${platform}?url=${encodeURIComponent(expanded)}`,
    `https://delirius-apiofc.vercel.app/download/${platform === 'igdl' ? 'instagram' : platform === 'fb' ? 'facebook' : platform === 'twitter' ? 'twitter' : platform}?url=${encodeURIComponent(expanded)}`,
    `https://api.siputzx.my.id/api/d/aio?url=${encodeURIComponent(expanded)}`,
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(ep, {}, 10000);
      const json = await res.json();
      const d = json?.data || json?.result || json;
      const dlUrl =
        (Array.isArray(d) && (d[0]?.url || d[0]?.downloadUrl)) ||
        d?.url ||
        d?.downloadUrl ||
        d?.download_url ||
        d?.hd ||
        d?.sd ||
        d?.medias?.[0]?.url;
      if (dlUrl && typeof dlUrl === 'string' && dlUrl.startsWith('http')) {
        return {
          url: dlUrl,
          filename: d?.filename || d?.title || `${platform}_media`,
          isImage: /\.(jpg|jpeg|png|webp)(\?|$)/i.test(dlUrl),
        };
      }
    } catch {}
  }
  return null;
}

export async function generateSpotifyPlayerCardBuffer(title, artist, thumbnailUrl, duration) {
  const apis = [
    `https://api.siputzx.my.id/api/canvas/spotify?title=${encodeURIComponent(title.slice(0, 32))}&author=${encodeURIComponent(artist.slice(0, 28))}&image=${encodeURIComponent(thumbnailUrl)}&start=0:00&end=${encodeURIComponent(duration || '3:45')}`,
    `https://delirius-apiofc.vercel.app/canvas/spotify?title=${encodeURIComponent(title.slice(0, 32))}&artist=${encodeURIComponent(artist.slice(0, 28))}&image=${encodeURIComponent(thumbnailUrl)}&duration=${encodeURIComponent(duration || '3:45')}`,
  ];
  for (const u of apis) {
    const buf = await fetchBuffer(u, '', 7000).catch(() => null);
    if (buf && buf.length > 2000) return buf;
  }
  return await fetchBuffer(thumbnailUrl, '', 7000).catch(() => null);
}

// ============================================================
// 3. STICKER MAKER (FOTO, VIDEO, BRAT, BRATVID) & RVO
// ============================================================
export async function mediaBufferToWebpSticker(inputBuffer, isVideo = false) {
  if (!inputBuffer) return null;
  if (hasFfmpeg()) {
    const id = crypto.randomBytes(6).toString('hex');
    const tmpDir = os.tmpdir();
    const ext = isVideo ? 'mp4' : 'png';
    const inPath = path.join(tmpDir, `stk_${id}.${ext}`);
    const outPath = path.join(tmpDir, `stk_${id}.webp`);
    try {
      await fsPromises.writeFile(inPath, inputBuffer);
      const vf = isVideo
        ? 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000'
        : 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000';
      const cmd = isVideo
        ? `ffmpeg -y -i "${inPath}" -t 6 -vf "${vf}" -c:v libwebp -loop 0 -q:v 65 -an "${outPath}"`
        : `ffmpeg -y -i "${inPath}" -vf "${vf}" -c:v libwebp -lossless 0 -q:v 80 -loop 0 -an "${outPath}"`;
      execSync(cmd, { stdio: 'ignore', timeout: 15000 });
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

export async function createBratSticker(text, animated = false) {
  const cleanText = (text || 'brat').trim().slice(0, 80);
  if (animated) {
    const animApis = [
      `https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(cleanText)}&isAnimated=true&delay=450`,
      `https://delirius-apiofc.vercel.app/canvas/bratvid?text=${encodeURIComponent(cleanText)}`,
    ];
    for (const apiUrl of animApis) {
      const resBuf = await fetchBuffer(apiUrl, '', 9000).catch(() => null);
      if (resBuf && resBuf.length > 500) {
        if (resBuf.slice(0, 4).toString() === 'RIFF' && resBuf.slice(8, 12).toString() === 'WEBP') {
          return resBuf;
        }
        const converted = await mediaBufferToWebpSticker(resBuf, true);
        if (converted) return converted;
      }
    }
  }

  const staticApis = [
    `https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(cleanText)}`,
    `https://delirius-apiofc.vercel.app/canvas/brat?text=${encodeURIComponent(cleanText)}`,
    `https://wsrv.nl/?url=${encodeURIComponent(`https://dummyimage.com/512x512/8ACE00/000000.png&text=${encodeURIComponent(cleanText)}`)}&output=webp&w=512&h=512`,
  ];
  for (const url of staticApis) {
    const buf = await fetchBuffer(url, '', 8000).catch(() => null);
    if (buf && buf.length > 300) {
      if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return buf;
      const webp = await fetchBuffer(`https://wsrv.nl/?url=${encodeURIComponent(url)}&output=webp&w=512&h=512`, '', 7000).catch(() => null);
      if (webp) return webp;
    }
  }
  return null;
}

export async function urlOrTextToWebpSticker(textOrUrl) {
  const targetUrl = textOrUrl.startsWith('http')
    ? textOrUrl
    : `https://dummyimage.com/512x512/0f172a/38bdf8.png&text=${encodeURIComponent(textOrUrl.slice(0, 50))}`;
  const webpBuf = await fetchBuffer(
    `https://wsrv.nl/?url=${encodeURIComponent(targetUrl)}&output=webp&w=512&h=512&fit=contain`,
    '',
    8000
  ).catch(() => null);
  if (webpBuf && webpBuf.length > 200) return webpBuf;
  const rawBuf = await fetchBuffer(targetUrl, '', 8000).catch(() => null);
  return await mediaBufferToWebpSticker(rawBuf, false);
}

export async function extractAndDownloadViewOnce(quotedMessage) {
  if (!quotedMessage) return null;
  const container =
    quotedMessage.viewOnceMessageV2?.message ||
    quotedMessage.viewOnceMessageV2Extension?.message ||
    quotedMessage.viewOnceMessage?.message ||
    quotedMessage;

  if (container?.imageMessage) {
    const stream = await downloadContentFromMessage(container.imageMessage, 'image');
    let buf = Buffer.from([]);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
    return { type: 'image', buffer: buf, caption: container.imageMessage.caption || '' };
  }
  if (container?.videoMessage) {
    const stream = await downloadContentFromMessage(container.videoMessage, 'video');
    let buf = Buffer.from([]);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
    return { type: 'video', buffer: buf, caption: container.videoMessage.caption || '' };
  }
  if (container?.audioMessage) {
    const stream = await downloadContentFromMessage(container.audioMessage, 'audio');
    let buf = Buffer.from([]);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
    return { type: 'audio', buffer: buf, caption: '' };
  }
  return null;
}

// ============================================================
// 4. TOMBOL ASLI WHATSAPP (VIEWONCEMESSAGE + NATIVEFLOWMESSAGE)
// ============================================================
export async function sendNativeInteractiveButtons(
  sock,
  jid,
  {
    title = '',
    body = '',
    footer = '',
    buttons = [],
    sections = [],
    listTitle = '📂 Pilih Menu',
    imageUrl = null,
    mentions = [],
    forwardedCard = true,
  },
  quotedMsg = null
) {
  try {
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
      if (btn.url && btn.url.startsWith('https://')) {
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
    if (imageUrl) {
      const imgBuf = await fetchBuffer(imageUrl, '', 5000).catch(() => null);
      if (imgBuf) {
        const uploaded = await prepareWAMessageMedia(
          { image: imgBuf },
          { upload: sock.waUploadToServer }
        ).catch(() => null);
        if (uploaded?.imageMessage) {
          headerMedia = { imageMessage: uploaded.imageMessage };
          hasMedia = true;
        }
      }
    }

    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: body || ' ' }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: footer || 'WHUXEN BOT' }),
      header: proto.Message.InteractiveMessage.Header.create({
        title: title || '',
        subtitle: '',
        hasMediaAttachment: hasMedia,
        ...headerMedia,
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons: nativeButtons,
      }),
      contextInfo: {
        mentionedJid: mentions,
        ...(forwardedCard ? { forwardingScore: 999, isForwarded: true } : {}),
      },
    });

    // Bungkus dengan viewOnceMessage agar tombol asli dirender & bisa ditekan di WhatsApp Mobile
    const fullContent = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage,
        },
      },
    };

    const waMsg = generateWAMessageFromContent(jid, fullContent, {
      userJid: sock.user?.id,
      quoted: quotedMsg || undefined,
    });

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
    const hints = buttons.filter((b) => b.id).map((b) => `• Ketik *${b.id}* (${b.text})`).join('\n');
    await sock.sendMessage(
      jid,
      {
        text: `${title ? `*${title}*\n\n` : ''}${body}${hints ? `\n\n🔘 *Tombol Cepat:*\n${hints}` : ''}`,
        mentions,
      },
      { quoted: quotedMsg || undefined }
    );
    return false;
  }
}

// ============================================================
// 5. MULTI-API AI ENGINE & ANIME VERIFIED ENGINE
// ============================================================
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
    lower.includes('service unavailable')
  );
}

export async function panggilServerAISatSet(prompt, systemPrompt) {
  const tasks = [];

  if (sharedCtx.GEMINI_API_KEY) {
    tasks.push(
      (async () => {
        const res = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${sharedCtx.GEMINI_API_KEY}`,
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
      if (!res.ok) throw new Error('Pollinations fail');
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
      if (!res.ok) throw new Error('Siputzx fail');
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

export async function getAnimeImageUrl(category) {
  const validWaifuPics = ['waifu', 'neko', 'megumin', 'shinobu', 'awoo', 'hug', 'pat', 'wave', 'dance'];
  const ep = validWaifuPics.includes(category) ? category : 'waifu';

  try {
    const res = await fetchWithTimeout(`https://api.waifu.pics/sfw/${ep}`, {}, 7000);
    const json = await res.json();
    if (json?.url) return json.url;
  } catch {}

  try {
    const nekosEp = ['kitsune', 'husbando', 'neko', 'waifu', 'hug', 'pat', 'wave', 'dance'].includes(category)
      ? category
      : 'waifu';
    const res = await fetchWithTimeout(`https://nekos.best/api/v2/${nekosEp}`, {}, 7000);
    const json = await res.json();
    const url = json?.results?.[0]?.url;
    if (url) return url;
  } catch {}

  return null;
}
