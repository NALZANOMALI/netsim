const express = require('express');
const path = require('node:path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Pakai handler yang sama dengan Vercel
app.post('/api/simulate', require('./api/simulate'));

app.listen(PORT, () => {
  console.log(`NetSim server jalan di http://localhost:${PORT}`);
});
