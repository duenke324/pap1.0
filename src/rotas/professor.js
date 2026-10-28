// Painel do Professor: turmas, alunos, registo de faltas e marcação de testes
const { get, post } = require('../lib/servidor');
const { todos, um, executar, transacao } = require('../db');
const { pagina, vazio, grelhaHorario, avatar, botaoImprimir } = require('../vistas/layout');
const { etiquetaFalta } = require('./aluno');
const { pautaDoAluno } = require('./avaliacao');
const {
  h,
  hoje,
  idade,
  dataValida,
  diaDaSemana,
  formatarData,
  formatarDataLonga,
  selecionado,
  comoLista,
  limitesAnoLetivo,
  DIAS_SEMANA,
  TIPOS_FALTA,
  TIPOS_TESTE,
  LIMITE_FALTAS,
  aulasDadas,
  GRAVIDADES_OCORRENCIA,
  etiquetaGravidade,
} = require('../lib/util');

// ---------- Consultas ----------
function turmasDoProfessor(professorId) {
  return todos(
    `SELECT DISTINCT t.* FROM turmas t JOIN horario hr ON hr.turma_id = t.id
      WHERE hr.professor_id = ? AND hr.ativo = 1 ORDER BY t.nome`,
    professorId
  );
}

async function lecionaTurma(professorId, turmaId) {
  return !!await um('SELECT 1 FROM horario WHERE professor_id = ? AND turma_id = ? AND ativo = 1', professorId, turmaId);
}

function alunosDaTurma(turmaId, pesquisa = '') {
  return todos(
    `SELECT a.*,
            (SELECT COUNT(*) FROM faltas f WHERE f.aluno_id = a.id) AS total_faltas,
            (SELECT COUNT(*) FROM faltas f WHERE f.aluno_id = a.id AND f.justificada = 0) AS injustificadas
       FROM alunos a
      WHERE a.turma_id = ? AND (? = '' OR a.nome LIKE ? OR a.numero_processo LIKE ?)
      ORDER BY a.nome`,
    turmaId,
    pesquisa,
    `%${pesquisa}%`,
    `%${pesquisa}%`
  );
}

// Alunos perto ou acima do limite de faltas, nas turmas que este professor dirige (diretor de turma)
async function avisosDeFaltas(professorId) {
  const linhas = await todos(
    `SELECT a.id AS aluno_id, a.nome AS aluno, t.id AS turma_id, t.nome AS turma, d.nome AS disciplina,
            (SELECT COUNT(*) FROM licoes l JOIN horario hr ON hr.id = l.horario_id
              WHERE hr.turma_id = t.id AND hr.disciplina_id = d.id) AS aulas,
            (SELECT COUNT(*) FROM faltas f JOIN horario hr ON hr.id = f.horario_id
              WHERE f.aluno_id = a.id AND hr.disciplina_id = d.id AND f.tipo = 'presenca') AS faltas
       FROM turmas t
       JOIN alunos a ON a.turma_id = t.id
       JOIN disciplinas d ON d.id IN (SELECT disciplina_id FROM horario WHERE turma_id = t.id AND ativo = 1)
      WHERE t.diretor_id = ?`,
    professorId
  );
  return linhas
    .map((l) => {
      const base = aulasDadas(l.aulas, l.faltas);
      const percentagem = base ? l.faltas / base : 0;
      return { ...l, percentagem, excedido: percentagem >= LIMITE_FALTAS };
    })
    .filter((l) => l.percentagem >= LIMITE_FALTAS * 0.7) // avisa a partir de 70% do limite (7% de faltas)
    .sort((x, y) => y.percentagem - x.percentagem);
}

// Uma linha por aluno, com uma etiqueta por disciplina (antes era uma linha por aluno e disciplina, e a
// tabela empurrava as turmas para fora do ecrã). Os avisos já vêm do mais grave para o menos grave.
function cartaoAvisosDeFaltas(avisos) {
  if (!avisos.length) return '';
  const porAluno = new Map();
  for (const x of avisos) {
    if (!porAluno.has(x.aluno_id)) porAluno.set(x.aluno_id, { aluno_id: x.aluno_id, aluno: x.aluno, turma: x.turma, disciplinas: [] });
    porAluno.get(x.aluno_id).disciplinas.push(x);
  }
  const acima = avisos.filter((x) => x.excedido).length;
  const etiqueta = (x) =>
    `<span class="etiqueta ${x.excedido ? 'etiqueta-perigo' : 'etiqueta-aviso'}" title="${x.excedido ? 'Acima do limite' : 'A aproximar-se do limite'}">${h(x.disciplina)} · ${Math.round(x.percentagem * 100)}% (${x.faltas}/${aulasDadas(x.aulas, x.faltas)})</span>`;
  return `<section class="cartao">
    <div class="cartao-topo">
      <h2>Faltas a acompanhar</h2>
      <span class="texto-suave">${porAluno.size} aluno(s) · ${acima} disciplina(s) acima do limite</span>
    </div>
    <p class="texto-suave">Alunos das turmas que dirige com ${Math.round(LIMITE_FALTAS * 70)}% ou mais de faltas numa disciplina.
      As etiquetas escuras já passaram o limite de ${LIMITE_FALTAS * 100}%; entre parênteses, faltas / aulas dadas.</p>
    <div class="tabela-scroll"><table class="tabela">
      <thead><tr><th>Aluno</th><th>Faltas por disciplina</th></tr></thead>
      <tbody>${[...porAluno.values()]
        .map(
          (a) => `<tr>
        <td><a class="aluno-linha" href="/professor/alunos/${a.aluno_id}"><span>${h(a.aluno)}<small>${h(a.turma)}</small></span></a></td>
        <td><div class="lista-etiquetas">${a.disciplinas.map(etiqueta).join('')}</div></td>
      </tr>`
        )
        .join('')}</tbody>
    </table></div>
  </section>`;
}

// Novidades recentes nas turmas que este professor dirige, para destacar logo ao abrir "As minhas turmas":
// ocorrências graves/muito graves e faltas injustificadas acabadas de registar.
const DIAS_NOVIDADES = 7;

