'use strict';
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ── Parsing de argumentos ──────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(nome) {
  const a = args.find(a => a.startsWith(`--${nome}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}
const ARG_DESDE  = getArg('desde');
const ARG_STATUS = getArg('status');

// ── Helpers visuais ───────────────────────────────────────────────────────
const SEP  = '═'.repeat(62);
const sep  = '─'.repeat(62);
const brl  = v => `R$ ${Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const pad  = (s, n) => String(s||'').padEnd(n).substring(0, n);
const padL = (s, n) => String(s||'').padStart(n).slice(-n);

function titulo(txt) {
  console.log(`\n${SEP}`);
  console.log(`  ${txt}`);
  console.log(SEP);
}

// ── Cláusulas WHERE reutilizáveis ─────────────────────────────────────────
function buildWhere() {
  const conds = [];
  const vals  = [];
  if (ARG_DESDE) {
    vals.push(ARG_DESDE);
    conds.push(`criado_em >= $${vals.length}`);
  }
  if (ARG_STATUS) {
    vals.push(ARG_STATUS);
    conds.push(`status = $${vals.length}`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  return { where, vals };
}

async function main() {
  const { where, vals } = buildWhere();

  console.log(`\n${SEP}`);
  console.log(`  VERIFICAÇÃO DE IMPORTAÇÃO — BANCO DE APs`);
  console.log(SEP);
  const filtros = [];
  if (ARG_DESDE)  filtros.push(`desde: ${ARG_DESDE}`);
  if (ARG_STATUS) filtros.push(`status: ${ARG_STATUS}`);
  console.log(`  Filtros: ${filtros.length ? filtros.join(' | ') : 'nenhum (todas as APs)'}`);

  // ── a) Resumo geral ───────────────────────────────────────────────────
  titulo('a) RESUMO GERAL');

  const resumo = await pool.query(
    `SELECT
       COUNT(*)                             AS total,
       MIN(data_ap)                         AS mais_antiga,
       MAX(data_ap)                         AS mais_recente,
       COALESCE(SUM(total_desconto), 0)     AS valor_total,
       COALESCE(SUM(total_bruto), 0)        AS valor_bruto
     FROM aps ${where}`,
    vals
  );
  const r = resumo.rows[0];
  console.log(`  Total de APs       : ${r.total}`);
  console.log(`  Data AP mais antiga: ${r.mais_antiga || '(sem data_ap)'}`);
  console.log(`  Data AP mais recente: ${r.mais_recente || '(sem data_ap)'}`);
  console.log(`  Valor total (c/ desc): ${brl(r.valor_total)}`);
  console.log(`  Valor total (bruto)  : ${brl(r.valor_bruto)}`);

  // ── b) Distribuição por status ────────────────────────────────────────
  titulo('b) DISTRIBUIÇÃO POR STATUS');

  const STATUS_ORDEM = ['gerada','enviada','ap_assinada','comprovada','emitir_nf','aguardando_pagamento','paga','cancelada'];
  const porStatus = await pool.query(
    `SELECT status, COUNT(*) AS qtd, COALESCE(SUM(total_desconto),0) AS valor
     FROM aps ${where}
     GROUP BY status ORDER BY status`,
    vals
  );
  // Preenche status sem resultados com zero
  const statusMap = {};
  porStatus.rows.forEach(r => { statusMap[r.status] = r; });
  STATUS_ORDEM.forEach(s => {
    const dado = statusMap[s] || { qtd: 0, valor: 0 };
    console.log(`  ${pad(s, 22)} : ${padL(dado.qtd, 5)} APs   ${brl(dado.valor)}`);
  });
  // Exibe status inesperados (fora da lista padrão)
  Object.keys(statusMap).filter(s => !STATUS_ORDEM.includes(s)).forEach(s => {
    const dado = statusMap[s];
    console.log(`  ${pad('[outro] '+s, 22)} : ${padL(dado.qtd, 5)} APs   ${brl(dado.valor)}`);
  });

  // ── c) Distribuição por mês (data_ap) ─────────────────────────────────
  titulo('c) DISTRIBUIÇÃO POR MÊS (data_ap)');

  // data_ap é TEXT no formato DD/MM/YYYY — extrai MM/YYYY para agrupar
  const porMes = await pool.query(
    `SELECT
       CASE
         WHEN data_ap IS NULL OR data_ap = '' THEN '(sem data)'
         ELSE SUBSTRING(data_ap FROM 4 FOR 7)
       END AS mes_ano,
       COUNT(*)                         AS qtd,
       COALESCE(SUM(total_desconto), 0) AS valor
     FROM aps ${where}
     GROUP BY mes_ano`,
    vals
  );

  // Ordenar cronologicamente: MM/YYYY → compara como YYYY-MM
  const toSortKey = m => {
    if (!m || m === '(sem data)') return '9999-99';
    const [mm, yyyy] = m.split('/');
    return `${yyyy}-${mm}`;
  };
  porMes.rows.sort((a, b) => toSortKey(a.mes_ano).localeCompare(toSortKey(b.mes_ano)));

  if (!porMes.rows.length) {
    console.log('  (nenhum resultado)');
  } else {
    console.log(`  ${'Mês/Ano'.padEnd(12)} ${'Qtd'.padStart(6)}   ${'Valor Total'.padStart(18)}`);
    console.log(`  ${sep.substring(0,50)}`);
    porMes.rows.forEach(r => {
      console.log(`  ${pad(r.mes_ano, 12)} ${padL(r.qtd, 6)}   ${padL(brl(r.valor), 18)}`);
    });
  }

  // ── d) Distribuição por unidade ───────────────────────────────────────
  titulo('d) DISTRIBUIÇÃO POR UNIDADE');

  const porUnidade = await pool.query(
    `SELECT
       COALESCE(NULLIF(TRIM(unidade), ''), '(sem unidade)') AS unidade,
       COUNT(*)                         AS qtd,
       COALESCE(SUM(total_desconto), 0) AS valor
     FROM aps ${where}
     GROUP BY unidade
     ORDER BY qtd DESC`,
    vals
  );

  if (!porUnidade.rows.length) {
    console.log('  (nenhum resultado)');
  } else {
    console.log(`  ${'Unidade'.padEnd(20)} ${'Qtd'.padStart(6)}   ${'Valor Total'.padStart(18)}`);
    console.log(`  ${sep.substring(0,50)}`);
    porUnidade.rows.forEach(r => {
      console.log(`  ${pad(r.unidade, 20)} ${padL(r.qtd, 6)}   ${padL(brl(r.valor), 18)}`);
    });
  }

  // ── e) Alertas / possíveis problemas ─────────────────────────────────
  titulo('e) ALERTAS — POSSÍVEIS PROBLEMAS');

  async function alertar(descricao, condicao) {
    const q = await pool.query(
      `SELECT id, numero, data_ap, total_desconto, status
       FROM aps
       ${where ? where + ' AND ' + condicao : 'WHERE ' + condicao}
       ORDER BY id DESC LIMIT 10`,
      vals
    );
    const total = await pool.query(
      `SELECT COUNT(*) AS n FROM aps ${where ? where + ' AND ' + condicao : 'WHERE ' + condicao}`,
      vals
    );
    const n = Number(total.rows[0].n);
    if (n === 0) {
      console.log(`  ✅ ${descricao}: nenhum problema`);
    } else {
      console.log(`  ⚠️  ${descricao}: ${n} AP(s)`);
      q.rows.forEach(ap => {
        console.log(`       id:${ap.id} | ${ap.numero||'(s/nº)'} | ${ap.data_ap||'(s/data)'} | ${ap.status}`);
      });
      if (n > 10) console.log(`       ... e mais ${n-10} outras.`);
    }
  }

  await alertar('Valor zerado ou nulo (total_desconto)',
    `(total_desconto IS NULL OR total_desconto = 0)`);

  await alertar('Sem número da AP (numero vazio)',
    `(numero IS NULL OR numero = '' OR numero LIKE 'SEM_MES.%')`);

  await alertar('Sem data_ap',
    `(data_ap IS NULL OR data_ap = '')`);

  await alertar('Sem PDF original (ap_assinada_url vazio)',
    `(ap_assinada_url IS NULL OR ap_assinada_url = '')`);

  // ── f) Últimas 5 criadas ─────────────────────────────────────────────
  titulo('f) ÚLTIMAS 5 APs CRIADAS');

  const ultimas = await pool.query(
    `SELECT id, numero, data_ap, unidade, total_desconto, status, criado_em
     FROM aps ${where}
     ORDER BY criado_em DESC LIMIT 5`,
    vals
  );

  if (!ultimas.rows.length) {
    console.log('  (nenhum resultado)');
  } else {
    console.log(`  ${'id'.padEnd(6)} ${'numero'.padEnd(28)} ${'data_ap'.padEnd(12)} ${'unidade'.padEnd(10)} ${'valor'.padStart(14)}  status`);
    console.log(`  ${sep}`);
    ultimas.rows.forEach(ap => {
      console.log(
        `  ${pad(ap.id, 6)} ${pad(ap.numero, 28)} ${pad(ap.data_ap||'(s/data)', 12)} ` +
        `${pad(ap.unidade||'—', 10)} ${padL(brl(ap.total_desconto), 14)}  ${ap.status}`
      );
    });
  }

  console.log(`\n${SEP}\n`);
  await pool.end();
}

main().catch(e => {
  console.error('❌ Erro fatal:', e.message);
  pool.end();
  process.exit(1);
});
