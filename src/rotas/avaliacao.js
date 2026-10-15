// Avaliação por módulos: o professor lança a classificação (0 a 20, NC ou EF) de cada aluno em cada módulo.
// Também tem a pauta do aluno, usada no painel do aluno e nas fichas do aluno.
const { get, post } = require('../lib/servidor');
const { todos, um, transacao } = require('../db');
const { pagina, vazio, avatar, botaoImprimir } = require('../vistas/layout');
const { h, selecionado, formatarData, lerClassificacao, textoClassificacao, etiquetaClassificacao, LIMITE_FALTAS, aulasDadas } = require('../lib/util');

// ---------- Pauta de um aluno (todas as disciplinas e módulos) ----------
async function pautaDoAluno(aluno) {
  const linhas = await todos(
    `SELECT d.id AS disciplina_id, d.nome AS disciplina, m.id, m.numero, m.nome, m.horas, n.estado, n.nota, n.atualizado_em
       FROM modulos m
       JOIN disciplinas d ON d.id = m.disciplina_id
       LEFT JOIN notas n ON n.modulo_id = m.id AND n.aluno_id = ?
      WHERE n.id IS NOT NULL
         OR m.disciplina_id IN (SELECT disciplina_id FROM horario WHERE turma_id = ? AND ativo = 1)
      ORDER BY d.nome, m.numero`,
    aluno.id,
    aluno.turma_id ?? 0
  );
  if (!linhas.length) return vazio('Ainda não há módulos definidos para as disciplinas deste aluno.');

  const porDisciplina = new Map();
  for (const l of linhas) {
    if (!porDisciplina.has(l.disciplina_id)) porDisciplina.set(l.disciplina_id, { nome: l.disciplina, modulos: [] });
    porDisciplina.get(l.disciplina_id).modulos.push(l);
  }

  return `<div class="pauta-aluno">${[...porDisciplina.values()]
    .map(({ nome, modulos }) => {
      const notas = modulos.filter((m) => m.estado === 'nota').map((m) => m.nota);
      const concluidos = notas.filter((n) => n >= 10);
      const media = concluidos.length ? (concluidos.reduce((a, b) => a + b, 0) / concluidos.length).toFixed(1).replace('.', ',') : null;
      return `<div class="pauta-disciplina">
        <div class="pauta-cabecalho"><strong>${h(nome)}</strong>
          <span class="texto-suave">${concluidos.length}/${modulos.length} módulo(s) concluído(s)${media ? ` · média ${media}` : ''}</span></div>
        <ul class="lista-modulos">${modulos
          .map(
            (m) => `<li><span class="modulo-num">M${m.numero}</span>
              <span class="modulo-nome">${h(m.nome)}${m.horas ? `<small>${m.horas} h</small>` : ''}</span>
              ${etiquetaClassificacao(m.estado ? m : null)}</li>`
          )
          .join('')}</ul>
      </div>`;
    })
    .join('')}</div>
    <p class="legenda">Um módulo fica concluído com nota igual ou superior a 10. NC = módulo não concluído · EF = excluído por faltas. A média conta só os módulos concluídos.</p>`;
}

// ---------- Professor: lançar classificações ----------
function combinacoesDoProfessor(professorId) {
  return todos(
    `SELECT DISTINCT t.id AS turma_id, t.nome AS turma, d.id AS disciplina_id, d.nome AS disciplina
       FROM horario hr JOIN turmas t ON t.id = hr.turma_id JOIN disciplinas d ON d.id = hr.disciplina_id
      WHERE hr.professor_id = ? AND hr.ativo = 1 ORDER BY t.nome, d.nome`,
    professorId
  );
}