async function novidadesRecentes(professorId) {
  const graves = await todos(
    `SELECT o.id, o.data, o.gravidade, a.id AS aluno_id, a.nome AS aluno, t.nome AS turma
       FROM ocorrencias o
       JOIN alunos a ON a.id = o.aluno_id
       JOIN turmas t ON t.id = a.turma_id
      WHERE t.diretor_id = ? AND o.gravidade IN ('grave', 'muito_grave')
        AND o.criado_em >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY o.criado_em DESC
      LIMIT 20`,
    professorId,
    DIAS_NOVIDADES
  );
  const porValidar = await todos(
    `SELECT f.id, f.data, a.id AS aluno_id, a.nome AS aluno, t.nome AS turma, d.nome AS disciplina
       FROM faltas f
       JOIN horario hr ON hr.id = f.horario_id
       JOIN turmas t ON t.id = hr.turma_id
       JOIN alunos a ON a.id = f.aluno_id
       JOIN disciplinas d ON d.id = hr.disciplina_id
      WHERE t.diretor_id = ? AND f.criado_em >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND f.tipo IN ('presenca', 'material') AND f.justificada = 0
      ORDER BY f.criado_em DESC
      LIMIT 20`,
    professorId,
    DIAS_NOVIDADES
  );
  return { graves, porValidar };
}

function cartaoNovidades({ graves, porValidar }) {
  if (!graves.length && !porValidar.length) return '';
  const linha = (item, etiqueta, texto) => `<li>
    <span class="hora">${h(formatarData(item.data))}</span>
    <span><a href="/professor/alunos/${item.aluno_id}"><strong>${h(item.aluno)}</strong></a>
      <small>${h(item.turma)}${item.disciplina ? ` · ${h(item.disciplina)}` : ''} · <span class="etiqueta ${etiqueta}">${texto}</span></small>
    </span>
  </li>`;
  return `<section class="cartao">
    <h2>Novidades nas suas turmas</h2>
    <p class="texto-suave">Ocorrências graves e novas faltas por justificar, registadas nos últimos ${DIAS_NOVIDADES} dias nas turmas que dirige.</p>
    <ul class="lista-simples">
      ${graves.map((o) => linha(o, o.gravidade === 'muito_grave' ? 'etiqueta-perigo' : 'etiqueta-aviso', GRAVIDADES_OCORRENCIA[o.gravidade])).join('')}
      ${porValidar.map((f) => linha(f, 'etiqueta-aviso', 'Nova falta por justificar')).join('')}
    </ul>
  </section>`;
}

// ---------- Reuniões de turma ----------
function reunioesDaTurma(turmaId) {
  return todos(
    `SELECT r.*, u.nome AS marcada_por_nome FROM reunioes_turma r LEFT JOIN utilizadores u ON u.id = r.marcada_por
      WHERE r.turma_id = ? ORDER BY r.data DESC, r.hora DESC`,
    turmaId
  );
}

function cartaoReunioes(turma, reunioes, ehDiretor) {
  // As próximas primeiro (da mais perto para a mais longe); depois as últimas já realizadas, esbatidas e
  // sem "Cancelar" (não faz sentido cancelar uma reunião que já aconteceu)
  const hojeISO = hoje();
  const proximas = reunioes.filter((r) => r.data >= hojeISO).reverse(); // vêm da mais recente para a mais antiga
  const anteriores = reunioes.filter((r) => r.data < hojeISO).slice(0, 5);
  const linha = (r, passada) => `<li${passada ? ' class="passado"' : ''}>
          <span class="hora">${h(formatarData(r.data))}<small>${h(r.hora)}</small></span>
          <span><strong>${h(r.assunto || 'Reunião de turma')}</strong>
            <small>${r.local ? `${h(r.local)} · ` : ''}Marcada por ${h(r.marcada_por_nome || '—')}${passada ? ' · já realizada' : ''}</small>
          </span>
          ${
            ehDiretor && !passada
              ? `<form method="post" action="/professor/reunioes/${r.id}/apagar" data-confirmar="Cancelar esta reunião?">
                   <input type="hidden" name="voltar" value="/professor/turmas?turma=${turma.id}">
                   <button class="botao-texto perigo">Cancelar</button></form>`
              : ''
          }
        </li>`;
  const linhas = reunioes.length
    ? `<ul class="lista-simples">${proximas.map((r) => linha(r, false)).join('')}${anteriores.map((r) => linha(r, true)).join('')}</ul>`
    : vazio('Sem reuniões marcadas para esta turma.');

  return `<section class="cartao">
    <h2>Reuniões de turma</h2>
    ${linhas}
    ${
      ehDiretor
        ? `<hr class="separador">
           <form method="post" action="/professor/turmas/${turma.id}/reunioes" class="grelha-form">
             <label>Data <input type="date" name="data" min="${hoje()}" required></label>
             <label>Hora <input type="time" name="hora" required></label>
             <label>Local <input name="local" maxlength="60" placeholder="Ex.: Sala B12"></label>
             <label class="coluna-toda">Assunto
               <input name="assunto" maxlength="200" placeholder="Ex.: Reunião com os delegados e subdelegados"></label>
             <div class="coluna-toda"><button class="botao">Marcar reunião</button></div>
           </form>
           <p class="legenda">O delegado e o subdelegado da turma veem esta reunião em destaque no seu painel.</p>`
        : ''
    }
  </section>`;
}

function rotuloAula(a) {
  return `${a.hora_inicio}–${a.hora_fim} · ${a.disciplina}${a.sala ? ` · Sala ${a.sala}` : ''}${a.ativo ? '' : ' (já não está no horário)'}`;
}

// Datas em que se podem registar faltas: dentro do ano letivo da turma e nunca no futuro
function intervaloFaltas(turma) {
  const limites = limitesAnoLetivo(turma.ano_letivo);
  const max = limites && limites.fim < hoje() ? limites.fim : hoje();
  return { min: limites?.inicio || '', max };
}

function semFicha(req, res) {
  res.html(pagina(req, { titulo: 'Professor', ativo: '' }, vazio('A sua conta não está associada a uma ficha de professor.')));
}

