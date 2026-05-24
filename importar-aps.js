'use strict';
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { Pool } = require('pg');
const { createWorker } = require('tesseract.js');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const PASTA = process.argv[2] || './pdfs-importar';
const STATUS = process.argv[3] || 'gerada';
const USUARIO_ID = parseInt(process.argv[4] || '1');

function extrairDados(texto, nomeArquivo) {
  // Número da AP — formato MES.TIPO.NUMERO
  let numeroMatch = texto.match(/([A-ZÇÃÕÁÉÍÓÚ]+\.[A-Z]+\.\d+)/);
  let numero = numeroMatch ? numeroMatch[1] : null;

  // Fallback: extrai número sequencial do nome do arquivo (ex: "AP 842.pdf" → gera número)
  if (!numero) {
    const seqMatch = nomeArquivo.match(/AP\s+(\d+)/i);
    if (seqMatch) numero = `SEM_MES.IMPORTADO.${seqMatch[1]}`;
  }

  const partes = numero ? numero.split('.') : [];
  const mes = partes[0] || '';
  const tipo = partes[1] || '';
  const sequencial = partes[2] || '';

  const dataMatch = texto.match(/(\d{2}\/\d{2}\/(\d{4}))/);
  const data_ap = dataMatch ? dataMatch[1] : null;
  const ano = dataMatch ? dataMatch[2] : String(new Date().getFullYear());

  let unidade = 'Geral';
  if (/UNIDADE REQUISITANTE[\s\S]{0,80}Interno/i.test(texto)) unidade = 'Interno';

  const projetoMatch = texto.match(/NOME DO PROJETO\s*\n?\s*([^\n]+)/i);
  const nome_projeto = projetoMatch ? projetoMatch[1].trim() : '';

  const descMatch = texto.match(/DESCRITIVO\s*\n?\s*([^\n]+)/i);
  const descritivo = descMatch ? descMatch[1].trim() : '';

  const totais = [...texto.matchAll(/R\$\s*([\d.]+,\d{2})/g)]
    .map(m => parseFloat(m[1].replace(/\./g,'').replace(',','.')))
    .filter(v => v > 0);
  const total_bruto    = totais.length >= 2 ? totais[totais.length-2] : (totais[0]||0);
  const total_desconto = totais.length >= 1 ? totais[totais.length-1] : 0;

  return { numero, mes, tipo, sequencial, ano, unidade, nome_projeto, descritivo, data_ap, total_bruto, total_desconto };
}

async function extrairTextoOCR(caminho) {
  console.log(`    🔍 OCR em andamento...`);
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  const { createCanvas } = require('canvas');

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fs.readFileSync(caminho)) });
  const pdfDoc = await loadingTask.promise;
  const page = await pdfDoc.getPage(1);
  const scale = 2.0;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context, viewport }).promise;

  const worker = await createWorker('por');
  const { data: { text } } = await worker.recognize(canvas.toBuffer('image/png'));
  await worker.terminate();
  return text;
}

async function importar() {
  if (!fs.existsSync(PASTA)) { console.error(`❌ Pasta não encontrada: ${PASTA}`); process.exit(1); }
  const arquivos = fs.readdirSync(PASTA).filter(f => f.toLowerCase().endsWith('.pdf'));
  if (!arquivos.length) { console.log('Nenhum PDF encontrado.'); return; }

  console.log(`📂 ${arquivos.length} PDFs — status: ${STATUS}\n`);
  let ok=0, pulados=0, erros=0;

  for (const arquivo of arquivos) {
    const caminho = path.join(PASTA, arquivo);
    try {
      let texto = '';
      const buffer = fs.readFileSync(caminho);
      const parsed = await pdf(buffer);
      texto = (parsed.text || '').trim();

      if (!texto) texto = await extrairTextoOCR(caminho);

      if (!texto) {
        console.warn(`⚠️  ${arquivo} — sem texto, pulando.`);
        erros++; continue;
      }

      const d = extrairDados(texto, arquivo);
      if (!d.numero) {
        console.warn(`⚠️  ${arquivo} — número não encontrado.`);
        erros++; continue;
      }

      const existe = await pool.query(`SELECT id FROM aps WHERE numero=$1`, [d.numero]);
      if (existe.rows.length) {
        console.log(`⏭  ${d.numero} — já existe.`);
        pulados++; continue;
      }

      await pool.query(`
        INSERT INTO aps (numero,mes,ano,tipo,sequencial,unidade,nome_projeto,descritivo,data_ap,total_bruto,total_desconto,status,usuario_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `, [d.numero,d.mes,d.ano,d.tipo,d.sequencial,d.unidade,d.nome_projeto,d.descritivo,d.data_ap,d.total_bruto,d.total_desconto,STATUS,USUARIO_ID]);

      console.log(`✅ ${d.numero} — ${d.nome_projeto||'(sem nome)'} — R$ ${d.total_desconto}`);
      ok++;
    } catch(e) {
      console.error(`❌ ${arquivo} — ${e.message}`);
      erros++;
    }
  }

  console.log(`\n📊 ${ok} importadas | ${pulados} puladas | ${erros} com erro`);
  await pool.end();
}

importar();
