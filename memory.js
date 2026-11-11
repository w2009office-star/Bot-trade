import fs from 'fs';
import path from 'path';

const MEMORY_FILE = './memory.json';

// Inisialisasi struktur database memori
const defaultMemory = {
  users: {},         // Data ingatan tiap pengguna { jid: { name, facts: [], lastSeen } }
  learnedWords: [],  // Kata kotor/toxic yang dipelajari otomatis oleh AI
  conversations: {}  // Riwayat percakapan singkat untuk konteks AI
};

// Load memori dari file JSON
export function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = fs.readFileSync(MEMORY_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('⚠️ Gagal membaca memory.json, menggunakan memori baru:', err.message);
  }
  return defaultMemory;
}

// Simpan perubahan memori ke file JSON
export function saveMemory(data) {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('⚠️ Gagal menyimpan memory.json:', err.message);
  }
}

// Tambahkan fakta baru tentang pengguna
export function rememberFact(db, jid, name, fact) {
  if (!db.users[jid]) {
    db.users[jid] = { name, facts: [], lastSeen: new Date().toISOString() };
  }
  db.users[jid].name = name;
  db.users[jid].lastSeen = new Date().toISOString();

  // Cegah duplikasi fakta
  if (!db.users[jid].facts.includes(fact)) {
    db.users[jid].facts.push(fact);
    // Batasi maksimal 10 fakta paling relevan per pengguna
    if (db.users[jid].facts.length > 10) db.users[jid].facts.shift();
    saveMemory(db);
  }
}

// Pembelajaran Otomatis: Tambah kata kotor baru hasil analisis AI
export function autoLearnBadWord(db, word) {
  const cleanWord = word.toLowerCase().trim();
  if (cleanWord && !db.learnedWords.includes(cleanWord)) {
    db.learnedWords.push(cleanWord);
    saveMemory(db);
    console.log(`🧠 [AUTO-LEARNING] Bot mempelajari kata kotor baru: "${cleanWord}"`);
  }
}
