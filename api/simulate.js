const crypto = require('crypto');

// Model utama + cadangan (dicoba berurutan kalau model sebelumnya sibuk/overload).
// Bisa diubah lewat env: GEMINI_MODEL dan GEMINI_FALLBACK_MODELS (pisah koma).
const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite')
  .split(',').map((m) => m.trim()).filter(Boolean);
const MODELS = [PRIMARY_MODEL, ...FALLBACK_MODELS.filter((m) => m !== PRIMARY_MODEL)];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Daftar key dibaca dari Environment Variable (TIDAK ditulis di kode):
//   GEMINI_API_KEYS = key1,key2,key3
// GEMINI_API_KEY (satu key) tetap didukung sebagai cadangan.
function getKeys() {
  const raw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

// Cache sederhana: topologi/prompt yang sama tidak memanggil AI lagi.
// (Hanya bertahan selama instance serverless masih "hangat", tapi tetap membantu.)
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 menit
const CACHE_MAX = 100;

function cacheGet(id) {
  const hit = cache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL) {
    cache.delete(id);
    return null;
  }
  return hit.text;
}
function cacheSet(id, text) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(id, { t: Date.now(), text });
}

// Error yang artinya "key ini bermasalah / kuotanya habis" -> coba key berikutnya
function shouldTryNextKey(status, message = '') {
  if (status === 429 || status === 403 || status === 401 || status >= 500) return true;
  if (status === 400 && /api key/i.test(message)) return true;
  return false;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const keys = getKeys();
  if (keys.length === 0) {
    return res.status(500).json({ error: 'GEMINI_API_KEYS belum diset di server.' });
  }

  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt tidak boleh kosong.' });
  }

  const cacheId = crypto.createHash('sha256').update(prompt).digest('hex');
  const cached = cacheGet(cacheId);
  if (cached) {
    return res.json({ text: cached, cached: true });
  }

  // Mulai dari key acak supaya beban terbagi rata ke semua key
  const start = Math.floor(Math.random() * keys.length);
  let lastStatus = 500;
  let lastMsg = 'Gemini API error';

  outer:
  for (const model of MODELS) {
    for (let i = 0; i < keys.length; i++) {
      const keyIdx = (start + i) % keys.length;
      const key = keys[keyIdx];
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': key, // lewat header, bukan URL, supaya key tidak muncul di log
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.3,
                responseMimeType: 'application/json',
              },
            }),
          }
        );

        const data = await geminiRes.json().catch(() => ({}));

        if (geminiRes.ok && !data.error) {
          // Gabungkan semua bagian balasan (bukan hanya parts[0])
          const parts = data?.candidates?.[0]?.content?.parts || [];
          const text = parts.map((p) => p.text || '').join('');
          const finish = data?.candidates?.[0]?.finishReason;
          console.log('Model:', model, '| finish:', finish, '| panjang:', text.length);

          // Validasi: harus JSON utuh (tidak terpotong). Kalau tidak, coba model berikutnya.
          let clean = null;
          const s0 = text.indexOf('{');
          const e0 = text.lastIndexOf('}');
          if (text && finish !== 'MAX_TOKENS' && s0 >= 0 && e0 > s0) {
            try {
              JSON.parse(text.slice(s0, e0 + 1));
              clean = text.slice(s0, e0 + 1);
            } catch (_) { /* tidak valid */ }
          }

          if (clean) {
            cacheSet(cacheId, clean);
            return res.json({ text: clean, model, finish });
          }

          lastStatus = 502;
          lastMsg = 'Balasan AI terpotong atau bukan JSON valid.';
          console.warn(`Model ${model}: balasan tidak valid (finish: ${finish}), coba model lain.`);
          continue;
        }

        lastStatus = geminiRes.status;
        lastMsg = data.error?.message || 'Gemini API error';
        console.warn(`Model ${model}, key #${keyIdx} gagal (HTTP ${lastStatus})`);

        if (lastStatus === 404) continue outer; // nama model salah -> langsung ke model berikutnya
        if (!shouldTryNextKey(lastStatus, lastMsg)) break outer; // error lain (mis. prompt salah)
        if (lastStatus === 503 || lastStatus === 429) await sleep(800); // beri jeda sebentar
      } catch (err) {
        lastMsg = err.message;
        console.warn(`Model ${model}, key #${keyIdx} error jaringan:`, err.message);
      }
    }
  }

  const busy = lastStatus === 429 || lastStatus === 503;
  return res.status(busy ? 429 : lastStatus).json({
    error: busy
      ? 'Server AI sedang sibuk atau kuota penuh. Coba lagi beberapa saat lagi.'
      : lastMsg,
  });
};
