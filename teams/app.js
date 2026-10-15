// Conversas — app separada da Gestão Escolar, ligada à mesma base de dados MySQL.
// As contas (professor/aluno) são as mesmas que a direção já cria no painel principal;
// esta app não gere contas nem palavras-passe.
const path = require('node:path');
const { get, post, criarServidor, renovarSessao, terminarSessao, guardarSessao } = require('../src/lib/servidor');
const { um, CONFIG } = require('../src/db');
const { verificarPassword, h } = require('../src/lib/util');
const { documento, paginaLogin } = require('./vistas');

const PORTA = Number(process.env.TEAMS_PORT || process.env.PORT) || 3100;
const NOME_COOKIE = 'sid_conversas';

const MENSAGENS_ERRO = {
  400: 'O pedido não é válido.',
  403: 'Não tem permissão para aceder a isto.',
  404: 'Esta página não existe.',
  500: 'Ocorreu um erro inesperado.',
};

// Tal como em src/app.js: guarda a sessão antes de responder, para não perder uma mensagem
// flash (ou a sessão recém-criada) escrita mesmo antes do erro. Se falhar, envia o erro à mesma.
async function paginaErro(req, res, estado) {
  await guardarSessao(req, res, NOME_COOKIE).catch((erro) => console.error(erro));
  res.writeHead(estado, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    documento(
      `Erro ${estado}`,
      `<div class="ecra-centro"><div class="cartao-login centro">
        <h1>${estado}</h1><p class="texto-suave">${h(MENSAGENS_ERRO[estado] || 'Erro.')}</p>
        <p><a class="botao" href="/">Voltar</a></p>
      </div></div>`
    )
  );
}

// Só professores e alunos usam esta app; a direção continua a gerir contas na Gestão Escolar
async function antesDaRota(req, res) {
  const id = req.sessao.dados.utilizadorId;
  if (id) {
    req.utilizador = await um('SELECT id, username, nome, papel FROM utilizadores WHERE id = ?', id);
    if (!req.utilizador) await terminarSessao(req);
  }
  const publico = req.caminho === '/login';
  if (!publico && !req.utilizador) {
    res.redirecionar('/login');
    return false;
  }
  if (req.utilizador && !['professor', 'aluno'].includes(req.utilizador.papel)) {
    paginaErro(req, res, 403);
    return false;
  }
  if (req.utilizador?.papel === 'aluno') {
    req.aluno = await um('SELECT id, nome, turma_id FROM alunos WHERE utilizador_id = ?', req.utilizador.id);
  } else if (req.utilizador?.papel === 'professor') {
    req.professor = await um('SELECT id, nome FROM professores WHERE utilizador_id = ?', req.utilizador.id);
  }
  return true;
}

get('/login', (req, res) => {
  if (req.utilizador) return res.redirecionar('/');
  res.html(paginaLogin({ mensagens: req.lerFlash() }));
});

post('/login', async (req, res) => {
  const email = String(req.corpo.email || '').trim();
  const password = String(req.corpo.password || '');
  // O email vive em professores/alunos, não em utilizadores — por isso o JOIN em vez de um WHERE direto
  const utilizador = await um(
    `SELECT u.* FROM utilizadores u
       LEFT JOIN professores p ON p.utilizador_id = u.id
       LEFT JOIN alunos a ON a.utilizador_id = u.id
      WHERE p.email = ? OR a.email = ?
      LIMIT 1`,
    email,
    email
  );

  if (!utilizador || !verificarPassword(password, utilizador.password_hash)) {
    return res.html(paginaLogin({ email, erro: 'Email ou palavra-passe incorretos.' }), 401);
  }
  if (!['professor', 'aluno'].includes(utilizador.papel)) {
    return res.html(paginaLogin({ email, erro: 'Esta conta não tem acesso a Conversas.' }), 403);
  }
  if (utilizador.deve_redefinir_password) {
    return res.html(
      paginaLogin({ email, erro: 'Primeiro tem de definir a sua palavra-passe na Gestão Escolar (ecrã que aparece ao entrar lá).' }),
      403
    );
  }
  (await renovarSessao(req)).dados.utilizadorId = utilizador.id;
  res.redirecionar('/');
});

post('/logout', async (req, res) => {
  await terminarSessao(req);
  res.setHeader('Set-Cookie', `${NOME_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.redirecionar('/login');
});

require('./rotas');
require('./privadas');

async function iniciar() {
  // Não cria nem migra o esquema (isso é feito pela Gestão Escolar, para as duas apps não
  // tentarem alterar a base de dados ao mesmo tempo se arrancarem juntas); só confirma que já existe.
  if (!(await um("SHOW TABLES LIKE 'canais'"))) {
    throw new Error('As tabelas de canais ainda não existem. Arranque a Gestão Escolar (npm start) pelo menos uma vez primeiro.');
  }
  const servidor = criarServidor({
    pastaPublica: path.join(__dirname, 'publico'),
    antesDaRota,
    paginaErro,
    nomeCookie: NOME_COOKIE,
  });
  servidor.on('error', (erro) => {
    if (erro.code === 'EADDRINUSE') {
      console.error(`\nA porta ${PORTA} já está a ser usada. Defina TEAMS_PORT=outra-porta e tente de novo.\n`);
    } else {
      console.error(erro);
    }
    process.exit(1);
  });
  servidor.listen(PORTA, () => {
    console.log(`Conversas a correr em http://localhost:${PORTA}  (MySQL: ${CONFIG.database})`);
  });
}

iniciar().catch((erro) => {
  console.error(`\nNão foi possível arrancar (MySQL em ${CONFIG.host}:${CONFIG.port}):`);
  console.error(erro.message);
  process.exit(1);
});
