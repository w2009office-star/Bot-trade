import http from 'http';
import { bot } from './status.js';

export function mulaiWeb() {
  const port = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    
    let contentHtml = '';
    
    if (bot.connected) {
      contentHtml = `
        <div class="card">
          <div class="status connected">✅ Bot Berhasil Terhubung!</div>
          <p style="color: #555; margin-top: 10px;">WhatsApp Bot Trade siap digunakan.</p>
        </div>
      `;
    } else {
      const qrImageUrl = bot.qr 
        ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bot.qr)}`
        : null;

      const pairingText = bot.pairingCode 
        ? bot.pairingCode 
        : (process.env.PHONE_NUMBER ? "Sedang memuat OTP..." : "Isi PHONE_NUMBER di Railway Variables untuk OTP");

      contentHtml = `
        <div class="grid-container">
          <!-- OPSI 1: QR CODE -->
          <div class="card">
            <h3>📱 Opsi 1: Scan QR Code</h3>
            ${qrImageUrl 
              ? `<img src="${qrImageUrl}" alt="QR Code" class="qr-img" />` 
              : `<div class="loading">⏳ Menyiapkan QR Code...</div>`
            }
            <p class="sub-text">Buka WA -> Perangkat Tertaut -> Scan QR di atas</p>
          </div>

          <!-- OPSI 2: KODE OTP / PAIRING -->
          <div class="card">
            <h3>🔑 Opsi 2: Kode Pairing (OTP)</h3>
            <div class="otp-box">${pairingText}</div>
            <p class="sub-text">Buka WA -> Perangkat Tertaut -> Tautkan dengan Nomor Telepon</p>
          </div>
        </div>
        <p class="timer-info">⏳ Sesi ini berlaku selama <b>2 Menit</b> (Halaman refresh otomatis)</p>
      `;
    }

    const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Panel Hubung WhatsApp Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="refresh" content="4"> <!-- Auto refresh setiap 4 detik -->
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #eef2f5; margin: 0; padding: 20px; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 100vh; }
        h2 { color: #075e54; margin-bottom: 20px; text-align: center; }
        .grid-container { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; max-width: 800px; width: 100%; }
        .card { background: white; padding: 25px; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); text-align: center; flex: 1; min-width: 280px; }
        h3 { color: #128C7E; margin-top: 0; font-size: 1.2em; }
        .status.connected { color: #25D366; font-weight: bold; font-size: 1.3em; padding: 15px; background: #e8f5e9; border-radius: 10px; }
        .qr-img { border: 3px solid #075e54; border-radius: 10px; margin: 10px 0; }
        .otp-box { font-size: 2em; letter-spacing: 5px; font-weight: bold; background: #f0fdf4; color: #166534; padding: 15px; border-radius: 10px; margin: 15px 0; border: 2px dashed #22c55e; word-break: break-all; }
        .sub-text { color: #666; font-size: 0.85em; margin: 5px 0 0 0; }
        .timer-info { color: #475569; font-size: 0.95em; margin-top: 25px; text-align: center; background: #e2e8f0; padding: 8px 16px; border-radius: 20px; }
        .loading { color: #64748b; font-style: italic; padding: 30px 0; }
      </style>
    </head>
    <body>
      <h2>🤖 Panel Koneksi Bot WhatsApp</h2>
      ${contentHtml}
    </body>
    </html>
    `;

    res.end(html);
  });

  server.listen(port, () => {
    console.log(`🌐 Server Web berjalan di port ${port}`);
  });
}
