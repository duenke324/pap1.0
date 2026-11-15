// Turmas, canais, grupos e mensagens da app Conversas.
// Um professor vê e gere os canais e grupos das turmas que leciona (mesma regra da Gestão Escolar):
//  - canal: para a turma (de uma disciplina ou com nome livre), normalmente com todos os alunos;
//  - grupo: só com os alunos que o professor escolher (ex.: um grupo de trabalho).
// Um aluno só vê e escreve nos canais e grupos aos quais foi adicionado.
const { get, post } = require('../src/lib/servidor');
// (canalAcessivel, lecionaTurma e turmasDoProfessor também são usados pelas tarefas: ver tarefas.js)
const { todos, um, executar } = require('../src/db');
const { h } = require('../src/lib/util');
const { pagina, vazio, ecraVazioDecorado, mensagemHtml, icone } = require('./vistas');
const { apagarFicheiroTarefa } = require('./ficheiros');

function lecionaTurma(professorId, turmaId) {
  return um('SELECT 1 FROM horario WHERE professor_id = ? AND turma_id = ? AND ativo = 1', professorId, turmaId).then(Boolean);
}

function turmasDoProfessor(professorId) {
  return todos(
    `SELECT DISTINCT t.* FROM turmas t JOIN horario hr ON hr.turma_id = t.id
      WHERE hr.professor_id = ? AND hr.ativo = 1 ORDER BY t.nome`,
    professorId
  );
}

// Disciplinas que este professor leciona nesta turma e ainda não têm canal — para escolher ao
// criar um canal novo (um canal = uma disciplina, só pode haver um por disciplina por turma).
function disciplinasDisponiveis(professorId, turmaId) {
  return todos(
    `SELECT DISTINCT d.id, d.nome, d.sigla
       FROM disciplinas d JOIN horario h ON h.disciplina_id = d.id
      WHERE h.professor_id = ? AND h.turma_id = ? AND h.ativo = 1
        AND d.id NOT IN (SELECT disciplina_id FROM canais WHERE turma_id = ? AND disciplina_id IS NOT NULL)
      ORDER BY d.nome`,
    professorId,
    turmaId,
    turmaId
  );
}

// Não lidas: mensagens do canal com id maior do que a última lida por este utilizador
// (canal_leituras.ultima_leitura_mensagem_id; 0/sem linha = nunca abriu o canal = tudo por ler).
const SUBCONSULTA_NAO_LIDAS = `
  (SELECT COUNT(*) FROM canal_mensagens cm_nl
     WHERE cm_nl.canal_id = c.id AND cm_nl.id > COALESCE(cl.ultima_leitura_mensagem_id, 0)) AS nao_lidas`;

// Árvore para a barra lateral: [{ turma, podeGerir, canais: [...] }]
async function arvoreDoUtilizador(req) {
  if (req.professor) {
    const turmas = await turmasDoProfessor(req.professor.id);
    return Promise.all(
      turmas.map(async (turma) => ({
        turma,
        podeGerir: true,
        canais: await todos(
          `SELECT c.*, ${SUBCONSULTA_NAO_LIDAS}
             FROM canais c LEFT JOIN canal_leituras cl ON cl.canal_id = c.id AND cl.utilizador_id = ?
            WHERE c.turma_id = ? ORDER BY c.criado_em`,
          req.utilizador.id,
          turma.id
        ),
      }))
    );
  }
  if (req.aluno) {
    const turmas = await todos(
      `SELECT DISTINCT t.* FROM canal_membros cm JOIN canais c ON c.id = cm.canal_id JOIN turmas t ON t.id = c.turma_id
        WHERE cm.aluno_id = ? ORDER BY t.nome`,
      req.aluno.id
    );
    return Promise.all(
      turmas.map(async (turma) => ({
        turma,
        podeGerir: false,
        canais: await todos(
          `SELECT c.*, ${SUBCONSULTA_NAO_LIDAS}
             FROM canais c JOIN canal_membros membro ON membro.canal_id = c.id
             LEFT JOIN canal_leituras cl ON cl.canal_id = c.id AND cl.utilizador_id = ?
            WHERE c.turma_id = ? AND membro.aluno_id = ? ORDER BY c.criado_em`,
          req.utilizador.id,
          turma.id,
          req.aluno.id
        ),
      }))
    );
  }
  return [];
}

