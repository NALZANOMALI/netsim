# NetSim — Network Topology Simulator

Simulasi & validasi topologi jaringan komputer dengan AI (Gemini).

## Struktur File

```
netsim/
├── server.js          ← Backend proxy (Node.js/Express)
├── package.json
├── .env               ← API key kamu (JANGAN di-upload ke GitHub!)
├── .env.example       ← Template .env
├── .gitignore
└── public/
    └── index.html     ← Frontend (otomatis disajikan oleh server)
```

---

## Cara Jalankan Lokal

### 1. Install dependencies
```bash
npm install
```

### 2. Buat file `.env`
```bash
cp .env.example .env
```
Lalu edit `.env`, isi API key Gemini kamu:
```
GEMINI_API_KEY=AIza_isi_key_kamu_di_sini
```
> Daftar & ambil key gratis di: https://aistudio.google.com/apikey

### 3. Jalankan server
```bash
npm start
```

### 4. Buka di browser
```
http://localhost:3000
```

---

## Deploy ke Railway (Gratis)

1. **Push ke GitHub dulu:**
   ```bash
   git init
   git add .
   git commit -m "first commit"
   git remote add origin https://github.com/username/netsim.git
   git push -u origin main
   ```
   > ⚠️ Pastikan `.env` masuk ke `.gitignore` — jangan sampai API key ke-push!

2. **Buka** https://railway.app → Login dengan GitHub

3. **New Project → Deploy from GitHub Repo** → pilih repo `netsim`

4. **Set environment variable di Railway:**
   - Buka tab **Variables**
   - Tambahkan: `GEMINI_API_KEY` = key Gemini kamu

5. **Deploy otomatis!** Railway akan deteksi `package.json` dan jalankan `npm start`.

---

## Deploy ke Render (Gratis)

1. Push ke GitHub (sama seperti langkah Railway di atas)
2. Buka https://render.com → New → Web Service
3. Connect repo GitHub kamu
4. Setting:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Tambahkan Environment Variable: `GEMINI_API_KEY`
6. Deploy!

---

## Cara Kerja Proxy

```
Browser (index.html)
    │
    │  POST /api/simulate  { prompt: "..." }
    ▼
server.js (Node.js)        ← API key aman di sini
    │
    │  POST ke Gemini API  ?key=GEMINI_API_KEY
    ▼
Gemini AI
    │
    └──► Hasil JSON dikembalikan ke browser
```

API key **tidak pernah terekspos ke browser** — semua lewat server.