// Carrega tudo o que a página precisa para uma turma + disciplina + módulo
async function dadosAvaliacao(req) {
  const combos = await combinacoesDoProfessor(req.professor.id);
  const pedido = String(req.query.combo || req.corpo.combo || '');
  const combo = combos.find((c) => `${c.turma_id}:${c.disciplina_id}` === pedido) || combos[0];
  if (!combo) return { combos };

  const modulos = await todos('SELECT * FROM modulos WHERE disciplina_id = ? ORDER BY numero', combo.disciplina_id);
  // Módulo por omissão: o da última lição dada, senão o primeiro
  const ultimo = await um(
    `SELECT l.modulo_id FROM licoes l JOIN horario hr ON hr.id = l.horario_id
      WHERE hr.turma_id = ? AND hr.disciplina_id = ? AND l.modulo_id IS NOT NULL ORDER BY l.data DESC, hr.hora_inicio DESC LIMIT 1`,
    combo.turma_id,
    combo.disciplina_id
  );
  const pedidoModulo = String(req.query.modulo || req.corpo.modulo || '');
  const modulo = modulos.find((m) => String(m.id) === pedidoModulo) || modulos.find((m) => m.id === ultimo?.modulo_id) || modulos[0];

  const alunos = await todos('SELECT id, nome, numero_processo, fotografia FROM alunos WHERE turma_id = ? ORDER BY nome', combo.turma_id);
  const notas = modulos.length
    ? await todos(
        `SELECT n.* FROM notas n JOIN alunos a ON a.id = n.aluno_id WHERE a.turma_id = ? AND n.modulo_id IN (?)`,
        combo.turma_id,
        modulos.map((m) => m.id)
      )
    : [];

  let licoesModulo = 0;
  const faltas = new Map();
  if (modulo) {
    licoesModulo = (
      await um(
        `SELECT COUNT(*) AS n FROM licoes l JOIN horario hr ON hr.id = l.horario_id WHERE l.modulo_id = ? AND hr.turma_id = ?`,
        modulo.id,
        combo.turma_id
      )
    ).n;
    for (const f of await todos(
      `SELECT f.aluno_id, COUNT(*) AS total, SUM(f.justificada = 0) AS injustificadas
         FROM faltas f
         JOIN licoes l ON l.horario_id = f.horario_id AND l.data = f.data
         JOIN horario hr ON hr.id = l.horario_id
        WHERE l.modulo_id = ? AND hr.turma_id = ? AND f.tipo = 'presenca'
        GROUP BY f.aluno_id`,
      modulo.id,
      combo.turma_id
    )) {
      faltas.set(f.aluno_id, { total: Number(f.total), injustificadas: Number(f.injustificadas) });
    }
  }
  return { combos, combo, modulos, modulo, alunos, notas, licoesModulo, faltas };
}

