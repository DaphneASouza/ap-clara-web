// server.js — Servidor Express principal
require('dotenv').config();
const express    = require('express');
const cloudinary = require('cloudinary').v2;
cloudinary.config({ cloudinary_url: `cloudinary://${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}@${process.env.CLOUDINARY_CLOUD_NAME}` });
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const session    = require('express-session');
const pgSession  = require('connect-pg-simple')(session);
const bcrypt     = require('bcrypt');
const path       = require('path');
const { pool, setupDB } = require('./db');
const { gerarPDF }      = require('./gerar-pdf');
const { gerarPDFv2 }    = require('./gerar-pdf-v2');
const { CARDAPIO }      = require('./cardapio');

const app  = express();
const PORT = process.env.PORT || 3000;

// Necessário para cookies no Render (proxy reverso)
app.set('trust proxy', 1);

// ── Middlewares ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Sessão com store em memória (simples para Render free tier)
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'sessoes',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'clara-digital-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: 'none',
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

// ── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session?.usuario) return res.status(401).json({ erro: 'Não autenticado' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session?.usuario) return res.status(401).json({ erro: 'Não autenticado' });
  if (req.session.usuario.nivel !== 'admin') return res.status(403).json({ erro: 'Sem permissão' });
  next();
}

// ════════════════════════════════════════════════════════════════════════════
// ROTAS DE AUTH
// ════════════════════════════════════════════════════════════════════════════

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { login, senha } = req.body;
  if (!login || !senha) return res.status(400).json({ erro: 'Login e senha obrigatórios' });

  try {
    const r = await pool.query(
      `SELECT * FROM usuarios WHERE login = $1 AND ativo = TRUE`, [login.toLowerCase()]
    );
    if (r.rows.length === 0) return res.status(401).json({ erro: 'Usuário ou senha inválidos' });

    const user = r.rows[0];
    const ok   = await bcrypt.compare(senha, user.senha_hash);
    if (!ok) return res.status(401).json({ erro: 'Usuário ou senha inválidos' });

    req.session.usuario = { id: user.id, nome: user.nome, login: user.login, nivel: user.nivel };
    res.json({ ok: true, nome: user.nome, nivel: user.nivel });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// GET /api/test-session
app.get('/api/test-session', (req, res) => {
  if (!req.session.contador) req.session.contador = 0;
  req.session.contador++;
  res.json({ contador: req.session.contador, sessionID: req.sessionID, cookie: req.session.cookie });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/me
app.get('/api/me', requireAuth, (req, res) => {
  res.json(req.session.usuario);
});

// ════════════════════════════════════════════════════════════════════════════
// CARDÁPIO
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/cardapio', requireAuth, (req, res) => {
  res.json(CARDAPIO);
});

// ════════════════════════════════════════════════════════════════════════════
// APs
// ════════════════════════════════════════════════════════════════════════════

// POST /api/aps — gera AP, salva no banco e devolve o PDF
app.post('/api/aps', requireAuth, async (req, res) => {
  const dados = req.body;
  const usuario = req.session.usuario;

  if (!dados.nomeProjeto || !dados.itens?.length) {
    return res.status(400).json({ erro: 'Dados incompletos' });
  }

  try {
    // Salva no banco
    const result = await pool.query(`
      INSERT INTO aps
        (numero, mes, ano, tipo, sequencial, unidade, nome_projeto,
         descritivo, data_ap, observacao, total_bruto, total_desconto, itens, usuario_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id
    `, [
      dados.numero, dados.mes, dados.ano, dados.tipo, dados.sequencial,
      dados.unidade, dados.nomeProjeto, dados.descritivo, dados.data,
      dados.observacao, dados.totalBruto, dados.totalDesconto,
      JSON.stringify(dados.itens), usuario.id,
    ]);

    const apId = result.rows[0].id;

    // Gera PDF em memória e devolve como download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="AP_${dados.numero.replace(/\./g,'_')}.pdf"`);

    await gerarPDFv2(dados, res);

  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ erro: e.message });
  }
});

