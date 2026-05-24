// gerar-relatorio.js — Relatório do Dashboard via Puppeteer
'use strict';
const { getBrowser } = require('./gerar-pdf-v2');
const fs = require('fs');

function brl(v){ return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function buildRelatorioHTML(dados){
  const { filtros, cards, itens, geradoEm } = dados;
  const corStatus = { gerada:'#2563EB', enviada:'#F59E0B', paga:'#16A34A', '':'#E65C00' };
  const labelStatus = { gerada:'Gerada', enviada:'Enviada', paga:'Paga', '':'—' };

  const linhas = itens.map((item,i) => `
    <tr style="background:${i%2===0?'#fff':'#fafafa'}">
      <td>${esc(item.numero||'—')}</td>
      <td>${esc(item.nome_projeto||'—')}</td>
      <td>${esc(item.unidade||'—')}</td>
      <td>${esc(item.data_ap||'—')}</td>
      <td><span style="background:${corStatus[item.status||'']}22;color:${corStatus[item.status||'']};padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">${labelStatus[item.status||'']||'Gerada'}</span></td>
      <td style="text-align:right;font-weight:700;color:#16A34A">${brl(item.total_desconto)}</td>
    </tr>`).join('');

  const totalGeral = itens.reduce((s,i)=>s+Number(i.total_desconto||0),0);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;font-size:12px;color:#18181B;background:#fff}
    /* Cabeçalho */
    .header{background:linear-gradient(135deg,#E65C00 0%,#C04E00 100%);color:white;padding:28px 32px;display:flex;justify-content:space-between;align-items:flex-start}
    .header-left .logo{font-size:26px;font-weight:800;letter-spacing:-1px}
    .header-left .logo span{opacity:.7}
    .header-left .sub{font-size:10px;opacity:.6;margin-top:4px;text-transform:uppercase;letter-spacing:1px}
    .header-right{text-align:right}
    .header-right .tipo{font-size:18px;font-weight:700}
    .header-right .data{font-size:10px;opacity:.7;margin-top:4px}
    /* Filtros ativos */
    .filtros-bar{background:#1C1C2E;padding:12px 32px;display:flex;gap:16px;flex-wrap:wrap;align-items:center}
    .filtro-pill{background:rgba(255,255,255,.08);color:rgba(255,255,255,.8);padding:4px 12px;border-radius:99px;font-size:10px;font-weight:600}
    .filtro-pill span{color:#FF8C42;margin-right:4px}
    /* Cards métricas */
    .cards-section{padding:20px 32px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .card{border:1.5px solid #E4E4E7;border-radius:10px;padding:16px;position:relative;overflow:hidden}
    .card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--accent)}
    .card-label{font-size:10px;color:#71717A;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
    .card-value{font-size:18px;font-weight:800;color:#18181B;word-break:break-word}
    .card-sub{font-size:10px;color:#A1A1AA;margin-top:4px}
    /* Divisor */
    .section-title{padding:16px 32px 8px;font-size:13px;font-weight:700;color:#E65C00;text-transform:uppercase;letter-spacing:.8px;border-bottom:2px solid #FFD6B8;margin:0 32px 16px}
    /* Tabela */
    .table-wrap{padding:0 32px 24px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    thead tr{background:#1C1C2E}
    thead th{color:rgba(255,255,255,.7);padding:10px 12px;text-align:left;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
    tbody td{padding:9px 12px;border-bottom:1px solid #F4F4F5}
    /* Total */
    .total-row{background:#FFF3EC;border-top:2px solid #E65C00}
    .total-row td{padding:12px;font-weight:800;font-size:13px}
    /* Rodapé */
    .footer{background:#F4F4F5;padding:14px 32px;display:flex;justify-content:space-between;align-items:center;margin-top:8px}
    .footer-left{font-size:10px;color:#71717A}
    .footer-right{font-size:10px;color:#71717A;text-align:right}
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="logo">clara<span>digital</span></div>
      <div class="sub">Gestão de APs · SESC-AR/DF</div>
    </div>
    <div class="header-right">
      <div class="tipo">Relatório de Dashboard</div>
      <div class="data">Gerado em ${esc(geradoEm)}</div>
    </div>
  </div>

  <div class="filtros-bar">
    ${filtros.map(f=>`<div class="filtro-pill"><span>${esc(f.label)}:</span>${esc(f.valor)}</div>`).join('')}
  </div>

  <div class="cards-section">
    ${cards.map(c=>`
      <div class="card" style="--accent:${c.cor||'#E65C00'}">
        <div class="card-label">${esc(c.label)}</div>
        <div class="card-value">${esc(c.value)}</div>
        <div class="card-sub">${esc(c.sub||'')}</div>
      </div>`).join('')}
  </div>

  <div class="section-title">Listagem Detalhada — ${itens.length} registro(s)</div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Número AP</th>
          <th>Projeto</th>
          <th>Unidade</th>
          <th>Data</th>
          <th>Status</th>
          <th style="text-align:right">Valor (c/ desc.)</th>
        </tr>
      </thead>
      <tbody>
        ${linhas}
        <tr class="total-row">
          <td colspan="5" style="color:#E65C00">TOTAL GERAL</td>
          <td style="text-align:right;color:#16A34A">${brl(totalGeral)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    <div class="footer-left">Clara Digital · Contrato Nº 018188/2024 · SESC-AR/DF</div>
    <div class="footer-right">Relatório gerado automaticamente pelo sistema de gestão de APs</div>
  </div>
</body>
</html>`;
}

async function gerarRelatorio(dados, destino){
  let page;
  try{
    const browser = await getBrowser();
    page = await browser.newPage();
    const html = buildRelatorioHTML(dados);
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.evaluateHandle('document.fonts.ready');
    const pdfBuf = await page.pdf({
      width: '210mm', height: '297mm', printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    await page.close(); page = null;
    const buf = Buffer.isBuffer(pdfBuf) ? pdfBuf : Buffer.from(pdfBuf);
    if(typeof destino === 'string'){ fs.writeFileSync(destino, buf); }
    else if(typeof destino?.end === 'function'){
      await new Promise((resolve,reject)=>{
        if(destino.on){ destino.on('error',reject); destino.on('finish',resolve); }
        destino.end(buf);
        if(!destino.on) resolve();
      });
    } else throw new Error('destino inválido');
  } catch(e){
    if(page) await page.close().catch(()=>{});
    throw e;
  }
}

module.exports = { gerarRelatorio };
