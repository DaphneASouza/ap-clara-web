# AP Clara Digital — Web App

## Stack
- Node.js + Express
- PostgreSQL (Neon — gratuito)
- PDFKit
- Deploy: Render.com

## Deploy passo a passo

### 1. Banco de dados (Neon)
1. Acesse https://neon.tech e crie uma conta gratuita
2. Crie um novo projeto → copie a **Connection String** (formato `postgresql://...`)

### 2. Repositório GitHub
1. Crie um repositório no GitHub (pode ser privado)
2. Envie todos os arquivos deste projeto
3. Coloque `assinatura.png` dentro de `public/`

### 3. Deploy no Render
1. Acesse https://render.com → New → Web Service
2. Conecte ao seu repositório GitHub
3. Configure:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Em **Environment Variables**, adicione:
   - `DATABASE_URL` → cole a connection string do Neon
   - `SESSION_SECRET` → qualquer texto longo (ex: `minha-chave-secreta-2024-clara`)
   - `NODE_ENV` → `production`
5. Clique em **Create Web Service**

### 4. Primeiro acesso
- URL: `https://seu-app.onrender.com`
- Login: `daphne`
- Senha: `clara2024` ← **troque após o primeiro login via painel admin**

## Níveis de acesso
- **admin (Daphne):** vê todas as APs, gerencia usuários
- **usuario:** vê e gera apenas suas próprias APs

## Estrutura de arquivos
```
ap-clara-web/
├── server.js        ← Express + rotas API
├── db.js            ← PostgreSQL + setup inicial
├── gerar-pdf.js     ← geração PDF
├── cardapio.js      ← 263 itens
├── package.json
├── Procfile         ← para o Render
├── .env.example     ← variáveis de ambiente
└── public/
    ├── index.html   ← tela de login
    ├── app.html     ← sistema principal
    └── assinatura.png ← adicionar manualmente
```
