// gerar-pdf.js — Gera PDF conforme modelo AP Clara Digital
'use strict';

const PDFDocument  = require('pdfkit');
const path         = require('path');
const fs           = require('fs');
const { CARDAPIO } = require('./cardapio');

// Lookup rápido por id
const CARD_MAP = Object.fromEntries(CARDAPIO.map(c => [c.id, c]));

const ASSINATURA_PATH = path.join(__dirname, 'public', 'assinatura.png');

// Paleta
const PRETO           = '#000000';
const BG_CINZA        = '#DDDDDD'; // título DESCRITIVO
const BG_AMARELO      = '#FFD580'; // título TABELA DE PRODUTOS
const BG_LABEL        = '#F0F0F0'; // células de label na tabela de identificação
const BG_HDR_TABELA   = '#F5F5F5'; // cabeçalho da tabela de produtos
const BORDA_W         = 0.5;

function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de desenho
// ─────────────────────────────────────────────────────────────────────────────

// Retorna a altura que uma string ocupa com determinada fonte/tamanho/largura
function strH(doc, text, fontSize, bold, width) {
  return doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(fontSize)
            .heightOfString(text, { width });
}

// Desenha um retângulo preenchido + borda
function fillRect(doc, x, y, w, h, fillColor) {
  doc.lineWidth(BORDA_W).rect(x, y, w, h).fillAndStroke(fillColor, PRETO);
}

// Desenha apenas a borda de um retângulo (fundo branco implícito)
function strokeRect(doc, x, y, w, h) {
  doc.lineWidth(BORDA_W).rect(x, y, w, h).stroke(PRETO);
}

// Escreve texto posicionado, retorna a altura ocupada
function txt(doc, text, x, y, w, { fontSize = 8, bold = false, align = 'left', color = PRETO } = {}) {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
     .fontSize(fontSize)
     .fillColor(color)
     .text(text, x, y, { width: w, align, lineBreak: true });
}

// Texto de 1 linha, sem quebra (para cabeçalhos)
function txtLine(doc, text, x, y, w, { fontSize = 7, bold = false, align = 'center', color = PRETO } = {}) {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
     .fontSize(fontSize)
     .fillColor(color)
     .text(text, x, y, { width: w, align, lineBreak: false });
}