function paginaAvaliacao(req, res, d, { valores = null, erros = {} } = {}, estado = 200) {
  const titulo = 'Avaliação';
  if (!d.combo) return res.html(pagina(req, { titulo, ativo: 'avaliacao' }, vazio('Ainda não tem turmas atribuídas.')), estado);
  const { combos, combo, modulos, modulo, alunos, notas, licoesModulo, faltas } = d;
  const chaveCombo = `${combo.turma_id}:${combo.disciplina_id}`;
  const notaDe = (alunoId, moduloId) => notas.find((n) => n.aluno_id === alunoId && n.modulo_id === moduloId);

  const filtros = `
    <form class="filtros" method="get">
      <label>Turma e disciplina
        <select name="combo" data-submeter>
          ${combos.map((c) => `<option value="${c.turma_id}:${c.disciplina_id}"${selecionado(`${c.turma_id}:${c.disciplina_id}`, chaveCombo)}>${h(c.turma)} — ${h(c.disciplina)}</option>`).join('')}
        </select></label>
      ${
        modulos.length
          ? `<label class="crescer">Módulo
              <select name="modulo" data-submeter>
                ${modulos.map((m) => `<option value="${m.id}"${selecionado(m.id, modulo.id)}>Módulo ${m.numero} – ${h(m.nome)}${m.horas ? ` (${m.horas} h)` : ''}</option>`).join('')}
              </select></label>`
          : ''
      }
      <noscript><button class="botao botao-secundario">Mostrar</button></noscript>
    </form>`;

  if (!modulos.length) {
    return res.html(
      pagina(req, { titulo, ativo: 'avaliacao' }, `<section class="cartao">${filtros}${vazio(`A disciplina ${combo.disciplina} ainda não tem módulos. Peça à secretaria para os criar.`)}</section>`),
      estado
    );
  }

  // Resumo do módulo
  const doModulo = alunos.map((a) => notaDe(a.id, modulo.id)).filter(Boolean);
  const numericas = doModulo.filter((n) => n.estado === 'nota').map((n) => n.nota);
  const media = numericas.length ? (numericas.reduce((a, b) => a + b, 0) / numericas.length).toFixed(1).replace('.', ',') : '—';
  const resumo = `
    <div class="resumo-avaliacao">
      <span><strong>${doModulo.length}/${alunos.length}</strong> lançadas</span>
      <span><strong>${numericas.filter((n) => n >= 10).length}</strong> concluídos (≥ 10)</span>
      <span><strong>${doModulo.filter((n) => n.estado === 'NC' || (n.estado === 'nota' && n.nota < 10)).length}</strong> não concluídos</span>
      <span><strong>${doModulo.filter((n) => n.estado === 'EF').length}</strong> EF</span>
      <span>Média <strong>${media}</strong></span>
      <span>${licoesModulo} lição(ões) dada(s) neste módulo</span>
    </div>`;

  const linhas = alunos
    .map((a) => {
      const atual = notaDe(a.id, modulo.id);
      const valor = valores ? valores[a.id] ?? '' : textoClassificacao(atual);
      const f = faltas.get(a.id);
      // Percentagem sobre as aulas já dadas (não as horas planeadas do módulo): mesma regra usada
      // nas estatísticas do aluno e no aviso ao diretor de turma, para os três ecrãs concordarem.
      const percentagem = f ? f.total / aulasDadas(licoesModulo, f.total) : null;
      const acimaDoLimite = percentagem !== null && percentagem >= LIMITE_FALTAS;
      return `<tr${erros[a.id] ? ' class="linha-erro"' : ''}>
        <td><div class="aluno-linha">${avatar(a, 'pequeno')}<span>${h(a.nome)}<small>Proc. ${h(a.numero_processo)}</small></span></div></td>
        <td>${
          f
            ? `<span class="${acimaDoLimite ? 'etiqueta etiqueta-perigo' : ''}" title="${f.injustificadas} injustificada(s)">${f.total} falta(s)${percentagem !== null ? ` · ${Math.round(percentagem * 100)}%` : ''}</span>`
            : '<span class="texto-suave">0</span>'
        }</td>
        <td><input class="campo-nota${erros[a.id] ? ' invalido' : ''}" name="nota_${a.id}" value="${h(valor)}" list="classificacoes"
              maxlength="2" autocomplete="off" inputmode="text" aria-label="Classificação de ${h(a.nome)}" pattern="[0-9]|1[0-9]|20|[nN][cC]|[eE][fF]">
            ${erros[a.id] ? `<small class="erro-campo">${h(erros[a.id])}</small>` : ''}</td>
        <td>${atual ? `${etiquetaClassificacao(atual)} <small class="texto-suave">${h(formatarData(atual.atualizado_em))}</small>` : '<span class="texto-suave">Por lançar</span>'}</td>
      </tr>`;
    })
    .join('');

  const folha = alunos.length
    ? `<form method="post" action="/professor/avaliacao">
        <input type="hidden" name="combo" value="${chaveCombo}">
        <input type="hidden" name="modulo" value="${modulo.id}">
        <div class="cartao-topo">
          <div><h2>Módulo ${modulo.numero} – ${h(modulo.nome)}</h2>
          <p class="texto-suave">${h(combo.turma)} · ${h(combo.disciplina)}${modulo.horas ? ` · ${modulo.horas} horas` : ''}</p></div>
        </div>
        ${Object.keys(erros).length ? `<div class="alerta alerta-erro" role="alert">Há classificações inválidas. Use um número de 0 a 20, NC ou EF.</div>` : ''}
        ${resumo}
        <datalist id="classificacoes"><option value="NC">Módulo não concluído</option><option value="EF">Excluído por faltas</option></datalist>
        <div class="tabela-scroll"><table class="tabela tabela-notas">
          <thead><tr><th>Aluno</th><th>Faltas no módulo</th><th>Classificação</th><th>Atual</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>
        <p class="legenda">Escreva uma nota de 0 a 20, <strong>NC</strong> (módulo não concluído) ou <strong>EF</strong> (excluído por faltas).
          Deixe em branco para retirar a classificação. As faltas contam as faltas de presença nas lições marcadas com este módulo;
          a vermelho quando chegam a ${LIMITE_FALTAS * 100}% das aulas já dadas neste módulo.</p>
        <div class="barra-acoes"><button class="botao">Guardar classificações</button></div>
      </form>`
    : vazio('Esta turma ainda não tem alunos.');

  // Pauta: todos os módulos da disciplina
  const pauta = alunos.length
    ? `<div class="tabela-scroll"><table class="tabela tabela-pauta">
        <thead><tr><th>Aluno</th>${modulos.map((m) => `<th class="centro${m.id === modulo.id ? ' atual' : ''}" title="${h(m.nome)}"><a href="?combo=${chaveCombo}&modulo=${m.id}">M${m.numero}</a></th>`).join('')}</tr></thead>
        <tbody>${alunos
          .map(
            (a) => `<tr><td>${h(a.nome)}</td>${modulos.map((m) => `<td class="centro${m.id === modulo.id ? ' atual' : ''}">${etiquetaClassificacao(notaDe(a.id, m.id))}</td>`).join('')}</tr>`
          )
          .join('')}</tbody>
      </table></div>`
    : '';

  res.html(
    pagina(
      req,
      { titulo, ativo: 'avaliacao', subtitulo: 'Lance a classificação de cada aluno em cada módulo', acoes: botaoImprimir('Imprimir pauta') },
      `<section class="cartao">${filtros}</section>
       <section class="cartao">${folha}</section>
       ${pauta ? `<section class="cartao"><h2>Pauta de ${h(combo.disciplina)} · ${h(combo.turma)}</h2>${pauta}</section>` : ''}`
    ),
    estado
  );
}

