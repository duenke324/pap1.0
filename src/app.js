// Ponto de entrada da aplicação
const path = require('node:path');
const { pastaBase } = require('./lib/recursos');
const { get, post, criarServidor, renovarSessao, terminarSessao, enviarFicheiro, guardarSessao } = require('./lib/servidor');
const { um, todos, executar, prepararBaseDeDados, CONFIG, PASTA_FOTOS } = require('./db');
const { verificarPassword, gerarHash, h } = require('./lib/util');
const { documento, mensagensFlash, botaoTema, LOGO } = require('./vistas/layout');
const { semearSeVazia } = require('./seed');

const PORTA = Number(process.env.PORT) || 3000;
const PAGINA_INICIAL = { aluno: '/aluno', professor: '/professor/turmas', admin: '/admin', funcionario: '/funcionario' };

// ---------- Páginas de erro ----------
const MENSAGENS_ERRO = {
  400: 'O endereço ou o pedido não é válido.',
  403: 'Não tem permissão para aceder a esta página.',
  404: 'A página que procura não existe.',
  413: 'O pedido é demasiado grande (a fotografia pode ser demasiado pesada).',
  500: 'Ocorreu um erro inesperado. Tente novamente.',
};

async function paginaErro(req, res, estado) {
  const voltar = req.utilizador ? PAGINA_INICIAL[req.utilizador.papel] : '/login';
  // Tal como as respostas normais (res.html/res.redirecionar), guarda a sessão antes de responder
  // (ex.: uma mensagem flash escrita mesmo antes do erro não se perde). Se falhar, envia o erro à mesma.
  await guardarSessao(req, res).catch((erro) => console.error(erro));
  res.writeHead(estado, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    documento(
      `Erro ${estado}`,
      `<div class="ecra-centro"><div class="cartao cartao-erro">
        <p class="codigo-erro">${estado}</p>
        <p>${h(MENSAGENS_ERRO[estado] || 'Erro.')}</p>
        <a class="botao" href="${voltar}">Voltar ao início</a>
      </div></div>`,
      'fundo-login'
    )
  );
}

// ---------- Autenticação e autorização ----------
// Corre antes de todas as rotas: carrega o utilizador e verifica se pode aceder à área pedida
async function antesDaRota(req, res) {
  const id = req.sessao.dados.utilizadorId;
  if (id) {
    req.utilizador = await um('SELECT id, username, nome, papel, deve_redefinir_password FROM utilizadores WHERE id = ?', id);
    if (!req.utilizador) await terminarSessao(req);
  }

  const publico = req.caminho === '/login';
  if (!publico && !req.utilizador) {
    res.redirecionar('/login');
    return false;
  }

  // Palavra-passe atribuída pelo administrador (conta nova ou redefinida): tem de ser substituída antes de mais nada
  if (req.utilizador?.deve_redefinir_password && !['/definir-password', '/logout'].includes(req.caminho)) {
    res.redirecionar('/definir-password');
    return false;
  }

  const area = req.caminho.split('/')[1];
  if (['aluno', 'professor', 'admin', 'funcionario'].includes(area) && req.utilizador.papel !== area) {
    paginaErro(req, res, 403);
    return false;
  }

  if (req.utilizador?.papel === 'aluno') {
    req.aluno = await um(
      `SELECT a.*, t.nome AS turma, t.ano_letivo, t.curso, p.nome AS diretor, p.email AS diretor_email
         FROM alunos a
         LEFT JOIN turmas t ON t.id = a.turma_id
         LEFT JOIN professores p ON p.id = t.diretor_id
        WHERE a.utilizador_id = ?`,
      req.utilizador.id
    );
  } else if (req.utilizador?.papel === 'professor') {
    req.professor = await um('SELECT * FROM professores WHERE utilizador_id = ?', req.utilizador.id);
  } else if (req.utilizador?.papel === 'funcionario') {
    req.funcionario = await um('SELECT * FROM funcionarios WHERE utilizador_id = ?', req.utilizador.id);
  }
  return true;
}

function paginaLogin(req, { username = '', erro = '' } = {}) {
  return documento(
    'Entrar',
    `<div class="canto-tema">${botaoTema()}</div>
    <div class="ecra-centro">
      <div class="cartao cartao-login">
        <div class="marca marca-login">
          ${LOGO}
          <div><strong>Gestão Escolar</strong><small>Faltas, sumários e avaliação</small></div>
        </div>
        ${mensagensFlash(req.lerFlash())}
        ${erro ? `<div class="alerta alerta-erro" role="alert">${h(erro)}</div>` : ''}
        <form method="post" action="/login" class="formulario">
          <label>Número de processo
            <input name="username" value="${h(username)}" autocomplete="username" required autofocus>
          </label>
          <label>Palavra-passe
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
          <button class="botao botao-bloco">Entrar</button>
        </form>
      </div>
    </div>`,
    'fundo-login'
  );
}

get('/login', (req, res) => {
  if (req.utilizador) return res.redirecionar(PAGINA_INICIAL[req.utilizador.papel]);
  res.html(paginaLogin(req));
});

post('/login', async (req, res) => {
  const username = String(req.corpo.username || '').trim();
  const password = String(req.corpo.password || '');
  const utilizador = await um('SELECT * FROM utilizadores WHERE username = ?', username);

  if (!utilizador || !verificarPassword(password, utilizador.password_hash)) {
    return res.html(paginaLogin(req, { username, erro: 'Utilizador ou palavra-passe incorretos.' }), 401);
  }
  (await renovarSessao(req)).dados.utilizadorId = utilizador.id;
  res.redirecionar(PAGINA_INICIAL[utilizador.papel]);
});

