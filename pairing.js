import { bot } from './status.js';

export async function mintaKodePairing(sock, phone) {
  try {
    if (!phone || sock.authState.creds.registered) return;
    
    const code = await sock.requestPairingCode(phone);
    bot.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
    console.log(`🔑 KODE OTP BOT: ${bot.pairingCode}`);
  } catch (err) {
    console.log('⚠️ Gagal mengambil kode OTP:', err?.message || err);
    bot.pairingCode = "Gagal memuat OTP. Coba muat ulang.";
  }
}
