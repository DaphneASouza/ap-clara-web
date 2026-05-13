// gerar-pdf.js — Gera PDF conforme modelo AP Clara Digital
'use strict';

const PDFDocument  = require('pdfkit');
const path         = require('path');
const fs           = require('fs');
const { CARDAPIO } = require('./cardapio');

// ── Lookup rápido por id ──────────────────────────────────────────────────────
const CARD_MAP = Object.fromEntries(CARDAPIO.map(c => [c.id, c]));

// ── Constantes visuais ────────────────────────────────────────────────────────
const COR_LARANJA       = '#E65C00';
const COR_LARANJA_CLARO = '#FFF3EC';
const COR_CINZA_CLARO   = '#F2F2F2';
const COR_CINZA_BORDA   = '#CCCCCC';
const COR_TEXTO         = '#111111';
const ASSINATURA_PATH   = path.join(__dirname, 'public', 'assinatura.png');

// ── Formatação BRL ────────────────────────────────────────────────────────────
function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ═════════════════════════════════════════════════════════════════════════════
// Geração do PDF
// ═════════════════════════════════════════════════════════════════════════════
async function gerarPDF(dados, destino) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 25, bufferPages: true });
      doc.pipe(destino);

      // Coordenadas base (A4 = 595.28 x 841.89 pt)
      const L = 25, R = 570, W = R - L; // W = 545
      const PAGE_BOTTOM = 812;
      let y = 25;

      // ── checkPage: adiciona página nova e chama callback opcional ──────────
      const checkPage = (needed, onNewPage = null) => {
        if (y + needed > PAGE_BOTTOM) {
          doc.addPage();
          y = 25;
          if (typeof onNewPage === 'function') onNewPage();
        }
      };

      // ══════════════════════════════════════════════════════════════════════
      // 1. CABEÇALHO — 2 colunas separadas por linha vertical
      // ══════════════════════════════════════════════════════════════════════
      const HDR_FS  = 7;
      const SPLIT   = Math.round(W * 0.55); // ~300 — largura coluna esquerda
      const colLw   = SPLIT - 6;
      const colRx   = L + SPLIT + 6;
      const colRw   = R - colRx;

      const leftRows = [
        ['NOME EMPRESARIAL: ',    'CLARA SERVICOS INTEGRADOS DE VIDEO, CONTEUDO E WEB LTDA'],
        ['ENDEREÇO: ',            'ST SHIN CA 01 LOTE A BLOCO A SALA, 71.503-501 LAGO NORTE - DF'],
        ['ENDEREÇO ELETRÔNICO: ', 'CONTATO@CLARADIGITAL.COM.BR'],
        ['CNPJ: ',                '07.660.888/0001-38'],
        ['NÚMERO DE INSCRIÇÃO: ', '07.660.888/0001-38 MATRIZ'],
      ];

      const yHdrStart = y;
      let yL = y;

      // Renderiza coluna esquerda
      leftRows.forEach(([lbl, val]) => {
        const lblW = doc.font('Helvetica-Bold').fontSize(HDR_FS).widthOfString(lbl);
        const valW = Math.max(1, colLw - lblW);
        doc.font('Helvetica-Bold').fontSize(HDR_FS).fillColor(COR_TEXTO)
           .text(lbl, L, yL, { lineBreak: false });
        doc.font('Helvetica').fontSize(HDR_FS).fillColor(COR_TEXTO)
           .text(val, L + lblW, yL, { width: valW });
        const rowH = Math.max(
          HDR_FS + 2,
          doc.font('Helvetica').fontSize(HDR_FS).heightOfString(val, { width: valW })
        );
        yL += rowH + 1.5;
      });

      // Renderiza coluna direita
      let yR = y;
      doc.fillColor(COR_LARANJA).fontSize(9.5).font('Helvetica-Bold')
         .text('AP – AUTORIZAÇÃO DE PRODUÇÃO', colRx, yR, { width: colRw });
      yR += doc.heightOfString('AP – AUTORIZAÇÃO DE PRODUÇÃO', { width: colRw, fontSize: 9.5 }) + 5;

      doc.fillColor(COR_TEXTO).fontSize(HDR_FS).font('Helvetica')
         .text(`Ano: ${dados.ano}`, colRx, yR, { width: colRw });
      yR += HDR_FS + 3;

      doc.text(`AP: ${dados.numero}`, colRx, yR, { width: colRw });
      yR += HDR_FS + 3;

      doc.fontSize(6.5).font('Helvetica-Bold').fillColor(COR_TEXTO)
         .text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS – SESC-AR/DF Nº 018188/2024',
               colRx, yR, { width: colRw });

      // Borda externa + linha vertical divisória
      const hdrH = Math.max(yL, yR) - yHdrStart + 5;
      doc.rect(L, yHdrStart, W, hdrH).stroke(COR_CINZA_BORDA);
      doc.moveTo(L + SPLIT, yHdrStart).lineTo(L + SPLIT, yHdrStart + hdrH).stroke(COR_CINZA_BORDA);

      y = yHdrStart + hdrH + 7;

      // ══════════════════════════════════════════════════════════════════════
      // 2. TABELA DE IDENTIFICAÇÃO
      // ══════════════════════════════════════════════════════════════════════
      const ID_FS   = 8;
      const LBL_COL = 155;
      const VAL_COL = W - LBL_COL;

      const idRows = [
        ['CLIENTE',              'SESC DF'],
        ['UNIDADE REQUISITANTE', dados.unidade     || '—'],
        ['PROJETO',              dados.tipo        || '—'],
        ['NOME DO PROJETO',      dados.nomeProjeto || '—'],
        ['DESCRITIVO',           dados.descritivo  || '—'],
      ];

      idRows.forEach(([lbl, val]) => {
        const valH = doc.font('Helvetica').fontSize(ID_FS)
                       .heightOfString(val, { width: VAL_COL - 12 });
        const rowH = Math.max(17, valH + 8);
        checkPage(rowH);

        doc.rect(L,           y, LBL_COL, rowH).fill(COR_CINZA_CLARO).stroke(COR_CINZA_BORDA);
        doc.rect(L + LBL_COL, y, VAL_COL, rowH).fill('white').stroke(COR_CINZA_BORDA);

        const lblY = y + (rowH - ID_FS) / 2 - 1;
        doc.fillColor(COR_TEXTO).fontSize(ID_FS).font('Helvetica-Bold')
           .text(lbl, L + 6, lblY, { width: LBL_COL - 12, lineBreak: false });

        doc.font('Helvetica').fillColor('#222222')
           .text(val, L + LBL_COL + 6, y + 4, { width: VAL_COL - 12 });

        y += rowH;
      });

      y += 9;

      // ══════════════════════════════════════════════════════════════════════
      // 3. DESCRITIVO DOS PRODUTOS E SERVIÇOS
      // ══════════════════════════════════════════════════════════════════════
      checkPage(24);
      const SEC_H = 18;

      // Título da seção
      doc.rect(L, y, W, SEC_H).fill(COR_CINZA_CLARO).stroke(COR_CINZA_BORDA);
      doc.fillColor(COR_TEXTO).fontSize(9).font('Helvetica-Bold')
         .text('DESCRITIVO DOS PRODUTOS E SERVIÇOS',
               L, y + (SEC_H - 9) / 2, { width: W, align: 'center' });
      y += SEC_H;

      (dados.itens || []).forEach((item, idx) => {
        const ci   = CARD_MAP[item.id] || {};
        const tit  = ci.titulo       || item.titulo       || '—';
        const comp = ci.complexidade || item.complexidade || '—';
        const numTx = `${idx + 1}. `;
        const numW  = doc.font('Helvetica-Bold').fontSize(8).widthOfString(numTx);

        const titH  = doc.font('Helvetica-Bold').fontSize(8).heightOfString(numTx + tit,  { width: W - 12 });
        const cmpH  = doc.font('Helvetica').fontSize(7.5).heightOfString(comp, { width: W - 14 - numW });
        const rowH  = Math.max(22, titH + cmpH + 9);

        checkPage(rowH);

        const bg = idx % 2 === 0 ? 'white' : COR_CINZA_CLARO;
        doc.rect(L, y, W, rowH).fill(bg).stroke(COR_CINZA_BORDA);

        const titY = y + 4;
        doc.fillColor(COR_TEXTO).fontSize(8).font('Helvetica-Bold')
           .text(numTx + tit, L + 6, titY, { width: W - 12 });

        const cmpY = titY + titH + 1;
        doc.fillColor('#555555').fontSize(7.5).font('Helvetica')
           .text(comp, L + 6 + numW, cmpY, { width: W - 12 - numW });

        y += rowH;
      });

      y += 9;

      // ══════════════════════════════════════════════════════════════════════
      // 4. TABELA DE PRODUTOS E SERVIÇOS
      // ══════════════════════════════════════════════════════════════════════
      checkPage(60);

      // Título da seção
      doc.rect(L, y, W, SEC_H).fill(COR_LARANJA_CLARO).stroke(COR_CINZA_BORDA);
      doc.fillColor(COR_LARANJA).fontSize(9).font('Helvetica-Bold')
         .text('TABELA DE PRODUTOS E SERVIÇOS',
               L, y + (SEC_H - 9) / 2, { width: W, align: 'center' });
      y += SEC_H;

      // Definição das colunas (total = 545)
      //  item  prod  comp  qtd  per  vUe  vTe  vUd  vTd
      //   25   120   105   30   50   57   57   57   44  = 545
      const COLS = [
        { key: 'item', w: 25  },
        { key: 'prod', w: 120 },
        { key: 'comp', w: 105 },
        { key: 'qtd',  w: 30  },
        { key: 'per',  w: 50  },
        { key: 'vUe',  w: 57  },
        { key: 'vTe',  w: 57  },
        { key: 'vUd',  w: 57  },
        { key: 'vTd',  w: 44  },
      ];
      let cx = L;
      COLS.forEach(c => { c.x = cx; cx += c.w; });
      const col = key => COLS.find(c => c.key === key);

      // ── Cabeçalho da tabela (2 linhas) ────────────────────────────────────
      const HDR1H = 14, HDR2H = 14;

      const drawTblHeader = () => {
        const yH = y;
        doc.rect(L, yH, W, HDR1H + HDR2H).fill(COR_LARANJA);
        doc.fillColor('white').font('Helvetica-Bold');

        // Coluna Item — centralizado verticalmente (spans 2 linhas)
        const midV = (HDR1H + HDR2H - 6) / 2;
        doc.fontSize(6)
           .text('Item', col('item').x, yH + midV, { width: col('item').w, align: 'center', lineBreak: false });

        // Produto/Serviço — 2 linhas de texto
        doc.fontSize(5.5)
           .text('Produto/', col('prod').x + 2, yH + HDR1H / 2 - 5, { width: col('prod').w - 4, align: 'center', lineBreak: false });
        doc.text('Serviço',  col('prod').x + 2, yH + HDR1H / 2 + 1, { width: col('prod').w - 4, align: 'center', lineBreak: false });

        // Complexidade — centralizado verticalmente
        doc.fontSize(6)
           .text('Complexidade', col('comp').x + 2, yH + midV, { width: col('comp').w - 4, align: 'center', lineBreak: false });

        // "Resumo do Cronograma de Entrega" — linha 1, abrange qtd + per
        const resumoX = col('qtd').x;
        const resumoW = col('qtd').w + col('per').w;
        doc.fontSize(5.5)
           .text('Resumo do Cronograma de Entrega',
                 resumoX, yH + 3, { width: resumoW, align: 'center', lineBreak: false });

        // Sub-headers — linha 2 (qtd e per)
        doc.text('Qtd.',            col('qtd').x, yH + HDR1H + 4, { width: col('qtd').w, align: 'center', lineBreak: false });
        doc.text('Período de exec.',col('per').x, yH + HDR1H + 4, { width: col('per').w, align: 'center', lineBreak: false });

        // Separador horizontal interno (entre linha 1 e 2 da área "Resumo")
        doc.moveTo(resumoX, yH + HDR1H)
           .lineTo(resumoX + resumoW, yH + HDR1H)
           .stroke('rgba(255,255,255,0.4)');

        // Colunas de valor — linha 1 (label) + linha 2 (sub-label)
        const valCols = [
          { key: 'vUe', l1: 'Valor Unit.',  l2: '(estimado)' },
          { key: 'vTe', l1: 'Valor Total',  l2: '(estimado)' },
          { key: 'vUd', l1: 'Valor Unit.',  l2: '(desc.13,5%)' },
          { key: 'vTd', l1: 'Valor Total',  l2: '(desc.13,5%)' },
        ];
        valCols.forEach(({ key, l1, l2 }) => {
          doc.fontSize(5.5)
             .text(l1, col(key).x + 1, yH + 3,       { width: col(key).w - 2, align: 'center', lineBreak: false });
          doc.text(l2, col(key).x + 1, yH + HDR1H + 4, { width: col(key).w - 2, align: 'center', lineBreak: false });
        });

        // Separadores verticais semi-transparentes
        COLS.slice(1).forEach(c => {
          doc.moveTo(c.x, yH + 1).lineTo(c.x, yH + HDR1H + HDR2H - 1)
             .stroke('rgba(255,255,255,0.3)');
        });

        y += HDR1H + HDR2H;
      };

      drawTblHeader();

      // ── Linhas de dados ────────────────────────────────────────────────────
      let totEst = 0, totDsc = 0;

      (dados.itens || []).forEach((item, idx) => {
        const ci    = CARD_MAP[item.id] || {};
        const tit   = ci.titulo       || item.titulo       || '—';
        const comp  = ci.complexidade || item.complexidade || '—';
        const qtd   = Number(item.qtd) || 1;
        const per   = item.periodo || `${dados.mes}/${dados.ano}`;

        // item.valor já vem com desconto de 13,5% aplicado
        // vEst = preço SEM desconto (estimado) = valor / 0.865
        const vDsc  = Number(item.valor || ci.valor || 0);
        const vEst  = vDsc > 0 ? vDsc / (1 - 0.135) : 0;
        const vTDsc = vDsc * qtd;
        const vTEst = vEst * qtd;

        totEst += vTEst;
        totDsc += vTDsc;

        const titH = doc.font('Helvetica').fontSize(7)
                       .heightOfString(tit,  { width: col('prod').w - 6 });
        const cmpH = doc.font('Helvetica').fontSize(6.5)
                       .heightOfString(comp, { width: col('comp').w - 6 });
        const rowH = Math.max(20, titH + 6, cmpH + 6);

        checkPage(rowH, drawTblHeader);

        const bg = idx % 2 === 0 ? 'white' : COR_LARANJA_CLARO;
        doc.rect(L, y, W, rowH).fill(bg);

        // Separadores verticais
        COLS.slice(1).forEach(c => {
          doc.moveTo(c.x, y).lineTo(c.x, y + rowH).stroke(COR_CINZA_BORDA);
        });
        doc.rect(L, y, W, rowH).stroke(COR_CINZA_BORDA);

        const cy = y + rowH / 2 - 3.5; // y central (para textos de 1 linha)

        doc.fillColor(COR_TEXTO).fontSize(7).font('Helvetica');
        doc.text(String(item.id || idx + 1),
                 col('item').x, cy, { width: col('item').w, align: 'center', lineBreak: false });
        doc.text(tit,  col('prod').x + 3, y + 3, { width: col('prod').w - 6 });
        doc.fontSize(6.5)
           .text(comp, col('comp').x + 3, y + 3, { width: col('comp').w - 6 });
        doc.fontSize(7)
           .text(String(qtd), col('qtd').x, cy, { width: col('qtd').w, align: 'center', lineBreak: false });
        doc.text(per, col('per').x, cy, { width: col('per').w, align: 'center', lineBreak: false });

        doc.font('Helvetica-Bold').fontSize(6.5);
        doc.text(brl(vEst),  col('vUe').x + 1, cy, { width: col('vUe').w - 2, align: 'right', lineBreak: false });
        doc.text(brl(vTEst), col('vTe').x + 1, cy, { width: col('vTe').w - 2, align: 'right', lineBreak: false });
        doc.text(brl(vDsc),  col('vUd').x + 1, cy, { width: col('vUd').w - 2, align: 'right', lineBreak: false });
        doc.text(brl(vTDsc), col('vTd').x + 1, cy, { width: col('vTd').w - 2, align: 'right', lineBreak: false });

        y += rowH;
      });

      // ── Linha TOTAL ────────────────────────────────────────────────────────
      const TOT_ROW_H = 18;
      checkPage(TOT_ROW_H + 22);

      doc.rect(L, y, W, TOT_ROW_H).fill(COR_CINZA_CLARO).stroke(COR_CINZA_BORDA);

      const totLabelW = col('vUe').x - L - 12;
      doc.fillColor(COR_TEXTO).fontSize(8).font('Helvetica-Bold')
         .text('TOTAL', L + 6, y + (TOT_ROW_H - 8) / 2,
               { width: totLabelW, align: 'right', lineBreak: false });
      doc.text(brl(totEst), col('vTe').x + 1, y + (TOT_ROW_H - 8) / 2,
               { width: col('vTe').w - 2, align: 'right', lineBreak: false });
      doc.text(brl(totDsc), col('vTd').x + 1, y + (TOT_ROW_H - 8) / 2,
               { width: col('vTd').w - 2, align: 'right', lineBreak: false });
      y += TOT_ROW_H;

      // ── Faixa "TOTAL: R$ X" ────────────────────────────────────────────────
      const TOT_BAR_H = 20;
      doc.rect(L, y, W, TOT_BAR_H).fill(COR_LARANJA);
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
         .text(`TOTAL: ${brl(totDsc)}`, L, y + (TOT_BAR_H - 10) / 2,
               { width: W, align: 'center', lineBreak: false });
      y += TOT_BAR_H + 14;

      // ══════════════════════════════════════════════════════════════════════
      // 5. RODAPÉ
      // ══════════════════════════════════════════════════════════════════════
      checkPage(115);

      // Linha de data
      doc.fillColor(COR_TEXTO).fontSize(9).font('Helvetica')
         .text(`DATA: ${dados.data || '—'}`, L, y);
      y += 20;

      // ── Bloco de assinatura (metade direita) ───────────────────────────────
      const SIG_W = Math.round(W * 0.50);
      const sigX  = R - SIG_W;

      // Linha horizontal de assinatura
      const assinY = y + 28;
      doc.moveTo(sigX, assinY).lineTo(R, assinY).stroke('#444444');

      // Imagem da assinatura sobreposta à linha
      if (fs.existsSync(ASSINATURA_PATH)) {
        doc.image(ASSINATURA_PATH,
                  sigX + SIG_W / 2 - 50, assinY - 26,
                  { width: 100, height: 28 });
      }

      // Textos abaixo da linha de assinatura
      let stY = assinY + 5;
      doc.fillColor(COR_TEXTO).fontSize(7).font('Helvetica-Bold')
         .text('CLARA SERVICOS INTEGRADOS DE VIDEO, CONTEUDO E WEB LTDA',
               sigX, stY, { width: SIG_W, align: 'center' });
      stY += 10;
      doc.font('Helvetica').fontSize(7)
         .text('CNPJ: 07.660.888/0001-38', sigX, stY, { width: SIG_W, align: 'center' });
      stY += 10;
      doc.text('Cláudia Gomes Chaves', sigX, stY, { width: SIG_W, align: 'center' });
      stY += 10;
      doc.text('Representante Legal', sigX, stY, { width: SIG_W, align: 'center' });

      y = stY + 20;

      // ── Bloco inferior — 3 colunas ─────────────────────────────────────────
      checkPage(55);

      const BOT_CW = Math.round(W / 3);
      const bot2X  = L + BOT_CW + 5;
      const bot2W  = BOT_CW - 10;
      const bot3X  = L + BOT_CW * 2 + 10;
      const bot3W  = R - bot3X;

      // Col 1: rótulo
      doc.fillColor(COR_TEXTO).fontSize(8).font('Helvetica-Bold')
         .text('Valor e definição dos serviços desta AP:', L, y, { width: BOT_CW - 5 });

      // Col 2: valores e referência do contrato
      doc.font('Helvetica').fontSize(7.5)
         .text(`Valor Total: ${brl(totEst)}`, bot2X, y, { width: bot2W });
      doc.text(`Valor Total (13,5%): ${brl(totDsc)}`, bot2X, doc.y + 2, { width: bot2W });
      doc.fontSize(6.5)
         .text('Conforme Contrato de Prestação de Serviços –\nSESC-AR/DF Nº 018188/2024',
               bot2X, doc.y + 3, { width: bot2W });

      // Col 3: assinatura do cliente
      const clientLineY = y + 36;
      doc.moveTo(bot3X, clientLineY).lineTo(bot3X + bot3W, clientLineY).stroke('#444444');
      doc.fillColor(COR_TEXTO).fontSize(7.5).font('Helvetica')
         .text('Assinatura do Cliente', bot3X, clientLineY + 5, { width: bot3W, align: 'center' });

      // ── Fim ────────────────────────────────────────────────────────────────
      doc.end();

      if (destino.on) {
        destino.on('finish', resolve);
        destino.on('error',  reject);
      } else {
        doc.on('end',   resolve);
        doc.on('error', reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { gerarPDF };
