'use strict';

const fs   = require('fs');
const path = require('path');
const { CARDAPIO } = require('./cardapio');

const CARD_MAP = Object.fromEntries(CARDAPIO.map(c => [c.id, c]));

const imgB64 = fs.readFileSync(path.join(__dirname, 'public', 'assinatura.png')).toString('base64');

// ── Helpers ───────────────────────────────────────────────────────────────────

function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Extrai "abr/26" de "ABRIL.MENSAL.2026" ou "mai" de "MAIO.ESPECIAL.1023"
const MESES_PT = {
  JANEIRO:'jan', FEVEREIRO:'fev', MARÇO:'mar', MARCO:'mar',
  ABRIL:'abr',  MAIO:'mai',      JUNHO:'jun',  JULHO:'jul',
  AGOSTO:'ago', SETEMBRO:'set',  OUTUBRO:'out',
  NOVEMBRO:'nov', DEZEMBRO:'dez',
};

function extrairPeriodo(numeroAP) {
  const partes  = (numeroAP || '').toUpperCase().split('.');
  const mesNome = (partes[0] || '').trim();
  const ultimo  = (partes[partes.length - 1] || '').trim();
  const mesAbrev = MESES_PT[mesNome] || mesNome.slice(0, 3).toLowerCase();
  // Último segmento é ano (ex: "2026") se for 4 dígitos começando com 20
  const isAno = /^20\d{2}$/.test(ultimo) && partes.length > 1 && ultimo !== partes[0];
  return isAno ? `${mesAbrev}/${ultimo.slice(2)}` : mesAbrev;
}

// ── HTML do documento ─────────────────────────────────────────────────────────