function ultimoIdDoCanal(canalId) {
  return um('SELECT MAX(id) AS id FROM canal_mensagens WHERE canal_id = ?', canalId).then((l) => l?.id || 0);
}

// Upsert atómico: sobe ultima_leitura_mensagem_id, nunca desce (duas abas a marcar como lido
// ao mesmo tempo não se podem sobrepor uma à outra com um valor mais antigo).
function marcarComoLido(canalId, utilizadorId, mensagemId) {
  if (!mensagemId) return Promise.resolve();
  return executar(
    `INSERT INTO canal_leituras (canal_id, utilizador_id, ultima_leitura_mensagem_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE ultima_leitura_mensagem_id = GREATEST(ultima_leitura_mensagem_id, VALUES(ultima_leitura_mensagem_id))`,
    canalId,
    utilizadorId,
    mensagemId
  );
}

// Canal com dados da turma, só se este utilizador tiver acesso (caso contrário null)
async function canalAcessivel(req, canalId) {
  const canal = await um('SELECT c.*, t.nome AS turma FROM canais c JOIN turmas t ON t.id = c.turma_id WHERE c.id = ?', canalId);
  if (!canal) return null;
  if (req.professor) return (await lecionaTurma(req.professor.id, canal.turma_id)) ? canal : null;
  if (req.aluno) {
    const membro = await um('SELECT 1 FROM canal_membros WHERE canal_id = ? AND aluno_id = ?', canal.id, req.aluno.id);
    return membro ? canal : null;
  }
  return null;
}

function mensagensDoCanal(canalId, apos = 0) {
  return todos(
    `SELECT cm.id, cm.utilizador_id, cm.texto, cm.criado_em, u.nome AS autor, u.papel AS autor_papel
       FROM canal_mensagens cm LEFT JOIN utilizadores u ON u.id = cm.utilizador_id
      WHERE cm.canal_id = ? AND cm.id > ? ORDER BY cm.id ASC`,
    canalId,
    apos
  );
}

function pesquisarMensagensDoCanal(canalId, termo) {
  return todos(
    `SELECT cm.id, cm.utilizador_id, cm.texto, cm.criado_em, u.nome AS autor, u.papel AS autor_papel
       FROM canal_mensagens cm LEFT JOIN utilizadores u ON u.id = cm.utilizador_id
      WHERE cm.canal_id = ? AND cm.texto LIKE ? ORDER BY cm.id ASC`,
    canalId,
    `%${termo}%`
  );
}

// Cabeçalho do canal: contagem de alunos + pesquisa de mensagens (funciona sem JavaScript —
// é um formulário GET normal, tal como a pesquisa de alunos em corpoGestao).
function cabecalhoCanalExtra(canal, numAlunos, pesquisa) {
  const base = `/turma/${canal.turma_id}/canal/${canal.id}`;
  return `
    <form class="pesquisa-canal" method="get" action="${base}" role="search">
      <input type="search" name="pesquisa" value="${h(pesquisa)}" placeholder="Pesquisar mensagens…" aria-label="Pesquisar mensagens neste canal">
      <button class="botao-icone" type="submit" aria-label="Pesquisar">${icone('pesquisar')}</button>
      ${pesquisa ? `<a class="botao-texto" href="${base}">Limpar</a>` : ''}
    </form>
    <span class="contagem-membros">${numAlunos} aluno${numAlunos === 1 ? '' : 's'}</span>`;
}