post('/logout', async (req, res) => {
  await terminarSessao(req);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.redirecionar('/login');
});

// Primeiro acesso (ou palavra-passe redefinida pelo administrador): tem de escolher uma nova antes de continuar
function paginaDefinirPassword(req, { erro = '' } = {}) {
  return documento(
    'Definir palavra-passe',
    `<div class="canto-tema">${botaoTema()}</div>
    <div class="ecra-centro">
      <div class="cartao cartao-login">
        <div class="marca marca-login">
          ${LOGO}
          <div><strong>Gestão Escolar</strong><small>Definir palavra-passe</small></div>
        </div>
        <p>É a primeira vez que entra (ou a sua palavra-passe foi redefinida). Escolha uma nova palavra-passe para continuar.</p>
        ${mensagensFlash(req.lerFlash())}
        ${erro ? `<div class="alerta alerta-erro" role="alert">${h(erro)}</div>` : ''}
        <form method="post" action="/definir-password" class="formulario">
          <label>Nova palavra-passe
            <input name="password" type="password" minlength="6" autocomplete="new-password" required autofocus>
          </label>
          <label>Confirmar palavra-passe
            <input name="confirmar" type="password" minlength="6" autocomplete="new-password" required>
          </label>
          <button class="botao botao-bloco">Guardar e continuar</button>
        </form>
      </div>
    </div>`,
    'fundo-login'
  );
}

get('/definir-password', (req, res) => {
  if (!req.utilizador.deve_redefinir_password) return res.redirecionar(PAGINA_INICIAL[req.utilizador.papel]);
  res.html(paginaDefinirPassword(req));
});

post('/definir-password', async (req, res) => {
  if (!req.utilizador.deve_redefinir_password) return res.redirecionar(PAGINA_INICIAL[req.utilizador.papel]);
  const password = String(req.corpo.password || '');
  const confirmar = String(req.corpo.confirmar || '');

  let erro = '';
  if (password.length < 6) erro = 'A palavra-passe deve ter pelo menos 6 caracteres.';
  else if (password !== confirmar) erro = 'As palavras-passe não coincidem.';
  else {
    // Não pode voltar a ficar com a palavra-passe temporária que lhe foi atribuída
    const atual = await um('SELECT password_hash FROM utilizadores WHERE id = ?', req.utilizador.id);
    if (verificarPassword(password, atual.password_hash)) {
      erro = 'Escolha uma palavra-passe diferente da que lhe foi atribuída.';
    }
  }
  if (erro) return res.html(paginaDefinirPassword(req, { erro }), 422);

  await executar(
    'UPDATE utilizadores SET password_hash = ?, deve_redefinir_password = 0 WHERE id = ?',
    gerarHash(password),
    req.utilizador.id
  );
  req.flash('sucesso', 'Palavra-passe definida com sucesso.');
  res.redirecionar(PAGINA_INICIAL[req.utilizador.papel]);
});

get('/', (req, res) => res.redirecionar(PAGINA_INICIAL[req.utilizador.papel]));

// Fotografias dos alunos: só utilizadores autenticados.
// Um aluno só pode ver a sua própria fotografia.
get('/fotos/:ficheiro', (req, res) => {
  const ficheiro = path.basename(req.params.ficheiro);
  if (req.utilizador.papel === 'aluno' && req.aluno?.fotografia !== ficheiro) return paginaErro(req, res, 403);
  if (!enviarFicheiro(res, PASTA_FOTOS, ficheiro, 300)) paginaErro(req, res, 404);
});

// ---------- Painéis ----------
require('./rotas/aluno');
require('./rotas/professor');
require('./rotas/avaliacao');
require('./rotas/admin');
require('./rotas/turmas');
require('./rotas/professores');
require('./rotas/funcionario');
require('./rotas/funcionarios');
require('./rotas/horarios');
require('./rotas/calendario');
require('./rotas/auditoria');

// ---------- Arranque ----------
async function iniciar() {
  try {
    await prepararBaseDeDados();
    await semearSeVazia();
  } catch (erro) {
    console.error(`\nNão foi possível ligar ao MySQL em ${CONFIG.host}:${CONFIG.port} (utilizador "${CONFIG.user}").`);
    console.error('Confirme que o MySQL está ligado no painel do XAMPP.\n');
    console.error(erro.message);
    process.exit(1);
  }

  const servidor = criarServidor({ pastaPublica: path.join(pastaBase(), 'public'), antesDaRota, paginaErro });
  servidor.on('error', (erro) => {
    if (erro.code === 'EADDRINUSE') {
      console.error(`\nA porta ${PORTA} já está a ser usada (provavelmente o servidor já está a correr noutro terminal).`);
      console.error('Feche o outro servidor (Ctrl + C) ou use outra porta, por exemplo:  set PORT=3001 && npm start\n');
    } else {
      console.error(erro);
    }
    process.exit(1);
  });
  servidor.listen(PORTA, async () => {
    const totais = (await todos('SELECT papel, COUNT(*) AS n FROM utilizadores GROUP BY papel'))
      .map((l) => `${l.n} ${l.papel}`)
      .join(', ');
    console.log(`Gestão Escolar a correr em http://localhost:${PORTA}  (MySQL: ${CONFIG.database} · ${totais})`);
  });
}

iniciar();