function seletorTurmas(turmas, turmaId, extra = '') {
  return `<label>Turma
    <select name="turma" data-submeter>
      ${turmas.map((t) => `<option value="${t.id}"${selecionado(t.id, turmaId)}>${h(t.nome)}</option>`).join('')}
    </select></label>${extra}`;
}

// ---------- Turmas e alunos ----------
get('/professor', async (req, res) => res.redirecionar('/professor/turmas'));

get('/professor/turmas', async (req, res) => {
  if (!req.professor) return semFicha(req, res);
  const cartaoNovas = cartaoNovidades(await novidadesRecentes(req.professor.id));
  const cartaoAvisos = cartaoAvisosDeFaltas(await avisosDeFaltas(req.professor.id));
  const turmas = await turmasDoProfessor(req.professor.id);
  if (!turmas.length) {
    return res.html(
      pagina(
        req,
        { titulo: 'As minhas turmas', ativo: 'turmas' },
        cartaoNovas + cartaoAvisos || vazio('Ainda não tem turmas atribuídas.')
      )
    );
  }
  const turma = turmas.find((t) => String(t.id) === req.query.turma) || turmas[0];
  const pesquisa = String(req.query.q || '').trim();
  const alunos = await alunosDaTurma(turma.id, pesquisa);
  const disciplinas = await todos(
    `SELECT DISTINCT d.nome FROM horario hr JOIN disciplinas d ON d.id = hr.disciplina_id
      WHERE hr.turma_id = ? AND hr.professor_id = ? AND hr.ativo = 1 ORDER BY d.nome`,
    turma.id,
    req.professor.id
  );
  const total = (await um('SELECT COUNT(*) AS n FROM alunos WHERE turma_id = ?', turma.id)).n;
  const ehDiretor = turma.diretor_id === req.professor.id;
  const cartaoReunioesTurma = cartaoReunioes(turma, await reunioesDaTurma(turma.id), ehDiretor);

  const separadores = turmas
    .map((t) => `<a href="?turma=${t.id}" class="${t.id === turma.id ? 'ativo' : ''}">${h(t.nome)}</a>`)
    .join('');

  const conteudo = `
    ${cartaoNovas}
    ${cartaoAvisos}
    <nav class="separadores" aria-label="Turmas">${separadores}</nav>
    <section class="cartao">
      <div class="cartao-topo">
        <div>
          <h2>${h(turma.nome)} <small class="texto-suave">· ${h(turma.ano_letivo)}</small></h2>
          <p class="texto-suave">${total} aluno(s) · Leciona: ${h(disciplinas.map((d) => d.nome).join(', '))}</p>
        </div>
        <a class="botao" href="/professor/aula?turma=${turma.id}">Dar aula</a>
      </div>
      <form class="filtros" method="get">
        <input type="hidden" name="turma" value="${turma.id}">
        <label class="crescer">Pesquisar aluno
          <input type="search" name="q" value="${h(pesquisa)}" placeholder="Nome ou n.º de processo">
        </label>
        <button class="botao botao-secundario">Filtrar</button>
      </form>
      ${
        alunos.length
          ? `<div class="grelha-alunos">${alunos
              .map(
                (a) => `<a class="cartao-aluno" href="/professor/alunos/${a.id}">
                ${avatar(a)}
                <div><strong>${h(a.nome)}</strong><small>Proc. ${h(a.numero_processo)}</small></div>
                <span class="contagem ${a.injustificadas ? 'aviso' : ''}" title="Faltas injustificadas / total">${a.injustificadas}/${a.total_faltas}</span>
              </a>`
              )
              .join('')}</div>
             <p class="legenda">O número à direita indica faltas injustificadas / total de faltas.</p>`
          : vazio(pesquisa ? 'Nenhum aluno corresponde à pesquisa.' : 'Esta turma ainda não tem alunos.')
      }
    </section>
    ${cartaoReunioesTurma}`;

  res.html(pagina(req, { titulo: 'As minhas turmas', ativo: 'turmas' }, conteudo));
});

// Só o diretor de turma marca ou cancela reuniões; os restantes professores só as veem
post('/professor/turmas/:id/reunioes', async (req, res) => {
  if (!req.professor) return semFicha(req, res);
  const turma = await um('SELECT * FROM turmas WHERE id = ?', req.params.id);
  if (!turma || turma.diretor_id !== req.professor.id) {
    req.flash('erro', 'Só o diretor de turma pode marcar reuniões.');
    return res.redirecionar('/professor/turmas');
  }
  const data = String(req.corpo.data || '');
  const hora = String(req.corpo.hora || '');
  const local = String(req.corpo.local || '').trim().slice(0, 60);
  const assunto = String(req.corpo.assunto || '').trim().slice(0, 200);
  if (!dataValida(data) || data < hoje() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    req.flash('erro', 'Indique uma data (hoje ou futura) e uma hora válidas.');
    return res.redirecionar(`/professor/turmas?turma=${turma.id}`);
  }
  await executar(
    'INSERT INTO reunioes_turma (turma_id, data, hora, local, assunto, marcada_por) VALUES (?, ?, ?, ?, ?, ?)',
    turma.id,
    data,
    hora,
    local || null,
    assunto || null,
    req.utilizador.id
  );
  req.flash('sucesso', 'Reunião marcada. O delegado e o subdelegado vão vê-la em destaque.');
  res.redirecionar(`/professor/turmas?turma=${turma.id}`);
});

post('/professor/reunioes/:id/apagar', async (req, res) => {
  if (!req.professor) return semFicha(req, res);
  const reuniao = await um('SELECT r.*, t.diretor_id FROM reunioes_turma r JOIN turmas t ON t.id = r.turma_id WHERE r.id = ?', req.params.id);
  if (!reuniao || reuniao.diretor_id !== req.professor.id) {
    req.flash('erro', 'Só o diretor de turma pode cancelar esta reunião.');
  } else {
    await executar('DELETE FROM reunioes_turma WHERE id = ?', reuniao.id);
    req.flash('sucesso', 'Reunião cancelada.');
  }
  const voltar = String(req.corpo.voltar || '');
  res.redirecionar(voltar.startsWith('/professor/') ? voltar : '/professor/turmas');
});

