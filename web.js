import http from 'http';
import { bot } from './status.js';

export function mulaiWeb() {
  const port = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    // API endpoint untuk update data realtime tanpa reload halaman
    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const qrImageUrl = bot.qr
        ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(bot.qr)}`
        : null;

      const otpDisplay = bot.pairingCode 
        ? bot.pairingCode 
        : (process.env.PHONE_NUMBER ? "⏳ Meminta Kode OTP..." : "⚠️ Tambahkan PHONE_NUMBER di Railway Variables untuk OTP");

      return res.end(JSON.stringify({
        connected: bot.connected,
        qrUrl: qrImageUrl,
        pairingCode: otpDisplay
      }));
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Panel Kontrol Bot WhatsApp Publik</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
        body { background: #ece5dd; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
        .container { max-width: 820px; width: 100%; text-align: center; }
        h2 { color: #075e54; margin-bottom: 20px; font-size: 1.8rem; }
        .grid { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; }
        .card { background: white; border-radius: 16px; padding: 25px; flex: 1; min-width: 280px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); text-align: center; }
        .status-connected { background: #dcf8c6; color: #075e54; font-size: 1.4rem; font-weight: bold; padding: 25px; border-radius: 12px; border: 2px solid #25D366; }
        .otp-box { font-size: 2.2rem; font-weight: bold; letter-spacing: 5px; color: #128c7e; background: #f0fdf4; padding: 15px; border-radius: 10px; border: 2px dashed #22c55e; margin: 15px 0; word-break: break-all; }
        .qr-img { border: 3px solid #075e54; border-radius: 12px; margin: 10px 0; }
        .sub-text { color: #666; font-size: 0.85rem; margin-top: 5px; }
        .badge { background: #075e54; color: white; padding: 10px 20px; border-radius: 20px; font-size: 0.9rem; margin-top: 25px; display: inline-block; font-weight: 500; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🌐 Panel Bot WhatsApp Publik</h2>
        <div id="content">
          <p style="color:#666;">Sedang memuat panel koneksi...</p>
        </div>
        <div class="badge">⏳ Timer OTP & QR: 2 Menit (Pembaruan Otomatis Halus)</div>
      </div>

      <script>
        let isConnected = false;

        async function updateStatus() {
          try {
            const res = await fetch('/api/status');
            const data = await res.json();
            const container = document.getElementById('content');

            if (data.connected) {
              if (!isConnected) {
                container.innerHTML = \`
                  <div class="card">
                    <div class="status-connected">✅ Bot Berhasil Terhubung!</div>
                    <p style="color: #444; margin-top: 15px;">Bot WhatsApp Publik sudah aktif. Siapa saja kini bisa mengirim pesan ke nomor bot ini!</p>
                  </div>\`;
                isConnected = true;
              }
              return;
            }

            isConnected = false;

            const qrHtml = data.qrUrl 
              ? '<img src="' + data.qrUrl + '" class="qr-img" width="200" height="200" />' 
              : '<p style="color:#888; padding: 40px 0;">⏳ Menyiapkan QR Code...</p>';

            container.innerHTML = \`
              <div class="grid">
                <div class="card">
                  <h3>📱 Opsi 1: Scan QR Code</h3>
                  \${qrHtml}
                  <p class="sub-text">Scan QR ini menggunakan WhatsApp Pemilik Bot</p>
                </div>
                <div class="card">
                  <h3>🔑 Opsi 2: Kode Pairing (OTP)</h3>
                  <div class="otp-box">\${data.pairingCode}</div>
                  <p class="sub-text">Masukkan kode ini di WA -> Perangkat Tertaut</p>
                </div>
              </div>
            \`;
          } catch (err) {
            console.error(err);
          }
        }

        // Pembaruan data halus setiap 2 detik (TIDAK KEDIP)
        setInterval(updateStatus, 2000);
        updateStatus();
      </script>
    </body>
    </html>
    `;

    res.end(html);
  });

  server.listen(port, () => {
    console.log(`🌐 Server Web berjalan di port ${port}`);
  });
}
