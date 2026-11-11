// Login pertama kali pakai kode pairing (lihat di Deploy Logs Railway)
export function mintaKodePairing(sock, phone) {
  setTimeout(async () => {
    try {
      const code = await sock.requestPairingCode(phone);
      console.log('=================================');
      console.log('KODE PAIRING:', code);
      console.log('WhatsApp > Perangkat tertaut > Tautkan dengan nomor telepon');
      console.log('=================================');
    } catch (e) {
      console.log('Gagal minta kode pairing:', e?.message || e);
    }
  }, 3000);
}
