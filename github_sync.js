import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || ''; // contoh: username/whuxen-bot
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const BACKUP_PATH = 'auth_backup.json';

// 1. PULIHKAN SESI LOGIN SEBELUM BOT KONEK (ANTI-SCAN ULANG SAAT REDEPLOY)
export async function restoreAuthFromGitHub(authDir = './auth') {
  const credsFile = path.join(authDir, 'creds.json');
  if (fs.existsSync(credsFile)) return true;
  if (!GITHUB_TOKEN || !GITHUB_REPO) return false;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${BACKUP_PATH}?ref=${GITHUB_BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'WHUXEN-BOT',
        },
      }
    );
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.content) return false;

    const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
    JSON.parse(decoded); // Pastikan JSON valid

    await fsPromises.mkdir(authDir, { recursive: true });
    await fsPromises.writeFile(credsFile, decoded, 'utf-8');
    console.log('✅ [AUTH RESTORE] Sesi WhatsApp berhasil dipulihkan dari GitHub!');
    return true;
  } catch {
    return false;
  }
}

// 2. SIMPAN OTOMATIS CREDS.JSON KE GITHUB TIAP ADA UPDATE KUNCI
let backupTimer = null;
export function scheduleAuthBackupToGitHub(authDir = './auth') {
  if (!GITHUB_TOKEN || !GITHUB_REPO) return;
  if (backupTimer) clearTimeout(backupTimer);

  backupTimer = setTimeout(async () => {
    try {
      const credsFile = path.join(authDir, 'creds.json');
      if (!fs.existsSync(credsFile)) return;
      const raw = await fsPromises.readFile(credsFile, 'utf-8');
      JSON.parse(raw);

      const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${BACKUP_PATH}`;
      const headers = {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'WHUXEN-BOT',
      };

      let sha = undefined;
      const checkRes = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers });
      if (checkRes.ok) {
        const existing = await checkRes.json();
        sha = existing.sha;
      }

      // Gunakan [skip ci] agar backup sesi tidak memicu redeploy berulang di hosting
      await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: 'chore: sync whatsapp session [skip ci]',
          content: Buffer.from(raw).toString('base64'),
          branch: GITHUB_BRANCH,
          ...(sha ? { sha } : {}),
        }),
      });
    } catch {}
  }, 5000);
}

// 3. LIVE HOT-RELOAD DARI GITHUB TANPA MUTUSIN KONEKSI WHATSAPP
export function startGitHubLiveHotReload(onCodeUpdated) {
  setInterval(async () => {
    try {
      if (!fs.existsSync('.git')) return;
      execSync(`git fetch origin ${GITHUB_BRANCH}`, { stdio: 'ignore', timeout: 10000 });
      const localHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
      const remoteHash = execSync(`git rev-parse origin/${GITHUB_BRANCH}`, { encoding: 'utf-8' }).trim();

      if (localHash && remoteHash && localHash !== remoteHash) {
        execSync(`git pull origin ${GITHUB_BRANCH}`, { stdio: 'ignore', timeout: 15000 });
        console.log(`🔄 [LIVE UPDATE] Kode GitHub baru ditarik (${remoteHash.slice(0, 7)}) tanpa mutusin WA!`);
        if (typeof onCodeUpdated === 'function') {
          await onCodeUpdated(remoteHash.slice(0, 7));
        }
      }
    } catch {}
  }, 60 * 1000); // Cek editan GitHub tiap 60 detik
}

// 4. TUTUP SOCKET DENGAN HALUS SAAT REDEPLOY AGAR PERANGKAT TETAP TERDAFTAR
export function setupGracefulShutdown(botRef, saveMemoryFn) {
  const cleanExit = async () => {
    try {
      if (typeof saveMemoryFn === 'function') await saveMemoryFn();
      if (botRef?.sock?.ws) botRef.sock.ws.close();
    } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', cleanExit);
  process.on('SIGINT', cleanExit);
}
