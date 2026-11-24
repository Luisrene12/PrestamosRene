require("dotenv").config();
const express = require("express");
const { Pool, types } = require("pg");
const path = require("path");

types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => parseFloat(v));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const h = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  });

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

app.get("/api/clientes", h(async (req, res) => {
  const cs = (await pool.query(
    `SELECT id, nombre, telefono, doc, monto, tasa, fecha
     FROM clientes ORDER BY id DESC`
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

app.post("/api/clientes", h(async (req, res) => {
  const d = limpiarCliente(req.body);
  if (!d) return res.status(400).json({ error: "Datos del cliente no válidos." });
  const { rows } = await pool.query(
    `INSERT INTO clientes (usuario_id, nombre, telefono, doc, monto, tasa, fecha)
     SELECT id, $1, $2, $3, $4, $5, $6 FROM usuarios ORDER BY id LIMIT 1
     RETURNING id`,
    [d.nombre, d.telefono, d.doc, d.monto, d.tasa, d.fecha]
  );
  if (!rows.length) return res.status(503).json({ error: "No hay un usuario base en la base de datos." });
  res.status(201).json({ id: rows[0].id });
}));

app.put("/api/clientes/:id", h(async (req, res) => {
  const d = limpiarCliente(req.body);
  if (!d) return res.status(400).json({ error: "Datos del cliente no válidos." });
  const r = await pool.query(
    `UPDATE clientes SET nombre=$2, telefono=$3, doc=$4, monto=$5, tasa=$6, fecha=$7
     WHERE id=$1`,
    [req.params.id, d.nombre, d.telefono, d.doc, d.monto, d.tasa, d.fecha]
  );
  if (!r.rowCount) return res.status(404).json({ error: "Cliente no encontrado." });
  res.json({ ok: true });
}));

app.delete("/api/clientes/:id", h(async (req, res) => {
  const r = await pool.query(
    "DELETE FROM clientes WHERE id=$1", [req.params.id]
  );
  if (!r.rowCount) return res.status(404).json({ error: "Cliente no encontrado." });
  res.json({ ok: true });
}));

app.put("/api/clientes/:id/pagos/:mes", h(async (req, res) => {
  const mes = parseInt(req.params.mes, 10);
  const fecha = String(req.body.fecha || "");
  const monto = Number(req.body.monto);
  if (!(mes >= 1) || !FECHA.test(fecha) || !(monto >= 0))
    return res.status(400).json({ error: "Datos del pago no válidos." });
  const r = await pool.query(
    `INSERT INTO pagos (cliente_id, mes, fecha, monto)
     SELECT c.id, $2, $3, $4 FROM clientes c WHERE c.id = $1
     ON CONFLICT (cliente_id, mes) DO UPDATE SET fecha = EXCLUDED.fecha, monto = EXCLUDED.monto`,
    [req.params.id, mes, fecha, monto]
  );
  if (!r.rowCount) return res.status(404).json({ error: "Cliente no encontrado." });
  res.json({ ok: true });
}));

app.delete("/api/clientes/:id/pagos/:mes", h(async (req, res) => {
  await pool.query(
    "DELETE FROM pagos WHERE cliente_id = $1 AND mes = $2",
    [req.params.id, parseInt(req.params.mes, 10)]
  );
  res.json({ ok: true });
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor listo en http://localhost:" + PORT));
