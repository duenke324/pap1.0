// Conversas — app separada da Gestão Escolar, ligada à mesma base de dados MySQL.
// As contas (professor/aluno) são as mesmas que a direção já cria no painel principal;
// esta app não gere contas nem palavras-passe.
const path = require('node:path');
const { get, post, criarServidor, renovarSessao, terminarSessao, guardarSessao, acrescentarCookie } = require('../src/lib/servidor');
const { um, plataforma, escolaPorDominio, CONFIG } = require('../src/db');
const { verificarPassword, h } = require('../src/lib/util');
const { correrNoContexto } = require('../src/lib/contexto');
const { escolaDoPedido, contextoDaEscola, contextoPlataforma } = require('../src/lib/escolas');
const { paginaEntrada, paginaLogin } = require('./vistas');

const PORTA = Number(process.env.TEAMS_PORT || process.env.PORT) || 3100;
const NOME_COOKIE = 'sid_conversas';
// A escola de cada pessoa fica memorizada num cookie próprio desta app, posto ao entrar
// (descobre-se pelo domínio do email). Tal como na Gestão Escolar, o cookie só escolhe a base de
// dados onde se procura a sessão — ver src/lib/escolas.js.
const COOKIE_ESCOLA = 'escola_conversas';

async function resolverContexto(req) {
  const escola = await escolaDoPedido(req, COOKIE_ESCOLA);
  // Sem escola (várias escolas e este browser ainda não entrou): só o ecrã de login funciona
  return escola ? contextoDaEscola(escola, NOME_COOKIE) : { ...contextoPlataforma(), nomeCookie: NOME_COOKIE };
}

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
    paginaEntrada(`Erro ${estado}`, {
      tituloPainel: `Erro ${estado}`,
      painel: `<p class="entrada-texto">${h(MENSAGENS_ERRO[estado] || 'Erro.')}</p>
        <a class="botao botao-bloco" href="/">Voltar</a>`,
    })
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
  // A escola é a do domínio do email (o que vem depois do @); se o domínio não for de nenhuma
  // escola, tenta-se a deste browser (ou a única que existir)
  const escola = (await escolaPorDominio(email.split('@')[1])) || (await escolaDoPedido(req, COOKIE_ESCOLA));
  if (!escola) return res.html(paginaLogin({ email, erro: 'Email ou palavra-passe incorretos.' }), 401);
  // O resto do login corre na base de dados dessa escola, incluindo a sessão criada no fim
  return correrNoContexto(contextoDaEscola(escola, NOME_COOKIE), () => entrarNaEscola(req, res, escola, email));
});

async function entrarNaEscola(req, res, escola, email) {
  const password = String(req.corpo.password || '');
  // O email vive em professores/alunos/funcionarios, não em utilizadores — por isso o JOIN em vez de um WHERE
  // direto. O JOIN a funcionarios é necessário mesmo esta app não lhes dando acesso: sem ele, uma conta de
  // funcionário nunca é encontrada e cai sempre no erro genérico de "credenciais incorretas" (401) em vez do
  // 403 "Esta conta não tem acesso a Conversas." que o código abaixo já trata para esse caso.
  const utilizador = await um(
    `SELECT u.* FROM utilizadores u
       LEFT JOIN professores p ON p.utilizador_id = u.id
       LEFT JOIN alunos a ON a.utilizador_id = u.id
       LEFT JOIN funcionarios f ON f.utilizador_id = u.id
      WHERE p.email = ? OR a.email = ? OR f.email = ?
      LIMIT 1`,
    email,
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
  acrescentarCookie(res, `${COOKIE_ESCOLA}=${encodeURIComponent(escola.codigo)}; SameSite=Lax; Path=/; Max-Age=31536000`);
  res.redirecionar('/');
}

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
  let escolas;
  try {
    escolas = await plataforma.todos('SELECT nome FROM escolas WHERE ativa = 1');
  } catch {
    throw new Error('A lista de escolas ainda não existe. Arranque a Gestão Escolar (npm start) pelo menos uma vez primeiro.');
  }
  if (!escolas.length) throw new Error('Ainda não há nenhuma escola ativa. Crie uma no painel da plataforma da Gestão Escolar.');
  const servidor = criarServidor({
    pastaPublica: path.join(__dirname, 'publico'),
    antesDaRota,
    paginaErro,
    nomeCookie: NOME_COOKIE,
    resolverContexto,
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
    console.log(`Conversas a correr em http://localhost:${PORTA}  (${escolas.length} escola(s): ${escolas.map((e) => e.nome).join(', ')})`);
  });
}

iniciar().catch((erro) => {
  console.error(`\nNão foi possível arrancar (MySQL em ${CONFIG.host}:${CONFIG.port}):`);
  console.error(erro.message);
  process.exit(1);
});
