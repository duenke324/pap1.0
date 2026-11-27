// Biblioteca (painel do funcionário com o cargo "biblioteca"): catálogo de livros e empréstimos a alunos e
// professores, pelo n.º de processo. O aluno vê os seus empréstimos no separador Informações.
// Também aqui: a secretaria (cargo "secretaria") procura alunos e descarrega a ficha de registo em PDF.
const { get, post } = require('../lib/servidor');
const { todos, um, executar } = require('../db');
const { pagina, vazio } = require('../vistas/layout');
const { notificar } = require('../lib/push');
const { enviarFichaPdf } = require('../lib/ficha-aluno');
const { h, hoje, paraISO, dataValida, formatarData, diasAte, selecionado } = require('../lib/util');

const DIAS_EMPRESTIMO = 15;

// Só o funcionário com este cargo entra nestas páginas (a direção gere os cargos em Funcionários)
function exigeCargo(req, res, cargo) {
  if (req.funcionario?.cargo === cargo) return true;
  res.erro(403);
  return false;
}

function prazoPorOmissao() {
  const d = new Date();
  d.setDate(d.getDate() + DIAS_EMPRESTIMO);
  return paraISO(d);
}

function etiquetaPrazo(e) {
  if (e.devolvido_em) return `<span class="etiqueta etiqueta-ok">Devolvido a ${h(formatarData(e.devolvido_em))}</span>`;
  const dias = diasAte(e.prazo);
  if (dias < 0) return `<span class="etiqueta etiqueta-perigo">Atrasado ${-dias} dia(s)</span>`;
  if (dias <= 2) return `<span class="etiqueta etiqueta-aviso">${dias === 0 ? 'Devolver hoje' : `Faltam ${dias} dia(s)`}</span>`;
  return `<span class="etiqueta">Até ${h(formatarData(e.prazo))}</span>`;
}

// Livros com o n.º de exemplares emprestados agora
function catalogo(pesquisa = '') {
  return todos(
    `SELECT l.*, (SELECT COUNT(*) FROM emprestimos e WHERE e.livro_id = l.id AND e.devolvido_em IS NULL) AS emprestados
       FROM livros l
      WHERE (? = '' OR l.titulo LIKE ? OR l.autor LIKE ? OR l.cota LIKE ? OR l.isbn LIKE ?)
      ORDER BY l.titulo`,
    pesquisa,
    ...Array(4).fill(`%${pesquisa}%`)
  );
}

function emprestimos(condicao, ...params) {
  return todos(
    `SELECT e.*, l.titulo, l.autor, u.username, u.nome AS leitor, u.papel, t.nome AS turma
       FROM emprestimos e JOIN livros l ON l.id = e.livro_id JOIN utilizadores u ON u.id = e.utilizador_id
       LEFT JOIN alunos a ON a.utilizador_id = u.id LEFT JOIN turmas t ON t.id = a.turma_id
      WHERE ${condicao}`,
    ...params
  );
}