async function registarMensagem(req, res, canal, voltar) {
  const querJson = (req.headers.accept || '').includes('application/json');
  const texto = String(req.corpo.texto || '').trim();
  let erro = '';
  if (!texto) erro = 'Escreva uma mensagem.';
  else if (texto.length > 2000) erro = 'Mensagem demasiado longa (máx. 2000 carateres).';
  if (erro) return querJson ? res.json({ ok: false, erro }, 422) : res.redirecionar(voltar);

  const r = await executar('INSERT INTO canal_mensagens (canal_id, utilizador_id, texto) VALUES (?, ?, ?)', canal.id, req.utilizador.id, texto);
  // Quem envia já viu a própria mensagem — conta logo como lida, para não aparecer como não
  // lida para si próprio assim que sair do canal.
  await marcarComoLido(canal.id, req.utilizador.id, r.lastInsertRowid);
  if (querJson) {
    const [nova] = await mensagensDoCanal(canal.id, r.lastInsertRowid - 1);
    return res.json({ ok: true, id: nova.id, html: mensagemHtml(nova, req.utilizador.id) });
  }
  res.redirecionar(voltar);
}

function corpoGestao(canal, membros, disponiveis, pesquisa) {
  const tipo = canal.tipo === 'grupo' ? 'grupo' : 'canal';
  return `<details class="gestao">
    <summary>Gerir ${tipo}</summary>
    <div class="gestao-corpo">
      <div class="gestao-bloco">
        <h3>Alunos no ${tipo} (${membros.length})</h3>
        ${
          membros.length
            ? `<ul class="lista-membros">${membros
                .map(
                  (a) => `<li><span>${h(a.nome)}</span>
              <form method="post" action="/turma/${canal.turma_id}/canal/${canal.id}/membros/${a.id}/remover"><button class="botao-texto">Remover</button></form></li>`
                )
                .join('')}</ul>`
            : vazio('Ainda sem alunos.')
        }
      </div>
      <div class="gestao-bloco">
        <h3>Adicionar aluno</h3>
        <form class="linha" method="get" action="/turma/${canal.turma_id}/canal/${canal.id}">
          <input type="search" name="q" value="${h(pesquisa)}" placeholder="Nome ou n.º de processo">
          <button class="botao botao-secundario">Procurar</button>
        </form>
        ${
          pesquisa
            ? disponiveis.length
              ? `<ul class="lista-membros">${disponiveis
                  .map(
                    (a) => `<li><span>${h(a.nome)} <small class="texto-suave">Proc. ${h(a.numero_processo)}</small></span>
                  <form method="post" action="/turma/${canal.turma_id}/canal/${canal.id}/membros?q=${encodeURIComponent(pesquisa)}">
                    <input type="hidden" name="aluno_id" value="${a.id}"><button class="botao-texto">Adicionar</button></form></li>`
                  )
                  .join('')}</ul>`
              : vazio(`Nenhum aluno encontrado (ou já está no ${tipo}).`)
            : ''
        }
        <form method="post" action="/turma/${canal.turma_id}/canal/${canal.id}/membros/todos">
          <button class="botao-texto">Adicionar todos os alunos da turma</button></form>
      </div>
      <div class="gestao-bloco">
        <h3>Apagar ${tipo}</h3>
        <p class="texto-suave">Apaga as mensagens e as tarefas deste ${tipo}. Não se pode desfazer.</p>
        <form method="post" action="/turma/${canal.turma_id}/canal/${canal.id}/apagar" data-confirmar="Apagar o ${tipo} &quot;${h(canal.nome)}&quot;, com todas as mensagens e tarefas? Não se pode desfazer.">
          <button class="botao botao-perigo">Apagar ${tipo}</button></form>
      </div>
    </div>
  </details>`;
}

get('/', async (req, res) => {
  const arvore = await arvoreDoUtilizador(req);
  const primeiraComCanal = arvore.find((g) => g.canais.length);
  if (primeiraComCanal) return res.redirecionar(`/turma/${primeiraComCanal.turma.id}/canal/${primeiraComCanal.canais[0].id}`);
  if (arvore.length) return res.redirecionar(`/turma/${arvore[0].turma.id}`);
  res.html(
    pagina(
      req,
      { secaoAtiva: 'equipas', arvore, titulo: 'Conversas' },
      ecraVazioDecorado(req.professor ? 'Ainda não tem turmas atribuídas.' : 'Ainda não foi adicionado a nenhum canal.')
    )
  );
});

