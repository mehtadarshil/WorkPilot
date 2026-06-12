const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log('DATABASE_URL:', process.env.DATABASE_URL);

const databaseUrl = process.env.DATABASE_URL?.trim();
let pool;
if (databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
} else {
  pool = new Pool({
    user: process.env.DB_USER || 'workpilot_user',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'workpilot',
    password: process.env.DB_PASSWORD || 'workpilot_password',
    port: parseInt(process.env.DB_PORT || '5433', 10),
  });
}

async function main() {
  try {
    const email = 'hiraniricky104@gmail.com';
    console.log('Querying users table for:', email);
    const usersRes = await pool.query('SELECT id, email, role, status FROM users WHERE LOWER(TRIM(email)) = $1', [email]);
    console.log('Users:', JSON.stringify(usersRes.rows, null, 2));

    console.log('Querying officers table for:', email);
    const officersRes = await pool.query('SELECT id, email, full_name, state, permissions, linked_user_id FROM officers WHERE LOWER(TRIM(email)) = $1', [email]);
    console.log('Officers:', JSON.stringify(officersRes.rows, null, 2));

    if (usersRes.rowCount && usersRes.rows[0].id) {
      const uId = usersRes.rows[0].id;
      console.log('Querying officers table by linked_user_id:', uId);
      const linkedRes = await pool.query('SELECT id, email, full_name, state, permissions, linked_user_id FROM officers WHERE linked_user_id = $1', [uId]);
      console.log('Linked Officers:', JSON.stringify(linkedRes.rows, null, 2));
    }
  } catch (err) {
    console.error('Error running query:', err);
  } finally {
    await pool.end();
  }
}

main();
