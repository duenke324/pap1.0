// Mensagens privadas (1 para 1) da app Conversas.
// Quem pode falar com quem (reforçado sempre do lado do servidor, nunca só no que vem do pedido):
//  - professor ↔ professor: sempre, são colegas.
//  - professor ↔ aluno: só se o professor lecionar a turma desse aluno.
//  - aluno ↔ aluno: não — mantém a mesma lógica do resto da app, em que é sempre um professor
//    a controlar quem fala com quem (cria canais, adiciona membros); conversas diretas entre
//    alunos ficariam fora desse controlo.
const { get, post } = require('../src/lib/servidor');
const { todos, um, executar } = require('../src/db');
const { h } = require('../src/lib/util');
const { pagina, vazio, ecraVazioDecorado, avatarHtml, mensagemHtml, icone } = require('./vistas');

// Pessoas com quem req.utilizador tem permissão para iniciar uma conversa.
function pessoasPermitidas(req) {
  if (req.professor) {
    return Promise.all([
      todos(
        `SELECT u.id AS utilizador_id, p.nome, 'professor' AS papel
           FROM professores p JOIN utilizadores u ON u.id = p.utilizador_id
          WHERE p.id != ? ORDER BY p.nome`,
        req.professor.id
      ),
      todos(
        `SELECT DISTINCT u.id AS utilizador_id, a.nome, 'aluno' AS papel
           FROM alunos a JOIN utilizadores u ON u.id = a.utilizador_id
           JOIN horario h ON h.turma_id = a.turma_id AND h.ativo = 1
          WHERE h.professor_id = ? ORDER BY a.nome`,
        req.professor.id
      ),
    ]).then(([colegas, alunos]) => [...colegas, ...alunos]);
  }
  if (req.aluno) {
    return todos(
      `SELECT DISTINCT u.id AS utilizador_id, p.nome, 'professor' AS papel
         FROM professores p JOIN utilizadores u ON u.id = p.utilizador_id
         JOIN horario h ON h.professor_id = p.id AND h.ativo = 1
        WHERE h.turma_id = ? ORDER BY p.nome`,
      req.aluno.turma_id
    );
  }
  return Promise.resolve([]);
}

function conversasDoUtilizador(utilizadorId) {
  return todos(
    `SELECT cd.id,
            CASE WHEN cd.utilizador_a_id = ? THEN cd.utilizador_b_id ELSE cd.utilizador_a_id END AS outro_id,
            u.nome AS outro_nome, u.papel AS outro_papel
       FROM conversas_diretas cd
       JOIN utilizadores u ON u.id = CASE WHEN cd.utilizador_a_id = ? THEN cd.utilizador_b_id ELSE cd.utilizador_a_id END
      WHERE cd.utilizador_a_id = ? OR cd.utilizador_b_id = ?
      ORDER BY cd.id DESC`,
    utilizadorId,
    utilizadorId,
    utilizadorId,
    utilizadorId
  );
}

// Conversa com o nome/papel da outra pessoa, só se req.utilizador for participante (caso
// contrário null) — nunca confiar só no :id do URL.
async function conversaAcessivel(req, conversaId) {
  const c = await um('SELECT * FROM conversas_diretas WHERE id = ?', conversaId);
  if (!c) return null;
  const meuId = req.utilizador.id;
  if (c.utilizador_a_id !== meuId && c.utilizador_b_id !== meuId) return null;
  const outroId = c.utilizador_a_id === meuId ? c.utilizador_b_id : c.utilizador_a_id;
  const outro = await um('SELECT nome, papel FROM utilizadores WHERE id = ?', outroId);
  return { ...c, outroId, outroNome: outro?.nome || 'Utilizador removido', outroPapel: outro?.papel };
}

function mensagensDaConversa(conversaId, apos = 0) {
  return todos(
    `SELECT cdm.id, cdm.utilizador_id, cdm.texto, cdm.criado_em, u.nome AS autor, u.papel AS autor_papel
       FROM conversa_direta_mensagens cdm LEFT JOIN utilizadores u ON u.id = cdm.utilizador_id
      WHERE cdm.conversa_id = ? AND cdm.id > ? ORDER BY cdm.id ASC`,
    conversaId,
    apos
  );
}

// utilizador_a_id é sempre o menor dos dois ids, para o par ter sempre uma única linha
// (ver comentário na tabela, em database/escola.sql).
async function encontrarOuCriarConversa(uId1, uId2) {
  const [a, b] = uId1 < uId2 ? [uId1, uId2] : [uId2, uId1];
  const existente = await um('SELECT * FROM conversas_diretas WHERE utilizador_a_id = ? AND utilizador_b_id = ?', a, b);
  if (existente) return existente;
  try {
    const r = await executar('INSERT INTO conversas_diretas (utilizador_a_id, utilizador_b_id) VALUES (?, ?)', a, b);
    return { id: r.lastInsertRowid, utilizador_a_id: a, utilizador_b_id: b };
  } catch (erro) {
    // Dois pedidos em simultâneo a criar a mesma conversa: o segundo perde a corrida da
    // chave única, mas a conversa já existe — basta devolvê-la.
    if (erro.code === 'ER_DUP_ENTRY') return um('SELECT * FROM conversas_diretas WHERE utilizador_a_id = ? AND utilizador_b_id = ?', a, b);
    throw erro;
  }
}

