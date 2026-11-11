import fs from 'fs/promises';
import existsSync from 'fs';

const MEMORY_FILE = './memory.json';

const defaultMemory = {
  users: {},
  learnedWords: [],
  conversations: {}
};

// Membaca memori saat startup
export async function loadMemory() {
  try {
    if (existsSync.existsSync(MEMORY_FILE)) {
      const data = await fs.readFile(MEMORY_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('⚠️ Gagal membaca memory.json:', err.message);
  }
  return defaultMemory;
}

// Menyimpan memori secara asinkron (tidak menghentikan proses bot)
export async function saveMemory(data) {
  try {
    await fs.writeFile(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('⚠️ Gagal menyimpan memory.json:', err.message);
  }
}

// Menambah fakta pengguna
export function rememberFact(db, jid, name, fact) {
  if (!db.users[jid]) {
    db.users[jid] = { name, facts: [], lastSeen: new Date().toISOString() };
  }
  db.users[jid].name = name;
  db.users[jid].lastSeen = new Date().toISOString();

  if (!db.users[jid].facts.includes(fact)) {
    db.users[jid].facts.push(fact);
    if (db.users[jid].facts.length > 15) db.users[jid].facts.shift();
    saveMemory(db); // Disimpan di latar belakang
  }
}

// Belajar kata kotor otomatis
export function autoLearnBadWord(db, word) {
  const cleanWord = word.toLowerCase().trim();
  if (cleanWord && !db.learnedWords.includes(cleanWord)) {
    db.learnedWords.push(cleanWord);
    saveMemory(db);
  }
}