get('/professor/alunos/:id', async (req, res) => {
  if (!req.professor) return semFicha(req, res);
  const aluno = await um(
    `SELECT a.*, t.nome AS turma FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id WHERE a.id = ?`,
    req.params.id
  );
  if (!aluno || !(await lecionaTurma(req.professor.id, aluno.turma_id))) {
    req.flash('erro', 'Só pode consultar alunos das suas turmas.');
    return res.redirecionar('/professor/turmas');
  }

  const faltas = await todos(
    `SELECT f.*, d.nome AS disciplina, hr.hora_inicio, hr.hora_fim, hr.professor_id
       FROM faltas f JOIN horario hr ON hr.id = f.horario_id JOIN disciplinas d ON d.id = hr.disciplina_id
      WHERE f.aluno_id = ? ORDER BY f.data DESC, hr.hora_inicio DESC`,
    aluno.id
  );
  const minhas = faltas.filter((f) => f.professor_id === req.professor.id);
  const ocorrencias = await todos(
    `SELECT o.*, u.nome AS registada_por_nome FROM ocorrencias o LEFT JOIN utilizadores u ON u.id = o.registada_por
      WHERE o.aluno_id = ? ORDER BY o.data DESC, o.id DESC`,
    aluno.id
  );
  const anos = idade(aluno.data_nascimento);

  const linhas = faltas
    .map((f) => {
      const podeApagar = f.registada_por === req.utilizador.id && !f.justificada;
      return `<tr class="${f.professor_id === req.professor.id ? '' : 'linha-suave'}">
        <td>${h(formatarDataLonga(f.data))}</td>
        <td>${h(f.hora_inicio)}</td>
        <td>${h(f.disciplina)}</td>
        <td>${h(TIPOS_FALTA[f.tipo])}</td>
        <td>${etiquetaFalta(f)}</td>
        <td class="direita">${
          podeApagar
            ? `<form method="post" action="/professor/faltas/${f.id}/apagar" data-confirmar="Anular esta falta?">
                 <input type="hidden" name="voltar" value="/professor/alunos/${aluno.id}">
                 <button class="botao-texto perigo">Anular</button></form>`
            : ''
        }</td>
      </tr>`;
    })
    .join('');

  const conteudo = `
    <p><a href="/professor/turmas?turma=${aluno.turma_id}" class="voltar">← ${h(aluno.turma)}</a></p>
    <div class="grelha-ficha">
      <section class="cartao ficha">
        ${avatar(aluno, 'grande')}
        <h2>${h(aluno.nome)}</h2>
        <dl class="dados">
          <dt>N.º de processo</dt><dd>${h(aluno.numero_processo)}</dd>
          <dt>Turma</dt><dd>${h(aluno.turma || '—')}</dd>
          <dt>Data de nascimento</dt><dd>${h(formatarData(aluno.data_nascimento))}${anos !== null ? ` (${anos} anos)` : ''}</dd>
          <dt>Contacto</dt><dd>${aluno.contacto ? `<a href="tel:${h(aluno.contacto)}">${h(aluno.contacto)}</a>` : '—'}</dd>
          <dt>Mãe / Encarregado de educação</dt><dd>${h(aluno.encarregado_nome || '—')}</dd>
        </dl>
      </section>
      <section class="cartao">
        <div class="cartao-topo">
          <h2>Faltas</h2>
          <span class="texto-suave">${faltas.length} no total · ${minhas.length} nas suas aulas · ${faltas.filter((f) => !f.justificada).length} injustificadas</span>
        </div>
        ${
          faltas.length
            ? `<div class="tabela-scroll"><table class="tabela"><thead><tr><th>Data</th><th>Hora</th><th>Disciplina</th><th>Tipo</th><th>Estado</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>
               <p class="legenda">As faltas de outras disciplinas aparecem esbatidas. Só pode anular faltas que registou e que ainda não foram justificadas.</p>`
            : vazio('Este aluno não tem faltas.')
        }
      </section>
    </div>
    <section class="cartao">
      <h2>Ocorrências disciplinares</h2>
      ${
        ocorrencias.length
          ? `<div class="tabela-scroll"><table class="tabela"><thead><tr><th>Data</th><th>Gravidade</th><th>Descrição</th><th>Registada por</th><th></th></tr></thead><tbody>${ocorrencias
              .map(
                (o) => `<tr>
                <td>${h(formatarData(o.data))}</td>
                <td>${etiquetaGravidade(o.gravidade)}</td>
                <td>${h(o.descricao)}</td>
                <td>${h(o.registada_por_nome || '—')}</td>
                <td class="direita">${
                  o.registada_por === req.utilizador.id
                    ? `<form method="post" action="/professor/ocorrencias/${o.id}/apagar" data-confirmar="Apagar esta ocorrência?">
                         <input type="hidden" name="voltar" value="/professor/alunos/${aluno.id}">
                         <button class="botao-texto perigo">Apagar</button></form>`
                    : ''
                }</td>
              </tr>`
              )
              .join('')}</tbody></table></div>`
          : vazio('Este aluno não tem ocorrências registadas.')
      }
      <hr class="separador">
      <form method="post" action="/professor/alunos/${aluno.id}/ocorrencias" class="grelha-form">
        <label>Gravidade
          <select name="gravidade" required>
            ${Object.entries(GRAVIDADES_OCORRENCIA).map(([v, r]) => `<option value="${v}">${h(r)}</option>`).join('')}
          </select></label>
        <label>Data <input type="date" name="data" value="${hoje()}" max="${hoje()}" required></label>
        <label class="coluna-toda">Descrição *
          <textarea name="descricao" rows="2" maxlength="500" required placeholder="Ex.: Perturbação da aula, recusa em cumprir instruções."></textarea></label>
        <div class="coluna-toda"><button class="botao">Registar ocorrência</button></div>
      </form>
    </section>
    <section class="cartao"><h2>Avaliação por módulos</h2>${await pautaDoAluno(aluno)}</section>`;

  res.html(pagina(req, { titulo: 'Ficha do aluno', ativo: 'turmas', acoes: botaoImprimir() }, conteudo));
});

