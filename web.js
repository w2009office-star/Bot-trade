import http from 'http';
import { bot } from './status.js';
import { HALAMAN } from './halaman.js';

const KEY = process.env.ADMIN_KEY || '';
const PORT = process.env.PORT || 3000;

function normal(n) {
  let d = String(n || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d.length >= 10 && d.length <= 15 ? d : '';
}

async function minta(body) {
  const { nomor, key } = JSON.parse(body || '{}');
  if (KEY && key !== KEY) return { error: 'Kata sandi salah.' };
  if (bot.registered) return { error: 'Bot sudah terhubung.' };
  const n = normal(nomor);
  if (!n) return { error: 'Nomor tidak valid.' };
  if (!bot.sock) return { error: 'Bot belum siap, coba lagi sebentar.' };
  return { kode: await bot.sock.requestPairingCode(n) };
}

export function mulaiWeb() {
  http.createServer(async (req, res) => {
    const kirim = (tipe, isi) => { res.writeHead(200, { 'Content-Type': tipe }); res.end(isi); };
    if (req.url === '/status') {
      return kirim('application/json', JSON.stringify({ connected: bot.connected, registered: bot.registered }));
    }
    if (req.method === 'POST' && req.url === '/pair') {
      let body = '';
      for await (const c of req) { body += c; if (body.length > 2000) break; }
      let hasil;
      try { hasil = await minta(body); } catch (e) { hasil = { error: 'Gagal minta kode, coba lagi sebentar.' }; }
      return kirim('application/json', JSON.stringify(hasil));
    }
    kirim('text/html; charset=utf-8', HALAMAN);
  }).listen(PORT, () => console.log('Web aktif di port', PORT));
}
