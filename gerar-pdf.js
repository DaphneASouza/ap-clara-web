// gerar-pdf.js — Gera PDF via Puppeteer (HTML → PDF)
'use strict';

const path = require('path');
const fs   = require('fs');
const { CARDAPIO } = require('./cardapio');

// Lookup rápido por id
const CARD_MAP = Object.fromEntries(CARDAPIO.map(c => [c.id, c]));

const ASSINATURA_PATH = path.join(__dirname, 'public', 'assinatura.png');

// ── Helpers ───────────────────────────────────────────────────────────────────

function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Escapa caracteres HTML para evitar injeção no template
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Lê assinatura.png e retorna como data URI base64 (ou null)
function assinaturaBase64() {
  try {
    if (!fs.existsSync(ASSINATURA_PATH)) return null;
    const buf = fs.readFileSync(ASSINATURA_PATH);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch { return null; }
}

// ── Montagem do HTML ──────────────────────────────────────────────────────────

function buildHTML(dados) {
  // Enriquece itens com dados do cardápio
  const itens = (dados.itens || []).map((item, idx) => {
    const ci = CARD_MAP[item.id] || {};
    const titulo      = ci.titulo       || item.titulo       || '—';
    const complexidade= ci.complexidade || item.complexidade || '—';
    const descricao   = ci.descricao
      ? ci.descricao
      : `${titulo}${complexidade && complexidade !== 'Não se aplica' ? ' – ' + complexidade : ''}`;
    const qtd  = Number(item.qtd) || 1;
    const per  = item.periodo || `${dados.mes || ''}/${dados.ano || ''}`;
    const vDsc = Number(item.valor || ci.valor || 0);
    const vEst = vDsc > 0 ? vDsc / (1 - 0.135) : 0;
    return { id: item.id || idx + 1, titulo, complexidade, descricao, qtd, per, vDsc, vEst,
             vTDsc: vDsc * qtd, vTEst: vEst * qtd };
  });

  let totEst = 0, totDsc = 0;
  itens.forEach(i => { totEst += i.vTEst; totDsc += i.vTDsc; });

  const assinB64 = assinaturaBase64();

  // ── BLOCO 3: Descritivo dos produtos ──────────────────────────────────────
  const descritivoHTML = itens.map(it => `
    <div style="margin-bottom:6px;padding:0 2px">
      <div style="font-weight:bold;font-size:9px;line-height:1.3">${esc(it.id)}. ${esc(it.titulo)}</div>
      <div style="font-size:7.5px;margin-top:1px;line-height:1.3;color:#222">${esc(it.descricao)}</div>
      <div style="font-size:8px;margin-top:1px;line-height:1.3">${esc(it.complexidade)}</div>
    </div>`).join('');

  // ── BLOCO 4: Linhas da tabela de produtos ────────────────────────────────
  const tabelaLinhas = itens.map(it => `
    <tr>
      <td style="text-align:center">${esc(it.id)}</td>
      <td>${esc(it.titulo)}</td>
      <td style="font-size:7px">${esc(it.complexidade)}</td>
      <td style="text-align:center">${it.qtd}</td>
      <td style="text-align:center;font-size:7px">${esc(it.per)}</td>
      <td style="text-align:right;font-weight:bold">${brl(it.vEst)}</td>
      <td style="text-align:right;font-weight:bold">${brl(it.vTEst)}</td>
      <td style="text-align:right;font-weight:bold">${brl(it.vDsc)}</td>
      <td style="text-align:right;font-weight:bold">${brl(it.vTDsc)}</td>
    </tr>`).join('');

  // ── Assinatura ────────────────────────────────────────────────────────────
  const assinBlock = assinB64
    ? `<div style="position:relative;text-align:center;height:38px;margin:0 10px">
         <img src="${assinB64}" style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);height:28px">
         <div style="position:absolute;bottom:0;left:0;right:0;border-bottom:0.5px solid #000"></div>
       </div>`
    : `<div style="border-bottom:0.5px solid #000;margin:28px 10px 0"></div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, sans-serif;
    font-size: 8px;
    color: #000;
    background: white;
    line-height: 1.35;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  td, th {
    border: 0.5px solid #000;
    padding: 2px 4px;
    vertical-align: top;
  }
  th {
    background: #D9D9D9;
    font-size: 7px;
    font-weight: bold;
    text-align: center;
    vertical-align: middle;
  }
  .bloco { margin-bottom: 5px; }
  .sec-titulo {
    font-weight: bold;
    font-size: 9px;
    text-align: center;
    padding: 3px 4px;
    border: 0.5px solid #000;
  }
</style>
</head>
<body>

<!-- ════ BLOCO 1 — CABEÇALHO ════ -->
<div class="bloco">
<table>
  <tr>
    <td style="width:60%;border-right:0.5px solid #000;padding:5px 6px;vertical-align:top">
      <div><span style="font-weight:bold">NOME EMPRESARIAL:</span> CLARA SERVICOS INTEGRADOS DE VIDEO, CONTEUDO E WEB LTDA</div>
      <div><span style="font-weight:bold">ENDEREÇO:</span> ST SHIN CA 01 LOTE A BLOCO A SALA, 71.503-501 LAGO NORTE - DF</div>
      <div><span style="font-weight:bold">ENDEREÇO ELETRÔNICO:</span> CONTATO@CLARADIGITAL.COM.BR</div>
      <div><span style="font-weight:bold">CNPJ:</span> 07.660.888/0001-38</div>
      <div><span style="font-weight:bold">NÚMERO DE INSCRIÇÃO:</span> 07.660.888/0001-38 MATRIZ</div>
    </td>
    <td style="width:40%;padding:5px 6px;vertical-align:top">
      <div style="font-weight:bold;font-size:11px;line-height:1.2">AP – AUTORIZAÇÃO DE PRODUÇÃO</div>
      <div style="margin-top:4px">Ano: ${esc(dados.ano)}</div>
      <div><span style="font-weight:bold">AP:</span> ${esc(dados.numero)}</div>
      <div style="font-size:7px;margin-top:4px">CONTRATO DE PRESTAÇÃO DE SERVIÇOS – SESC-AR/DF Nº 018188/2024</div>
    </td>
  </tr>
</table>
</div>

<!-- ════ BLOCO 2 — TABELA DE IDENTIFICAÇÃO ════ -->
<div class="bloco">
<table>
  <tr>
    <td style="width:22%;background:#D9D9D9;font-weight:bold;text-align:right">CLIENTE</td>
    <td style="width:78%">SESC DF</td>
  </tr>
  <tr>
    <td style="background:#D9D9D9;font-weight:bold;text-align:right">UNIDADE REQUISITANTE</td>
    <td>${esc(dados.unidade)}</td>
  </tr>
  <tr>
    <td style="background:#D9D9D9;font-weight:bold;text-align:right">PROJETO</td>
    <td>${esc(dados.tipo)}</td>
  </tr>
  <tr>
    <td style="background:#D9D9D9;font-weight:bold;text-align:right">NOME DO PROJETO</td>
    <td>${esc(dados.nomeProjeto)}</td>
  </tr>
  <tr>
    <td style="background:#D9D9D9;font-weight:bold;text-align:right">DESCRITIVO</td>
    <td style="white-space:pre-wrap">${esc(dados.descritivo)}</td>
  </tr>
</table>
</div>

<!-- ════ BLOCO 3 — DESCRITIVO DOS PRODUTOS E SERVIÇOS ════ -->
<div class="bloco">
  <div class="sec-titulo" style="background:#D9D9D9">DESCRITIVO DOS PRODUTOS E SERVIÇOS</div>
  <div style="padding:4px 4px 2px;border:0.5px solid #000;border-top:none">
    ${descritivoHTML}
  </div>
</div>

<!-- ════ BLOCO 4 — TABELA DE PRODUTOS E SERVIÇOS ════ -->
<div class="bloco">
  <div class="sec-titulo" style="background:#FFE699">TABELA DE PRODUTOS E SERVIÇOS</div>
  <table>
    <thead>
      <tr>
        <th rowspan="2" style="width:4%">Item</th>
        <th rowspan="2" style="width:20%">Produto/<br>Serviço</th>
        <th rowspan="2" style="width:17%">Complexidade</th>
        <th colspan="2" style="width:14%">Resumo do Cronograma de Entrega</th>
        <th rowspan="2" style="width:11%">Valor Unitário<br>(estimado)</th>
        <th rowspan="2" style="width:11%">Valor Total<br>(estimado)</th>
        <th rowspan="2" style="width:11%">Valor Unitário<br>(desc.13,5%)</th>
        <th rowspan="2" style="width:11%">Valor Total<br>(desc.13,5%)</th>
      </tr>
      <tr>
        <th style="width:5%">Qtd. de itens</th>
        <th style="width:9%">Período de execução</th>
      </tr>
    </thead>
    <tbody>
      ${tabelaLinhas}
      <tr>
        <td colspan="6" style="text-align:right;font-weight:bold;background:#D9D9D9">TOTAL:</td>
        <td style="text-align:right;font-weight:bold;background:#D9D9D9">${brl(totEst)}</td>
        <td style="background:#D9D9D9"></td>
        <td style="text-align:right;font-weight:bold;background:#D9D9D9">${brl(totDsc)}</td>
      </tr>
    </tbody>
  </table>
  <div style="text-align:center;font-weight:bold;font-size:10px;border:0.5px solid #000;border-top:none;padding:3px 4px">
    TOTAL: ${brl(totDsc)}
  </div>
</div>

<!-- ════ BLOCO 5 — RODAPÉ ════ -->
<hr style="border:none;border-top:0.5px solid #000;margin:4px 0">

<!-- Linha DATA | Assinatura -->
<div style="display:flex;margin-bottom:5px;align-items:flex-end">
  <div style="width:50%;text-align:center;padding:4px;font-weight:bold">
    DATA: ${esc(dados.data || '—')}
  </div>
  <div style="width:50%;padding:2px 0">
    ${assinBlock}
    <div style="text-align:center;padding-top:3px">
      <div style="font-weight:bold;font-size:7px;line-height:1.4">CLARA SERVICOS INTEGRADOS DE VIDEO, CONTEUDO E WEB LTDA</div>
      <div style="font-size:7px">CNPJ: 07.660.888/0001-38</div>
      <div style="font-size:7px">Cláudia Gomes Chaves</div>
      <div style="font-size:7px">Representante Legal</div>
    </div>
  </div>
</div>

<!-- Bloco inferior: valores | assinatura do cliente -->
<table>
  <tr>
    <td style="width:62%;padding:5px 6px;vertical-align:top">
      <div style="font-weight:bold;margin-bottom:2px">Valor e definição dos serviços desta AP:</div>
      <div>Valor Total: ${brl(totEst)}</div>
      <div>Valor Total (13,5%): ${brl(totDsc)}</div>
      <div style="font-size:7px;margin-top:3px">Para a tabela acima disposta, serão executados os serviços descritos e aprovados referente ao Contrato Nº 018188/2024.</div>
    </td>
    <td style="width:38%;padding:5px 6px;vertical-align:bottom;text-align:center">
      <div style="border-top:0.5px solid #000;margin-top:30px;padding-top:3px;font-size:8px">Assinatura do Cliente</div>
    </td>
  </tr>
</table>

</body>
</html>`;
}

// ── Geração do PDF via Puppeteer ──────────────────────────────────────────────

async function gerarPDF(dados, destino) {
  let browser;
  try {
    const puppeteer = require('puppeteer');

    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      headless: 'new',
    });
    const page = await browser.newPage();

    const html = buildHTML(dados);
    await page.setContent(html, { waitUntil: 'load' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });

    await browser.close();
    browser = null;

    // Escreve o buffer no destino (HTTP response ou WriteStream)
    await new Promise((resolve, reject) => {
      if (typeof destino.end === 'function') {
        const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
        if (destino.on) {
          destino.on('error', reject);
          destino.on('finish', resolve);
          destino.end(buf);
        } else {
          destino.end(buf);
          resolve();
        }
      } else {
        reject(new Error('destino inválido'));
      }
    });

  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    throw e;
  }
}

module.exports = { gerarPDF };