// GET /api/aps — lista APs (admin vê todas, usuário vê as suas)
app.get('/api/aps', requireAuth, async (req, res) => {
  const u = req.session.usuario;
  try {
    const query = u.nivel === 'admin'
      ? `SELECT a.*, u.nome as usuario_nome
         FROM aps a JOIN usuarios u ON a.usuario_id = u.id
         ORDER BY a.criado_em DESC`
      : `SELECT a.*, u.nome as usuario_nome
         FROM aps a JOIN usuarios u ON a.usuario_id = u.id
         WHERE a.usuario_id = $1
         ORDER BY a.criado_em DESC`;

    const params = u.nivel === 'admin' ? [] : [u.id];
    const r = await pool.query(query, params);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// PUT /api/aps/:id — edita campos básicos de uma AP
app.put('/api/aps/:id', requireAuth, async (req, res) => {
  const u = req.session.usuario;
  const { numero, nome_projeto, data_ap, observacao, status, ap_assinada_url, numero_nf, data_envio, data_pagamento } = req.body;
  try {
    const check = await pool.query(`SELECT usuario_id FROM aps WHERE id = $1`, [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ erro: 'AP não encontrada' });
    if (u.nivel !== 'admin' && check.rows[0].usuario_id !== u.id)
      return res.status(403).json({ erro: 'Sem permissão' });
    await pool.query(`
      UPDATE aps SET
        numero=$1, nome_projeto=$2, data_ap=$3, observacao=$4,
        status=COALESCE($5, status),
        ap_assinada_url=COALESCE($6, ap_assinada_url),
        numero_nf=COALESCE($7, numero_nf),
        data_envio=COALESCE($8, data_envio),
        data_pagamento=COALESCE($9, data_pagamento)
      WHERE id=$10`,
      [numero, nome_projeto, data_ap||null, observacao||null,
       status||null, ap_assinada_url||null, numero_nf||null,
       data_envio||null, data_pagamento||null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// DELETE /api/aps/:id
app.delete('/api/aps/:id', requireAuth, async (req, res) => {
  const u = req.session.usuario;
  try {
    const check = await pool.query(`SELECT usuario_id FROM aps WHERE id = $1`, [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ erro: 'AP não encontrada' });
    if (u.nivel !== 'admin' && check.rows[0].usuario_id !== u.id)
      return res.status(403).json({ erro: 'Sem permissão' });
    await pool.query(`DELETE FROM aps WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Upload AP assinada
app.post('/api/aps/:id/assinada', requireAuth, async (req, res) => {
  try {
    const { ap_assinada_url } = req.body;
    if (!ap_assinada_url) return res.status(400).json({ erro: 'URL não informada.' });
    await pool.query(`UPDATE aps SET ap_assinada_url=$1 WHERE id=$2`, [ap_assinada_url, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Atualizar status da AP
app.patch('/api/aps/:id/status', requireAuth, async (req, res) => {
  try {
    const { status, numero_nf, data_envio, data_pagamento, nf_arquivo_url } = req.body;
    await pool.query(`
      UPDATE aps SET
        status=COALESCE($1,status),
        numero_nf=COALESCE($2,numero_nf),
        data_envio=COALESCE($3,data_envio),
        data_pagamento=COALESCE($4,data_pagamento),
        nf_arquivo_url=COALESCE($5,nf_arquivo_url)
      WHERE id=$6`,
      [status||null, numero_nf||null, data_envio||null, data_pagamento||null, nf_arquivo_url||null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// GET /api/aps/:id/pdf — baixa PDF de AP já existente
app.get('/api/aps/:id/pdf', requireAuth, async (req, res) => {
  const u = req.session.usuario;
  try {
    const r = await pool.query(`SELECT * FROM aps WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ erro: 'AP não encontrada' });

    const ap = r.rows[0];
    if (u.nivel !== 'admin' && ap.usuario_id !== u.id)
      return res.status(403).json({ erro: 'Sem permissão' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="AP_${ap.numero.replace(/\./g,'_')}.pdf"`);

    const dados = {
      numero: ap.numero, mes: ap.mes, ano: ap.ano, tipo: ap.tipo,
      unidade: ap.unidade, nomeProjeto: ap.nome_projeto,
      descritivo: ap.descritivo, data: ap.data_ap,
      observacao: ap.observacao, itens: ap.itens,
      totalBruto: Number(ap.total_bruto),
      totalDesconto: Number(ap.total_desconto),
    };

    await gerarPDFv2(dados, res);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ erro: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// USUÁRIOS (admin only)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/usuarios
app.get('/api/usuarios', requireAdmin, async (req, res) => {
  const r = await pool.query(
    `SELECT id, nome, login, nivel, ativo, criado_em FROM usuarios ORDER BY nome`
  );
  res.json(r.rows);
});

// POST /api/usuarios
app.post('/api/usuarios', requireAdmin, async (req, res) => {
  const { nome, login, senha, nivel } = req.body;
  if (!nome || !login || !senha) return res.status(400).json({ erro: 'Dados incompletos' });
  try {
    const hash = await bcrypt.hash(senha, 10);
    await pool.query(
      `INSERT INTO usuarios (nome, login, senha_hash, nivel) VALUES ($1,$2,$3,$4)`,
      [nome, login.toLowerCase(), hash, nivel || 'usuario']
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ erro: 'Login já existe' });
    res.status(500).json({ erro: e.message });
  }
});

// PUT /api/usuarios/:id
app.put('/api/usuarios/:id', requireAdmin, async (req, res) => {
  const { nome, nivel, ativo, senha } = req.body;
  try {
    if (senha) {
      const hash = await bcrypt.hash(senha, 10);
      await pool.query(
        `UPDATE usuarios SET nome=$1, nivel=$2, ativo=$3, senha_hash=$4 WHERE id=$5`,
        [nome, nivel, ativo, hash, req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE usuarios SET nome=$1, nivel=$2, ativo=$3 WHERE id=$4`,
        [nome, nivel, ativo, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// DELETE /api/usuarios/:id
app.delete('/api/usuarios/:id', requireAdmin, async (req, res) => {
  // Não deleta, só desativa
  await pool.query(`UPDATE usuarios SET ativo=FALSE WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// EXECUÇÃO CONTROLE
// ════════════════════════════════════════════════════════════════════════════

// GET /api/execucao — admin vê todas, usuário vê as suas
app.get('/api/execucao', requireAuth, async (req, res) => {
  const u = req.session.usuario;
  try {
    let r;
    if (u.nivel === 'admin') {
      r = await pool.query(
        `SELECT e.*, u.nome as usuario_nome
         FROM execucao e LEFT JOIN usuarios u ON e.usuario_id = u.id
         ORDER BY e.criado_em DESC`
      );
    } else {
      r = await pool.query(
        `SELECT e.*, u.nome as usuario_nome
         FROM execucao e LEFT JOIN usuarios u ON e.usuario_id = u.id
         WHERE e.usuario_id = $1
         ORDER BY e.criado_em DESC`,
        [u.id]
      );
    }
    res.json(r.rows);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// POST /api/execucao
app.post('/api/execucao', requireAuth, async (req, res) => {
  const { unidade, projeto, nome_projeto, itens, numero_ap, obs } = req.body;
  const usuario_id = req.session.usuario.id;
  try {
    const r = await pool.query(
      `INSERT INTO execucao (unidade, projeto, nome_projeto, itens, numero_ap, obs, usuario_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [unidade, projeto, nome_projeto, JSON.stringify(itens || []), numero_ap || null, obs || null, usuario_id]
    );
    res.json({ id: r.rows[0].id });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// PUT /api/execucao/:id
app.put('/api/execucao/:id', requireAuth, async (req, res) => {
  const u = req.session.usuario;
  const { unidade, projeto, nome_projeto, itens, numero_ap, obs } = req.body;
  try {
    const check = await pool.query(`SELECT usuario_id FROM execucao WHERE id=$1`, [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ erro: 'Não encontrado' });
    if (u.nivel !== 'admin' && check.rows[0].usuario_id !== u.id)
      return res.status(403).json({ erro: 'Sem permissão' });
    await pool.query(
      `UPDATE execucao SET unidade=$1, projeto=$2, nome_projeto=$3, itens=$4, numero_ap=$5, obs=$6 WHERE id=$7`,
      [unidade, projeto, nome_projeto, JSON.stringify(itens || []), numero_ap || null, obs || null, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// DELETE /api/execucao/:id
app.delete('/api/execucao/:id', requireAuth, async (req, res) => {
  const u = req.session.usuario;
  try {
    const check = await pool.query(`SELECT usuario_id FROM execucao WHERE id=$1`, [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ erro: 'Não encontrado' });
    if (u.nivel !== 'admin' && check.rows[0].usuario_id !== u.id)
      return res.status(403).json({ erro: 'Sem permissão' });
    await pool.query(`DELETE FROM execucao WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/gerar-ap-pdf-v2 — gera PDF v2 (Puppeteer/HTML) sem salvar no banco
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/gerar-ap-pdf-v2', requireAuth, async (req, res) => {
  const dados = req.body;
  if (!dados.numero || !dados.itens?.length) {
    return res.status(400).json({ erro: 'Campos obrigatórios: numero, itens' });
  }
  try {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="AP_${(dados.numero || 'AP').replace(/\./g, '_')}.pdf"`);
    await gerarPDFv2(dados, res);
  } catch (e) {
    console.error('[gerar-ap-pdf-v2]', e);
    if (!res.headersSent) res.status(500).json({ erro: e.message });
  }
});

// ── Rota catch-all (SPA) ─────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────────────────────────────────
setupDB().then(() => {
  app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));
}).catch(e => {
  console.error('❌ Erro ao conectar ao banco:', e.message);
  process.exit(1);
});
