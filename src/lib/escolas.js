// Várias escolas na mesma instalação, todas na mesma base de dados (gestao_escolar): a tabela escolas
// guarda a lista de escolas, e cada linha das outras tabelas tem o escola_id da sua escola (ver src/db.js).
// Este módulo decide a que escola pertence cada pedido, prepara tudo no arranque e cria escolas novas.
const {
  plataforma,
  escolasAtivas,
  escolaPorCodigo,
  prepararBaseDeDados,
  executar,
  um,
  todos,
  transacao,
} = require('../db');
const { correrNoContexto } = require('./contexto');
const { lerCookies, acrescentarCookie } = require('./servidor');
const { gerarHash, gerarPasswordTemporaria } = require('./util');

const COOKIE_ESCOLA = 'escola';
const USERNAME_DIRECAO = 'direcao';

// A plataforma é a "escola 0": não vê dados de nenhuma escola (só as tabelas escolas e gestores)
const contextoPlataforma = () => ({ escolaId: 0, escola: null, nomeCookie: 'sid_plataforma' });
// prefixo: o código da escola no início dos endereços (/epmontijo/aluno). Cada escola tem o seu cookie
// de sessão (sid_epmontijo, sid_outra…), por isso dá para ter sessão aberta em duas escolas ao mesmo tempo.
const contextoDaEscola = (escola, base = 'sid') => ({
  escolaId: escola.id,
  escola,
  prefixo: escola.codigo,
  nomeCookie: `${base}_${escola.codigo}`,
});

// Códigos que não podem ser de uma escola, porque o início do endereço já tem outro significado
const CODIGOS_RESERVADOS = new Set([
  'plataforma', 'escolas', 'escola', 'static', 'fotos', 'login', 'logout', 'admin', 'aluno', 'professor',
  'encarregado', 'funcionario', 'justificativos', 'recuperar', 'recuperar_password', 'definir_password',
  'mensagens', 'turma', 'sw', 'manifest', 'offline',
]);

// Primeiro bocado do endereço e o resto: "/epmontijo/admin/faltas" → ["epmontijo", "/admin/faltas"]
function partirCaminho(caminho) {
  const m = /^\/([^/]+)(\/.*)?$/.exec(caminho);
  return m ? [m[1], m[2] || '/'] : ['', caminho];
}

// ---------- A que escola pertence o pedido ----------
// A escola fica memorizada num cookie, posto quando a pessoa abre o endereço de entrada da sua
// escola (/escola/<codigo>). O cookie só escolhe a base de dados onde se procura a sessão: mudá-lo
// à mão para o código de outra escola não dá acesso a nada, porque a sessão não existe lá.
// Com uma única escola ativa não é preciso cookie: é essa.
async function escolaDoPedido(req, nomeCookie = COOKIE_ESCOLA) {
  const codigo = lerCookies(req)[nomeCookie];
  const escola = codigo ? await escolaPorCodigo(codigo) : null;
  if (escola) return escola;
  const ativas = await escolasAtivas();
  return ativas.length === 1 ? ativas[0] : null;
}

const FICHEIROS_PWA = ['/manifest.webmanifest', '/sw.js', '/offline.html'];

// Cada escola tem os seus endereços: /epmontijo/login, /epmontijo/aluno, /epmontijo/admin/faltas…
// Se o endereço começar pelo código de uma escola ativa, o pedido é dessa escola e o código sai do
// caminho (as rotas continuam a ser "/aluno", "/admin"…; o servidor volta a pô-lo nos links das páginas).
// Endereços sem escola ("/login", "/aluno", de antes desta mudança) levam para os da escola certa.
async function resolverContextoComPrefixo(req, res, { base, paginaSemEscola }) {
  const [primeiro, resto] = partirCaminho(req.caminho);
  const escola = primeiro && !CODIGOS_RESERVADOS.has(primeiro) ? await escolaPorCodigo(primeiro) : null;
  if (escola) {
    req.caminho = resto;
    // a escola fica memorizada neste browser, para os endereços antigos levarem para ela
    if (lerCookies(req)[`${COOKIE_ESCOLA}_${base}`] !== escola.codigo) {
      acrescentarCookie(res, `${COOKIE_ESCOLA}_${base}=${encodeURIComponent(escola.codigo)}; SameSite=Lax; Path=/; Max-Age=31536000`);
    }
    return contextoDaEscola(escola, base);
  }
  return null;
}

function redirecionarPara(res, destino) {
  res.writeHead(303, { Location: destino });
  res.end();
  return false;
}

async function resolverContextoGestao(req, res) {
  const ctx = await resolverContextoComPrefixo(req, res, { base: 'sid' });
  if (ctx) return ctx;
  // Painel da plataforma e escolha da escola: não pertencem a nenhuma escola
  if (/^\/(plataforma|escolas|escola)(\/|$)/.test(req.caminho)) return contextoPlataforma();
  if (FICHEIROS_PWA.includes(req.caminho)) return contextoPlataforma();
  // Endereço sem escola: leva para o mesmo endereço dentro da escola deste browser (ou da única que existe)
  const escola = (await escolaDoPedido(req, `${COOKIE_ESCOLA}_sid`)) || (await escolaDoPedido(req));
  if (escola) {
    const consulta = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return redirecionarPara(res, `/${escola.codigo}${req.caminho === '/' ? '/' : req.caminho}${consulta}`);
  }
  // Há várias escolas e este browser ainda não escolheu nenhuma
  return redirecionarPara(res, '/escolas');
}

