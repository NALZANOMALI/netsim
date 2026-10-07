const crypto = require('crypto');

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

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

  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key, // lewat header, bukan URL, supaya key tidak muncul di log
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1500, temperature: 0.3 },
          }),
        }
      );

      const data = await geminiRes.json().catch(() => ({}));

      if (geminiRes.ok && !data.error) {
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) cacheSet(cacheId, text);
        return res.json({ text });
      }

      lastStatus = geminiRes.status;
      lastMsg = data.error?.message || 'Gemini API error';
      console.warn(`Key #${(start + i) % keys.length} gagal (HTTP ${lastStatus})`);

      if (!shouldTryNextKey(lastStatus, lastMsg)) break; // error lain (mis. prompt salah) -> tidak perlu ganti key
    } catch (err) {
      lastMsg = err.message;
      console.warn(`Key #${(start + i) % keys.length} error jaringan:`, err.message);
    }
  }

  const exhausted = lastStatus === 429;
  return res.status(exhausted ? 429 : lastStatus).json({
    error: exhausted
      ? 'Kuota AI sedang penuh. Coba lagi beberapa saat lagi.'
      : lastMsg,
  });
};