function buildHTML(dados) {
  // 4. Período: usa dados.mes + dados.ano diretamente
  const mesAbrev = MESES_PT[(dados.mes || '').toUpperCase().trim()]
                   || (dados.mes || '').slice(0, 3).toLowerCase();
  const periodo  = dados.ano ? `${mesAbrev}/${String(dados.ano).slice(2)}` : mesAbrev;

  // Enriquece itens com dados do cardápio e calcula valores
  const itens = (dados.itens || []).map(item => {
    const ci    = CARD_MAP[item.id] || {};
    const tit   = ci.titulo       || item.titulo       || '—';
    const comp  = ci.complexidade || item.complexidade || '';
    const desc  = ci.descritivo   || item.descritivo   || '';  // 2/3. campo descritivo
    const qtd   = Number(item.qtd || item.quantidade)  || 1;
    const per   = item.periodo || periodo;

    // item.valor está com desconto de 13,5% já aplicado
    const vDisc = Number(item.valor || item.valor_unitario || ci.valor || 0);
    const vEst  = vDisc > 0 ? vDisc / 0.865 : 0;   // estimado (sem desconto)
    const vtEst  = vEst  * qtd;
    const vtDisc = vDisc * qtd;

    return { id: item.id, tit, comp, desc, qtd, per, vEst, vtEst, vDisc, vtDisc };
  });

  let totEst = 0, totDisc = 0;
  itens.forEach(i => { totEst += i.vtEst; totDisc += i.vtDisc; });

  // 2. DESCRITIVO: junta os descricao_projeto de cada item separados por " ; "
  const descval = itens
    .map(it => (it.descricao_projeto || '').trim())
    .filter(Boolean)
    .join(' ; ');

  // ── Linhas de item da tabela ─────────────────────────────────────────────
  const linhasItens = itens.map(it => `
    <tr>
      <td style="text-align:center">${esc(it.id)}</td>
      <td>${esc(it.tit)}</td>
      <td>${esc(it.comp)}</td>
      <td style="text-align:center">${it.qtd}</td>
      <td style="text-align:center">${esc(it.per)}</td>
      <td class="td-num">${brl(it.vEst)}</td>
      <td class="td-num">${brl(it.vtEst)}</td>
      <td class="td-num">${brl(it.vDisc)}</td>
      <td class="td-num">${brl(it.vtDisc)}</td>
    </tr>`).join('');

  // 3. Descritivo dos produtos: titulo + descritivo completo + complexidade em itálico
  const descItems = itens.map(it => `
    <div class="desc-item">
      <span class="desc-titulo">${esc(it.id)}.${esc(it.tit)}</span>
      ${it.desc
        ? `<div class="desc-comp">${esc(it.desc)}</div>` : ''}
      ${it.comp && it.comp !== 'Não se aplica'
        ? `<div class="desc-comp" style="font-style:italic;font-size:7.5px">${esc(it.comp)}</div>` : ''}
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 10mm; }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: Arial, sans-serif;
    font-size: 9px;
    color: #000;
    background: #fff;
  }

  table { width: 100%; border-collapse: collapse; }
  td, th {
    border: 0.5px solid #000;
    padding: 2px 4px;
    vertical-align: middle;
    word-break: break-word;
  }

  .bloco { margin-bottom: 3px; }

  /* ── Bloco 1: Cabeçalho — fundo LARANJA, texto branco ── */
  .hdr-esq {
    width: 58%; vertical-align: top;
    padding: 5px 6px; font-weight: bold; font-size: 8px; line-height: 1.6;
    background: #FF6D01; color: #fff;
  }
  .hdr-dir {
    width: 42%; vertical-align: top;
    padding: 5px 6px; font-size: 8px; line-height: 1.6;
    background: #FF6D01; color: #fff;
  }
  .hdr-dir .ap-titulo { font-weight: bold; font-size: 10px; }
  .hdr-dir .contrato  { font-size: 7px; margin-top: 3px; }

  /* ── Bloco 2: Campos fixos — label LARANJA, valor BRANCO ── */
  .lbl {
    background: #FF6D01; color: #fff; font-weight: bold;
    text-align: right; white-space: nowrap;
    width: 22%; padding: 3px 6px;
  }
  .val { background: #fff; padding: 3px 5px; }

  /* ── Títulos de seção ── */
  .sec-titulo {
    background: #FF6D01; color: #fff; font-weight: bold;
    text-align: center; padding: 4px 6px; font-size: 9px;
    border: 0.5px solid #000;
  }

  /* ── Bloco 3: Descritivo dos produtos — corpo BRANCO ── */
  .desc-corpo {
    border: 0.5px solid #000; border-top: none;
    background: #fff; padding: 4px 6px;
  }
  .desc-item { padding: 2px 0 4px; }
  .desc-item + .desc-item { border-top: 0.5px solid #eee; padding-top: 4px; }
  .desc-titulo { font-weight: bold; }
  .desc-comp   { font-size: 8px; color: #333; margin-top: 1px; }

  /* ── Bloco 4: Cabeçalho da tabela ── */
  .th-main {
    background: #FF6D01; color: #fff; font-weight: bold;
    text-align: center; vertical-align: middle; font-size: 8px;
  }
  .th-sub {
    background: #FCE5CD;
    text-align: center; vertical-align: middle; font-size: 8px;
  }

  /* ── Células de valor ── */
  .td-num { text-align: right; white-space: nowrap; font-weight: bold; }

  /* ── Linha TOTAL ── */
  .tr-total td {
    background: #FF6D01; color: #fff;
    font-weight: bold; padding: 3px 6px;
  }

  /* ── Barra TOTAL repetida ── */
  .total-bar {
    background: #FF6D01; color: #fff; font-weight: bold;
    text-align: center; font-size: 10px; padding: 4px 6px;
    border: 0.5px solid #000; margin-bottom: 3px;
  }

  /* ── Rodapé ── */
  .rdf-data-esq {
    width: 50%; padding: 6px; font-weight: bold;
    text-align: center; vertical-align: middle;
  }
  .rdf-data-dir { width: 50%; padding: 6px; }

  .rdf-val-lbl {
    background: #FF6D01; color: #fff; font-weight: bold;
    padding: 3px 6px; font-size: 8.5px;
  }
  .rdf-val-body { padding: 4px 6px; font-size: 8.5px; line-height: 1.65; }
  .rdf-val-contrato { font-size: 7.5px; margin-top: 4px; color: #333; }

  .rdf-assin-dir {
    width: 40%; text-align: center;
    vertical-align: bottom; padding: 8px 8px 6px;
  }
</style>
</head>
<body>

<!-- ════ BLOCO 1: CABEÇALHO (fundo branco, texto preto bold) ════ -->
<div class="bloco">
<table>
  <tr>
    <td class="hdr-esq">
      <div><strong>NOME EMPRESARIAL:</strong> CLARA SERVICOS INTEGRADOS DE VIDEO, CONTEUDO E WEB LTDA</div>
      <div><strong>ENDEREÇO:</strong> ST SHIN CA 01 LOTE A BLOCO A SALA, 71.503-501 LAGO NORTE - DF</div>
      <div><strong>ENDEREÇO ELETRÔNICO:</strong> CONTATO@CLARADIGITAL.COM.BR</div>
      <div><strong>CNPJ:</strong> 07.660.888/0001-38</div>
      <div><strong>NÚMERO DE INSCRIÇÃO:</strong> 07.660.888/0001-38 MATRIZ</div>
    </td>
    <td class="hdr-dir">
      <div class="ap-titulo">AP – AUTORIZAÇÃO DE PRODUÇÃO</div>
      <div style="margin-top:4px">Ano: <strong>${esc(dados.ano || String(new Date().getFullYear()))}</strong></div>
      <div>AP: <strong>${esc(dados.numero || '')}</strong></div>
      <div class="contrato">CONTRATO DE PRESTAÇÃO DE SERVIÇOS – SESC-AR/DF Nº 018188/2024</div>
    </td>
  </tr>
</table>
</div>

<!-- ════ BLOCO 2: CAMPOS FIXOS (label laranja, valor branco) ════ -->
<div class="bloco">
<table>
  <tr><td class="lbl">CLIENTE:</td>             <td class="val">SESC DF</td></tr>
  <tr><td class="lbl">UNIDADE REQUISITANTE:</td> <td class="val">${esc(dados.unidade?.trim() || 'Geral')}</td></tr>
  <tr><td class="lbl">PROJETO:</td>              <td class="val">${esc(dados.tipo || '')}</td></tr>
  <tr><td class="lbl">NOME DO PROJETO:</td>      <td class="val">${esc(dados.nomeProjeto || '')}</td></tr>
  <tr><td class="lbl">DESCRITIVO:</td>           <td class="val">${esc(descval)}</td></tr>
</table>
</div>

<!-- ════ BLOCO 3: DESCRITIVO DOS PRODUTOS ════ -->
<div class="bloco">
  <div class="sec-titulo">DESCRITIVO DOS PRODUTOS E SERVIÇOS</div>
  <div class="desc-corpo">${descItems}</div>
</div>

<!-- ════ BLOCO 4: TABELA DE PRODUTOS E SERVIÇOS ════ -->
<div class="bloco">
  <div class="sec-titulo">TABELA DE PRODUTOS E SERVIÇOS</div>
  <table>
    <thead>
      <tr>
        <th class="th-main" rowspan="2" style="width:4%">Item</th>
        <th class="th-main" rowspan="2" style="width:19%">Produto/<br>Serviço</th>
        <th class="th-main" rowspan="2" style="width:15%">Complexidade</th>
        <th class="th-main" colspan="2">Resumo do Cronograma de Entrega</th>
        <th class="th-main" rowspan="2" style="width:12%">Valor Unitário<br>(estimado)</th>
        <th class="th-main" rowspan="2" style="width:11%">Valor Total</th>
        <th class="th-main" rowspan="2" style="width:13%">Valor Unitário<br>(desc.13,5%)</th>
        <th class="th-main" rowspan="2" style="width:12%">Valor Total<br>(desc.13,5%)</th>
      </tr>
      <tr>
        <th class="th-sub" style="width:6%">Qtd. de itens</th>
        <th class="th-sub" style="width:8%">Período de execução</th>
      </tr>
    </thead>
    <tbody>
      ${linhasItens}
      <tr class="tr-total">
        <td colspan="6" style="text-align:right">TOTAL:</td>
        <td class="td-num">${brl(totEst)}</td>
        <td></td>
        <td class="td-num">${brl(totDisc)}</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ════ TOTAL REPETIDO (valor com desconto sozinho) ════ -->
<div class="total-bar">TOTAL: ${brl(totDisc)}</div>

<!-- ════ RODAPÉ — LINHA DATA ════ -->
<div class="bloco">
<table>
  <tr>
    <td class="rdf-data-esq">DATA: ${esc(dados.data || '—')}</td>
    <td class="rdf-data-dir" style="text-align:center; vertical-align:middle; padding:4px 8px;">
      <img src="data:image/png;base64,${imgB64}" style="max-height:50px; max-width:100%; object-fit:contain; display:inline-block;">
    </td>
  </tr>
</table>
</div>

<!-- ════ RODAPÉ — VALORES / ASSINATURA CLIENTE ════ -->
<div class="bloco">
<table>
  <tr>
    <td style="width:60%;vertical-align:top;padding:0">
      <div class="rdf-val-lbl">Valor e definição dos serviços desta AP:</div>
      <div class="rdf-val-body">
        <div>Valor Total: <strong>${brl(totEst)}</strong></div>
        <div>Valor Total (13,5%): <strong>${brl(totDisc)}</strong></div>
        <div class="rdf-val-contrato">
          Para a tabela acima disposta, serão executados os serviços descritos e aprovados
          referente ao Contrato Nº 018188/2024.
        </div>
      </div>
    </td>
    <td class="rdf-assin-dir">
      <div style="margin-bottom:24px"></div>
      <div>________________________________</div>
      <div style="margin-top:4px">Assinatura do Cliente</div>
    </td>
  </tr>
</table>
</div>

</body>
</html>`;
}

// ── Gerar PDF via Puppeteer ───────────────────────────────────────────────────

async function gerarPDFv2(dados, destino) {
  let browser;
  try {
    const puppeteer = require('puppeteer-core');
    const chromium  = require('@sparticuz/chromium');
    browser = await puppeteer.launch({
      args:            chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath:  await chromium.executablePath(),
      headless:        chromium.headless,
    });

    const page = await browser.newPage();
    const html = buildHTML(dados);
    await page.setContent(html, { waitUntil: 'load' });

    const pdfBuf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });

    await browser.close();
    browser = null;

    const buf = Buffer.isBuffer(pdfBuf) ? pdfBuf : Buffer.from(pdfBuf);

    // Aceita: WriteStream (res), path string, ou buffer callback
    if (typeof destino === 'string') {
      fs.writeFileSync(destino, buf);
    } else if (typeof destino?.end === 'function') {
      await new Promise((resolve, reject) => {
        if (destino.on) {
          destino.on('error', reject);
          destino.on('finish', resolve);
        }
        destino.end(buf);
        if (!destino.on) resolve();
      });
    } else {
      throw new Error('destino inválido');
    }

  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    throw e;
  }
}

module.exports = { gerarPDFv2, buildHTML };
