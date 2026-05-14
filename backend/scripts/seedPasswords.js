// Generates valid bcrypt hashes and updates the SecureBank dev database
// so the team can log in immediately after importing the SQL dump.
//
// Usage:
//   cd backend
//   node scripts/seedPasswords.js
//
// Defaults to admin password "Admin@123" and user password "Password@123".

require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/database');

const ADMIN_PW = process.env.SEED_ADMIN_PW || 'Admin@123';
const USER_PW = process.env.SEED_USER_PW || 'Password@123';
const ROUNDS = 12;

async function main() {
  const adminHash = await bcrypt.hash(ADMIN_PW, ROUNDS);
  const userHash = await bcrypt.hash(USER_PW, ROUNDS);

  const [adminRes] = await pool.execute(
    'UPDATE admins SET password_hash = ? WHERE username = ?',
    [adminHash, 'admin']
  );
  const [userRes] = await pool.execute(
    "UPDATE users SET password_hash = ? WHERE password_hash LIKE '$2b$10$%'",
    [userHash]
  );

  console.log(`Admins updated: ${adminRes.affectedRows}`);
  console.log(`Users updated:  ${userRes.affectedRows}`);
  console.log('\nLogin credentials:');
  console.log(`  Admin -> username: admin       password: ${ADMIN_PW}`);
  console.log(`  Users -> e.g. john.doe / ${USER_PW}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
