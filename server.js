const express = require('express');
const path = require('node:path');
const fs = require('node:fs');

// Baca .env dari folder proyek, dari mana pun server dijalankan
const envPath = path.join(__dirname, '.env');
const loaded = require('dotenv').config({ path: envPath });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Pakai handler yang sama dengan Vercel
app.post('/api/simulate', require('./api/simulate'));

app.listen(PORT, () => {
  console.log(`NetSim server jalan di http://localhost:${PORT}`);

  // Diagnosa .env (isi key TIDAK ditampilkan)
  const keyCount = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
    .split(',').map((k) => k.trim()).filter(Boolean).length;
  if (keyCount > 0) {
    console.log(`API key terbaca: ${keyCount} key`);
  } else if (!fs.existsSync(envPath)) {
    console.warn(`PERINGATAN: file .env tidak ditemukan di ${envPath}`);
  } else if (loaded.error) {
    console.warn('PERINGATAN: .env gagal dibaca:', loaded.error.message);
  } else {
    console.warn('PERINGATAN: .env terbaca, tapi GEMINI_API_KEY / GEMINI_API_KEYS tidak ada atau kosong.');
    console.warn('Variabel yang terbaca:', Object.keys(loaded.parsed || {}).join(', ') || '(kosong)');
    console.warn('Cek ejaan nama variabel, simpan file (Ctrl+S), dan pastikan encoding UTF-8.');
  }
});
