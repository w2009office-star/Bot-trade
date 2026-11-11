import http from 'http';
import { bot, getUptime } from './status.js';

export function mulaiWeb() {
  const port = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const qrImageUrl = bot.qr
        ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(bot.qr)}`
        : null;

      return res.end(JSON.stringify({
        connected: bot.connected,
        qrUrl: qrImageUrl,
        pairingCode: bot.pairingCode || (process.env.PHONE_NUMBER ? "⏳ Meminta Kode OTP..." : "Masukkan nomor untuk pairing OTP"),
        uptime: getUptime(),
        userPhone: bot.userPhone || 'Belum Terhubung',
        userName: bot.userName || 'Belum Terhubung',
        stats: bot.stats,
        badWordsCount: bot.badWords.length,
        commands: bot.commands
      }));
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Commercial Panel Bot WhatsApp</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
        body { background: #e2e8f0; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { color: #0f172a; margin: 0 0 5px 0; font-size: 1.8rem; }
        .container { display: flex; flex-wrap: wrap; gap: 20px; max-width: 1100px; width: 100%; }
        .panel { background: white; border-radius: 16px; padding: 25px; flex: 1; min-width: 320px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
        .panel-title { font-size: 1.2rem; color: #0284c7; font-weight: bold; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 15px; }
        .qr-img { border: 3px solid #0284c7; border-radius: 12px; margin: 15px 0; }
        .otp-box { font-size: 2rem; font-weight: bold; letter-spacing: 4px; color: #0369a1; background: #e0f2fe; padding: 12px; border-radius: 10px; border: 2px dashed #0284c7; margin: 15px 0; text-align: center; }
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
        .stat-card { background: #f8fafc; padding: 12px; border-radius: 10px; border-left: 4px solid #0284c7; }
        .stat-card div { font-size: 0.8rem; color: #64748b; }
        .stat-card strong { font-size: 1.1rem; color: #0f172a; }
        .menu-list { max-height: 200px; overflow-y: auto; background: #f8fafc; border-radius: 8px; padding: 10px; font-size: 0.85rem; }
        .menu-item { padding: 6px 0; border-bottom: 1px dashed #e2e8f0; display: flex; justify-content: space-between; }
        .badge { background: #10b981; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🚀 Commercial Web Panel Bot WhatsApp</h1>
        <p style="color:#64748b; margin:0;">Sistem Proteksi Grup & Panel Siap Jual</p>
      </div>

      <div class="container">
        <!-- PANEL 1: KONEKSI KLIEN (QR / OTP) -->
        <div class="panel">
          <div class="panel-title">📱 PANEL 1: HUBUNGKAN NOMOR WA</div>
          <div id="p1-content">Memuat status koneksi...</div>
        </div>

        <!-- PANEL 2: MONITOR PROTEKSI & SYSTEM MENU -->
        <div class="panel">
          <div class="panel-title">🛡️ PANEL 2: DASHBOARD PROTEKSI & MENU</div>
          <div class="stat-grid">
            <div class="stat-card">
              <div>Kata Kotor Dihapus</div>
              <strong id="st-badwords">0</strong>
            </div>
            <div class="stat-card">
              <div>Pornografi Dihapus</div>
              <strong id="st-porn">0</strong>
            </div>
            <div class="stat-card">
              <div>Database Kata Terlarang</div>
              <strong id="st-totalwords">0 Kata</strong>
            </div>
            <div class="stat-card">
              <div>Pembersihan 24j Terakhir</div>
              <strong id="st-clean" style="font-size:0.75rem;">-</strong>
            </div>
          </div>

          <h4 style="margin: 15px 0 8px 0; color:#0f172a;">📜 Daftar Menu Bot (Otomatis Sync):</h4>
          <div class="menu-list" id="menu-container"></div>
        </div>
      </div>

      <script>
        async function updateData() {
          try {
            const res = await fetch('/api/status');
            const d = await res.json();

            // Panel 1: Pairing & QR
            const p1 = document.getElementById('p1-content');
            if (d.connected) {
              p1.innerHTML = \`
                <div style="text-align:center; padding:30px 0;">
                  <span class="badge" style="background:#10b981; font-size:1rem;">✅ WA TERHUBUNG</span>
                  <p style="margin-top:15px; color:#475569;">Bot aktif melayani grup & pesan pribadi.</p>
                  <p style="font-size:0.85rem; color:#64748b;">Nomor: <b>\${d.userPhone}</b></p>
                </div>\`;
            } else {
              const qrHtml = d.qrUrl ? '<img src="' + d.qrUrl + '" class="qr-img" width="180" height="180" />' : '<p style="color:#94a3b8;">Menyiapkan QR Code...</p>';
              p1.innerHTML = \`
                <div style="text-align:center;">
                  <span class="badge" style="background:#ef4444;">🔴 WA TERPUTUS</span>
                  <div style="margin-top:15px;"><strong>Scan QR Code:</strong><br>\${qrHtml}</div>
                  <div style="margin-top:10px;"><strong>Kode Pairing OTP:</strong><div class="otp-box">\${d.pairingCode}</div></div>
                </div>\`;
            }

            // Panel 2: Proteksi & Stats
            document.getElementById('st-badwords').innerText = d.stats.totalDeletedBadWords;
            document.getElementById('st-porn').innerText = d.stats.totalDeletedPornLinks;
            document.getElementById('st-totalwords').innerText = d.badWordsCount + ' Kata';
            document.getElementById('st-clean').innerText = d.stats.lastCleanupTime;

            // Render Daftar Menu Dinamis
            const menuBox = document.getElementById('menu-container');
            menuBox.innerHTML = d.commands.map(c => \`
              <div class="menu-item">
                <b>\${c.cmd}</b>
                <span style="color:#64748b;">\${c.desc}</span>
              </div>\`).join('');

          } catch (e) { console.error(e); }
        }

        setInterval(updateData, 2000);
        updateData();
      </script>
    </body>
    </html>
    `;

    res.end(html);
  });

  server.listen(port, () => console.log(`🌐 Web Panel di port ${port}`));
}
