require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const [, , usuario, password] = process.argv;
if (!usuario || !password) {
  console.log('Uso: node crear-usuario.js usuario "contraseña"');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

(async () => {
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO usuarios (usuario, password_hash) VALUES ($1, $2)
     ON CONFLICT (usuario) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [usuario, hash]
  );
  console.log("Usuario listo:", usuario);
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