get('/turma/:id', async (req, res) => {
  const turmaId = Number(req.params.id);
  if (!req.professor || !(await lecionaTurma(req.professor.id, turmaId))) return res.redirecionar('/');
  const turma = await um('SELECT * FROM turmas WHERE id = ?', turmaId);
  if (!turma) return res.redirecionar('/');
  const arvore = await arvoreDoUtilizador(req);
  const disponiveis = await disciplinasDisponiveis(req.professor.id, turmaId);
  const alunos = await todos('SELECT id, nome, numero_processo FROM alunos WHERE turma_id = ? ORDER BY nome', turmaId);

  const conteudo = `<div class="criar-pagina">
    <section class="cartao-criar">
      <h2><span class="hash">#</span> Novo canal</h2>
      <p class="texto-suave">Para a turma toda: avisos, dúvidas e tarefas de uma disciplina, ou um canal geral.</p>
      <form class="form-criar" method="post" action="/turma/${turma.id}/canais">
        ${
          disponiveis.length
            ? `<label>Disciplina
                <select name="disciplina_id">
                  ${disponiveis.map((d) => `<option value="${d.id}">${h(d.nome)}</option>`).join('')}
                  <option value="">Outro (nome livre)…</option>
                </select></label>`
            : '<input type="hidden" name="disciplina_id" value="">'
        }
        <label>Nome do canal <small class="texto-suave">${disponiveis.length ? '(só se escolher "Outro")' : '(ex.: Geral, Visita de estudo)'}</small>
          <input name="nome" maxlength="80" placeholder="Ex.: Geral"${disponiveis.length ? '' : ' required'}></label>
        <label class="caixa"><input type="checkbox" name="todos" value="1" checked> Adicionar já todos os alunos da turma (${alunos.length})</label>
        <button class="botao">Criar canal</button>
      </form>
    </section>
    <section class="cartao-criar">
      <h2>${icone('grupo')} Novo grupo</h2>
      <p class="texto-suave">Só com os alunos que escolher — por exemplo, um grupo de trabalho. Os outros alunos não o veem.</p>
      <form class="form-criar" method="post" action="/turma/${turma.id}/grupos">
        <label>Nome do grupo <input name="nome" maxlength="80" placeholder="Ex.: Grupo 1 — Projeto" required></label>
        ${
          alunos.length
            ? `<fieldset class="escolher-alunos">
                <legend>Alunos do grupo</legend>
                <label class="caixa selecionar-todos"><input type="checkbox" data-selecionar-todos> Selecionar todos</label>
                ${alunos.map((a) => `<label class="caixa"><input type="checkbox" name="alunos" value="${a.id}" data-selecionar> ${h(a.nome)} <small class="texto-suave">Proc. ${h(a.numero_processo)}</small></label>`).join('')}
              </fieldset>`
            : vazio('Esta turma ainda não tem alunos.')
        }
        <button class="botao"${alunos.length ? '' : ' disabled'}>Criar grupo</button>
      </form>
    </section>
  </div>`;
  res.html(pagina(req, { secaoAtiva: 'equipas', arvore, titulo: turma.nome, subtitulo: 'Novo canal ou grupo' }, conteudo));
});

// Adiciona ao canal/grupo os alunos indicados, desde que sejam da turma do canal
async function adicionarAlunos(canal, ids) {
  const lista = [].concat(ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!lista.length) return 0;
  const validos = await todos(`SELECT id FROM alunos WHERE turma_id = ? AND id IN (${lista.map(() => '?').join(',')})`, canal.turma_id, ...lista);
  for (const a of validos) await executar('INSERT IGNORE INTO canal_membros (canal_id, aluno_id) VALUES (?, ?)', canal.id, a.id);
  return validos.length;
}

async function nomeJaUsado(turmaId, nome) {
  return Boolean(await um('SELECT 1 FROM canais WHERE turma_id = ? AND nome = ?', turmaId, nome));
}