post('/professor/alunos/:id/ocorrencias', async (req, res) => {
  if (!req.professor) return semFicha(req, res);
  const aluno = await um('SELECT * FROM alunos WHERE id = ?', req.params.id);
  if (!aluno || !(await lecionaTurma(req.professor.id, aluno.turma_id))) {
    req.flash('erro', 'Só pode registar ocorrências de alunos das suas turmas.');
    return res.redirecionar('/professor/turmas');
  }
  const gravidade = String(req.corpo.gravidade || '');
  const descricao = String(req.corpo.descricao || '').trim();
  const data = String(req.corpo.data || '');
  if (!(gravidade in GRAVIDADES_OCORRENCIA) || !descricao || descricao.length > 500 || !dataValida(data) || data > hoje()) {
    req.flash('erro', 'Preencha a gravidade, a descrição e uma data válida (não futura).');
    return res.redirecionar(`/professor/alunos/${aluno.id}`);
  }
  await executar(
    'INSERT INTO ocorrencias (aluno_id, gravidade, descricao, data, registada_por) VALUES (?, ?, ?, ?, ?)',
    aluno.id,
    gravidade,
    descricao,
    data,
    req.utilizador.id
  );
  req.flash('sucesso', 'Ocorrência registada.');
  res.redirecionar(`/professor/alunos/${aluno.id}`);
});

post('/professor/ocorrencias/:id/apagar', async (req, res) => {
  const r = await executar('DELETE FROM ocorrencias WHERE id = ? AND registada_por = ?', req.params.id, req.utilizador?.id);
  req.flash(r.changes ? 'sucesso' : 'erro', r.changes ? 'Ocorrência apagada.' : 'Não é possível apagar esta ocorrência.');
  const voltar = String(req.corpo.voltar || '');
  res.redirecionar(voltar.startsWith('/professor/') ? voltar : '/professor/turmas');
});

// ---------- Dar aula (sumário + faltas) ----------
// Aulas do horário atual + aulas antigas (inativas) que já tenham lição ou faltas nessa data (para se poder corrigir)
const CONDICAO_AULA_NA_DATA = `(hr.ativo = 1
  OR EXISTS (SELECT 1 FROM faltas f WHERE f.horario_id = hr.id AND f.data = ?)
  OR EXISTS (SELECT 1 FROM licoes l WHERE l.horario_id = hr.id AND l.data = ?))`;

function aulasDoDia(professorId, turmaId, data) {
  return todos(
    `SELECT hr.*, d.nome AS disciplina,
            EXISTS (SELECT 1 FROM licoes l WHERE l.horario_id = hr.id AND l.data = ?) AS dada
       FROM horario hr JOIN disciplinas d ON d.id = hr.disciplina_id
      WHERE hr.professor_id = ? AND hr.turma_id = ? AND hr.dia_semana = ? AND ${CONDICAO_AULA_NA_DATA}
      ORDER BY hr.hora_inicio, hr.ativo DESC`,
    data,
    professorId,
    turmaId,
    diaDaSemana(data),
    data,
    data
  );
}

// Todas as lições de uma turma numa disciplina, com o n.º da lição (1, 2, 3… por ordem de data e hora)
function licoesNumeradas(turmaId, disciplinaId) {
  return todos(
    `SELECT l.*, hr.hora_inicio, hr.hora_fim, m.numero AS modulo_numero, m.nome AS modulo_nome,
            ROW_NUMBER() OVER (ORDER BY l.data, hr.hora_inicio) AS numero,
            (SELECT COUNT(*) FROM faltas f WHERE f.horario_id = l.horario_id AND f.data = l.data AND f.tipo = 'presenca') AS ausentes
       FROM licoes l JOIN horario hr ON hr.id = l.horario_id LEFT JOIN modulos m ON m.id = l.modulo_id
      WHERE hr.turma_id = ? AND hr.disciplina_id = ?
      ORDER BY l.data DESC, hr.hora_inicio DESC`,
    turmaId,
    disciplinaId
  );
}

const rotuloModulo = (m) => `Módulo ${m.numero} – ${m.nome}`;

// Os links antigos (/professor/faltas) continuam a funcionar
get('/professor/faltas', (req, res) => {
  const pesquisa = new URLSearchParams(req.query).toString();
  res.redirecionar(`/professor/aula${pesquisa ? `?${pesquisa}` : ''}`);
});

