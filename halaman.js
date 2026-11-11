// Tampilan halaman web untuk memasukkan nomor
export const HALAMAN = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hubungkan WhatsApp</title>
<style>body{font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 16px}
input,button{width:100%;padding:12px;margin:6px 0;font-size:16px;box-sizing:border-box}
#kode{font-size:34px;letter-spacing:4px;text-align:center;font-weight:bold;margin:16px 0}</style>
</head><body><h2>Hubungkan WhatsApp</h2><p id="st">Memeriksa status...</p>
<div id="form"><input id="nomor" type="tel" placeholder="Nomor WA, contoh 08123456789">
<input id="key" type="password" placeholder="Kata sandi akses (jika diatur)">
<button id="btn">Dapatkan kode</button></div>
<div id="kode"></div><p id="info"></p>
<script>
const $ = (i) => document.getElementById(i);
async function cek() {
  const s = await (await fetch('/status')).json();
  $('form').style.display = s.registered ? 'none' : 'block';
  if (s.connected) { $('st').textContent = '✅ Bot sudah terhubung ke WhatsApp'; $('kode').textContent = ''; $('info').textContent = ''; }
  else $('st').textContent = s.registered ? 'Menyambungkan ulang...' : 'Belum terhubung. Masukkan nomor WA bot.';
}
$('btn').onclick = async () => {
  $('info').textContent = 'Meminta kode...';
  const r = await fetch('/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nomor: $('nomor').value, key: $('key').value }) });
  const d = await r.json();
  $('kode').textContent = d.kode || '';
  $('info').textContent = d.kode ? 'Di WhatsApp: Perangkat tertaut > Tautkan dengan nomor telepon, lalu masukkan kode ini.' : d.error;
};
cek(); setInterval(cek, 3000);
</script></body></html>`;
