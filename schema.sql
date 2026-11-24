CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  usuario       TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  creado        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clientes (
  id         SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  telefono   TEXT NOT NULL DEFAULT '',
  doc        TEXT NOT NULL DEFAULT '',
  monto      NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  tasa       NUMERIC(6,2) NOT NULL CHECK (tasa >= 0),
  fecha      DATE NOT NULL,
  creado     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pagos (
  id         SERIAL PRIMARY KEY,
  cliente_id INT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  mes        INT NOT NULL CHECK (mes >= 1),
  fecha      DATE NOT NULL,
  monto      NUMERIC(14,2) NOT NULL CHECK (monto >= 0),
  UNIQUE (cliente_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_clientes_usuario ON clientes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cliente ON pagos(cliente_id);