// ─────────────────────────────────────────────────────────────────────────────
async function gerarPDF(dados, destino) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 25, bufferPages: true });
      doc.pipe(destino);

      // Margens e largura útil
      const L = 25, R = 570, W = R - L; // W = 545
      const PAGE_BOTTOM = 815;
      let y = 25;

      // Verifica se há espaço; se não, adiciona página
      const checkPage = (needed, onNewPage = null) => {
        if (y + needed > PAGE_BOTTOM) {
          doc.addPage();
          y = 25;
          if (typeof onNewPage === 'function') onNewPage();
        }
      };

      // ══════════════════════════════════════════════════════════════════════
      // BLOCO 1 — CABEÇALHO (2 colunas, borda externa fina)
      // ══════════════════════════════════════════════════════════════════════
      const COL_L_W = Math.round(W * 0.60); // 327
      const COL_R_X = L + COL_L_W;
      const COL_R_W = R - COL_R_X;          // 218
      const PAD     = 5;

      // Linhas da coluna esquerda: [label_bold, valor]
      const hdrLeft = [
        ['NOME EMPRESARIAL: ',    'CLARA SERVICOS INTEGRADOS DE VIDEO, CONTEUDO E WEB LTDA'],
        ['ENDEREÇO: ',            'ST SHIN CA 01 LOTE A BLOCO A SALA, 71.503-501 LAGO NORTE - DF'],
        ['ENDEREÇO ELETRÔNICO: ', 'CONTATO@CLARADIGITAL.COM.BR'],
        ['CNPJ: ',                '07.660.888/0001-38'],
        ['NÚMERO DE INSCRIÇÃO: ', '07.660.888/0001-38 MATRIZ'],
      ];

      // Pré-calcula alturas de cada linha da coluna esquerda
      const hdrLeftH = hdrLeft.map(([lbl, val]) => {
        const lblW = doc.font('Helvetica-Bold').fontSize(8).widthOfString(lbl);
        const valW = Math.max(1, COL_L_W - lblW - PAD * 2);
        return Math.max(10, strH(doc, val, 8, false, valW)) + 2;
      });
      const leftTotalH = hdrLeftH.reduce((s, h) => s + h, 0) + PAD * 2;

      // Conteúdo da coluna direita
      const hdrRight = [
        { text: 'AP – AUTORIZAÇÃO DE PRODUÇÃO',                                          bold: true,  fs: 10 },
        { text: `Ano: ${dados.ano}`,                                                      bold: false, fs: 8  },
        { text: `AP: ${dados.numero}`,                                                    bold: true,  fs: 8  },
        { text: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS – SESC-AR/DF Nº 018188/2024',         bold: false, fs: 7  },
      ];
      let rightTotalH = PAD;
      hdrRight.forEach(r => {
        rightTotalH += strH(doc, r.text, r.fs, r.bold, COL_R_W - PAD * 2) + 3;
      });
      rightTotalH += PAD;

      const hdrH = Math.max(leftTotalH, rightTotalH);

      // Borda externa do bloco
      strokeRect(doc, L, y, W, hdrH);
      // Linha divisória vertical
      doc.lineWidth(BORDA_W).moveTo(COL_R_X, y).lineTo(COL_R_X, y + hdrH).stroke(PRETO);

      // Renderiza coluna esquerda
      let yL = y + PAD;
      hdrLeft.forEach(([lbl, val], i) => {
        const lblW = doc.font('Helvetica-Bold').fontSize(8).widthOfString(lbl);
        const valW = Math.max(1, COL_L_W - lblW - PAD * 2);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(PRETO)
           .text(lbl, L + PAD, yL, { lineBreak: false });
        doc.font('Helvetica').fontSize(8).fillColor(PRETO)
           .text(val, L + PAD + lblW, yL, { width: valW });
        yL += hdrLeftH[i];
      });

      // Renderiza coluna direita
      let yR = y + PAD;
      hdrRight.forEach(r => {
        const font = r.bold ? 'Helvetica-Bold' : 'Helvetica';
        doc.font(font).fontSize(r.fs).fillColor(PRETO)
           .text(r.text, COL_R_X + PAD, yR, { width: COL_R_W - PAD * 2 });
        yR += strH(doc, r.text, r.fs, r.bold, COL_R_W - PAD * 2) + 3;
      });

      y += hdrH + 7;

      // ══════════════════════════════════════════════════════════════════════
      // BLOCO 2 — TABELA DE IDENTIFICAÇÃO
      // ══════════════════════════════════════════════════════════════════════
      const ID_LBL_W = Math.round(W * 0.25); // ~136
      const ID_VAL_W = W - ID_LBL_W;

      const idRows = [
        ['CLIENTE',              'SESC DF'],
        ['UNIDADE REQUISITANTE', dados.unidade     || '—'],
        ['PROJETO',              dados.tipo        || '—'],
        ['NOME DO PROJETO',      dados.nomeProjeto || '—'],
        ['DESCRITIVO',           dados.descritivo  || '—'],
      ];

      idRows.forEach(([lbl, val]) => {
        const valH = strH(doc, val, 8, false, ID_VAL_W - 10);
        const rowH = Math.max(16, valH + 8);
        checkPage(rowH);

        // Label (cinza, negrito, alinhado à direita)
        fillRect(doc, L, y, ID_LBL_W, rowH, BG_LABEL);
        const lblH = strH(doc, lbl, 8, true, ID_LBL_W - 10);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(PRETO)
           .text(lbl, L + 4, y + (rowH - lblH) / 2, { width: ID_LBL_W - 8, align: 'right', lineBreak: false });

        // Valor (branco, alinhado à esquerda)
        strokeRect(doc, L + ID_LBL_W, y, ID_VAL_W, rowH);
        doc.font('Helvetica').fontSize(8).fillColor(PRETO)
           .text(val, L + ID_LBL_W + 5, y + 4, { width: ID_VAL_W - 10 });

        y += rowH;
      });

      y += 8;

      // ══════════════════════════════════════════════════════════════════════
      // BLOCO 3 — DESCRITIVO DOS PRODUTOS E SERVIÇOS
      // ══════════════════════════════════════════════════════════════════════
      checkPage(20);

      // Título
      const SEC_H = 16;
      fillRect(doc, L, y, W, SEC_H, BG_CINZA);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(PRETO)
         .text('DESCRITIVO DOS PRODUTOS E SERVIÇOS',
               L + 4, y + (SEC_H - 9) / 2, { width: W - 8, align: 'center' });
      y += SEC_H;

      (dados.itens || []).forEach((item) => {
        const ci   = CARD_MAP[item.id] || {};
        const tit  = ci.titulo       || item.titulo       || '—';
        const comp = ci.complexidade || item.complexidade || '—';

        const idTxt = `${item.id || ''}. ${tit}`;
        const titH  = strH(doc, idTxt, 9, true,  W - 12);
        const cmpH  = strH(doc, comp,  8, false, W - 12);
        const rowH  = titH + cmpH + 12;

        checkPage(rowH);

        strokeRect(doc, L, y, W, rowH);

        // N. Título em negrito 9pt
        doc.font('Helvetica-Bold').fontSize(9).fillColor(PRETO)
           .text(idTxt, L + 6, y + 4, { width: W - 12 });

        // Complexidade em 8pt regular
        doc.font('Helvetica').fontSize(8).fillColor(PRETO)
           .text(comp, L + 6, y + 4 + titH + 1, { width: W - 12 });

        y += rowH;
      });

      y += 8;

      // ══════════════════════════════════════════════════════════════════════
      // BLOCO 4 — TABELA DE PRODUTOS E SERVIÇOS
      // ══════════════════════════════════════════════════════════════════════
      checkPage(60);

      // Título
      fillRect(doc, L, y, W, SEC_H, BG_AMARELO);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(PRETO)
         .text('TABELA DE PRODUTOS E SERVIÇOS',
               L + 4, y + (SEC_H - 9) / 2, { width: W - 8, align: 'center' });
      y += SEC_H;

      // Definição das colunas — total W = 545
      // item  prod  comp  qtd  per   vUe  vTe  vUd  vTd
      //  25   120   105   28   57    55   55   55   45  = 545
      const COLS = [
        { key: 'item', w: 25  },
        { key: 'prod', w: 120 },
        { key: 'comp', w: 105 },
        { key: 'qtd',  w: 28  },
        { key: 'per',  w: 57  },
        { key: 'vUe',  w: 55  },
        { key: 'vTe',  w: 55  },
        { key: 'vUd',  w: 55  },
        { key: 'vTd',  w: 45  },
      ];
      let cx = L;
      COLS.forEach(c => { c.x = cx; cx += c.w; });
      const col = key => COLS.find(c => c.key === key);

      // Alturas das linhas do cabeçalho
      const H1 = 14, H2 = 14;

      const drawTableHeader = () => {
        const yH = y;

        // Fundo do cabeçalho
        doc.rect(L, yH, W, H1 + H2).fill(BG_HDR_TABELA);

        // — Item (span H1+H2, centrado) —
        strokeRect(doc, col('item').x, yH, col('item').w, H1 + H2);
        txtLine(doc, 'Item',
          col('item').x + 1, yH + (H1 + H2 - 7) / 2, col('item').w - 2,
          { fontSize: 7, bold: true });

        // — Produto/Serviço (span H1+H2) —
        strokeRect(doc, col('prod').x, yH, col('prod').w, H1 + H2);
        txtLine(doc, 'Produto/Serviço',
          col('prod').x + 2, yH + (H1 + H2 - 7) / 2, col('prod').w - 4,
          { fontSize: 7, bold: true });

        // — Complexidade (span H1+H2) —
        strokeRect(doc, col('comp').x, yH, col('comp').w, H1 + H2);
        txtLine(doc, 'Complexidade',
          col('comp').x + 2, yH + (H1 + H2 - 7) / 2, col('comp').w - 4,
          { fontSize: 7, bold: true });

        // — Resumo do Cronograma (colspan qtd+per, apenas linha 1) —
        const resumoX = col('qtd').x;
        const resumoW = col('qtd').w + col('per').w;
        strokeRect(doc, resumoX, yH, resumoW, H1);
        txtLine(doc, 'Resumo do Cronograma de Entrega',
          resumoX + 2, yH + (H1 - 6) / 2, resumoW - 4,
          { fontSize: 6, bold: true });

        // — Qtd. de itens (linha 2) —
        strokeRect(doc, col('qtd').x, yH + H1, col('qtd').w, H2);
        txtLine(doc, 'Qtd. de itens',
          col('qtd').x + 1, yH + H1 + (H2 - 6) / 2, col('qtd').w - 2,
          { fontSize: 6, bold: true });

        // — Período de execução (linha 2) —
        strokeRect(doc, col('per').x, yH + H1, col('per').w, H2);
        txtLine(doc, 'Período de execução',
          col('per').x + 1, yH + H1 + (H2 - 6) / 2, col('per').w - 2,
          { fontSize: 6, bold: true });

        // — Colunas de valor (span H1+H2) —
        const valDefs = [
          { key: 'vUe', lbl: 'Valor Unitário\n(estimado)' },
          { key: 'vTe', lbl: 'Valor Total\n(estimado)' },
          { key: 'vUd', lbl: 'Valor Unitário\n(desc. 13,5%)' },
          { key: 'vTd', lbl: 'Valor Total\n(desc. 13,5%)' },
        ];
        valDefs.forEach(({ key, lbl }) => {
          const c = col(key);
          strokeRect(doc, c.x, yH, c.w, H1 + H2);
          const lH = strH(doc, lbl, 6, true, c.w - 4);
          doc.font('Helvetica-Bold').fontSize(6).fillColor(PRETO)
             .text(lbl, c.x + 2, yH + (H1 + H2 - lH) / 2, { width: c.w - 4, align: 'center' });
        });

        y += H1 + H2;
      };

      drawTableHeader();

      // ── Linhas de dados ────────────────────────────────────────────────────
      let totEst = 0, totDsc = 0;

      (dados.itens || []).forEach((item, idx) => {
        const ci    = CARD_MAP[item.id] || {};
        const tit   = ci.titulo       || item.titulo       || '—';
        const comp  = ci.complexidade || item.complexidade || '—';
        const qtd   = Number(item.qtd) || 1;
        const per   = item.periodo || `${dados.mes}/${dados.ano}`;

        // item.valor já tem desconto 13,5% aplicado
        const vDsc  = Number(item.valor || ci.valor || 0);
        const vEst  = vDsc > 0 ? vDsc / (1 - 0.135) : 0;
        const vTDsc = vDsc * qtd;
        const vTEst = vEst * qtd;

        totEst += vTEst;
        totDsc += vTDsc;

        const prodH = strH(doc, tit,  7.5, false, col('prod').w - 6);
        const cmpH  = strH(doc, comp, 7.5, false, col('comp').w - 6);
        const rowH  = Math.max(18, prodH + 6, cmpH + 6);

        checkPage(rowH, drawTableHeader);

        // Fundo branco (sem zebra)
        doc.rect(L, y, W, rowH).fill('white');

        // Borda de cada célula
        COLS.forEach(c => {
          doc.lineWidth(BORDA_W).rect(c.x, y, c.w, rowH).stroke(PRETO);
        });

        const cy = y + rowH / 2 - 3.75; // y central (para textos de 1 linha)

        doc.font('Helvetica').fontSize(7.5).fillColor(PRETO);
        // Item id
        doc.text(String(item.id || idx + 1),
          col('item').x + 1, cy, { width: col('item').w - 2, align: 'center', lineBreak: false });
        // Produto
        doc.text(tit,  col('prod').x + 3, y + 3, { width: col('prod').w - 6 });
        // Complexidade
        doc.text(comp, col('comp').x + 3, y + 3, { width: col('comp').w - 6 });
        // Qtd
        doc.text(String(qtd),
          col('qtd').x + 1, cy, { width: col('qtd').w - 2, align: 'center', lineBreak: false });
        // Período
        doc.text(per,
          col('per').x + 2, cy, { width: col('per').w - 4, align: 'center', lineBreak: false });

        // Valores em negrito, alinhados à direita
        doc.font('Helvetica-Bold').fontSize(7.5);
        doc.text(brl(vEst),  col('vUe').x + 1, cy, { width: col('vUe').w - 2, align: 'right', lineBreak: false });
        doc.text(brl(vTEst), col('vTe').x + 1, cy, { width: col('vTe').w - 2, align: 'right', lineBreak: false });
        doc.text(brl(vDsc),  col('vUd').x + 1, cy, { width: col('vUd').w - 2, align: 'right', lineBreak: false });
        doc.text(brl(vTDsc), col('vTd').x + 1, cy, { width: col('vTd').w - 2, align: 'right', lineBreak: false });

        y += rowH;
      });

      // ── Linha TOTAL ────────────────────────────────────────────────────────
      const TOT_H = 16;
      checkPage(TOT_H + 22);

      doc.rect(L, y, W, TOT_H).fill(BG_HDR_TABELA);
      COLS.forEach(c => { doc.lineWidth(BORDA_W).rect(c.x, y, c.w, TOT_H).stroke(PRETO); });

      doc.font('Helvetica-Bold').fontSize(8).fillColor(PRETO)
         .text('TOTAL:', L + 4, y + (TOT_H - 8) / 2,
               { width: col('vUe').x - L - 8, align: 'right', lineBreak: false });
      doc.text(brl(totEst), col('vTe').x + 1, y + (TOT_H - 8) / 2,
               { width: col('vTe').w - 2, align: 'right', lineBreak: false });
      doc.text(brl(totDsc), col('vTd').x + 1, y + (TOT_H - 8) / 2,
               { width: col('vTd').w - 2, align: 'right', lineBreak: false });
      y += TOT_H;

      // ── "TOTAL: R$ X" centralizado abaixo da tabela ────────────────────────
      const TOT_BAR_H = 18;
      doc.rect(L, y, W, TOT_BAR_H).fill('white');
      strokeRect(doc, L, y, W, TOT_BAR_H);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(PRETO)
         .text(`TOTAL: ${brl(totDsc)}`, L + 4, y + (TOT_BAR_H - 10) / 2,
               { width: W - 8, align: 'center', lineBreak: false });
      y += TOT_BAR_H + 10;

      // ══════════════════════════════════════════════════════════════════════
      // BLOCO 5 — RODAPÉ
      // ══════════════════════════════════════════════════════════════════════
      checkPage(110);

      // Linha divisória
      doc.lineWidth(BORDA_W).moveTo(L, y).lineTo(R, y).stroke(PRETO);
      y += 8;

      // ── Linha Data | Assinatura ────────────────────────────────────────────
      const ROD_LW = Math.round(W * 0.50);
      const ROD_RX = L + ROD_LW;
      const ROD_RW = R - ROD_RX;

      // Esquerda: DATA centralizado
      doc.font('Helvetica').fontSize(9).fillColor(PRETO)
         .text(`DATA: ${dados.data || '—'}`, L, y + 4, { width: ROD_LW, align: 'center' });

      // Direita: linha de assinatura
      const assinY = y + 28;
      doc.lineWidth(BORDA_W).moveTo(ROD_RX, assinY).lineTo(R, assinY).stroke(PRETO);

      // Imagem sobreposta à linha
      if (fs.existsSync(ASSINATURA_PATH)) {
        doc.image(ASSINATURA_PATH,
                  ROD_RX + ROD_RW / 2 - 45, assinY - 24,
                  { width: 90, height: 25 });
      }

      let sY = assinY + 5;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(PRETO)
         .text('CLARA SERVICOS INTEGRADOS DE VIDEO, CONTEUDO E WEB LTDA',
               ROD_RX, sY, { width: ROD_RW, align: 'center' });
      sY += 10;
      doc.font('Helvetica').fontSize(7)
         .text('CNPJ: 07.660.888/0001-38', ROD_RX, sY, { width: ROD_RW, align: 'center' });
      sY += 10;
      doc.text('Cláudia Gomes Chaves', ROD_RX, sY, { width: ROD_RW, align: 'center' });
      sY += 10;
      doc.text('Representante Legal', ROD_RX, sY, { width: ROD_RW, align: 'center' });

      y = sY + 14;

      // ── Bloco inferior com borda (2 colunas) ──────────────────────────────
      checkPage(55);

      const BOT_LW = Math.round(W * 0.60);
      const BOT_RX = L + BOT_LW;
      const BOT_RW = R - BOT_RX;
      const BOT_H  = 52;

      strokeRect(doc, L, y, W, BOT_H);
      doc.lineWidth(BORDA_W).moveTo(BOT_RX, y).lineTo(BOT_RX, y + BOT_H).stroke(PRETO);

      // Col esquerda: valores e referência do contrato
      let bY = y + 5;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(PRETO)
         .text('Valor e definição dos serviços desta AP:', L + 5, bY, { width: BOT_LW - 10 });
      bY += 11;
      doc.font('Helvetica').fontSize(8)
         .text(`Valor Total: ${brl(totEst)}`, L + 5, bY, { width: BOT_LW - 10 });
      bY += 11;
      doc.text(`Valor Total (13,5%): ${brl(totDsc)}`, L + 5, bY, { width: BOT_LW - 10 });
      bY += 11;
      doc.fontSize(7)
         .text('Para a tabela acima disposta, serão executados os serviços descritos e aprovados referente ao Contrato Nº 018188/2024.',
               L + 5, bY, { width: BOT_LW - 10 });

      // Col direita: assinatura do cliente
      const cliLineY = y + BOT_H - 18;
      doc.lineWidth(BORDA_W)
         .moveTo(BOT_RX + 8, cliLineY).lineTo(R - 8, cliLineY).stroke(PRETO);
      doc.font('Helvetica').fontSize(8).fillColor(PRETO)
         .text('Assinatura do Cliente', BOT_RX + 4, cliLineY + 5,
               { width: BOT_RW - 8, align: 'center' });

      // ── Fim ───────────────────────────────────────────────────────────────
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
