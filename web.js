import http from 'http';
import { bot, getUptime } from './status.js';

export function mulaiWeb() {
  const port = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    // Handling API Status & Pengaturan
    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const qrImageUrl = bot.qr
        ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(bot.qr)}`
        : null;

      const otpDisplay = bot.pairingCode 
        ? bot.pairingCode 
        : (process.env.PHONE_NUMBER ? "⏳ Meminta Kode OTP..." : "⚠️ Tambahkan PHONE_NUMBER di Railway Variables");

      return res.end(JSON.stringify({
        connected: bot.connected,
        qrUrl: qrImageUrl,
        pairingCode: otpDisplay,
        uptime: getUptime(),
        userPhone: bot.userPhone || 'Belum Terhubung',
        userName: bot.userName || 'Belum Terhubung',
        commands: bot.baseCommands,
        features: bot.dailyFeatures
      }));
    }

    // Endpoint untuk Mengubah Nama Profil WA lewat Web Panel
    if (req.url.startsWith('/api/set-name') && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const { newName } = JSON.parse(body);
          if (bot.sock && newName) {
            await bot.sock.updateProfileName(newName);
            bot.userName = newName;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true }));
          }
        } catch (e) {
          console.error(e);
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Panel Kontrol Bot WhatsApp</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background: #f0f2f5; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
        .header { text-align: center; margin-bottom: 25px; }
        .header h1 { color: #075e54; margin: 0 0 8px 0; }
        .container { display: flex; flex-wrap: wrap; gap: 20px; max-width: 1050px; width: 100%; }
        .panel { background: white; border-radius: 16px; padding: 25px; flex: 1; min-width: 320px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
        .panel-title { font-size: 1.25rem; color: #128c7e; font-weight: bold; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 18px; display: flex; align-items: center; gap: 8px; }
        .qr-img { border: 3px solid #075e54; border-radius: 12px; margin: 15px 0; }
        .otp-box { font-size: 2rem; font-weight: bold; letter-spacing: 4px; color: #128c7e; background: #f0fdf4; padding: 12px; border-radius: 10px; border: 2px dashed #22c55e; margin: 15px 0; word-break: break-all; text-align: center; }
        .info-row { display: flex; justify-content: space-between; background: #f8fafc; padding: 10px 14px; border-radius: 8px; margin-bottom: 10px; font-size: 0.92rem; }
        .info-label { font-weight: 600; color: #475569; }
        .info-value { color: #0f172a; font-weight: bold; }
        .feature-list { max-height: 180px; overflow-y: auto; background: #f8fafc; border-radius: 8px; padding: 10px 15px; margin-top: 10px; }
        .feature-item { font-size: 0.88rem; color: #334155; padding: 5px 0; border-bottom: 1px dashed #e2e8f0; }
        .feature-item:last-child { border-bottom: none; }
        .input-group { display: flex; gap: 8px; margin-top: 15px; }
        .input-group input { flex: 1; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; }
        .input-group button { background: #075e54; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .input-group button:hover { background: #128c7e; }
        .status-badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; }
        .status-badge.on { background: #dcf8c6; color: #075e54; }
        .status-badge.off { background: #fee2e2; color: #991b1b; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🤖 Panel Kontrol Bot WhatsApp Trade Pro</h1>
        <p style="color: #64748b; margin: 0;">Sistem Manajemen Otomatis & Koneksi Terpadu</p>
      </div>

      <div class="container">
        <!-- PANEL 1: KONEKSI QR & OTP -->
        <div class="panel">
          <div class="panel-title">📱 PANEL 1: KONEKSI WHATSAPP</div>
          <div id="panel1-content">
            <p style="color:#666;">Sedang memuat status koneksi...</p>
          </div>
        </div>

        <!-- PANEL 2: PENGATURAN & AUTO-UPDATE -->
        <div class="panel">
          <div class="panel-title">⚙️ PANEL 2: PENGATURAN & AUTO-UPDATE</div>
          <div id="panel2-content">
            <div class="info-row">
              <span class="info-label">⏱️ Bot Uptime:</span>
              <span class="info-value" id="uptime-val">-</span>
            </div>
            <div class="info-row">
              <span class="info-label">📞 Nomor Akun:</span>
              <span class="info-value" id="phone-val">-</span>
            </div>
            <div class="info-row">
              <span class="info-label">👤 Nama Profil WA:</span>
              <span class="info-value" id="name-val">-</span>
            </div>

            <div class="input-group">
              <input type="text" id="new-name-input" placeholder="Ubah nama WhatsApp...">
              <button onclick="changeWaName()">Simpan</button>
            </div>

            <h4 style="margin: 18px 0 8px 0; color: #075e54;">🚀 Fitur & Auto-Update Harian (+5/Hari):</h4>
            <div class="feature-list" id="features-list">
              <!-- Fitur Otomatis Bertambah Muncul di Sini -->
            </div>
          </div>
        </div>
      </div>

      <script>
        async function updateDashboard() {
          try {
            const res = await fetch('/api/status');
            const data = await res.json();

            // Panel 1: Render Koneksi QR & OTP
            const p1 = document.getElementById('panel1-content');
            if (data.connected) {
              p1.innerHTML = \`
                <div style="text-align:center; padding: 20px 0;">
                  <span class="status-badge on">✅ BOT TERHUBUNG</span>
                  <p style="margin-top: 15px; color:#475569;">Bot aktif melayani pesan publik 24/7.</p>
                </div>\`;
            } else {
              const qrCodeHtml = data.qrUrl 
                ? '<img src="' + data.qrUrl + '" class="qr-img" width="180" height="180" />'
                : '<p style="color:#94a3b8; padding:20px 0;">Menyiapkan QR Code...</p>';

              p1.innerHTML = \`
                <div style="text-align:center;">
                  <span class="status-badge off">🔴 MENUNGGU KONEKSI</span>
                  <div style="margin-top: 15px;">
                    <strong>Opsi 1: Scan QR Code</strong><br>
                    \${qrCodeHtml}
                  </div>
                  <div style="margin-top: 15px;">
                    <strong>Opsi 2: Kode Pairing (OTP)</strong>
                    <div class="otp-box">\${data.pairingCode}</div>
                  </div>
                </div>\`;
            }

            // Panel 2: Render Settings & Auto-Features
            document.getElementById('uptime-val').innerText = data.uptime;
            document.getElementById('phone-val').innerText = data.userPhone;
            document.getElementById('name-val').innerText = data.userName;

            const featContainer = document.getElementById('features-list');
            featContainer.innerHTML = data.features.map(f => '<div class="feature-item">' + f + '</div>').join('');

          } catch (e) {
            console.error(e);
          }
        }

        async function changeWaName() {
          const input = document.getElementById('new-name-input');
          if (!input.value.trim()) return alert('Masukkan nama terlebih dahulu!');
          
          const res = await fetch('/api/set-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName: input.value.trim() })
          });
          const result = await res.json();
          if (result.success) {
            alert('Nama profil WhatsApp berhasil diperbarui!');
            input.value = '';
            updateDashboard();
          } else {
            alert('Gagal memperbarui nama WhatsApp.');
          }
        }

        setInterval(updateDashboard, 2000);
        updateDashboard();
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