// ---------- Empréstimos ----------
get('/funcionario/biblioteca', async (req, res) => {
  if (!exigeCargo(req, res, 'biblioteca')) return;
  const livros = await catalogo();
  const abertos = await emprestimos('e.devolvido_em IS NULL ORDER BY e.prazo, e.id');
  const devolvidos = await emprestimos('e.devolvido_em IS NOT NULL ORDER BY e.devolvido_em DESC, e.id DESC LIMIT 10');
  const atrasados = abertos.filter((e) => e.prazo < hoje()).length;
  const disponiveis = livros.filter((l) => l.exemplares > l.emprestados);

  const linhaEmprestimo = (e, comBotao) => `<tr>
    <td><strong>${h(e.titulo)}</strong><small class="bloco texto-suave">${h(e.autor || '')}</small></td>
    <td>${h(e.leitor)}<small class="bloco texto-suave">${h(e.username)} · ${e.papel === 'aluno' ? h(e.turma || 'aluno') : 'professor(a)'}</small></td>
    <td>${h(formatarData(e.data))}</td>
    <td>${etiquetaPrazo(e)}</td>
    ${comBotao ? `<td class="direita"><form method="post" action="/funcionario/biblioteca/${e.id}/devolver"><button class="botao botao-secundario">Devolvido</button></form></td>` : ''}
  </tr>`;

  const conteudo = `
    <section class="estatisticas">
      <div class="estatistica"><span>Livros no catálogo</span><strong>${livros.length}</strong></div>
      <div class="estatistica"><span>Emprestados agora</span><strong>${abertos.length}</strong></div>
      <div class="estatistica ${atrasados ? 'destaque-aviso' : ''}"><span>Atrasados</span><strong>${atrasados}</strong></div>
    </section>
    <section class="cartao">
      <h2>Novo empréstimo</h2>
      ${
        disponiveis.length
          ? `<form method="post" action="/funcionario/biblioteca" class="grelha-form">
        <label>N.º de processo do leitor
          <input name="leitor" required maxlength="50" placeholder="ex.: 2450" autocomplete="off"></label>
        <label>Livro
          <select name="livro" required>${disponiveis
            .map((l) => `<option value="${l.id}">${h(l.titulo)} — ${l.exemplares - l.emprestados} de ${l.exemplares} disponível(eis)</option>`)
            .join('')}</select></label>
        <label>Devolver até
          <input type="date" name="prazo" value="${prazoPorOmissao()}" min="${hoje()}" required></label>
        <div class="barra-acoes coluna-toda"><button class="botao">Registar empréstimo</button>
          <span class="texto-suave">Alunos e professores. O leitor recebe uma notificação, se as tiver ligadas.</span></div>
      </form>`
          : vazio(livros.length ? 'Todos os exemplares estão emprestados.' : 'Ainda não há livros: acrescente-os no Catálogo.')
      }
    </section>
    <section class="cartao">
      <div class="cartao-topo"><h2>Por devolver</h2><span class="texto-suave">${abertos.length} empréstimo(s)</span></div>
      ${
        abertos.length
          ? `<div class="tabela-scroll"><table class="tabela"><thead><tr><th>Livro</th><th>Leitor</th><th>Emprestado</th><th>Prazo</th><th></th></tr></thead>
             <tbody>${abertos.map((e) => linhaEmprestimo(e, true)).join('')}</tbody></table></div>`
          : vazio('Não há livros emprestados.')
      }
    </section>
    <section class="cartao">
      <h2>Devolvidos recentemente</h2>
      ${
        devolvidos.length
          ? `<div class="tabela-scroll"><table class="tabela"><thead><tr><th>Livro</th><th>Leitor</th><th>Emprestado</th><th>Devolução</th></tr></thead>
             <tbody>${devolvidos.map((e) => linhaEmprestimo(e, false)).join('')}</tbody></table></div>`
          : vazio('Ainda não há devoluções.')
      }
    </section>`;
  res.html(pagina(req, { titulo: 'Empréstimos', ativo: 'biblioteca', subtitulo: 'Biblioteca da escola' }, conteudo));
});

post('/funcionario/biblioteca', async (req, res) => {
  if (!exigeCargo(req, res, 'biblioteca')) return;
  const voltar = '/funcionario/biblioteca';
  const username = String(req.corpo.leitor || '').trim();
  const prazo = String(req.corpo.prazo || '');
  const leitor = await um("SELECT id, nome FROM utilizadores WHERE username = ? AND papel IN ('aluno', 'professor')", username);
  const livro = await um(
    `SELECT l.*, (SELECT COUNT(*) FROM emprestimos e WHERE e.livro_id = l.id AND e.devolvido_em IS NULL) AS emprestados FROM livros l WHERE l.id = ?`,
    Number(req.corpo.livro) || 0
  );
  let erro = '';
  if (!leitor) erro = `Não há nenhum aluno ou professor com o n.º de processo "${username}".`;
  else if (!livro) erro = 'Escolha um livro.';
  else if (livro.emprestados >= livro.exemplares) erro = `Não há exemplares disponíveis de "${livro.titulo}".`;
  else if (!dataValida(prazo) || prazo < hoje()) erro = 'O prazo de devolução tem de ser uma data a partir de hoje.';
  if (erro) {
    req.flash('erro', erro);
    return res.redirecionar(voltar);
  }
  await executar(
    'INSERT INTO emprestimos (livro_id, utilizador_id, data, prazo, registado_por) VALUES (?, ?, ?, ?, ?)',
    livro.id,
    leitor.id,
    hoje(),
    prazo,
    req.utilizador.id
  );
  await notificar(leitor.id, { titulo: 'Empréstimo da biblioteca', corpo: `«${livro.titulo}» — devolver até ${formatarData(prazo)}.`, url: '/' });
  req.flash('sucesso', `«${livro.titulo}» emprestado a ${leitor.nome} até ${formatarData(prazo)}.`);
  res.redirecionar(voltar);
});

post('/funcionario/biblioteca/:id/devolver', async (req, res) => {
  if (!exigeCargo(req, res, 'biblioteca')) return;
  const r = await executar('UPDATE emprestimos SET devolvido_em = ? WHERE id = ? AND devolvido_em IS NULL', hoje(), req.params.id);
  req.flash(r.changes ? 'sucesso' : 'erro', r.changes ? 'Devolução registada.' : 'Este empréstimo já estava devolvido.');
  res.redirecionar('/funcionario/biblioteca');
});