get('/professor/aula', async (req, res) => {
  if (!req.professor) return semFicha(req, res);
  const titulo = 'Dar aula';
  const turmas = await turmasDoProfessor(req.professor.id);
  if (!turmas.length) {
    return res.html(pagina(req, { titulo, ativo: 'aula' }, vazio('Ainda não tem turmas atribuídas.')));
  }
  const turma = turmas.find((t) => String(t.id) === req.query.turma) || turmas[0];
  const { min, max } = intervaloFaltas(turma);
  let data = dataValida(req.query.data) ? req.query.data : hoje();
  if (data > max) data = max;
  if (min && data < min) data = min;
  const foraDoAno = data > max; // o ano letivo da turma ainda não começou

  const aulas = foraDoAno ? [] : await aulasDoDia(req.professor.id, turma.id, data);
  const aula = aulas.find((a) => String(a.id) === req.query.aula) || (aulas.length === 1 ? aulas[0] : null);

  const filtros = `
    <form class="filtros" method="get">
      ${seletorTurmas(turmas, turma.id)}
      <label>Data
        <input type="date" name="data" value="${data}"${min ? ` min="${min}"` : ''} max="${max}" data-submeter>
      </label>
      ${
        aulas.length
          ? `<label class="crescer">Aula
              <select name="aula" data-submeter>
                ${aulas.length > 1 ? '<option value="">Escolha a aula…</option>' : ''}
                ${aulas.map((a) => `<option value="${a.id}"${selecionado(a.id, aula?.id)}>${h(rotuloAula(a))}${a.dada ? ' ✓' : ''}</option>`).join('')}
              </select></label>`
          : ''
      }
      <noscript><button class="botao botao-secundario">Mostrar</button></noscript>
    </form>`;

  let folha;
  let anteriores = '';
  if (foraDoAno) {
    folha = vazio(`O ano letivo ${turma.ano_letivo} da turma ${turma.nome} ainda não começou.`);
  } else if (!aulas.length) {
    folha = vazio(`Não tem aulas com a turma ${turma.nome} à ${DIAS_SEMANA[diaDaSemana(data) % 7].toLowerCase()} (${formatarData(data)}).`);
  } else if (!aula) {
    folha = vazio('Escolha a aula. As aulas com ✓ já têm sumário.');
  } else {
    const alunos = await alunosDaTurma(turma.id);
    const existentes = await todos('SELECT * FROM faltas WHERE horario_id = ? AND data = ?', aula.id, data);
    const procurar = (alunoId, tipo) => existentes.find((f) => f.aluno_id === alunoId && f.tipo === tipo);
    const modulos = await todos('SELECT * FROM modulos WHERE disciplina_id = ? ORDER BY numero', aula.disciplina_id);
    const licoes = await licoesNumeradas(turma.id, aula.disciplina_id);
    const licao = licoes.find((l) => l.horario_id === aula.id && l.data === data);
    const antes = (l) => l.data < data || (l.data === data && l.hora_inicio < aula.hora_inicio);
    const numero = licao ? licao.numero : licoes.filter(antes).length + 1;
    // Por omissão, o módulo da lição anterior (normalmente continua-se no mesmo módulo)
    const moduloAtual = licao ? licao.modulo_id : licoes.find(antes)?.modulo_id;

    const linhas = alunos
      .map((a) => {
        const caixas = Object.entries(TIPOS_FALTA)
          .map(([tipo, rotulo]) => {
            const f = procurar(a.id, tipo);
            const bloqueada = f && f.justificada;
            return `<td class="centro"><label class="caixa${bloqueada ? ' bloqueada' : ''}" title="${bloqueada ? 'Falta já justificada' : rotulo}">
              <input type="checkbox" name="falta" value="${a.id}:${tipo}"${f ? ' checked' : ''}${bloqueada ? ' disabled' : ''}>
              <span class="sr">${h(rotulo)} – ${h(a.nome)}</span></label></td>`;
          })
          .join('');
        return `<tr><td><div class="aluno-linha">${avatar(a, 'pequeno')}<span>${h(a.nome)}<small>Proc. ${h(a.numero_processo)}</small></span></div></td>${caixas}</tr>`;
      })
      .join('');

    folha = `<form method="post" action="/professor/aula" class="folha-faltas">
        <input type="hidden" name="turma" value="${turma.id}">
        <input type="hidden" name="aula" value="${aula.id}">
        <input type="hidden" name="data" value="${data}">
        <div class="cartao-topo">
          <div><h2>${h(aula.disciplina)} · ${h(turma.nome)}</h2>
          <p class="texto-suave">${h(formatarDataLonga(data))}, ${h(aula.hora_inicio)}–${h(aula.hora_fim)}${aula.sala ? ` · Sala ${h(aula.sala)}` : ''}</p></div>
          <span class="etiqueta ${licao ? 'etiqueta-ok' : ''}">Lição n.º ${numero}${licao ? ' · sumário registado' : ''}</span>
        </div>
        <div class="grelha-form">
          <label>Módulo
            <select name="modulo">
              <option value="">— Sem módulo —</option>
              ${modulos.map((m) => `<option value="${m.id}"${selecionado(m.id, moduloAtual)}>${h(rotuloModulo(m))}</option>`).join('')}
            </select>
            ${modulos.length ? '' : '<small class="texto-suave">Esta disciplina ainda não tem módulos (a secretaria pode criá-los).</small>'}
          </label>
          <label class="coluna-toda">Sumário *
            <textarea name="sumario" rows="3" maxlength="2000" required placeholder="Ex.: Estruturas de repetição (for e while). Resolução de exercícios.">${h(licao?.sumario || '')}</textarea>
          </label>
        </div>
        <h3 class="titulo-faltas">Faltas <small class="texto-suave">— marque apenas os alunos com falta</small></h3>
        ${
          alunos.length
            ? `<div class="tabela-scroll"><table class="tabela">
                <thead><tr><th>Aluno</th>${Object.values(TIPOS_FALTA).map((t) => `<th class="centro">${t}</th>`).join('')}</tr></thead>
                <tbody>${linhas}</tbody>
              </table></div>`
            : vazio('Esta turma ainda não tem alunos.')
        }
        <div class="barra-acoes">
          <button class="botao">${licao ? 'Guardar alterações' : 'Guardar aula'}</button>
          ${
            licao && !existentes.length
              ? `<button class="botao botao-secundario" formaction="/professor/aula/apagar" formnovalidate
                   data-confirmar-botao="Apagar o sumário desta lição? Use isto se registou a aula no dia ou na hora errada.">Apagar lição</button>`
              : ''
          }
        </div>
      </form>`;

    const outras = licoes.filter((l) => l !== licao).slice(0, 10);
    anteriores = `<section class="cartao">
      <div class="cartao-topo"><h2>Lições de ${h(aula.disciplina)} · ${h(turma.nome)}</h2><span class="contador">${licoes.length} lição(ões)</span></div>
      ${
        outras.length
          ? `<ul class="lista-simples lista-licoes">${outras
              .map(
                (l) => `<li><span class="hora">N.º ${l.numero}</span>
                <span><a href="/professor/aula?turma=${turma.id}&data=${l.data}&aula=${l.horario_id}"><strong>${h(formatarDataLonga(l.data))}, ${h(l.hora_inicio)}</strong></a>
                ${l.modulo_numero ? `<small>Módulo ${l.modulo_numero} – ${h(l.modulo_nome)}</small>` : ''}
                <span class="sumario">${h(l.sumario)}</span>
                <small>${l.ausentes ? `${l.ausentes} aluno(s) faltaram` : 'Sem faltas de presença'}</small></span></li>`
              )
              .join('')}</ul>`
          : vazio('Ainda não há outras lições registadas.')
      }
    </section>`;
  }

  res.html(
    pagina(
      req,
      { titulo, ativo: 'aula', subtitulo: 'Escolha a turma, o dia e a aula. Escreva o sumário, marque as faltas e guarde.' },
      `<section class="cartao">${filtros}</section><section class="cartao">${folha}</section>${anteriores}`
    )
  );
});