post('/turma/:id/canais', async (req, res) => {
  const turmaId = Number(req.params.id);
  if (!req.professor || !(await lecionaTurma(req.professor.id, turmaId))) return res.redirecionar('/');
  const todosAlunos = async (canalId) => {
    if (req.corpo.todos) {
      const alunos = await todos('SELECT id FROM alunos WHERE turma_id = ?', turmaId);
      await adicionarAlunos({ id: canalId, turma_id: turmaId }, alunos.map((a) => a.id));
    }
  };
  const disciplinaId = Number(req.corpo.disciplina_id);
  // Canal com nome livre (sem disciplina)
  if (!disciplinaId) {
    const nome = String(req.corpo.nome || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!nome) {
      req.flash('erro', 'Escreva o nome do canal.');
      return res.redirecionar(`/turma/${turmaId}`);
    }
    if (await nomeJaUsado(turmaId, nome)) {
      req.flash('erro', `Já existe um canal ou grupo "${nome}" nesta turma.`);
      return res.redirecionar(`/turma/${turmaId}`);
    }
    const r = await executar("INSERT INTO canais (turma_id, nome, tipo, criado_por) VALUES (?, ?, 'canal', ?)", turmaId, nome, req.professor.id);
    await todosAlunos(r.lastInsertRowid);
    req.flash('sucesso', `Canal "${nome}" criado.`);
    return res.redirecionar(`/turma/${turmaId}/canal/${r.lastInsertRowid}`);
  }
  // Revalida do lado do servidor: tem de ser uma disciplina que este professor dá nesta turma,
  // e que ainda não tenha canal — nunca confiar só no que veio do formulário.
  const disciplina = await um(
    `SELECT d.* FROM disciplinas d JOIN horario h ON h.disciplina_id = d.id
      WHERE d.id = ? AND h.professor_id = ? AND h.turma_id = ? AND h.ativo = 1 LIMIT 1`,
    disciplinaId,
    req.professor.id,
    turmaId
  );
  if (!disciplina) return res.redirecionar(`/turma/${turmaId}`);
  const jaExiste = await um('SELECT 1 FROM canais WHERE turma_id = ? AND disciplina_id = ?', turmaId, disciplinaId);
  if (jaExiste) return res.redirecionar(`/turma/${turmaId}`);
  const r = await executar(
    "INSERT INTO canais (turma_id, disciplina_id, nome, tipo, criado_por) VALUES (?, ?, ?, 'canal', ?)",
    turmaId,
    disciplinaId,
    disciplina.nome,
    req.professor.id
  );
  await todosAlunos(r.lastInsertRowid);
  req.flash('sucesso', `Canal "${disciplina.nome}" criado.`);
  res.redirecionar(`/turma/${turmaId}/canal/${r.lastInsertRowid}`);
});

