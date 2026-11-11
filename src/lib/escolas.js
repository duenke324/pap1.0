// Várias escolas na mesma instalação: cada escola tem a sua base de dados, e uma base de dados
// central (a "plataforma") guarda a lista de escolas e a conta de quem as gere.
// Este módulo decide a que escola pertence cada pedido, prepara tudo no arranque e cria escolas novas.
const {
  plataforma,
  escolasAtivas,
  escolaPorCodigo,
  prepararPlataforma,
  prepararBaseDeDados,
  nomeBdValido,
  executar,
  um,
  todos,
  transacao,
  CONFIG,
  BD_PLATAFORMA,
} = require('../db');
const { correrNoContexto } = require('./contexto');
const { lerCookies } = require('./servidor');
const { gerarHash, gerarPasswordTemporaria } = require('./util');

const COOKIE_ESCOLA = 'escola';
const USERNAME_DIRECAO = 'direcao';

const contextoPlataforma = () => ({ bd: BD_PLATAFORMA, escola: null, nomeCookie: 'sid_plataforma' });
const contextoDaEscola = (escola, nomeCookie = 'sid') => ({ bd: escola.base_dados, escola, nomeCookie });

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

async function resolverContextoGestao(req, res) {
  // Painel da plataforma e escolha da escola: não pertencem a nenhuma escola
  if (/^\/(plataforma|escolas|escola)(\/|$)/.test(req.caminho)) return contextoPlataforma();
  const escola = await escolaDoPedido(req);
  if (escola) return contextoDaEscola(escola);
  if (FICHEIROS_PWA.includes(req.caminho)) return contextoPlataforma();
  // Há várias escolas e este browser ainda não escolheu nenhuma
  res.writeHead(303, { Location: '/escolas' });
  res.end();
  return false;
}

// ---------- Arranque ----------
// Prepara a base de dados central e a de cada escola (cria o que faltar e aplica as migrações).
// Na primeira vez regista como primeira escola a base de dados que já existia (CONFIG.database)
// e cria a conta do gestor da plataforma.
async function prepararTudo() {
  await prepararPlataforma();

  if (!(await plataforma.um('SELECT 1 FROM gestores LIMIT 1'))) {
    await plataforma.executar(
      `INSERT INTO gestores (username, password_hash, nome, deve_redefinir_password) VALUES ('plataforma', ?, 'Gestor da plataforma', 1)`,
      gerarHash(process.env.PLATAFORMA_PASSWORD || 'plataforma123')
    );
  }

  if (!(await plataforma.um('SELECT 1 FROM escolas LIMIT 1'))) {
    await plataforma.executar(
      `INSERT INTO escolas (codigo, nome, dominio_email, base_dados, direcao_nome) VALUES (?, ?, ?, ?, ?)`,
      'epmontijo',
      'Escola Profissional do Montijo',
      'epmontijo.edu.pt',
      CONFIG.database,
      'Secretaria'
    );
  }

  const escolas = await plataforma.todos('SELECT * FROM escolas ORDER BY id');
  for (const escola of escolas) await prepararBaseDeDados(escola.base_dados);
  return escolas;
}

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

// Cria a base de dados da escola, a conta da direção (administrador dessa escola) e regista a escola.
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

  // Numa instalação de testes (DB_NAME definido, ex.: gestao_escolar_teste) as escolas novas ficam com
  // esse prefixo, para nunca reutilizarem a base de dados de uma escola verdadeira no mesmo servidor
  const baseDados = process.env.DB_NAME ? `${CONFIG.database}_${codigo}` : `gestao_${codigo}`;
  if (!nomeBdValido(baseDados) || baseDados === BD_PLATAFORMA) return { erro: 'O código da escola não é válido.' };
  const repetida = await plataforma.um(
    'SELECT codigo, dominio_email FROM escolas WHERE codigo = ? OR dominio_email = ? OR base_dados = ?',
    codigo,
    dominio,
    baseDados
  );
  if (repetida) {
    return { erro: repetida.dominio_email === dominio ? `Já existe uma escola com o domínio @${dominio}.` : `Já existe uma escola com o código "${codigo}".` };
  }

  await prepararBaseDeDados(baseDados);
  const password = gerarPasswordTemporaria();
  const escola = { codigo, nome, dominio_email: dominio, base_dados: baseDados, direcao_nome: direcao, ativa: 1 };
  await correrNoContexto(contextoDaEscola(escola), async () => {
    // (se a base de dados já existia de uma tentativa anterior, reaproveita a conta da direção)
    const existente = await um('SELECT id FROM utilizadores WHERE username = ?', USERNAME_DIRECAO);
    if (existente) {
      await executar('UPDATE utilizadores SET password_hash = ?, nome = ?, deve_redefinir_password = 1 WHERE id = ?', gerarHash(password), direcao, existente.id);
    } else {
      await executar(
        `INSERT INTO utilizadores (username, password_hash, papel, nome, deve_redefinir_password) VALUES (?, ?, 'admin', ?, 1)`,
        USERNAME_DIRECAO,
        gerarHash(password),
        direcao
      );
    }
  });
  const r = await plataforma.executar(
    'INSERT INTO escolas (codigo, nome, dominio_email, base_dados, direcao_nome) VALUES (?, ?, ?, ?, ?)',
    codigo,
    nome,
    dominio,
    baseDados,
    direcao
  );
  return { escola: { ...escola, id: r.lastInsertRowid }, username: USERNAME_DIRECAO, password };
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
// Tudo corre na base de dados da escola indicada, seja qual for a escola do pedido.
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
  alunosPorTurma,
  gerarPasswordsAlunos,
  COOKIE_ESCOLA,
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
