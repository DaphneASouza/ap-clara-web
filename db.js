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

    CREATE TABLE IF NOT EXISTS execucao (
      id                 SERIAL PRIMARY KEY,
      unidade_req        TEXT,
      projeto            TEXT,
      nome_projeto       TEXT,
      descricao          TEXT,
      link_trello        TEXT,
      num_item           TEXT,
      produtos_servicos  TEXT,
      complexidade       TEXT,
      valor_unitario     NUMERIC(14,2),
      quantidade         NUMERIC(14,2),
      valor_total        NUMERIC(14,2),
      numero_ap          TEXT,
      obs                TEXT,
      link_comprovacao   TEXT,
      criado_em          TIMESTAMPTZ DEFAULT NOW()
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

  // Garante coluna itens na tabela execucao (migracao segura)
  await pool.query(`ALTER TABLE execucao ADD COLUMN IF NOT EXISTS itens JSONB DEFAULT '[]'`);

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
