'use strict';
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { CARDAPIO } = require('./cardapio');

const CARD_MAP = Object.fromEntries(CARDAPIO.map(c => [c.id, c]));
const ASSINATURA_PATH = path.join(__dirname, 'public', 'assinatura.png');
const PRETO = '#000000';
const BG_CINZA = '#D9D9D9';
const BG_AMARELO = '#FFE699';
const BORDA = 0.5;

function brl(v) {
  return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}

function strH(doc, text, size, bold, width) {
  return doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size)
    .heightOfString(String(text||''), {width});
}

function box(doc, x, y, w, h, fill) {
  doc.lineWidth(BORDA);
  if (fill) doc.rect(x,y,w,h).fillAndStroke(fill, PRETO);
  else      doc.rect(x,y,w,h).stroke(PRETO);
}

async function gerarPDF(dados, destino) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({size:'A4', margin:20, bufferPages:true});
      doc.pipe(destino);

      const L=20, R=575, W=R-L;
      let y=20;
      const PB=818;

      function checkPage(h, cb) {
        if (y+h > PB) { doc.addPage(); y=20; if(cb) cb(); }
      }

      // ═══ BLOCO 1: CABEÇALHO ══════════════════════════════════════
      const CL = Math.round(W*0.58);
      const CR = W - CL;
      const CRX = L + CL;

      const leftLines = [
        {label:'NOME EMPRESARIAL: ', val:'CLARA SERVICOS INTEGRADOS DE VIDEO, CONTEUDO E WEB LTDA'},
        {label:'ENDEREÇO: ',          val:'ST SHIN CA 01 LOTE A BLOCO A SALA, 71.503-501 LAGO NORTE - DF'},
        {label:'ENDEREÇO ELETRÔNICO: ', val:'CONTATO@CLARADIGITAL.COM.BR'},
        {label:'CNPJ: ',              val:'07.660.888/0001-38'},
        {label:'NÚMERO DE INSCRIÇÃO: ', val:'07.660.888/0001-38 MATRIZ'},
      ];

      let leftH = 6;
      leftLines.forEach(({label, val}) => {
        const lw = doc.font('Helvetica-Bold').fontSize(7.5).widthOfString(label);
        const vw = Math.max(1, CL - lw - 8);
        leftH += Math.max(10, strH(doc, val, 7.5, false, vw)) + 2;
      });
      leftH += 6;

      const rightItems = [
        {text:'AP – AUTORIZAÇÃO DE PRODUÇÃO', bold:true, size:10},
        {text:`Ano: ${dados.ano||''}`,        bold:false, size:8},
        {text:`AP: ${dados.numero||''}`,      bold:true,  size:8},
        {text:'CONTRATO DE PRESTAÇÃO DE SERVIÇOS – SESC-AR/DF Nº 018188/2024', bold:false, size:7},
      ];
      let rightH = 6;
      rightItems.forEach(r => { rightH += strH(doc, r.text, r.size, r.bold, CR-8) + 4; });
      rightH += 6;

      const hdrH = Math.max(leftH, rightH);
      box(doc, L, y, W, hdrH);
      doc.lineWidth(BORDA).moveTo(CRX, y).lineTo(CRX, y+hdrH).stroke(PRETO);

      let yy = y+6;
      leftLines.forEach(({label, val}) => {
        const lw = doc.font('Helvetica-Bold').fontSize(7.5).widthOfString(label);
        const vw = Math.max(1, CL - lw - 8);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(PRETO).text(label, L+4, yy, {lineBreak:false});
        doc.font('Helvetica').fontSize(7.5).fillColor(PRETO).text(val, L+4+lw, yy, {width:vw});
        yy += Math.max(10, strH(doc, val, 7.5, false, vw)) + 2;
      });

      let yr = y+6;
      rightItems.forEach(r => {
        doc.font(r.bold?'Helvetica-Bold':'Helvetica').fontSize(r.size).fillColor(PRETO)
           .text(r.text, CRX+4, yr, {width:CR-8});
        yr += strH(doc, r.text, r.size, r.bold, CR-8) + 4;
      });

      y += hdrH + 5;

      // ═══ BLOCO 2: TABELA IDENTIFICAÇÃO ═══════════════════════════
      // Ajuste 1: labels com dois-pontos; célula de label E valor com borda; descritivo vazio → célula em branco
      const LW = Math.round(W*0.22);
      const VW = W - LW;

      const descVal = (dados.descritivo||'').trim();
      const showDesc = descVal && descVal !== '—';

      [
        ['CLIENTE:',              'SESC DF'],
        ['UNIDADE REQUISITANTE:', dados.unidade||''],
        ['PROJETO:',              dados.tipo||''],
        ['NOME DO PROJETO:',      dados.nomeProjeto||''],
        ['DESCRITIVO:',           showDesc ? descVal : ''],
      ].forEach(([lbl, val]) => {
        const vh = val ? strH(doc, val, 8, false, VW-8) : 0;
        const rh = Math.max(18, vh+10);
        checkPage(rh);
        // célula label (fundo cinza, borda completa, texto alinhado à direita)
        box(doc, L, y, LW, rh, BG_CINZA);
        const lh = strH(doc, lbl, 7.5, true, LW-6);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(PRETO)
           .text(lbl, L+3, y+(rh-lh)/2, {width:LW-6, align:'right', lineBreak:false});
        // célula valor (sem fundo, borda completa)
        box(doc, L+LW, y, VW, rh);
        if (val) {
          doc.font('Helvetica').fontSize(8).fillColor(PRETO)
             .text(val, L+LW+4, y+5, {width:VW-8});
        }
        y += rh;
      });
      y += 5;

      // ═══ BLOCO 3: DESCRITIVO DOS PRODUTOS ════════════════════════
      // Ajuste 2: formato "182.Titulo" (sem espaço), descrição abaixo, espaço entre itens
      checkPage(20);
      box(doc, L, y, W, 15, BG_CINZA);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(PRETO)
         .text('DESCRITIVO DOS PRODUTOS E SERVIÇOS', L+4, y+3.5, {width:W-8, align:'center'});
      y += 15;

      (dados.itens||[]).forEach((item, idx) => {
        const ci = CARD_MAP[item.id] || {};
        const tit  = ci.titulo       || item.titulo       || '—';
        const comp = ci.complexidade || item.complexidade || '';
        // descrição completa: titulo + complexidade (se aplicável)
        const header = `${item.id}.${tit}`; // sem espaço após o ponto
        const hh = strH(doc, header, 9, true, W-10);
        // linha abaixo: apenas complexidade (sem repetir título)
        const showComp = comp && comp !== 'Não se aplica' && comp !== '—';
        const dh = showComp ? strH(doc, comp, 7.5, false, W-14) : 0;
        const itemH = hh + (showComp ? dh + 4 : 0) + 8;
        if (idx > 0) {
          checkPage(6 + itemH);
          y += 6; // linha em branco entre itens
        } else {
          checkPage(itemH);
        }
        doc.font('Helvetica-Bold').fontSize(9).fillColor(PRETO)
           .text(header, L+4, y+2, {width:W-8});
        if (showComp) {
          doc.font('Helvetica').fontSize(7.5).fillColor(PRETO)
             .text(comp, L+8, y+2+hh+2, {width:W-14});
        }
        y += itemH;
      });
      y += 5;

      // ═══ BLOCO 4: TABELA PRODUTOS E SERVIÇOS ═════════════════════
      // Ajuste 4: cabeçalho com rowspan/colspan correto; "Valor Total (estimado)" na coluna te
      checkPage(50);
      box(doc, L, y, W, 15, BG_AMARELO);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(PRETO)
         .text('TABELA DE PRODUTOS E SERVIÇOS', L+4, y+3.5, {width:W-8, align:'center'});
      y += 15;

      const C = [
        {k:'id', x:L,      w:24 },
        {k:'pr', x:L+24,   w:116},
        {k:'cp', x:L+140,  w:98 },
        {k:'qt', x:L+238,  w:27 },
        {k:'pe', x:L+265,  w:56 },
        {k:'ue', x:L+321,  w:56 },
        {k:'te', x:L+377,  w:56 },
        {k:'ud', x:L+433,  w:56 },
        {k:'td', x:L+489,  w:W-489},
      ];
      const gc = k => C.find(c=>c.k===k);
      const H1=13, H2=12;

      const drawTH = () => {
        // fundo cinza para a área toda do cabeçalho
        doc.rect(L, y, W, H1+H2).fill(BG_CINZA);
        doc.lineWidth(BORDA);

        // Colunas com rowspan 2 (ocupam H1+H2): id, pr, cp, ue, te, ud, td
        ['id','pr','cp','ue','te','ud','td'].forEach(k => {
          box(doc, gc(k).x, y, gc(k).w, H1+H2);
        });

        // Célula "Resumo do Cronograma de Entrega" (colspan qt+pe, linha 1 = H1)
        const rx = gc('qt').x, rw = gc('qt').w + gc('pe').w;
        box(doc, rx, y, rw, H1);
        doc.font('Helvetica-Bold').fontSize(6).fillColor(PRETO)
           .text('Resumo do Cronograma de Entrega', rx+2, y+(H1-6)/2,
                 {width:rw-4, align:'center', lineBreak:false});

        // Sub-células na linha 2: Qtd e Período
        box(doc, gc('qt').x, y+H1, gc('qt').w, H2);
        doc.font('Helvetica-Bold').fontSize(5.5).fillColor(PRETO)
           .text('Qtd. de\nitens', gc('qt').x+1, y+H1+1, {width:gc('qt').w-2, align:'center'});
        box(doc, gc('pe').x, y+H1, gc('pe').w, H2);
        doc.font('Helvetica-Bold').fontSize(5.5).fillColor(PRETO)
           .text('Período de\nexecução', gc('pe').x+1, y+H1+1, {width:gc('pe').w-2, align:'center'});

        // Labels das colunas de altura total (centralizados em H1+H2)
        [
          {k:'id', l:'Item'},
          {k:'pr', l:'Produto/\nServiço'},
          {k:'cp', l:'Complexidade'},
          {k:'ue', l:'Valor Unitário\n(estimado)'},
          {k:'te', l:'Valor Total'},
          {k:'ud', l:'Valor Unitário\n(desc.13,5%)'},
          {k:'td', l:'Valor Total\n(desc.13,5%)'},
        ].forEach(({k, l}) => {
          const c = gc(k);
          const lh = strH(doc, l, 6, true, c.w-4);
          doc.font('Helvetica-Bold').fontSize(6).fillColor(PRETO)
             .text(l, c.x+2, y+(H1+H2-lh)/2, {width:c.w-4, align:'center'});
        });

        y += H1+H2;
      };

      drawTH();

      let totE=0, totD=0;
      (dados.itens||[]).forEach(item => {
        const ci  = CARD_MAP[item.id]||{};
        const tit  = ci.titulo       ||item.titulo       ||'—';
        const comp = ci.complexidade ||item.complexidade ||'—';
        const qtd  = Number(item.qtd||item.quantidade)||1;
        const per  = item.periodo || `${dados.mes||''} ${dados.ano||''}`.trim();
        const vD   = Number(item.valor||item.valor_unitario||ci.valor||0);
        const vE   = vD > 0 ? vD/0.865 : 0;
        const vtD  = vD*qtd, vtE = vE*qtd;
        totE += vtE; totD += vtD;

        const ph = strH(doc, tit,  8, false, gc('pr').w-6);
        const ch = strH(doc, comp, 8, false, gc('cp').w-6);
        const rh = Math.max(20, Math.max(ph,ch)+8);
        checkPage(rh, drawTH);

        doc.rect(L, y, W, rh).fill('white');
        C.forEach(c => { box(doc, c.x, y, c.w, rh); });

        const my = y + rh/2 - 4;
        doc.font('Helvetica').fontSize(8).fillColor(PRETO);
        doc.text(String(item.id||''), gc('id').x+1, my,  {width:gc('id').w-2, align:'center', lineBreak:false});
        doc.text(tit,  gc('pr').x+3, y+4, {width:gc('pr').w-6});
        doc.text(comp, gc('cp').x+3, y+4, {width:gc('cp').w-6});
        doc.text(String(qtd), gc('qt').x+1, my, {width:gc('qt').w-2, align:'center', lineBreak:false});
        doc.text(per, gc('pe').x+2, my, {width:gc('pe').w-4, align:'center', lineBreak:false});
        doc.font('Helvetica-Bold').fontSize(8).fillColor(PRETO);
        doc.text(brl(vE),  gc('ue').x+1, my, {width:gc('ue').w-2, align:'right', lineBreak:false});
        doc.text(brl(vtE), gc('te').x+1, my, {width:gc('te').w-2, align:'right', lineBreak:false});
        doc.text(brl(vD),  gc('ud').x+1, my, {width:gc('ud').w-2, align:'right', lineBreak:false});
        doc.text(brl(vtD), gc('td').x+1, my, {width:gc('td').w-2, align:'right', lineBreak:false});
        y += rh;
      });

      // Linha TOTAL
      const TH = 15;
      checkPage(TH+80);
      doc.rect(L, y, W, TH).fill(BG_CINZA);
      C.forEach(c => { box(doc, c.x, y, c.w, TH); });
      const totLabelW = gc('ue').x - L - 6;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(PRETO)
         .text('TOTAL:', L+4, y+(TH-8)/2, {width:totLabelW, align:'right', lineBreak:false});
      doc.text(brl(totE), gc('te').x+1, y+(TH-8)/2, {width:gc('te').w-2, align:'right', lineBreak:false});
      doc.text(brl(totD), gc('td').x+1, y+(TH-8)/2, {width:gc('td').w-2, align:'right', lineBreak:false});
      y += TH;

      // Barra TOTAL com desconto
      box(doc, L, y, W, 16);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(PRETO)
         .text(`TOTAL: ${brl(totD)}`, L+4, y+3, {width:W-8, align:'center', lineBreak:false});
      y += 16+8;

      // ═══ BLOCO 5: RODAPÉ ═════════════════════════════════════════
      // Ajuste 3: bloco superior com borda externa envolvendo DATA (esq) + Assinatura (dir)

      const RLW = Math.round(W*0.50);
      const RRX = L+RLW;
      const RRW = R-RRX;
      const assinH = 72; // altura da caixa DATA+Assinatura

      checkPage(assinH + 60);

      // Caixa externa com divisor vertical
      box(doc, L, y, W, assinH);
      doc.lineWidth(BORDA).moveTo(RRX, y).lineTo(RRX, y+assinH).stroke(PRETO);

      // Coluna esquerda: DATA centralizado
      doc.font('Helvetica-Bold').fontSize(9).fillColor(PRETO)
         .text(`DATA: ${dados.data||'—'}`, L+4, y+(assinH-9)/2, {width:RLW-8, align:'center', lineBreak:false});

      // Coluna direita: linha de assinatura + imagem + textos
      const lineY = y + 40;
      doc.lineWidth(BORDA).moveTo(RRX+8, lineY).lineTo(R-8, lineY).stroke(PRETO);
      if (fs.existsSync(ASSINATURA_PATH)) {
        doc.image(ASSINATURA_PATH, RRX+RRW/2-40, lineY-26, {width:80, height:24});
      }
      let sY = lineY+4;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(PRETO)
         .text('CLARA SERVICOS INTEGRADOS DE VIDEO, CONTEUDO E WEB LTDA',
               RRX+4, sY, {width:RRW-8, align:'center'});
      sY += 9;
      doc.font('Helvetica').fontSize(7).fillColor(PRETO)
         .text('CNPJ: 07.660.888/0001-38', RRX+4, sY, {width:RRW-8, align:'center'}); sY+=9;
      doc.text('Cláudia Gomes Chaves',  RRX+4, sY, {width:RRW-8, align:'center'}); sY+=9;
      doc.text('Representante Legal',    RRX+4, sY, {width:RRW-8, align:'center'});

      y += assinH + 4;

      // Bloco inferior: valores | assinatura do cliente
      const BLW=Math.round(W*0.60), BRX=L+BLW, BRW=R-BRX, BH=54;
      checkPage(BH);
      box(doc, L, y, W, BH);
      doc.lineWidth(BORDA).moveTo(BRX, y).lineTo(BRX, y+BH).stroke(PRETO);
      let bY = y+5;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(PRETO)
         .text('Valor e definição dos serviços desta AP:', L+5, bY, {width:BLW-10}); bY+=11;
      doc.font('Helvetica').fontSize(8).fillColor(PRETO)
         .text(`Valor Total: ${brl(totE)}`, L+5, bY, {width:BLW-10}); bY+=10;
      doc.text(`Valor Total (13,5%): ${brl(totD)}`, L+5, bY, {width:BLW-10}); bY+=10;
      doc.fontSize(7)
         .text('Para a tabela acima disposta, serão executados os serviços descritos e aprovados referente ao Contrato Nº 018188/2024.',
               L+5, bY, {width:BLW-10});
      const clY = y+BH-20;
      doc.lineWidth(BORDA).moveTo(BRX+8, clY).lineTo(R-8, clY).stroke(PRETO);
      doc.font('Helvetica').fontSize(8).fillColor(PRETO)
         .text('Assinatura do Cliente', BRX+4, clY+5, {width:BRW-8, align:'center'});

      doc.end();
      if (destino.on) { destino.on('finish', resolve); destino.on('error', reject); }
      else            { doc.on('end', resolve);         doc.on('error', reject); }
    } catch(e) { reject(e); }
  });
}

module.exports = { gerarPDF };
