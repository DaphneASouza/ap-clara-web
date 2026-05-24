// importar-aps.js — Importa APs a partir de PDFs da Clara Digital
'use strict';
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Pasta com os PDFs — ajuste se necessário
const PASTA = process.argv[2] || './pdfs-importar';
// Status padrão — pode ser: 'gerada', 'enviada', 'paga', 'cancelada'
const STATUS = process.argv[3] || 'gerada';
// ID do usuário que será dono das APs
const USUARIO_ID = parseInt(process.argv[4] || '1');

function extrairDados(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);

  // Número da AP (ex: MAIO.MENSAL.1090)
  const numeroMatch = texto.match(/([A-ZÇÃ]+\.[A-Z]+\.\d+)/);
  const numero = numeroMatch ? numeroMatch[1] : null;

  // Mês, tipo, sequencial
  const partes = numero ? numero.split('.') : [];
  const mes = partes[0] || '';
  const tipo = partes[1] || '';
  const sequencial = partes[2] || '';

  // Ano — busca padrão "dd/mm/yyyy"
  const dataMatch = texto.match(/(\d{2}\/\d{2}\/(\d{4}))/);
  const data_ap = dataMatch ? dataMatch[1] : null;
  const ano = dataMatch ? dataMatch[2] : String(new Date().getFullYear());

  // Unidade
  let unidade = 'Geral';
  if (/UNIDADE REQUISITANTE[\s\S]{0,50}Interno/i.test(texto)) unidade = 'Interno';
  else if (/UNIDADE REQUISITANTE[\s\S]{0,50}Geral/i.test(texto)) unidade = 'Geral';

  // Nome do projeto
  const projetoMatch = texto.match(/NOME DO PROJETO\s*\n?\s*([^\n]+)/i);
  const nome_projeto = projetoMatch ? projetoMatch[1].trim() : '';

  // Descritivo
  const descMatch = texto.match(/DESCRITIVO\s*\n?\s*([^\n]+)/i);
  const descritivo = descMatch ? descMatch[1].trim() : '';

  // Total com desconto — busca "R$ X.XXX,XX" próximo a "desconto" ou última linha de total
  const totais = [...texto.matchAll(/R\$\s*([\d.,]+)/g)].map(m =>
    parseFloat(m[1].replace(/\./g,'').replace(',','.'))
  ).filter(v => v > 0);

  // Total bruto e com desconto — pega os dois últimos valores encontrados
  const total_bruto    = totais.length >= 2 ? totais[totais.length - 2] : (totais[0] || 0);
  const total_desconto = totais.length >= 1 ? totais[totais.length - 1] : 0;

  return { numero, mes, tipo, sequencial, ano, unidade, nome_projeto, descritivo, data_ap, total_bruto, total_desconto };
}

async function importar() {
  if (!fs.existsSync(PASTA)) {
    console.error(`❌ Pasta não encontrada: ${PASTA}`);
    process.exit(1);
  }

  const arquivos = fs.readdirSync(PASTA).filter(f => f.toLowerCase().endsWith('.pdf'));
  if (!arquivos.length) {
    console.log('Nenhum PDF encontrado na pasta.');
    return;
  }

  console.log(`📂 ${arquivos.length} PDFs encontrados. Status: ${STATUS}\n`);
  let ok = 0, erros = 0;

  for (const arquivo of arquivos) {
    const caminho = path.join(PASTA, arquivo);
    try {
      const buffer = fs.readFileSync(caminho);
      const data = await pdf(buffer);
      const texto = data.text;
      const d = extrairDados(texto);

      if (!d.numero) {
        console.warn(`⚠️  ${arquivo} — número da AP não encontrado, pulando.`);
        erros++;
        continue;
      }

      // Verifica duplicata
      const existe = await pool.query(`SELECT id FROM aps WHERE numero=$1`, [d.numero]);
      if (existe.rows.length) {
        console.log(`⏭  ${d.numero} — já existe no banco, pulando.`);
        continue;
      }

      await pool.query(`
        INSERT INTO aps (numero, mes, ano, tipo, sequencial, unidade, nome_projeto, descritivo, data_ap, total_bruto, total_desconto, status, usuario_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `, [d.numero, d.mes, d.ano, d.tipo, d.sequencial, d.unidade, d.nome_projeto, d.descritivo, d.data_ap, d.total_bruto, d.total_desconto, STATUS, USUARIO_ID]);

      console.log(`✅ ${d.numero} — ${d.nome_projeto} (${d.unidade}) — R$ ${d.total_desconto}`);
      ok++;
    } catch (e) {
      console.error(`❌ ${arquivo} — erro: ${e.message}`);
      erros++;
    }
  }

  console.log(`\n📊 Resultado: ${ok} importadas, ${erros} com erro.`);
  await pool.end();
}

importar();