// ---------- Arranque ----------
// Prepara a base de dados (cria o que faltar, aplica as migrações e, na primeira vez, junta tudo na
// mesma base de dados — ver src/db.js) e cria a conta do gestor da plataforma.
async function prepararTudo() {
  await prepararBaseDeDados();

  if (!(await plataforma.um('SELECT 1 FROM gestores LIMIT 1'))) {
    await plataforma.executar(
      `INSERT INTO gestores (username, password_hash, nome, deve_redefinir_password) VALUES ('plataforma', ?, 'Gestor da plataforma', 1)`,
      gerarHash(process.env.PLATAFORMA_PASSWORD || 'plataforma123')
    );
  }

  return plataforma.todos('SELECT * FROM escolas ORDER BY id');
}

// Tempos letivos com que cada escola nova começa (a escola pode mudá-los no editor de horários)
const TEMPOS_PADRAO = [
  ['08:30', '09:20'], ['09:30', '10:20'], ['10:35', '11:25'], ['11:35', '12:25'],
  ['13:30', '14:20'], ['14:30', '15:20'], ['15:30', '16:20'], ['16:30', '17:20'],
];

// ---------- Criar uma escola ----------
// "Liceu de Setúbal" → "liceu_de_setubal"
function gerarCodigo(nome) {
  return String(nome)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
}