// Valida a aula e a data enviadas (tem de ser uma aula do professor, num dia dessa aula, dentro do ano letivo)
async function validarAulaEData(req, res) {
  const { turma, aula: aulaId, data } = req.corpo;
  const voltar = `/professor/aula?turma=${encodeURIComponent(turma)}&data=${encodeURIComponent(data)}&aula=${encodeURIComponent(aulaId)}`;
  const aula = dataValida(data)
    ? await um(
        `SELECT hr.*, t.ano_letivo FROM horario hr JOIN turmas t ON t.id = hr.turma_id
          WHERE hr.id = ? AND hr.professor_id = ? AND ${CONDICAO_AULA_NA_DATA}`,
        aulaId,
        req.professor.id,
        data,
        data
      )
    : null;
  if (!aula) {
    req.flash('erro', 'Aula ou data inválida.');
    res.redirecionar('/professor/aula');
    return null;
  }
  const { min, max } = intervaloFaltas(aula);
  if (data > max || (min && data < min)) {
    req.flash('erro', `A data tem de estar dentro do ano letivo ${aula.ano_letivo} e não pode ser no futuro.`);
    res.redirecionar(voltar);
    return null;
  }
  if (diaDaSemana(data) !== aula.dia_semana) {
    req.flash('erro', 'A data não corresponde a um dia desta aula.');
    res.redirecionar(voltar);
    return null;
  }
  return { aula, data, voltar };
}

post('/professor/aula', async (req, res) => {
  if (!req.professor) return semFicha(req, res);
  const valido = await validarAulaEData(req, res);
  if (!valido) return;
  const { aula, data, voltar } = valido;

  const sumario = String(req.corpo.sumario || '').trim().replace(/\r\n/g, '\n');
  if (!sumario || sumario.length > 2000) {
    req.flash('erro', 'Escreva o sumário da aula (até 2000 caracteres).');
    return res.redirecionar(voltar);
  }
  const moduloId = req.corpo.modulo ? Number(req.corpo.modulo) : null;
  if (moduloId !== null && !(Number.isInteger(moduloId) && (await um('SELECT 1 FROM modulos WHERE id = ? AND disciplina_id = ?', moduloId, aula.disciplina_id)))) {
    req.flash('erro', 'Módulo inválido para esta disciplina.');
    return res.redirecionar(voltar);
  }

  const idsTurma = new Set((await todos('SELECT id FROM alunos WHERE turma_id = ?', aula.turma_id)).map((a) => a.id));
  const marcadas = new Set(
    comoLista(req.corpo.falta).filter((v) => {
      const [alunoId, tipo] = String(v).split(':');
      return idsTurma.has(Number(alunoId)) && tipo in TIPOS_FALTA;
    })
  );

  let criadas = 0;
  let anuladas = 0;
  await transacao(async (tx) => {
    await tx.executar(
      `INSERT INTO licoes (horario_id, data, modulo_id, sumario, registada_por) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE modulo_id = VALUES(modulo_id), sumario = VALUES(sumario)`,
      aula.id,
      data,
      moduloId,
      sumario,
      req.utilizador.id
    );
    const existentes = await tx.todos('SELECT * FROM faltas WHERE horario_id = ? AND data = ?', aula.id, data);
    for (const f of existentes) {
      const chave = `${f.aluno_id}:${f.tipo}`;
      if (marcadas.has(chave)) {
        marcadas.delete(chave); // já existia
      } else if (!f.justificada) {
        await tx.executar('DELETE FROM faltas WHERE id = ?', f.id);
        anuladas++;
      }
    }
    for (const chave of marcadas) {
      const [alunoId, tipo] = chave.split(':');
      await tx.executar(
        'INSERT INTO faltas (aluno_id, horario_id, data, tipo, registada_por) VALUES (?, ?, ?, ?, ?)',
        Number(alunoId),
        aula.id,
        data,
        tipo,
        req.utilizador.id
      );
      criadas++;
    }
  });

  const partes = ['sumário'];
  if (criadas) partes.push(`${criadas} falta(s) registada(s)`);
  if (anuladas) partes.push(`${anuladas} falta(s) anulada(s)`);
  req.flash('sucesso', `Aula guardada: ${partes.join(', ')}.`);
  res.redirecionar(voltar);
});

// Apagar uma lição registada por engano (só se não tiver faltas)
post('/professor/aula/apagar', async (req, res) => {
  if (!req.professor) return semFicha(req, res);
  const valido = await validarAulaEData(req, res);
  if (!valido) return;
  const { aula, data, voltar } = valido;
  if (await um('SELECT 1 FROM faltas WHERE horario_id = ? AND data = ?', aula.id, data)) {
    req.flash('erro', 'Esta lição tem faltas. Desmarque as faltas e guarde antes de apagar a lição.');
  } else {
    const r = await executar('DELETE FROM licoes WHERE horario_id = ? AND data = ?', aula.id, data);
    req.flash(r.changes ? 'sucesso' : 'erro', r.changes ? 'Lição apagada.' : 'Esta aula não tem lição registada.');
  }
  res.redirecionar(voltar);
});

post('/professor/faltas/:id/apagar', async (req, res) => {
  const falta = await um('SELECT * FROM faltas WHERE id = ?', req.params.id);
  if (!falta || falta.registada_por !== req.utilizador.id || falta.justificada) {
    req.flash('erro', 'Não é possível anular esta falta.');
  } else {
    await executar('DELETE FROM faltas WHERE id = ?', falta.id);
    req.flash('sucesso', 'Falta anulada.');
  }
  const voltar = String(req.corpo.voltar || '');
  res.redirecionar(voltar.startsWith('/professor/') ? voltar : '/professor/turmas');
});