// ---------- Catálogo ----------
function lerLivro(corpo) {
  const dados = {
    titulo: String(corpo.titulo || '').trim().replace(/\s+/g, ' ').slice(0, 200),
    autor: String(corpo.autor || '').trim().slice(0, 150),
    isbn: String(corpo.isbn || '').replace(/[^0-9Xx-]/g, '').slice(0, 20),
    cota: String(corpo.cota || '').trim().slice(0, 30),
    exemplares: Number(corpo.exemplares),
  };
  let erro = '';
  if (dados.titulo.length < 2) erro = 'Indique o título do livro.';
  else if (!Number.isInteger(dados.exemplares) || dados.exemplares < 1 || dados.exemplares > 500) erro = 'O n.º de exemplares tem de estar entre 1 e 500.';
  return { dados, erro };
}

get('/funcionario/livros', async (req, res) => {
  if (!exigeCargo(req, res, 'biblioteca')) return;
  const pesquisa = String(req.query.q || '').trim();
  const livros = await catalogo(pesquisa);
  const editar = req.query.editar ? livros.find((l) => String(l.id) === req.query.editar) : null;
  const l = editar || { exemplares: 1 };
  const conteudo = `
    <section class="cartao">
      <h2>${editar ? `Editar «${h(editar.titulo)}»` : 'Acrescentar livro'}</h2>
      <form method="post" action="${editar ? `/funcionario/livros/${editar.id}` : '/funcionario/livros'}" class="grelha-form">
        <label class="coluna-toda">Título * <input name="titulo" value="${h(l.titulo)}" required maxlength="200"></label>
        <label>Autor <input name="autor" value="${h(l.autor)}" maxlength="150"></label>
        <label>ISBN <input name="isbn" value="${h(l.isbn)}" maxlength="20" inputmode="numeric"></label>
        <label>Cota <input name="cota" value="${h(l.cota)}" maxlength="30" placeholder="ex.: 821.134.3 QUE"></label>
        <label>Exemplares * <input type="number" name="exemplares" value="${h(l.exemplares)}" min="1" max="500" required></label>
        <div class="barra-acoes coluna-toda"><button class="botao">${editar ? 'Guardar' : 'Acrescentar'}</button>
          ${editar ? '<a class="botao botao-secundario" href="/funcionario/livros">Cancelar</a>' : ''}</div>
      </form>
    </section>
    <section class="cartao">
      <form class="filtros" method="get">
        <label class="crescer">Pesquisar <input type="search" name="q" value="${h(pesquisa)}" placeholder="Título, autor, cota ou ISBN"></label>
        <button class="botao botao-secundario">Pesquisar</button>
        <span class="contador">${livros.length} livro(s)</span>
      </form>
      ${
        livros.length
          ? `<div class="tabela-scroll"><table class="tabela"><thead><tr><th>Título</th><th>Autor</th><th>Cota</th><th class="direita">Disponíveis</th><th></th></tr></thead>
        <tbody>${livros
          .map(
            (x) => `<tr><td><strong>${h(x.titulo)}</strong>${x.isbn ? `<small class="bloco texto-suave">ISBN ${h(x.isbn)}</small>` : ''}</td>
          <td>${h(x.autor || '—')}</td><td>${h(x.cota || '—')}</td>
          <td class="direita"><span class="etiqueta ${x.exemplares > x.emprestados ? 'etiqueta-ok' : 'etiqueta-aviso'}">${x.exemplares - x.emprestados} de ${x.exemplares}</span></td>
          <td class="direita"><a class="botao-texto" href="/funcionario/livros?editar=${x.id}">Editar</a>
            <form method="post" action="/funcionario/livros/${x.id}/apagar" data-confirmar="Apagar «${h(x.titulo)}» do catálogo?" style="display:inline"><button class="botao-texto">Apagar</button></form></td></tr>`
          )
          .join('')}</tbody></table></div>`
          : vazio(pesquisa ? 'Nenhum livro corresponde à pesquisa.' : 'O catálogo está vazio.')
      }
    </section>`;
  res.html(pagina(req, { titulo: 'Catálogo', ativo: 'livros', subtitulo: 'Livros da biblioteca' }, conteudo));
});

post('/funcionario/livros', async (req, res) => {
  if (!exigeCargo(req, res, 'biblioteca')) return;
  const { dados, erro } = lerLivro(req.corpo);
  if (erro) {
    req.flash('erro', erro);
    return res.redirecionar('/funcionario/livros');
  }
  await executar('INSERT INTO livros (titulo, autor, isbn, cota, exemplares) VALUES (?, ?, ?, ?, ?)', dados.titulo, dados.autor || null, dados.isbn || null, dados.cota || null, dados.exemplares);
  req.flash('sucesso', `«${dados.titulo}» acrescentado ao catálogo.`);
  res.redirecionar('/funcionario/livros');
});

