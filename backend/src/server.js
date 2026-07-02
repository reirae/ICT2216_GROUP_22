require('dotenv').config();

const app = require('./app');
const { ping } = require('./config/database');

const PORT = Number(process.env.PORT || 4000);

(async () => {
  try {
    await ping();
    console.log('[db] connection OK');
  } catch (err) {
    console.error('[db] connection failed:', err.message);
  }
  app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
})();