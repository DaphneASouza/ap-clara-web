// db.js — Conexão PostgreSQL (Neon) e setup do schema
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function setupDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id         SERIAL PRIMARY KEY,
      nome       TEXT NOT NULL,
      login      TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      nivel      TEXT NOT NULL DEFAULT 'usuario', -- 'admin' ou 'usuario'
      ativo      BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS aps (
      id             SERIAL PRIMARY KEY,
      numero         TEXT NOT NULL,
      mes            TEXT NOT NULL,
      ano            TEXT NOT NULL,
      tipo           TEXT NOT NULL,
      sequencial     TEXT NOT NULL,
      unidade        TEXT,
      nome_projeto   TEXT NOT NULL,
      descritivo     TEXT,
      data_ap        TEXT,
      observacao     TEXT,
      total_bruto    NUMERIC(14,2),
      total_desconto NUMERIC(14,2),
      itens          JSONB,
      usuario_id     INTEGER REFERENCES usuarios(id),
      criado_em      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Setup tabela execucao com migrações seguras
  await pool.query(`
    CREATE TABLE IF NOT EXISTS execucao (
      id           SERIAL PRIMARY KEY,
      unidade      TEXT,
      projeto      TEXT,
      nome_projeto TEXT,
      itens        JSONB DEFAULT '[]',
      numero_ap    TEXT,
      obs          TEXT,
      usuario_id   INTEGER REFERENCES usuarios(id),
      criado_em    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE execucao ADD COLUMN IF NOT EXISTS numero_ap TEXT`);
  await pool.query(`ALTER TABLE execucao ADD COLUMN IF NOT EXISTS obs TEXT`);
  await pool.query(`ALTER TABLE aps ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'gerada'`);
  await pool.query(`ALTER TABLE aps ADD COLUMN IF NOT EXISTS ap_assinada_url TEXT`);
  await pool.query(`ALTER TABLE aps ADD COLUMN IF NOT EXISTS numero_nf TEXT`);
  await pool.query(`ALTER TABLE aps ADD COLUMN IF NOT EXISTS data_envio TEXT`);
  await pool.query(`ALTER TABLE aps ADD COLUMN IF NOT EXISTS data_pagamento TEXT`);
  await pool.query(`ALTER TABLE aps ADD COLUMN IF NOT EXISTS nf_arquivo_url TEXT`);
  await pool.query(`ALTER TABLE aps ADD COLUMN IF NOT EXISTS link_comprovacao TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS eventos (
      id          SERIAL PRIMARY KEY,
      titulo      TEXT NOT NULL,
      descricao   TEXT,
      data        TEXT NOT NULL,
      cor         TEXT NOT NULL DEFAULT '#E65C00',
      categoria   TEXT NOT NULL DEFAULT 'Evento',
      usuario_id  INTEGER REFERENCES usuarios(id),
      criado_em   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Cria admin Daphne se não existir
  const bcrypt = require('bcrypt');
  const existe = await pool.query(`SELECT id FROM usuarios WHERE login = 'daphne'`);
  if (existe.rows.length === 0) {
    const hash = await bcrypt.hash('clara2024', 10);
    await pool.query(`
      INSERT INTO usuarios (nome, login, senha_hash, nivel)
      VALUES ('Daphne', 'daphne', $1, 'admin')
    `, [hash]);
    console.log('✅ Admin Daphne criada (senha: clara2024) — troque após o primeiro login!');
  }
}

module.exports = { pool, setupDB };
