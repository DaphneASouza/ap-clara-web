// gerar-pdf.js — Gera PDF com PDFKit e envia para a response (stream HTTP)
const PDFDocument = require('pdfkit');
const path        = require('path');
const fs          = require('fs');

const COR_LARANJA       = '#E65C00';
const COR_LARANJA_CLARO = '#FFF3EC';
const DESCONTO          = 0.135;
const ASSINATURA_PATH   = path.join(__dirname, 'public', 'assinatura.png');

function brl(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function gerarPDF(dados, destino) {
  // destino pode ser uma Response HTTP ou um WritableStream
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
      doc.pipe(destino);

      const L = 40, R = 555, W = R - L;

      // ── CABEÇALHO ───────────────────────────────────────────────────
      doc.rect(L, 30, W, 70).fill(COR_LARANJA);
      doc.fillColor('white').fontSize(15).font('Helvetica-Bold')
         .text('AUTORIZAÇÃO DE PRODUÇÃO', L, 44, { align: 'center', width: W });
      doc.fontSize(9).font('Helvetica')
         .text('CLARA SERVICOS INTEGRADOS DE VIDEO, CONTEUDO E WEB LTDA', L, 64, { align: 'center', width: W })
         .text('CNPJ: 07.660.888/0001-38  |  CONTRATO SESC-AR/DF Nº 018188/2024', L, 76, { align: 'center', width: W });

      // ── NÚMERO E IDENTIFICAÇÃO ───────────────────────────────────────
      let y = 115;
      doc.rect(L, y, W, 1).fill(COR_LARANJA); y += 8;
      doc.fillColor(COR_LARANJA).fontSize(14).font('Helvetica-Bold')
         .text(`AP Nº ${dados.numero}`, L, y);
      y += 20;

      const col2X = L + W / 2 + 5;
      doc.fillColor('#333333').fontSize(9);

      doc.font('Helvetica-Bold').text('Unidade:', L, y, { continued: true })
         .font('Helvetica').text(`  ${dados.unidade || '—'}`);
      doc.font('Helvetica-Bold').text('Data:', col2X, y, { continued: true })
         .font('Helvetica').text(`  ${dados.data || '—'}`);
      y += 16;

      doc.font('Helvetica-Bold').text('Projeto:', L, y, { continued: true })
         .font('Helvetica').text(`  ${dados.nomeProjeto || '—'}`);
      y += 16;

      doc.font('Helvetica-Bold').text('Competência:', L, y, { continued: true })
         .font('Helvetica').text(`  ${dados.mes} / ${dados.ano}`);
      doc.font('Helvetica-Bold').text('Tipo:', col2X, y, { continued: true })
         .font('Helvetica').text(`  ${dados.tipo}`);
      y += 20;

      // ── DESCRITIVO ───────────────────────────────────────────────────
      if (dados.descritivo?.trim()) {
        doc.rect(L, y, W, 1).fill(COR_LARANJA); y += 8;
        doc.fillColor(COR_LARANJA).fontSize(10).font('Helvetica-Bold')
           .text('DESCRITIVO DOS SERVIÇOS', L, y);
        y += 14;
        doc.fillColor('#333333').fontSize(8.5).font('Helvetica')
           .text(dados.descritivo, L, y, { width: W, align: 'justify' });
        y += doc.heightOfString(dados.descritivo, { width: W }) + 12;
      }

      // ── TABELA DE ITENS ──────────────────────────────────────────────
      doc.rect(L, y, W, 1).fill(COR_LARANJA); y += 8;
      doc.fillColor(COR_LARANJA).fontSize(10).font('Helvetica-Bold')
         .text('ITENS DO CARDÁPIO', L, y);
      y += 14;

      const cW = { id: 30, titulo: 195, comp: 155, qtd: 35, per: 55, val: 70 };
      const cX = {
        id:    L,
        titulo:L + cW.id,
        comp:  L + cW.id + cW.titulo,
        qtd:   L + cW.id + cW.titulo + cW.comp,
        per:   L + cW.id + cW.titulo + cW.comp + cW.qtd,
        val:   L + cW.id + cW.titulo + cW.comp + cW.qtd + cW.per,
      };

      const drawHeader = (yPos) => {
        doc.rect(L, yPos, W, 16).fill(COR_LARANJA);
        doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold');
        doc.text('Nº',          cX.id,    yPos+4, { width: cW.id,    align: 'center' });
        doc.text('DESCRIÇÃO',   cX.titulo, yPos+4, { width: cW.titulo });
        doc.text('COMPLEXIDADE',cX.comp,   yPos+4, { width: cW.comp });
        doc.text('QTD',         cX.qtd,    yPos+4, { width: cW.qtd,   align: 'center' });
        doc.text('PERÍODO',     cX.per,    yPos+4, { width: cW.per,   align: 'center' });
        doc.text('VALOR (R$)',  cX.val,    yPos+4, { width: cW.val,   align: 'right' });
        return yPos + 16;
      };

      y = drawHeader(y);

      (dados.itens || []).forEach((item, idx) => {
        const h = Math.max(
          28,
          doc.heightOfString(item.titulo,       { width: cW.titulo-4, fontSize:7.5 }) + 8,
          doc.heightOfString(item.complexidade,  { width: cW.comp-4,  fontSize:7.5 }) + 8,
        );

        if (y + h > 760) { doc.addPage(); y = 40; y = drawHeader(y); }

        doc.rect(L, y, W, h).fill(idx % 2 === 0 ? 'white' : COR_LARANJA_CLARO);
        doc.fillColor('#222222').fontSize(7.5).font('Helvetica');
        doc.text(String(item.id),        cX.id,    y+4, { width: cW.id-2,    align: 'center' });
        doc.text(item.titulo,            cX.titulo, y+4, { width: cW.titulo-4 });
        doc.text(item.complexidade,       cX.comp,   y+4, { width: cW.comp-4 });
        doc.text(String(item.qtd || 1),  cX.qtd,    y+4, { width: cW.qtd-2,  align: 'center' });
        doc.text(item.periodo || '—',    cX.per,    y+4, { width: cW.per-2,  align: 'center' });
        doc.font('Helvetica-Bold')
           .text(brl(item.valor * (item.qtd||1)), cX.val, y+4, { width: cW.val-4, align: 'right' });
        doc.rect(L, y+h, W, 0.5).fill('#DDDDDD');
        y += h;
      });

      // ── TOTAIS ───────────────────────────────────────────────────────
      if (y + 60 > 760) { doc.addPage(); y = 40; }
      y += 8;
      doc.rect(L, y, W, 0.5).fill(COR_LARANJA); y += 8;

      const xL = R - 220;
      doc.fillColor('#333333').fontSize(9).font('Helvetica')
         .text('Subtotal Bruto:', xL, y, { width: 130, align: 'right' });
      doc.font('Helvetica-Bold')
         .text(brl(dados.totalBruto), xL+134, y, { width: 76, align: 'right' });
      y += 16;

      doc.fillColor('#777777').fontSize(8).font('Helvetica')
         .text(`Desconto (${(DESCONTO*100).toFixed(1)}%):`, xL, y, { width: 130, align: 'right' });
      doc.text(`– ${brl(dados.totalBruto - dados.totalDesconto)}`, xL+134, y, { width: 76, align: 'right' });
      y += 16;

      doc.rect(xL, y, 210, 20).fill(COR_LARANJA);
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
         .text('TOTAL COM DESCONTO:', xL+4, y+5, { width: 130, align: 'right' });
      doc.text(brl(dados.totalDesconto), xL+138, y+5, { width: 68, align: 'right' });
      y += 30;

      // ── OBSERVAÇÃO ───────────────────────────────────────────────────
      if (dados.observacao?.trim()) {
        if (y + 50 > 760) { doc.addPage(); y = 40; }
        y += 6;
        doc.rect(L, y, W, 1).fill(COR_LARANJA); y += 8;
        doc.fillColor(COR_LARANJA).fontSize(9).font('Helvetica-Bold').text('OBSERVAÇÕES', L, y);
        y += 13;
        doc.fillColor('#333333').fontSize(8.5).font('Helvetica')
           .text(dados.observacao, L, y, { width: W });
        y += doc.heightOfString(dados.observacao, { width: W }) + 10;
      }

      // ── RODAPÉ / ASSINATURAS ─────────────────────────────────────────
      const RH = 90;
      if (y + RH > 760) { doc.addPage(); y = 40; }
      y = Math.max(y + 20, 710);

      doc.rect(L, y, W, RH).fill(COR_LARANJA);
      const hW = W / 2 - 10;
      const c2 = L + W / 2 + 10;

      // Esquerdo — SESC
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
         .text('SESC-AR/DF', L+10, y+8, { width: hW, align: 'center' });
      doc.rect(L+10, y+20, hW, 0.5).fill('white');
      doc.font('Helvetica').fontSize(7.5)
         .text('Assinatura e Carimbo', L+10, y+24, { width: hW, align: 'center' })
         .text('Contrato SESC-AR/DF Nº 018188/2024', L+10, y+34, { width: hW, align: 'center' })
         .text('Representante: _____________________________', L+10, y+56, { width: hW, align: 'center' })
         .text('Data: _____ / _____ / _________', L+10, y+68, { width: hW, align: 'center' });

      doc.rect(L+hW+10, y+6, 0.5, RH-12).fill('white');

      // Direito — Clara Digital
      doc.fillColor('white').font('Helvetica-Bold').fontSize(8)
         .text('CLARA DIGITAL', c2, y+8, { width: hW, align: 'center' });
      doc.rect(c2, y+20, hW, 0.5).fill('white');
      doc.font('Helvetica').fontSize(7.5)
         .text('Representante Legal', c2, y+24, { width: hW, align: 'center' })
         .text('Claudia Gomes Chaves', c2, y+34, { width: hW, align: 'center' })
         .text('CNPJ: 07.660.888/0001-38', c2, y+44, { width: hW, align: 'center' });

      if (fs.existsSync(ASSINATURA_PATH)) {
        doc.image(ASSINATURA_PATH, c2 + hW/2 - 40, y+55, { width: 80, height: 28, fit: [80,28] });
      }

      doc.end();

      if (destino.on) {
        destino.on('finish', resolve);
        destino.on('error', reject);
      } else {
        doc.on('end', resolve);
        doc.on('error', reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { gerarPDF };