const DOMINIO_VALIDO = /^(?=.{4,120}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// Limpa o que a pessoa escreveu no campo do domínio ("@Escola.PT " → "escola.pt")
function normalizarDominio(texto) {
  return String(texto || '').trim().toLowerCase().replace(/^@+/, '');
}

// Regista a escola e cria a conta da direção (administrador dessa escola) e os tempos letivos dela.
// Devolve { erro } ou { escola, username, password } (a palavra-passe temporária só existe aqui).
async function criarEscola({ nome, dominio, direcao, codigo }) {
  nome = String(nome || '').trim().slice(0, 120);
  direcao = String(direcao || '').trim().slice(0, 120);
  dominio = normalizarDominio(dominio);

  if (!nome) return { erro: 'Indique o nome da escola.' };
  if (!DOMINIO_VALIDO.test(dominio)) return { erro: 'Indique o domínio de email da escola (o que vem depois do @), por exemplo: escola.edu.pt' };
  if (!direcao) return { erro: 'Indique o nome da direção.' };

  // Código da escola (aparece no endereço de entrada): por omissão, a primeira parte do domínio
  // ("esalcochete.edu.pt" → "esalcochete"), que é curta e a escola já conhece; se não servir, o nome.
  codigo = gerarCodigo(codigo || dominio.split('.')[0]);
  if (codigo.length < 3 || !/^[a-z]/.test(codigo)) codigo = gerarCodigo(nome);
  if (codigo.length < 3 || !/^[a-z]/.test(codigo)) return { erro: 'Não foi possível criar um código para a escola a partir do domínio nem do nome.' };
  // o código vai no início dos endereços da escola: não pode ser uma palavra que a aplicação já usa
  if (CODIGOS_RESERVADOS.has(codigo)) codigo = `${codigo}_escola`;

  const repetida = await plataforma.um('SELECT codigo, dominio_email FROM escolas WHERE codigo = ? OR dominio_email = ?', codigo, dominio);
  if (repetida) {
    return { erro: repetida.dominio_email === dominio ? `Já existe uma escola com o domínio @${dominio}.` : `Já existe uma escola com o código "${codigo}".` };
  }

  const r = await plataforma.executar(
    'INSERT INTO escolas (codigo, nome, dominio_email, direcao_nome) VALUES (?, ?, ?, ?)',
    codigo,
    nome,
    dominio,
    direcao
  );
  const escola = { id: r.lastInsertRowid, codigo, nome, dominio_email: dominio, direcao_nome: direcao, ativa: 1 };
  const password = gerarPasswordTemporaria();
  try {
    // Corre "dentro" da escola nova: as linhas criadas ficam com o escola_id dela
    await correrNoContexto(contextoDaEscola(escola), () =>
      transacao(async (tx) => {
        await tx.executar(
          `INSERT INTO utilizadores (username, password_hash, papel, nome, deve_redefinir_password) VALUES (?, ?, 'admin', ?, 1)`,
          USERNAME_DIRECAO,
          gerarHash(password),
          direcao
        );
        for (const [inicio, fim] of TEMPOS_PADRAO) {
          await tx.executar('INSERT INTO tempos (hora_inicio, hora_fim) VALUES (?, ?)', inicio, fim);
        }
      })
    );
  } catch (erro) {
    await plataforma.executar('DELETE FROM escolas WHERE id = ?', escola.id); // não fica uma escola sem direção
    throw erro;
  }
  return { escola, username: USERNAME_DIRECAO, password };
}

// Gera uma palavra-passe temporária nova para a direção de uma escola (o primeiro administrador)
async function reporPasswordDirecao(escola) {
  const password = gerarPasswordTemporaria();
  return correrNoContexto(contextoDaEscola(escola), async () => {
    const admin = await um(`SELECT id, username FROM utilizadores WHERE papel = 'admin' ORDER BY (username = ?) DESC, id LIMIT 1`, USERNAME_DIRECAO);
    if (!admin) return null;
    await executar('UPDATE utilizadores SET password_hash = ?, deve_redefinir_password = 1 WHERE id = ?', gerarHash(password), admin.id);
    return { username: admin.username, password };
  });
}

// ---------- Alunos de uma escola (para o painel da plataforma) ----------
// Tudo corre nos dados da escola indicada, seja qual for a escola do pedido.
const naEscola = (escola, fn) => correrNoContexto(contextoDaEscola(escola), fn);

async function alunosPorTurma(escola, pesquisa = '') {
  return naEscola(escola, async () => {
    const turmas = await todos('SELECT id, nome, curso, ano_letivo FROM turmas ORDER BY nome');
    const alunos = await todos(
      `SELECT a.id, a.numero_processo, a.nome, a.email, a.turma_id, a.utilizador_id,
              u.username, u.deve_redefinir_password
         FROM alunos a LEFT JOIN utilizadores u ON u.id = a.utilizador_id
        WHERE (? = '' OR a.nome LIKE ? OR a.numero_processo LIKE ? OR a.email LIKE ?)
        ORDER BY a.nome`,
      pesquisa,
      `%${pesquisa}%`,
      `%${pesquisa}%`,
      `%${pesquisa}%`
    );
    const grupos = turmas.map((t) => ({ turma: t, alunos: alunos.filter((a) => a.turma_id === t.id) }));
    const semTurma = alunos.filter((a) => !a.turma_id || !turmas.some((t) => t.id === a.turma_id));
    if (semTurma.length) grupos.push({ turma: { id: 0, nome: 'Sem turma', curso: '' }, alunos: semTurma });
    return { grupos, total: alunos.length };
  });
}

// Gera palavras-passe temporárias novas para alunos com conta. A pessoa é obrigada a escolher uma
// sua no primeiro acesso seguinte, e as sessões abertas dessas contas terminam.
// filtro: { alunoId } | { turmaId } (0 = sem turma) | {} (todos). Devolve as linhas com a palavra-passe,
// que só existe aqui: na base de dados fica apenas o hash.
async function gerarPasswordsAlunos(escola, filtro = {}) {
  return naEscola(escola, async () => {
    const condicoes = ['a.utilizador_id IS NOT NULL'];
    const params = [];
    if (filtro.alunoId) {
      condicoes.push('a.id = ?');
      params.push(filtro.alunoId);
    } else if (filtro.turmaId === 0) {
      condicoes.push('(a.turma_id IS NULL OR a.turma_id NOT IN (SELECT id FROM turmas))');
    } else if (filtro.turmaId) {
      condicoes.push('a.turma_id = ?');
      params.push(filtro.turmaId);
    }
    const alunos = await todos(
      `SELECT a.id, a.utilizador_id, a.numero_processo, a.nome, a.email, u.username, t.nome AS turma
         FROM alunos a JOIN utilizadores u ON u.id = a.utilizador_id LEFT JOIN turmas t ON t.id = a.turma_id
        WHERE ${condicoes.join(' AND ')}
        ORDER BY t.nome, a.nome`,
      ...params
    );
    const resultado = alunos.map((a) => ({ ...a, password: gerarPasswordTemporaria() }));
    await transacao(async (tx) => {
      for (const a of resultado) {
        await tx.executar('UPDATE utilizadores SET password_hash = ?, deve_redefinir_password = 1 WHERE id = ?', gerarHash(a.password), a.utilizador_id);
        await tx.executar(`DELETE FROM sessoes WHERE JSON_VALUE(dados, '$.utilizadorId') = ?`, a.utilizador_id);
      }
      if (resultado.length) {
        const quem = resultado.length === 1 ? `do aluno "${resultado[0].nome}" (n.º ${resultado[0].numero_processo})` : `de ${resultado.length} alunos`;
        await tx.executar(
          `INSERT INTO logs_auditoria (utilizador_id, acao, entidade, entidade_id, detalhe) VALUES (NULL, 'editar', 'aluno', ?, ?)`,
          resultado.length === 1 ? resultado[0].id : null,
          `O gestor da plataforma gerou uma palavra-passe temporária nova ${quem}.`
        );
      }
    });
    return resultado;
  });
}

module.exports = {
  TEMPOS_PADRAO,
  alunosPorTurma,
  gerarPasswordsAlunos,
  COOKIE_ESCOLA,
  resolverContextoComPrefixo,
  redirecionarPara,
  contextoPlataforma,
  contextoDaEscola,
  escolaDoPedido,
  resolverContextoGestao,
  prepararTudo,
  criarEscola,
  reporPasswordDirecao,
  normalizarDominio,
  DOMINIO_VALIDO,
};
