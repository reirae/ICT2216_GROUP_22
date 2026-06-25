const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  multipleStatements: false,
  dateStrings: true,
  namedPlaceholders: false,
});

async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT 1');
  } finally {
    conn.release();
  }
}

module.exports = { pool, ping };

/**
 * Run a function inside a database transaction with optional retries on deadlock.
 * work is an async function that receives a connection and performs queries.
 * Options:
 *  - retries: number of times to retry on deadlock (default 3)
 *  - isolation: transaction isolation level (default 'SERIALIZABLE')
 */
async function runTransaction(work, options = {}) {
  const retries = Number.isInteger(options.retries) ? options.retries : 3;
  const isolation = options.isolation || 'SERIALIZABLE';
  let attempt = 0;

  while (true) {
    const conn = await pool.getConnection();
    try {
      // set isolation level for this transaction
      await conn.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
      await conn.beginTransaction();

      const result = await work(conn);

      await conn.commit();
      conn.release();
      return result;
    } catch (err) {
      try {
        await conn.rollback();
      } catch (e) {
        // ignore rollback errors
      }
      conn.release();

      // Retry on common lock errors
      const retryable = err && (err.code === 'ER_LOCK_DEADLOCK' || err.code === 'ER_LOCK_WAIT_TIMEOUT' || err.errno === 1213 || err.errno === 1205);
      if (retryable && attempt < retries) {
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
}

module.exports = { pool, ping, runTransaction };
