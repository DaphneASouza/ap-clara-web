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

  // Seed automático de feriados nacionais
  async function calcularEInserirFeriados(ano){
    function pascoa(y){
      const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4;
      const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
      const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7;
      const m=Math.floor((a+11*h+22*l)/451);
      const mes=Math.floor((h+l-7*m+114)/31),dia=((h+l-7*m+114)%31)+1;
      return new Date(y,mes-1,dia);
    }
    function fmt(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
    function add(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
    const p=pascoa(ano);
    const feriados=[
      {data:`${ano}-01-01`,titulo:'Confraternização Universal',cor:'#2563EB'},
      {data:`${ano}-04-21`,titulo:'Tiradentes',cor:'#2563EB'},
      {data:`${ano}-05-01`,titulo:'Dia do Trabalho',cor:'#2563EB'},
      {data:`${ano}-09-07`,titulo:'Independência do Brasil',cor:'#16A34A'},
      {data:`${ano}-10-12`,titulo:'Nossa Sra. Aparecida',cor:'#7C3AED'},
      {data:`${ano}-11-02`,titulo:'Finados',cor:'#71717A'},
      {data:`${ano}-11-15`,titulo:'Proclamação da República',cor:'#16A34A'},
      {data:`${ano}-11-20`,titulo:'Consciência Negra',cor:'#E65C00'},
      {data:`${ano}-12-25`,titulo:'Natal',cor:'#DC2626'},
      {data:fmt(add(p,-48)),titulo:'Segunda de Carnaval',cor:'#F59E0B'},
      {data:fmt(add(p,-47)),titulo:'Terça de Carnaval',cor:'#F59E0B'},
      {data:fmt(add(p,-46)),titulo:'Quarta de Cinzas (meio dia)',cor:'#F59E0B'},
      {data:fmt(add(p,-2)),titulo:'Sexta-feira Santa',cor:'#7C3AED'},
      {data:fmt(p),titulo:'Páscoa',cor:'#7C3AED'},
      {data:fmt(add(p,60)),titulo:'Corpus Christi',cor:'#7C3AED'},
    ];
    for(const f of feriados){
      const existe=await pool.query(`SELECT id FROM eventos WHERE data=$1 AND titulo=$2`,[f.data,f.titulo]);
      if(!existe.rows.length){
        await pool.query(`INSERT INTO eventos (titulo,descricao,data,cor,categoria) VALUES ($1,$2,$3,$4,$5)`,
          [f.titulo,'Feriado Nacional',f.data,f.cor,'Evento']);
      }
    }
  }
  const anoAtual=new Date().getFullYear();
  await calcularEInserirFeriados(anoAtual);
  await calcularEInserirFeriados(anoAtual+1);
  console.log(`✅ Feriados ${anoAtual} e ${anoAtual+1} verificados.`);
}

module.exports = { pool, setupDB };