// ---------- Testes e avaliações ----------
function combinacoesTurmaDisciplina(professorId) {
  return todos(
    `SELECT DISTINCT t.id AS turma_id, t.nome AS turma, d.id AS disciplina_id, d.nome AS disciplina
       FROM horario hr JOIN turmas t ON t.id = hr.turma_id JOIN disciplinas d ON d.id = hr.disciplina_id
      WHERE hr.professor_id = ? AND hr.ativo = 1 ORDER BY t.nome, d.nome`,
    professorId
  );
}

get('/professor/testes', async (req, res) => {
  if (!req.professor) return semFicha(req, res);
  const combos = await combinacoesTurmaDisciplina(req.professor.id);
  const testes = await todos(
    `SELECT te.*, t.nome AS turma, d.nome AS disciplina
       FROM testes te JOIN turmas t ON t.id = te.turma_id JOIN disciplinas d ON d.id = te.disciplina_id
      WHERE te.professor_id = ? ORDER BY te.data`,
    req.professor.id
  );
  const proximos = testes.filter((t) => t.data >= hoje());
  const passados = testes.filter((t) => t.data < hoje()).reverse();

  const tabela = (lista, vazioTexto) =>
    lista.length
      ? `<div class="tabela-scroll"><table class="tabela"><thead><tr><th>Data</th><th>Turma</th><th>Disciplina</th><th>Tipo</th><th>Descrição</th><th></th></tr></thead><tbody>${lista
          .map(
            (t) => `<tr>
          <td>${h(formatarDataLonga(t.data))}</td><td>${h(t.turma)}</td><td>${h(t.disciplina)}</td>
          <td>${h(TIPOS_TESTE[t.tipo])}</td><td>${h(t.descricao || '—')}</td>
          <td class="direita"><form method="post" action="/professor/testes/${t.id}/apagar" data-confirmar="Desmarcar esta avaliação?">
            <button class="botao-texto perigo">Desmarcar</button></form></td></tr>`
          )
          .join('')}</tbody></table></div>`
      : vazio(vazioTexto);

  const conteudo = `
    <section class="cartao">
      <h2>Marcar nova avaliação</h2>
      ${
        combos.length
          ? `<form method="post" action="/professor/testes" class="formulario grelha-form">
        <label>Turma e disciplina
          <select name="combo" required>
            ${combos.map((c) => `<option value="${c.turma_id}:${c.disciplina_id}">${h(c.turma)} — ${h(c.disciplina)}</option>`).join('')}
          </select></label>
        <label>Data <input type="date" name="data" min="${hoje()}" required></label>
        <label>Tipo
          <select name="tipo">${Object.entries(TIPOS_TESTE).map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></label>
        <label class="coluna-toda">Descrição / matéria <input name="descricao" maxlength="200" placeholder="Ex.: Módulo 3 – Estruturas de repetição"></label>
        <div class="coluna-toda"><button class="botao">Marcar avaliação</button></div>
      </form>`
          : vazio('Não tem turmas atribuídas.')
      }
    </section>
    <section class="cartao"><h2>Próximas avaliações</h2>${tabela(proximos, 'Não tem avaliações marcadas.')}</section>
    <section class="cartao"><h2>Avaliações anteriores</h2>${tabela(passados, 'Sem avaliações anteriores.')}</section>`;

  res.html(pagina(req, { titulo: 'Testes e avaliações', ativo: 'testes' }, conteudo));
});

post('/professor/testes', async (req, res) => {
  if (!req.professor) return semFicha(req, res);
  const [turmaId, disciplinaId] = String(req.corpo.combo || '').split(':').map(Number);
  const { data, tipo } = req.corpo;
  const descricao = String(req.corpo.descricao || '').trim().slice(0, 200);
  const valido = (await combinacoesTurmaDisciplina(req.professor.id)).some(
    (c) => c.turma_id === turmaId && c.disciplina_id === disciplinaId
  );

  if (!valido || !(tipo in TIPOS_TESTE)) {
    req.flash('erro', 'Dados inválidos.');
  } else if (!dataValida(data) || data < hoje()) {
    req.flash('erro', 'Indique uma data válida (hoje ou futura).');
  } else if (diaDaSemana(data) > 5) {
    req.flash('erro', 'A data escolhida é um fim de semana.');
  } else {
    await executar(
      'INSERT INTO testes (turma_id, disciplina_id, professor_id, data, tipo, descricao) VALUES (?, ?, ?, ?, ?, ?)',
      turmaId,
      disciplinaId,
      req.professor.id,
      data,
      tipo,
      descricao || null
    );
    req.flash('sucesso', `${TIPOS_TESTE[tipo]} marcado para ${formatarData(data)}.`);
  }
  res.redirecionar('/professor/testes');
});

post('/professor/testes/:id/apagar', async (req, res) => {
  const resultado = await executar('DELETE FROM testes WHERE id = ? AND professor_id = ?', req.params.id, req.professor?.id);
  req.flash(resultado.changes ? 'sucesso' : 'erro', resultado.changes ? 'Avaliação desmarcada.' : 'Avaliação não encontrada.');
  res.redirecionar('/professor/testes');
});

// ---------- Horário ----------
get('/professor/horario', async (req, res) => {
  if (!req.professor) return semFicha(req, res);
  const aulas = await todos(
    `SELECT hr.*, d.nome AS disciplina, d.sigla, t.nome AS turma
       FROM horario hr JOIN disciplinas d ON d.id = hr.disciplina_id JOIN turmas t ON t.id = hr.turma_id
      WHERE hr.professor_id = ? AND hr.ativo = 1 ORDER BY hr.dia_semana, hr.hora_inicio`,
    req.professor.id
  );
  res.html(
    pagina(
      req,
      { titulo: 'Horário', ativo: 'horario', acoes: botaoImprimir() },
      `<section class="cartao">${grelhaHorario(aulas, { mostrarTurma: true })}</section>`
    )
  );
});
