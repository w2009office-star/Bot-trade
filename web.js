import http from 'http';
import { bot } from './status.js';

export function mulaiWeb() {
  const port = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    
    let contentHtml = '';
    
    if (bot.connected) {
      contentHtml = `<div class="status connected">✅ Bot Berhasil Terhubung!</div>`;
    } else if (bot.qr) {
      // Mengubah string QR dari Baileys menjadi Gambar QR Code di Web Browser
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(bot.qr)}`;
      contentHtml = `
        <h3>Scan QR Code di Bawah Ini:</h3>
        <img src="${qrImageUrl}" alt="QR Code" class="qr-img" />
        <p class="timer-info">⏳ Waktu tersisa: 2 Menit (Otomatis Refresh)</p>
      `;
    } else if (bot.pairingCode) {
      contentHtml = `
        <h3>Kode Pairing WhatsApp:</h3>
        <div class="otp-box">${bot.pairingCode}</div>
        <p class="timer-info">Masukkan kode ini di WhatsApp -> Perangkat Tertaut</p>
      `;
    } else {
      contentHtml = `<div class="loading">⏳ Sedang menyiapkan koneksi baru...</div>`;
    }

    const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Panel WhatsApp Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="refresh" content="4"> <!-- Auto refresh halaman setiap 4 detik -->
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #ece5dd; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .card { background: white; padding: 30px; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); text-align: center; max-width: 400px; width: 90%; }
        h2 { color: #075e54; margin-top: 0; font-size: 1.5em; }
        .status.connected { color: #25D366; font-weight: bold; font-size: 1.2em; padding: 10px; background: #e8f5e9; border-radius: 8px; }
        .qr-img { border: 4px solid #075e54; border-radius: 12px; margin: 15px 0; }
        .otp-box { font-size: 2.2em; letter-spacing: 6px; font-weight: bold; background: #e8f5e9; color: #1b5e20; padding: 15px; border-radius: 10px; margin: 15px 0; border: 2px dashed #2e7d32; }
        .timer-info { color: #666; font-size: 0.9em; margin-top: 8px; }
        .loading { color: #075e54; font-weight: 500; font-size: 1.1em; padding: 20px 0; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>🤖 Trade WhatsApp Bot</h2>
        ${contentHtml}
      </div>
    </body>
    </html>
    `;

    res.end(html);
  });

  server.listen(port, () => {
    console.log(`🌐 Server Web berjalan di port ${port}`);
  });
}
