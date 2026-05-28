// gerar-relatorio-execucoes.js — Relatório PDF detalhado das Execuções Salvas
'use strict';
const { getBrowser } = require('./gerar-pdf-v2');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Preserva quebras de linha para white-space:pre-wrap (escapa HTML mas mantém \n)
function escPre(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatarData(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return '—'; }
}

function buildExecucoesHTML({ filtros, execucoes, geradoEm }) {
  const totalExecucoes = execucoes.length;

  const blocos = execucoes.map(row => {
    const itens = Array.isArray(row.itens) ? row.itens : [];

    const itensHtml = itens.length
      ? itens.map((it, idx) => {
          const links = [
            it.link_trello ? `<a href="${esc(it.link_trello)}" style="color:#2563EB;font-size:10px;text-decoration:none">🔗 Trello</a>` : '',
            ...(Array.isArray(it.links_trello_extra) ? it.links_trello_extra.map((l, i) => l ? `<a href="${esc(l)}" style="color:#2563EB;font-size:10px;text-decoration:none">🔗 Trello ${i + 2}</a>` : '').filter(Boolean) : []),
            it.link_trello_comprovacao ? `<a href="${esc(it.link_trello_comprovacao)}" style="color:#16A34A;font-size:10px;text-decoration:none">✅ Comprovação</a>` : '',
            ...(Array.isArray(it.links_comprovacao_extra) ? it.links_comprovacao_extra.map((l, i) => l ? `<a href="${esc(l)}" style="color:#16A34A;font-size:10px;text-decoration:none">✅ Comprovação ${i + 2}</a>` : '').filter(Boolean) : []),
          ].filter(Boolean);

          return `
          <div class="item-row">
            <div class="item-header">
              <span class="item-num">${idx + 1}</span>
              <div class="item-prod">
                <span class="item-nome">${esc(it.produto || '—')}</span>
                ${it.complexidade ? `<span class="item-complex">${esc(it.complexidade)}</span>` : ''}
              </div>
              <div class="item-meta">
                ${it.item_id ? `<span class="meta-pill">Nº ${esc(it.item_id)}</span>` : ''}
                <span class="meta-pill">Qtd: ${it.quantidade || 1}</span>
              </div>
            </div>
            ${it.descricao_projeto ? `<div class="item-desc">📋 ${escPre(it.descricao_projeto)}</div>` : ''}
            ${links.length ? `<div class="item-links">${links.join('')}</div>` : ''}
          </div>`;
        }).join('')
      : '<div class="sem-itens">Sem itens cadastrados</div>';

    const badges = [
      row.unidade   ? `<span class="badge badge-und">${esc(row.unidade)}</span>`   : '',
      row.projeto   ? `<span class="badge badge-proj">${esc(row.projeto)}</span>`  : '',
      row.numero_ap ? `<span class="badge badge-ap">${esc(row.numero_ap)}</span>`  : '',
    ].filter(Boolean).join('');

    const autorLinha = [
      row.usuario_nome ? 'Por ' + esc(row.usuario_nome) : '',
      row.criado_em    ? formatarData(row.criado_em)     : '',
    ].filter(Boolean).join(' · ');

    return `
      <div class="exec-bloco">
        <div class="bloco-header">
          <div class="bloco-badges">${badges}</div>
          <div class="bloco-nome">${esc(row.nome_projeto || '(sem nome)')}</div>
        </div>
        <div class="bloco-itens">${itensHtml}</div>
        <div class="bloco-footer">
          ${row.obs ? `<div class="bloco-obs"><strong>Obs:</strong> ${esc(row.obs)}</div>` : ''}
          ${autorLinha ? `<div class="bloco-autor">${autorLinha}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;font-size:12px;color:#18181B;background:#fff}

    /* ── Cabeçalho ── */
    .header{background:linear-gradient(135deg,#E65C00 0%,#C04E00 100%);color:white;padding:24px 32px;display:flex;justify-content:space-between;align-items:flex-start}
    .header-logo{font-size:24px;font-weight:800;letter-spacing:-1px}
    .header-logo span{opacity:.65}
    .header-sub{font-size:10px;opacity:.6;margin-top:3px;text-transform:uppercase;letter-spacing:1px}
    .header-right{text-align:right}
    .header-tipo{font-size:16px;font-weight:700}
    .header-data{font-size:10px;opacity:.7;margin-top:4px}

    /* ── Filtros ── */
    .filtros-bar{background:#1C1C2E;padding:10px 32px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
    .filtro-pill{background:rgba(255,255,255,.08);color:rgba(255,255,255,.8);padding:3px 10px;border-radius:99px;font-size:10px;font-weight:600}
    .filtro-pill span{color:#FF8C42;margin-right:3px}

    /* ── Resumo ── */
    .resumo{padding:14px 32px;background:#FFF3EC;border-bottom:2px solid #FFD6B8;display:flex;align-items:center;gap:8px}
    .resumo-label{font-size:10px;color:#92400E;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
    .resumo-valor{font-size:18px;font-weight:800;color:#E65C00;margin-left:6px}

    /* ── Blocos de execução ── */
    .blocos{padding:20px 32px;display:flex;flex-direction:column;gap:16px}

    .exec-bloco{border:1.5px solid #E4E4E7;border-radius:10px;overflow:hidden;page-break-inside:avoid;break-inside:avoid}

    .bloco-header{background:#1C1C2E;padding:10px 14px;display:flex;flex-direction:column;gap:5px}
    .bloco-badges{display:flex;gap:6px;flex-wrap:wrap}
    .badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px}
    .badge-und{background:rgba(255,140,66,.18);color:#FF8C42}
    .badge-proj{background:rgba(255,255,255,.1);color:rgba(255,255,255,.75)}
    .badge-ap{background:#E65C00;color:white}
    .bloco-nome{font-size:13px;font-weight:700;color:white}

    /* ── Itens ── */
    .bloco-itens{padding:8px 14px;display:flex;flex-direction:column;gap:6px;background:#fff}

    .item-row{background:#F9FAFB;border-radius:6px;padding:8px 10px}
    .item-header{display:flex;align-items:flex-start;gap:8px}
    .item-num{font-size:10px;font-weight:700;color:#E65C00;min-width:14px;padding-top:1px}
    .item-prod{flex:1;display:flex;flex-direction:column;gap:2px}
    .item-nome{font-size:12px;font-weight:700;color:#18181B}
    .item-complex{font-size:10px;color:#71717A}
    .item-meta{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
    .meta-pill{font-size:10px;color:#52525B;background:#E4E4E7;padding:2px 7px;border-radius:99px;white-space:nowrap}
    .item-desc{font-size:11px;color:#52525B;margin-top:5px;white-space:pre-wrap;word-break:break-word;line-height:1.5;padding-left:22px}
    .item-links{display:flex;gap:10px;flex-wrap:wrap;margin-top:5px;padding-left:22px}
    .sem-itens{font-size:11px;color:#A1A1AA;padding:6px 0}

    /* ── Rodapé do bloco ── */
    .bloco-footer{background:#F9FAFB;border-top:1px solid #E4E4E7;padding:8px 14px;display:flex;flex-direction:column;gap:3px}
    .bloco-obs{font-size:11px;color:#52525B;font-style:italic}
    .bloco-autor{font-size:10px;color:#A1A1AA}

    /* ── Rodapé do PDF ── */
    .footer{background:#F4F4F5;padding:12px 32px;display:flex;justify-content:space-between;align-items:center;margin-top:8px}
    .footer-txt{font-size:10px;color:#71717A}
  </style>
</head>
<body>

  <div class="header">
    <div>
      <div class="header-logo">clara<span>digital</span></div>
      <div class="header-sub">Gestão de APs · SESC-AR/DF</div>
    </div>
    <div class="header-right">
      <div class="header-tipo">Relatório de Execuções Salvas</div>
      <div class="header-data">Gerado em ${esc(geradoEm)}</div>
    </div>
  </div>

  <div class="filtros-bar">
    ${(filtros || []).map(f => `<div class="filtro-pill"><span>${esc(f.label)}:</span>${esc(f.valor)}</div>`).join('')}
  </div>

  <div class="resumo">
    <span class="resumo-label">Execuções</span>
    <span class="resumo-valor">${totalExecucoes}</span>
  </div>

  <div class="blocos">
    ${blocos || '<div style="text-align:center;padding:32px;color:#A1A1AA">Nenhuma execução encontrada.</div>'}
  </div>

  <div class="footer">
    <span class="footer-txt">Clara Digital · Contrato Nº 018188/2024 · SESC-AR/DF</span>
    <span class="footer-txt">Gerado automaticamente pelo sistema de gestão de APs</span>
  </div>

</body>
</html>`;
}

async function gerarRelatorioExecucoes({ filtros, execucoes }) {
  const geradoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    const html = buildExecucoesHTML({ filtros, execucoes, geradoEm });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.evaluateHandle('document.fonts.ready');
    const pdfBuf = await page.pdf({
      width: '210mm', height: '297mm', printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    await page.close(); page = null;
    return Buffer.isBuffer(pdfBuf) ? pdfBuf : Buffer.from(pdfBuf);
  } catch (e) {
    if (page) await page.close().catch(() => {});
    throw e;
  }
}

module.exports = { gerarRelatorioExecucoes };