post('/funcionario/livros/:id', async (req, res) => {
  if (!exigeCargo(req, res, 'biblioteca')) return;
  const { dados, erro } = lerLivro(req.corpo);
  const emprestados = (await um('SELECT COUNT(*) AS n FROM emprestimos WHERE livro_id = ? AND devolvido_em IS NULL', req.params.id)).n;
  const mensagem = erro || (dados.exemplares < emprestados ? `Há ${emprestados} exemplar(es) emprestado(s): não pode ficar com menos.` : '');
  if (mensagem) {
    req.flash('erro', mensagem);
    return res.redirecionar(`/funcionario/livros?editar=${req.params.id}`);
  }
  await executar(
    'UPDATE livros SET titulo = ?, autor = ?, isbn = ?, cota = ?, exemplares = ? WHERE id = ?',
    dados.titulo,
    dados.autor || null,
    dados.isbn || null,
    dados.cota || null,
    dados.exemplares,
    req.params.id
  );
  req.flash('sucesso', 'Livro atualizado.');
  res.redirecionar('/funcionario/livros');
});

post('/funcionario/livros/:id/apagar', async (req, res) => {
  if (!exigeCargo(req, res, 'biblioteca')) return;
  // Com empréstimos (mesmo antigos) não se apaga, para não perder o histórico
  if (await um('SELECT 1 FROM emprestimos WHERE livro_id = ?', req.params.id)) {
    req.flash('erro', 'Este livro já foi emprestado: não pode ser apagado (o histórico ficaria incompleto).');
  } else {
    await executar('DELETE FROM livros WHERE id = ?', req.params.id);
    req.flash('sucesso', 'Livro apagado.');
  }
  res.redirecionar('/funcionario/livros');
});

// ---------- Aluno: os seus empréstimos (cartão em Informações) ----------
async function cartaoEmprestimosAluno(utilizadorId) {
  const lista = await emprestimos('e.utilizador_id = ? AND e.devolvido_em IS NULL ORDER BY e.prazo', utilizadorId);
  if (!lista.length) return '';
  return `<section class="cartao">
    <div class="cartao-topo"><h2>Livros da biblioteca</h2><span class="texto-suave">${lista.length} por devolver</span></div>
    <ul class="lista-simples">${lista
      .map((e) => `<li><span><strong>${h(e.titulo)}</strong><small>${h(e.autor || '')}</small></span>${etiquetaPrazo(e)}</li>`)
      .join('')}</ul>
  </section>`;
}

// ---------- Secretaria: fichas dos alunos em PDF ----------
get('/funcionario/alunos', async (req, res) => {
  if (!exigeCargo(req, res, 'secretaria')) return;
  const turmas = await todos('SELECT id, nome FROM turmas ORDER BY nome');
  const turma = String(req.query.turma || '');
  const q = String(req.query.q || '').trim();
  const alunos = await todos(
    `SELECT a.id, a.nome, a.numero_processo, t.nome AS turma FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
      WHERE (? = '' OR a.turma_id = ?) AND (? = '' OR a.nome LIKE ? OR a.numero_processo LIKE ?)
      ORDER BY t.nome, a.nome LIMIT 300`,
    turma,
    turma,
    q,
    `%${q}%`,
    `%${q}%`
  );
  const conteudo = `
    <section class="cartao">
      <p class="texto-suave">Ficha de registo de cada aluno (módulos, classificações e assiduidade), pronta a imprimir e assinar.</p>
      <form class="filtros" method="get">
        <label>Turma <select name="turma" data-submeter><option value="">Todas</option>
          ${turmas.map((t) => `<option value="${t.id}"${selecionado(t.id, turma)}>${h(t.nome)}</option>`).join('')}</select></label>
        <label class="crescer">Pesquisar <input type="search" name="q" value="${h(q)}" placeholder="Nome ou n.º de processo"></label>
        <button class="botao botao-secundario">Filtrar</button>
      </form>
      ${
        alunos.length
          ? `<div class="tabela-scroll"><table class="tabela"><thead><tr><th>Aluno</th><th>Processo</th><th>Turma</th><th></th></tr></thead>
        <tbody>${alunos
          .map(
            (a) => `<tr><td>${h(a.nome)}</td><td>${h(a.numero_processo)}</td><td>${h(a.turma || '—')}</td>
          <td class="direita"><a class="botao botao-secundario" href="/funcionario/alunos/${a.id}/ficha.pdf" target="_blank">Ficha em PDF</a></td></tr>`
          )
          .join('')}</tbody></table></div>`
          : vazio('Nenhum aluno encontrado.')
      }
    </section>`;
  res.html(pagina(req, { titulo: 'Fichas dos alunos', ativo: 'fichas' }, conteudo));
});

get('/funcionario/alunos/:id/ficha.pdf', async (req, res) => {
  if (!exigeCargo(req, res, 'secretaria')) return;
  await enviarFichaPdf(res, req.params.id);
});

module.exports = { cartaoEmprestimosAluno, DIAS_EMPRESTIMO };