function corpoNovaConversa(pessoas, pesquisa) {
  const professores = pessoas.filter((p) => p.papel === 'professor');
  const alunos = pessoas.filter((p) => p.papel === 'aluno');
  const grupo = (titulo, lista) =>
    lista.length
      ? `<div class="nova-conversa-grupo">
          <h3>${titulo}</h3>
          <div class="nova-conversa-lista">
            ${lista
              .map(
                (p) => `<form method="post" action="/mensagens/nova">
                <input type="hidden" name="utilizador_id" value="${p.utilizador_id}">
                <button type="submit" class="pessoa-item">${avatarHtml(p.nome)}<span>${h(p.nome)}</span></button>
              </form>`
              )
              .join('')}
          </div>
        </div>`
      : '';
  return `<div class="nova-conversa">
    <form class="linha nova-conversa-pesquisa" method="get" action="/mensagens/nova">
      <input type="search" name="q" value="${h(pesquisa)}" placeholder="Procurar por nome…" autofocus>
      <button class="botao botao-secundario">Procurar</button>
    </form>
    ${grupo('Professores', professores)}
    ${grupo('Alunos', alunos)}
    ${!professores.length && !alunos.length ? vazio('Nenhuma pessoa encontrada.') : ''}
  </div>`;
}

get('/mensagens', async (req, res) => {
  const conversas = await conversasDoUtilizador(req.utilizador.id);
  res.html(
    pagina(
      req,
      { secaoAtiva: 'mensagens', conversas, titulo: 'Mensagens' },
      ecraVazioDecorado('Escolha uma conversa à esquerda ou inicie uma nova.', '<p><a class="botao" href="/mensagens/nova">Nova conversa</a></p>')
    )
  );
});

get('/mensagens/nova', async (req, res) => {
  const pesquisa = String(req.query.q || '').trim();
  const alvo = pesquisa.toLowerCase();
  const pessoas = (await pessoasPermitidas(req)).filter((p) => !alvo || p.nome.toLowerCase().includes(alvo));
  const conversas = await conversasDoUtilizador(req.utilizador.id);
  res.html(pagina(req, { secaoAtiva: 'mensagens', conversas, titulo: 'Nova conversa' }, corpoNovaConversa(pessoas, pesquisa)));
});

post('/mensagens/nova', async (req, res) => {
  const outroId = Number(req.corpo.utilizador_id);
  const permitido = (await pessoasPermitidas(req)).some((p) => p.utilizador_id === outroId);
  if (!permitido) return res.redirecionar('/mensagens');
  const conversa = await encontrarOuCriarConversa(req.utilizador.id, outroId);
  res.redirecionar(`/mensagens/${conversa.id}`);
});

get('/mensagens/:id', async (req, res) => {
  const conversa = await conversaAcessivel(req, req.params.id);
  if (!conversa) return res.redirecionar('/mensagens');

  const conversas = await conversasDoUtilizador(req.utilizador.id);
  const mensagensHtml = (await mensagensDaConversa(conversa.id)).map((m) => mensagemHtml(m, req.utilizador.id)).join('');
  const conteudo = `
    <div class="corpo-canal" data-canal data-canal-api="/mensagens/${conversa.id}">
      <div class="mensagens" data-canal-mensagens role="log" aria-live="polite" aria-label="Mensagens da conversa">${mensagensHtml || vazio('Ainda não há mensagens. Diga olá.')}</div>
      <form class="compositor" data-canal-form method="post" action="/mensagens/${conversa.id}">
        <div class="compositor-caixa">
          <textarea name="texto" maxlength="2000" required placeholder="Escrever mensagem…" aria-label="Mensagem"></textarea>
        </div>
        <button class="botao-enviar" aria-label="Enviar mensagem" title="Enviar mensagem">${icone('enviar')}</button>
      </form>
    </div>`;
  res.html(
    pagina(
      req,
      {
        secaoAtiva: 'mensagens',
        conversas,
        conversaAtivaId: conversa.id,
        titulo: conversa.outroNome,
        subtitulo: conversa.outroPapel === 'professor' ? 'Professor' : 'Aluno',
      },
      conteudo
    )
  );
});

post('/mensagens/:id', async (req, res) => {
  const conversa = await conversaAcessivel(req, req.params.id);
  if (!conversa) return res.redirecionar('/mensagens');

  const querJson = (req.headers.accept || '').includes('application/json');
  const texto = String(req.corpo.texto || '').trim();
  let erro = '';
  if (!texto) erro = 'Escreva uma mensagem.';
  else if (texto.length > 2000) erro = 'Mensagem demasiado longa (máx. 2000 carateres).';
  if (erro) return querJson ? res.json({ ok: false, erro }, 422) : res.redirecionar(`/mensagens/${conversa.id}`);

  const r = await executar(
    'INSERT INTO conversa_direta_mensagens (conversa_id, utilizador_id, texto) VALUES (?, ?, ?)',
    conversa.id,
    req.utilizador.id,
    texto
  );
  if (querJson) {
    const [nova] = await mensagensDaConversa(conversa.id, r.lastInsertRowid - 1);
    return res.json({ ok: true, id: nova.id, html: mensagemHtml(nova, req.utilizador.id) });
  }
  res.redirecionar(`/mensagens/${conversa.id}`);
});

get('/mensagens/:id/mensagens', async (req, res) => {
  const conversa = await conversaAcessivel(req, req.params.id);
  if (!conversa) return res.json({ ok: false }, 403);
  const apos = Number(req.query.apos) || 0;
  const novas = await mensagensDaConversa(conversa.id, apos);
  res.json({ ok: true, mensagens: novas.map((m) => ({ id: m.id, html: mensagemHtml(m, req.utilizador.id) })) });
});
