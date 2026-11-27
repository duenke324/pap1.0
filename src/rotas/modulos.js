// Progresso dos módulos (professor): para cada turma e disciplina que leciona, as horas já dadas de cada
// módulo (uma lição = um tempo = uma hora, como nos avisos de faltas) face às horas previstas, e quantos
// alunos já têm classificação. Avisa quando um módulo está a acabar (80% das horas ou mais) e ainda faltam
// notas, ou quando as horas previstas já foram ultrapassadas.
const { get } = require('../lib/servidor');
const { todos } = require('../db');
const { pagina, vazio } = require('../vistas/layout');
const { h, selecionado } = require('../lib/util');

const QUASE_NO_FIM = 0.8;

// Estado de um módulo: concluido (todas as notas), passou (mais horas do que as previstas), fim (≥ 80%
// das horas e notas em falta), curso (a decorrer), por_comecar (sem lições)
function estadoModulo(m, alunos) {
  if (alunos && m.notas >= alunos) return 'concluido';
  if (!m.dadas) return 'por_comecar';
  if (m.horas && m.dadas > m.horas) return 'passou';
  if (m.horas && m.dadas >= m.horas * QUASE_NO_FIM) return 'fim';
  return 'curso';
}

const ESTADOS = {
  concluido: { texto: 'Notas lançadas', classe: 'etiqueta-ok' },
  passou: { texto: 'Horas ultrapassadas', classe: 'etiqueta-perigo' },
  fim: { texto: 'A acabar — faltam notas', classe: 'etiqueta-aviso' },
  curso: { texto: 'A decorrer', classe: '' },
  por_comecar: { texto: 'Por começar', classe: '' },
};

// Todas as turmas/disciplinas do professor, com os módulos e as contagens
async function progressoDoProfessor(professorId) {
  const combos = await todos(
    `SELECT DISTINCT t.id AS turma_id, t.nome AS turma, d.id AS disciplina_id, d.nome AS disciplina,
            (SELECT COUNT(*) FROM alunos a WHERE a.turma_id = t.id) AS alunos
       FROM horario hr JOIN turmas t ON t.id = hr.turma_id JOIN disciplinas d ON d.id = hr.disciplina_id
      WHERE hr.professor_id = ? AND hr.ativo = 1 ORDER BY t.nome, d.nome`,
    professorId
  );
  for (const c of combos) {
    c.alunos = Number(c.alunos);
    c.modulos = (
      await todos(
        `SELECT m.id, m.numero, m.nome, m.horas,
                (SELECT COUNT(*) FROM licoes l JOIN horario hr ON hr.id = l.horario_id
                  WHERE l.modulo_id = m.id AND hr.turma_id = ?) AS dadas,
                (SELECT MAX(l.data) FROM licoes l JOIN horario hr ON hr.id = l.horario_id
                  WHERE l.modulo_id = m.id AND hr.turma_id = ?) AS ultima,
                (SELECT COUNT(*) FROM notas n JOIN alunos a ON a.id = n.aluno_id
                  WHERE n.modulo_id = m.id AND a.turma_id = ?) AS notas
           FROM modulos m WHERE m.disciplina_id = ? ORDER BY m.numero`,
        c.turma_id,
        c.turma_id,
        c.turma_id,
        c.disciplina_id
      )
    ).map((m) => {
      const mod = { ...m, dadas: Number(m.dadas), notas: Number(m.notas), horas: m.horas ? Number(m.horas) : null };
      return { ...mod, estado: estadoModulo(mod, c.alunos) };
    });
  }
  return combos;
}

// Módulos a pedir atenção (para o cartão em "As minhas turmas")
function alertasModulos(combos) {
  const lista = [];
  for (const c of combos) for (const m of c.modulos) if (m.estado === 'fim' || m.estado === 'passou') lista.push({ ...m, turma: c.turma, disciplina: c.disciplina, combo: c });
  return lista;
}

function cartaoAlertasModulos(combos) {
  const alertas = alertasModulos(combos);
  if (!alertas.length) return '';
  return `<section class="cartao cartao-faltas-modulos">
    <div class="cartao-topo"><h2>Módulos a acabar</h2><a href="/professor/modulos">Ver o progresso</a></div>
    <p class="texto-suave">Módulos com ${QUASE_NO_FIM * 100}% ou mais das horas dadas que ainda não têm as notas de todos os alunos.</p>
    <ul class="lista-simples">${alertas
      .map(
        (m) => `<li><span><strong>${h(m.turma)} · ${h(m.disciplina)} — M${m.numero}</strong><small>${h(m.nome)} · ${m.dadas} de ${m.horas} h · ${m.notas}/${m.combo.alunos} notas</small></span>
        <a class="etiqueta ${ESTADOS[m.estado].classe}" href="/professor/avaliacao?combo=${m.combo.turma_id}:${m.combo.disciplina_id}&modulo=${m.id}">Lançar notas</a></li>`
      )
      .join('')}</ul>
  </section>`;
}

