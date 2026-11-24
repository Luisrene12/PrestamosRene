require("dotenv").config();
const express = require("express");
const { Pool, types } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const path = require("path");

types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => parseFloat(v));

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error("Falta JWT_SECRET en el archivo .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const h = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  });

function auth(req, res, next) {
  try {
    req.user = jwt.verify(req.cookies.token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Sesión vencida. Inicia sesión de nuevo." });
  }
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function limpiarCliente(b) {
  const d = {
    nombre: String(b.nombre || "").trim(),
    telefono: String(b.telefono || "").trim(),
    doc: String(b.doc || "").trim(),
    monto: Number(b.monto),
    tasa: Number(b.tasa),
    fecha: String(b.fecha || ""),
  };
  if (!d.nombre || !(d.monto > 0) || !(d.tasa >= 0) || !FECHA.test(d.fecha)) return null;
  return d;
}

app.post("/api/login", h(async (req, res) => {
  const usuario = String(req.body.usuario || "").trim();
  const password = String(req.body.password || "");
  const { rows } = await pool.query(
    "SELECT id, password_hash FROM usuarios WHERE usuario = $1", [usuario]
  );
  const ok = rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  const token = jwt.sign({ id: rows[0].id }, SECRET, { expiresIn: "12h" });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
}));

app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

app.get("/api/me", auth, (req, res) => res.json({ id: req.user.id }));

app.get("/api/clientes", auth, h(async (req, res) => {
  const cs = (await pool.query(
    `SELECT id, nombre, telefono, doc, monto, tasa, fecha
     FROM clientes WHERE usuario_id = $1 ORDER BY id DESC`,
    [req.user.id]
  )).rows;
  const ids = cs.map((c) => c.id);
  const ps = ids.length ? (await pool.query(
    "SELECT cliente_id, mes, fecha, monto FROM pagos WHERE cliente_id = ANY($1::int[])",
    [ids]
  )).rows : [];
  const mapa = new Map(cs.map((c) => [c.id, (c.pagos = {}, c)]));
  ps.forEach((p) => { mapa.get(p.cliente_id).pagos[p.mes] = { fecha: p.fecha, monto: p.monto }; });
  res.json(cs);
}));

app.post("/api/clientes", auth, h(async (req, res) => {
  const d = limpiarCliente(req.body);
  if (!d) return res.status(400).json({ error: "Datos del cliente no válidos." });
  const { rows } = await pool.query(
    `INSERT INTO clientes (usuario_id, nombre, telefono, doc, monto, tasa, fecha)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [req.user.id, d.nombre, d.telefono, d.doc, d.monto, d.tasa, d.fecha]
  );
  res.status(201).json({ id: rows[0].id });
}));

app.put("/api/clientes/:id", auth, h(async (req, res) => {
  const d = limpiarCliente(req.body);
  if (!d) return res.status(400).json({ error: "Datos del cliente no válidos." });
  const r = await pool.query(
    `UPDATE clientes SET nombre=$3, telefono=$4, doc=$5, monto=$6, tasa=$7, fecha=$8
     WHERE id=$1 AND usuario_id=$2`,
    [req.params.id, req.user.id, d.nombre, d.telefono, d.doc, d.monto, d.tasa, d.fecha]
  );
  if (!r.rowCount) return res.status(404).json({ error: "Cliente no encontrado." });
  res.json({ ok: true });
}));

app.delete("/api/clientes/:id", auth, h(async (req, res) => {
  const r = await pool.query(
    "DELETE FROM clientes WHERE id=$1 AND usuario_id=$2", [req.params.id, req.user.id]
  );
  if (!r.rowCount) return res.status(404).json({ error: "Cliente no encontrado." });
  res.json({ ok: true });
}));

app.put("/api/clientes/:id/pagos/:mes", auth, h(async (req, res) => {
  const mes = parseInt(req.params.mes, 10);
  const fecha = String(req.body.fecha || "");
  const monto = Number(req.body.monto);
  if (!(mes >= 1) || !FECHA.test(fecha) || !(monto >= 0))
    return res.status(400).json({ error: "Datos del pago no válidos." });
  const r = await pool.query(
    `INSERT INTO pagos (cliente_id, mes, fecha, monto)
     SELECT c.id, $3, $4, $5 FROM clientes c WHERE c.id = $1 AND c.usuario_id = $2
     ON CONFLICT (cliente_id, mes) DO UPDATE SET fecha = EXCLUDED.fecha, monto = EXCLUDED.monto`,
    [req.params.id, req.user.id, mes, fecha, monto]
  );
  if (!r.rowCount) return res.status(404).json({ error: "Cliente no encontrado." });
  res.json({ ok: true });
}));

app.delete("/api/clientes/:id/pagos/:mes", auth, h(async (req, res) => {
  await pool.query(
    `DELETE FROM pagos WHERE cliente_id = $1 AND mes = $2
     AND cliente_id IN (SELECT id FROM clientes WHERE usuario_id = $3)`,
    [req.params.id, parseInt(req.params.mes, 10), req.user.id]
  );
  res.json({ ok: true });
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor listo en http://localhost:" + PORT));