// Mesma mensagem que professor.js usa quando a conta não tem ficha de professor associada
function semFicha(req, res) {
  res.html(pagina(req, { titulo: 'Professor', ativo: '' }, vazio('A sua conta não está associada a uma ficha de professor.')));
}

get('/professor/avaliacao', async (req, res) => {
  if (!req.professor) return semFicha(req, res);
  paginaAvaliacao(req, res, await dadosAvaliacao(req));
});

post('/professor/avaliacao', async (req, res) => {
  if (!req.professor) return semFicha(req, res);
  const d = await dadosAvaliacao(req);
  // O combo e o módulo têm de ser exatamente os pedidos (senão dadosAvaliacao escolheria outros por omissão)
  if (!d.combo || `${d.combo.turma_id}:${d.combo.disciplina_id}` !== String(req.corpo.combo) || String(d.modulo?.id) !== String(req.corpo.modulo)) {
    req.flash('erro', 'Turma, disciplina ou módulo inválido.');
    return res.redirecionar('/professor/avaliacao');
  }

  const valores = {};
  const erros = {};
  const alteracoes = [];
  for (const a of d.alunos) {
    const texto = String(req.corpo[`nota_${a.id}`] ?? '').trim();
    valores[a.id] = texto;
    const c = lerClassificacao(texto);
    if (!c) erros[a.id] = 'Inválida';
    else alteracoes.push({ alunoId: a.id, c });
  }
  if (Object.keys(erros).length) return paginaAvaliacao(req, res, d, { valores, erros }, 422);

  let guardadas = 0;
  let retiradas = 0;
  await transacao(async (tx) => {
    for (const { alunoId, c } of alteracoes) {
      const atual = d.notas.find((n) => n.aluno_id === alunoId && n.modulo_id === d.modulo.id);
      if (c.vazio) {
        if (atual) {
          await tx.executar('DELETE FROM notas WHERE id = ?', atual.id);
          retiradas++;
        }
      } else if (!atual || atual.estado !== c.estado || atual.nota !== c.nota) {
        await tx.executar(
          `INSERT INTO notas (aluno_id, modulo_id, estado, nota, lancada_por) VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE estado = VALUES(estado), nota = VALUES(nota), lancada_por = VALUES(lancada_por)`,
          alunoId,
          d.modulo.id,
          c.estado,
          c.nota,
          req.utilizador.id
        );
        guardadas++;
      }
    }
  });

  const partes = [];
  if (guardadas) partes.push(`${guardadas} classificação(ões) guardada(s)`);
  if (retiradas) partes.push(`${retiradas} retirada(s)`);
  req.flash('sucesso', partes.length ? `Módulo ${d.modulo.numero}: ${partes.join(', ')}.` : 'Sem alterações.');
  res.redirecionar(`/professor/avaliacao?combo=${d.combo.turma_id}:${d.combo.disciplina_id}&modulo=${d.modulo.id}`);
});

module.exports = { pautaDoAluno };