post('/turma/:id/grupos', async (req, res) => {
  const turmaId = Number(req.params.id);
  if (!req.professor || !(await lecionaTurma(req.professor.id, turmaId))) return res.redirecionar('/');
  const nome = String(req.corpo.nome || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  let erro = '';
  if (!nome) erro = 'Escreva o nome do grupo.';
  else if (!req.corpo.alunos) erro = 'Escolha pelo menos um aluno para o grupo.';
  else if (await nomeJaUsado(turmaId, nome)) erro = `Já existe um canal ou grupo "${nome}" nesta turma.`;
  if (erro) {
    req.flash('erro', erro);
    return res.redirecionar(`/turma/${turmaId}`);
  }
  const r = await executar("INSERT INTO canais (turma_id, nome, tipo, criado_por) VALUES (?, ?, 'grupo', ?)", turmaId, nome, req.professor.id);
  const n = await adicionarAlunos({ id: r.lastInsertRowid, turma_id: turmaId }, req.corpo.alunos);
  req.flash('sucesso', `Grupo "${nome}" criado com ${n} aluno(s).`);
  res.redirecionar(`/turma/${turmaId}/canal/${r.lastInsertRowid}`);
});

get('/turma/:turmaId/canal/:canalId', async (req, res) => {
  const canal = await canalAcessivel(req, req.params.canalId);
  if (!canal || canal.turma_id !== Number(req.params.turmaId)) return res.redirecionar('/');

  // Marca como lido antes de montar a árvore, para o canal que está a abrir já aparecer sem
  // nenhuma não lida na barra lateral desta mesma página (e não só na próxima navegação).
  await marcarComoLido(canal.id, req.utilizador.id, await ultimoIdDoCanal(canal.id));
  const arvore = await arvoreDoUtilizador(req);
  const pesquisaMensagens = String(req.query.pesquisa || '').trim();
  const listaMensagens = pesquisaMensagens ? await pesquisarMensagensDoCanal(canal.id, pesquisaMensagens) : await mensagensDoCanal(canal.id);
  const mensagensHtml = listaMensagens.map((m) => mensagemHtml(m, req.utilizador.id)).join('');
  const { n: numAlunos } = await um('SELECT COUNT(*) AS n FROM canal_membros WHERE canal_id = ?', canal.id);

  let gestaoHtml = '';
  if (req.professor) {
    const membros = await todos(
      `SELECT a.id, a.nome, a.numero_processo FROM canal_membros cm JOIN alunos a ON a.id = cm.aluno_id
        WHERE cm.canal_id = ? ORDER BY a.nome`,
      canal.id
    );
    const pesquisa = String(req.query.q || '').trim();
    const disponiveis = pesquisa
      ? await todos(
          `SELECT a.id, a.nome, a.numero_processo FROM alunos a
            WHERE a.turma_id = ? AND (a.nome LIKE ? OR a.numero_processo LIKE ?)
              AND a.id NOT IN (SELECT aluno_id FROM canal_membros WHERE canal_id = ?)
            ORDER BY a.nome LIMIT 20`,
          canal.turma_id,
          `%${pesquisa}%`,
          `%${pesquisa}%`,
          canal.id
        )
      : [];
    gestaoHtml = corpoGestao(canal, membros, disponiveis, pesquisa);
  }

  const conteudo = `
    ${gestaoHtml}
    <div class="corpo-canal corpo-publicacoes" data-canal data-canal-api="/turma/${canal.turma_id}/canal/${canal.id}">
      <div class="mensagens" data-canal-mensagens role="log" aria-live="polite" aria-label="Mensagens do canal">${
        mensagensHtml || vazio(pesquisaMensagens ? `Nenhuma mensagem encontrada para "${pesquisaMensagens}".` : 'Ainda não há mensagens. Seja o primeiro a escrever.')
      }</div>
      <form class="compositor" data-canal-form method="post" action="/turma/${canal.turma_id}/canal/${canal.id}/mensagens">
        <div class="compositor-caixa">
          <textarea name="texto" maxlength="2000" required placeholder="Escreva uma mensagem" aria-label="Mensagem"></textarea>
          <button class="botao-enviar" aria-label="Enviar mensagem" title="Enviar mensagem">${icone('enviar')}</button>
        </div>
      </form>
    </div>`;
  res.html(
    pagina(
      req,
      {
        secaoAtiva: 'equipas',
        arvore,
        canalAtivoId: canal.id,
        titulo: canal.nome,
        subtitulo: canal.turma,
        distintivoTitulo: canal.tipo === 'grupo' ? '<span class="distintivo-grupo">Grupo</span>' : '',
        cabecalhoExtra: cabecalhoCanalExtra(canal, numAlunos, pesquisaMensagens),
        separadores: [
          ['Publicações', '', true],
          ['Tarefas', `/tarefas?canal=${canal.id}`, false],
        ],
      },
      conteudo
    )
  );
});

post('/turma/:turmaId/canal/:canalId/mensagens', async (req, res) => {
  const canal = await canalAcessivel(req, req.params.canalId);
  if (!canal) return res.redirecionar('/');
  registarMensagem(req, res, canal, `/turma/${canal.turma_id}/canal/${canal.id}`);
});

get('/turma/:turmaId/canal/:canalId/mensagens', async (req, res) => {
  const canal = await canalAcessivel(req, req.params.canalId);
  if (!canal) return res.json({ ok: false }, 403);
  const apos = Number(req.query.apos) || 0;
  const novas = await mensagensDoCanal(canal.id, apos);
  // Quem está a sondar o canal (página aberta) está a vê-lo — conta como lido até à última.
  if (novas.length) await marcarComoLido(canal.id, req.utilizador.id, novas[novas.length - 1].id);
  res.json({ ok: true, mensagens: novas.map((m) => ({ id: m.id, html: mensagemHtml(m, req.utilizador.id) })) });
});

// Nota de segurança: a autorização usa sempre canal.turma_id (vindo da BD através de
// canalAcessivel), nunca o :turmaId do URL diretamente — caso contrário um professor podia gerir
// os membros de um canal de uma turma que não leciona, bastando pôr na URL uma turma sua a seguir
// a um canalId de outra turma (os dois parâmetros do URL não têm de concordar entre si).
post('/turma/:turmaId/canal/:canalId/membros', async (req, res) => {
  const canal = await canalAcessivel(req, req.params.canalId);
  if (!req.professor || !canal || canal.turma_id !== Number(req.params.turmaId)) return res.redirecionar('/');
  const alunoId = Number(req.corpo.aluno_id);
  const aluno = await um('SELECT id FROM alunos WHERE id = ? AND turma_id = ?', alunoId, canal.turma_id);
  if (aluno) await executar('INSERT IGNORE INTO canal_membros (canal_id, aluno_id) VALUES (?, ?)', canal.id, aluno.id);
  const volta = req.query.q ? `?q=${encodeURIComponent(req.query.q)}` : '';
  res.redirecionar(`/turma/${canal.turma_id}/canal/${canal.id}${volta}`);
});

post('/turma/:turmaId/canal/:canalId/membros/todos', async (req, res) => {
  const canal = await canalAcessivel(req, req.params.canalId);
  if (!req.professor || !canal || canal.turma_id !== Number(req.params.turmaId)) return res.redirecionar('/');
  const alunos = await todos('SELECT id FROM alunos WHERE turma_id = ?', canal.turma_id);
  await adicionarAlunos(canal, alunos.map((a) => a.id));
  req.flash('sucesso', 'Todos os alunos da turma estão agora neste ' + (canal.tipo === 'grupo' ? 'grupo.' : 'canal.'));
  res.redirecionar(`/turma/${canal.turma_id}/canal/${canal.id}`);
});

post('/turma/:turmaId/canal/:canalId/apagar', async (req, res) => {
  const canal = await canalAcessivel(req, req.params.canalId);
  if (!req.professor || !canal || canal.turma_id !== Number(req.params.turmaId)) return res.redirecionar('/');
  // Os ficheiros das tarefas ficam no disco: apagam-se antes (as linhas apagam-se em cascata)
  const ficheiros = await todos(
    `SELECT ficheiro FROM tarefas WHERE canal_id = ? AND ficheiro IS NOT NULL
     UNION ALL SELECT e.ficheiro FROM tarefa_entregas e JOIN tarefas t ON t.id = e.tarefa_id WHERE t.canal_id = ? AND e.ficheiro IS NOT NULL`,
    canal.id,
    canal.id
  );
  await executar('DELETE FROM canais WHERE id = ?', canal.id);
  ficheiros.forEach((l) => apagarFicheiroTarefa(l.ficheiro));
  req.flash('sucesso', `"${canal.nome}" foi apagado.`);
  res.redirecionar(`/turma/${canal.turma_id}`);
});

post('/turma/:turmaId/canal/:canalId/membros/:alunoId/remover', async (req, res) => {
  const canal = await canalAcessivel(req, req.params.canalId);
  if (!req.professor || !canal || canal.turma_id !== Number(req.params.turmaId)) return res.redirecionar('/');
  await executar('DELETE FROM canal_membros WHERE canal_id = ? AND aluno_id = ?', canal.id, req.params.alunoId);
  res.redirecionar(`/turma/${canal.turma_id}/canal/${canal.id}`);
});

module.exports = { canalAcessivel, lecionaTurma, turmasDoProfessor, arvoreDoUtilizador };