function barra(m) {
  if (!m.horas) return '<span class="texto-suave">Sem horas definidas</span>';
  const pct = Math.min(100, Math.round((m.dadas / m.horas) * 100));
  return `<span class="barra-assiduidade${m.estado === 'passou' ? ' abaixo-limite' : ''}" role="img" aria-label="${pct}% das horas dadas"><span style="width: ${pct}%"></span></span>
    <small class="texto-suave">${m.dadas}/${m.horas} h</small>`;
}

get('/professor/modulos', async (req, res) => {
  if (!req.professor) return res.html(pagina(req, { titulo: 'Progresso dos módulos', ativo: 'modulos' }, vazio('A sua conta não está associada a uma ficha de professor.')));
  const combos = await progressoDoProfessor(req.professor.id);
  if (!combos.length) return res.html(pagina(req, { titulo: 'Progresso dos módulos', ativo: 'modulos' }, vazio('Ainda não tem turmas atribuídas.')));
  const pedido = String(req.query.combo || '');
  const filtrados = pedido ? combos.filter((c) => `${c.turma_id}:${c.disciplina_id}` === pedido) : combos;

  const conteudo = `
    <form class="filtros no-imprimir" method="get">
      <label>Turma e disciplina
        <select name="combo" data-submeter>
          <option value="">Todas</option>
          ${combos.map((c) => `<option value="${c.turma_id}:${c.disciplina_id}"${selecionado(`${c.turma_id}:${c.disciplina_id}`, pedido)}>${h(c.turma)} · ${h(c.disciplina)}</option>`).join('')}
        </select></label>
      <noscript><button class="botao botao-secundario">Ver</button></noscript>
    </form>
    ${filtrados
      .map((c) => {
        const horas = c.modulos.reduce((s, m) => s + (m.horas || 0), 0);
        const dadas = c.modulos.reduce((s, m) => s + m.dadas, 0);
        return `<section class="cartao">
        <div class="cartao-topo">
          <div><h2>${h(c.turma)} · ${h(c.disciplina)}</h2>
            <p class="texto-suave">${c.alunos} aluno(s) · ${dadas}${horas ? ` de ${horas}` : ''} h dadas · ${c.modulos.filter((m) => m.estado === 'concluido').length}/${c.modulos.length} módulo(s) com notas</p></div>
          <a class="botao botao-secundario" href="/professor/avaliacao?combo=${c.turma_id}:${c.disciplina_id}">Avaliação</a>
        </div>
        ${
          c.modulos.length
            ? `<div class="tabela-scroll"><table class="tabela">
            <thead><tr><th>Módulo</th><th>Horas dadas</th><th>Última lição</th><th class="direita">Notas</th><th>Estado</th></tr></thead>
            <tbody>${c.modulos
              .map(
                (m) => `<tr>
              <td><strong>M${m.numero}</strong> ${h(m.nome)}</td>
              <td class="celula-progresso">${barra(m)}</td>
              <td>${m.ultima ? h(m.ultima.split('-').reverse().join('/')) : '—'}</td>
              <td class="direita">${m.notas}/${c.alunos}</td>
              <td><a class="etiqueta ${ESTADOS[m.estado].classe}" href="/professor/avaliacao?combo=${c.turma_id}:${c.disciplina_id}&modulo=${m.id}">${ESTADOS[m.estado].texto}</a></td>
            </tr>`
              )
              .join('')}</tbody></table></div>`
            : vazio('Esta disciplina ainda não tem módulos (a direção cria-os em Disciplinas).')
        }
      </section>`;
      })
      .join('')}
    <p class="legenda">Cada lição registada em «Dar aula» conta uma hora do módulo escolhido no sumário. «A acabar» = ${QUASE_NO_FIM * 100}% ou mais das horas dadas e ainda faltam notas.</p>`;
  res.html(pagina(req, { titulo: 'Progresso dos módulos', ativo: 'modulos', subtitulo: 'Horas dadas e notas lançadas em cada módulo' }, conteudo));
});

module.exports = { progressoDoProfessor, cartaoAlertasModulos, estadoModulo };
