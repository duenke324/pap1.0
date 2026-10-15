// Painel do Aluno: informações, estatísticas, dados pessoais, faltas, sumários, avaliação, testes e horário
const { get } = require('../lib/servidor');
const { todos, um } = require('../db');
const { pagina, vazio, grelhaHorario, botaoImprimir } = require('../vistas/layout');
const { pautaDoAluno } = require('./avaliacao');
const {
  h,
  hoje,
  idade,
  formatarData,
  formatarDataLonga,
  anoLetivoAtual,
  diaDaSemana,
  diasAte,
  TIPOS_FALTA,
  TIPOS_TESTE,
  LIMITE_FALTAS,
  aulasDadas,
} = require('../lib/util');

// ---------- Consultas ----------
function faltasDoAluno(alunoId) {
  return todos(
    `SELECT f.*, d.nome AS disciplina, d.sigla, d.id AS disciplina_id, hr.hora_inicio, hr.hora_fim
       FROM faltas f
       JOIN horario hr ON hr.id = f.horario_id
       JOIN disciplinas d ON d.id = hr.disciplina_id
      WHERE f.aluno_id = ?
      ORDER BY f.data DESC, hr.hora_inicio DESC`,
    alunoId
  );
}

function testesDaTurma(turmaId) {
  return todos(
    `SELECT t.*, d.nome AS disciplina, d.sigla, p.nome AS professor
       FROM testes t
       JOIN disciplinas d ON d.id = t.disciplina_id
       LEFT JOIN professores p ON p.id = t.professor_id
      WHERE t.turma_id = ?
      ORDER BY t.data`,
    turmaId
  );
}

function horarioDaTurma(turmaId) {
  return todos(
    `SELECT hr.*, d.nome AS disciplina, d.sigla, p.nome AS professor
       FROM horario hr
       JOIN disciplinas d ON d.id = hr.disciplina_id
       LEFT JOIN professores p ON p.id = hr.professor_id
      WHERE hr.turma_id = ? AND hr.ativo = 1
      ORDER BY hr.dia_semana, hr.hora_inicio`,
    turmaId
  );
}

// ---------- Componentes ----------
function etiquetaFalta(f) {
  return f.justificada
    ? `<span class="etiqueta etiqueta-ok">Justificada</span>`
    : `<span class="etiqueta etiqueta-aviso">Injustificada</span>`;
}

function etiquetaPrazo(data) {
  const dias = diasAte(data);
  if (dias < 0) return `<span class="etiqueta">Realizado</span>`;
  if (dias === 0) return `<span class="etiqueta etiqueta-perigo">Hoje</span>`;
  if (dias === 1) return `<span class="etiqueta etiqueta-aviso">Amanhã</span>`;
  if (dias <= 7) return `<span class="etiqueta etiqueta-aviso">Daqui a ${dias} dias</span>`;
  return `<span class="etiqueta">Daqui a ${dias} dias</span>`;
}

function listaTestes(testes) {
  if (!testes.length) return vazio('Não há avaliações marcadas.');
  return `<ul class="lista-testes">${testes
    .map((t) => {
      const [a, m, d] = t.data.split('-');
      const mes = new Date(a, m - 1, d).toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '');
      return `<li>
        <div class="data-bloco"><strong>${d}</strong><span>${h(mes)}</span></div>
        <div class="teste-info">
          <strong>${h(TIPOS_TESTE[t.tipo])} de ${h(t.disciplina)}</strong>
          <span>${h(t.descricao || 'Sem descrição')}${t.professor ? ` · ${h(t.professor)}` : ''}</span>
        </div>
        ${etiquetaPrazo(t.data)}
      </li>`;
    })
    .join('')}</ul>`;
}

function semTurma(req, res, titulo, ativo) {
  res.html(
    pagina(req, { titulo, ativo }, vazio('Ainda não está associado a nenhuma turma. Contacte a secretaria.'))
  );
}

// Diferente de semTurma: aqui nem sequer há ficha de aluno associada à conta (não apenas sem turma)
function semFicha(req, res, titulo, ativo) {
  res.html(pagina(req, { titulo, ativo }, vazio('Ficha de aluno não encontrada.')));
}

// ---------- Rotas ----------
function listaAvisos(avisos) {
  if (!avisos.length) return vazio('Não há avisos publicados.');
  return `<ul class="lista-avisos">${avisos
    .map(
      (a) => `<li>
        <p class="aviso-data">${h(formatarData(a.publicado_em))}${a.turma ? ` · <span class="etiqueta">${h(a.turma)}</span>` : ''}</p>
        <h3>${h(a.titulo)}</h3>
        <p class="aviso-texto">${h(a.texto)}</p>
      </li>`
    )
    .join('')}</ul>`;
}

// Calendário do ano letivo: cada período dá duas linhas (início e fim), como no calendário afixado na escola
function cartaoCalendario(anoLetivo, calendario) {
  const hojeISO = hoje();
  const periodos = calendario.filter((c) => c.tipo === 'periodo');
  const interrupcoes = calendario.filter((c) => c.tipo === 'interrupcao');
  const agora = calendario.find((c) => c.inicio <= hojeISO && hojeISO <= c.fim);
  const linhas = periodos
    .flatMap((p) => [
      { data: p.inicio, texto: `Início ${p.nome}` },
      { data: p.fim, texto: `Fim ${p.nome}` },
    ])
    .sort((a, b) => a.data.localeCompare(b.data));

  return `
    <section class="cartao cartao-calendario">
      <h2>Ano letivo ${h(anoLetivo)}</h2>
      ${agora ? `<p class="calendario-agora">${agora.tipo === 'periodo' ? `A decorrer: ${h(agora.nome)}` : `Interrupção letiva: ${h(agora.nome)}`}</p>` : ''}
      ${
        linhas.length
          ? `<ul class="lista-calendario">${linhas
              .map((l) => `<li class="${l.data < hojeISO ? 'passado' : ''}"><span class="hora">${h(formatarData(l.data))}</span><span>${h(l.texto)}</span></li>`)
              .join('')}</ul>`
          : vazio('A secretaria ainda não publicou o calendário.')
      }
    </section>
    <section class="cartao cartao-calendario">
      <h2>Interrupções letivas</h2>
      ${
        interrupcoes.length
          ? `<table class="tabela tabela-compacta"><tbody>${interrupcoes
              .map(
                (i) => `<tr class="${i === agora ? 'atual' : ''}"><td>${h(i.nome)}</td><td class="direita">${h(formatarData(i.inicio))}</td><td class="direita">${h(formatarData(i.fim))}</td></tr>`
              )
              .join('')}</tbody></table>`
          : vazio('Sem interrupções registadas.')
      }
    </section>`;
}

get('/aluno', async (req, res) => {
  const aluno = req.aluno;
  if (!aluno) return semFicha(req, res, 'Informações', 'inicio');

  const anoLetivo = aluno.ano_letivo || anoLetivoAtual();
  const calendario = await todos('SELECT * FROM calendario WHERE ano_letivo = ? ORDER BY inicio', anoLetivo);
  const avisos = await todos(
    `SELECT av.*, t.nome AS turma FROM avisos av LEFT JOIN turmas t ON t.id = av.turma_id
      WHERE av.turma_id IS NULL OR av.turma_id = ? ORDER BY av.publicado_em DESC, av.id DESC LIMIT 20`,
    aluno.turma_id ?? 0
  );
  const proximos = aluno.turma_id ? (await testesDaTurma(aluno.turma_id)).filter((t) => t.data >= hoje()) : [];
  const diaHoje = diaDaSemana(hoje());
  const aulasHoje = aluno.turma_id ? (await horarioDaTurma(aluno.turma_id)).filter((a) => a.dia_semana === diaHoje) : [];

  const conteudo = `
    <div class="grelha-informacoes">
      <aside>${cartaoCalendario(anoLetivo, calendario)}</aside>
      <div>
        <section class="cartao">
          <h2>Avisos</h2>
          ${listaAvisos(avisos)}
        </section>
        <div class="grelha-2">
          <section class="cartao">
            <div class="cartao-topo"><h2>Aulas de hoje</h2><a href="/aluno/horario">Ver horário</a></div>
            ${
              aulasHoje.length
                ? `<ul class="lista-simples">${aulasHoje
                    .map(
                      (a) => `<li><span class="hora">${h(a.hora_inicio)}–${h(a.hora_fim)}</span>
                        <span><strong>${h(a.disciplina)}</strong><small>${h(a.professor || '')}${a.sala ? ` · Sala ${h(a.sala)}` : ''}</small></span></li>`
                    )
                    .join('')}</ul>`
                : vazio('Não tem aulas hoje.')
            }
          </section>
          <section class="cartao">
            <div class="cartao-topo"><h2>Próximas avaliações</h2><a href="/aluno/testes">Ver todas</a></div>
            ${listaTestes(proximos.slice(0, 4))}
          </section>
        </div>
      </div>
    </div>`;

  res.html(pagina(req, { titulo: 'Informações', ativo: 'inicio' }, conteudo));
});

// ---------- Estatísticas: assiduidade por disciplina e resumo da avaliação ----------
get('/aluno/estatisticas', async (req, res) => {
  const aluno = req.aluno;
  if (!aluno?.turma_id) return semTurma(req, res, 'Estatísticas', 'estatisticas');

  const disciplinas = await todos(
    `SELECT d.id, d.nome,
            (SELECT COUNT(*) FROM licoes l JOIN horario hr ON hr.id = l.horario_id
              WHERE hr.turma_id = ? AND hr.disciplina_id = d.id) AS aulas,
            (SELECT COUNT(*) FROM faltas f JOIN horario hr ON hr.id = f.horario_id
              WHERE f.aluno_id = ? AND hr.disciplina_id = d.id AND f.tipo = 'presenca') AS faltas,
            (SELECT COUNT(*) FROM faltas f JOIN horario hr ON hr.id = f.horario_id
              WHERE f.aluno_id = ? AND hr.disciplina_id = d.id AND f.tipo = 'presenca' AND f.justificada = 0) AS injustificadas
       FROM disciplinas d
      WHERE d.id IN (SELECT disciplina_id FROM horario WHERE turma_id = ? AND ativo = 1)
      ORDER BY d.nome`,
    aluno.turma_id,
    aluno.id,
    aluno.id,
    aluno.turma_id
  );
  const outras = await um(
    `SELECT SUM(tipo = 'material') AS material, SUM(tipo = 'disciplinar') AS disciplinar, SUM(justificada = 0) AS por_justificar
       FROM faltas WHERE aluno_id = ?`,
    aluno.id
  );
  const notas = await todos(
    `SELECT n.estado, n.nota FROM notas n JOIN modulos m ON m.id = n.modulo_id WHERE n.aluno_id = ?`,
    aluno.id
  );
  const totalModulos = (
    await um(
      `SELECT COUNT(*) AS n FROM modulos WHERE disciplina_id IN (SELECT disciplina_id FROM horario WHERE turma_id = ? AND ativo = 1)`,
      aluno.turma_id
    )
  ).n;

  const base = (d) => aulasDadas(d.aulas, d.faltas);
  const aulasTotal = disciplinas.reduce((s, d) => s + base(d), 0);
  const faltasTotal = disciplinas.reduce((s, d) => s + d.faltas, 0);
  const assiduidade = aulasTotal ? Math.round((1 - faltasTotal / aulasTotal) * 1000) / 10 : null;
  const concluidos = notas.filter((n) => n.estado === 'nota' && n.nota >= 10).map((n) => n.nota);
  const media = concluidos.length ? (concluidos.reduce((a, b) => a + b, 0) / concluidos.length).toFixed(1).replace('.', ',') : '—';
  const pct = (x) => String(x).replace('.', ',');

  const linhas = disciplinas
    .map((d) => {
      const presenca = base(d) ? Math.round((1 - d.faltas / base(d)) * 1000) / 10 : 100;
      const alerta = base(d) && d.faltas / base(d) >= LIMITE_FALTAS;
      return `<tr>
        <td>${h(d.nome)}</td>
        <td class="direita">${d.aulas}</td>
        <td class="direita">${d.faltas}${d.injustificadas ? ` <small class="texto-suave">(${d.injustificadas} inj.)</small>` : ''}</td>
        <td class="coluna-barra">
          <div class="barra-assiduidade${alerta ? ' alerta' : ''}" role="img" aria-label="Assiduidade ${pct(presenca)}%">
            <span style="width: ${presenca}%"></span>
          </div>
          <span class="valor-barra">${pct(presenca)}%</span>
        </td>
      </tr>`;
    })
    .join('');

  const conteudo = `
    <section class="estatisticas">
      <div class="estatistica${assiduidade !== null && assiduidade < (1 - LIMITE_FALTAS) * 100 ? ' destaque-aviso' : ''}"><span>Assiduidade</span><strong>${assiduidade === null ? '—' : `${pct(assiduidade)}%`}</strong></div>
      <a class="estatistica${Number(outras.por_justificar) ? ' destaque-aviso' : ''}" href="/aluno/faltas?estado=injustificadas"><span>Faltas por justificar</span><strong>${Number(outras.por_justificar) || 0}</strong></a>
      <a class="estatistica" href="/aluno/avaliacao"><span>Módulos concluídos</span><strong>${concluidos.length}<small class="texto-suave"> / ${totalModulos}</small></strong></a>
      <a class="estatistica" href="/aluno/avaliacao"><span>Média dos módulos concluídos</span><strong>${media}</strong></a>
    </section>
    <section class="cartao">
      <h2>Assiduidade por disciplina</h2>
      ${
        disciplinas.length
          ? `<div class="tabela-scroll"><table class="tabela tabela-assiduidade">
              <thead><tr><th>Disciplina</th><th class="direita">Aulas dadas</th><th class="direita">Faltas de presença</th><th>Assiduidade</th></tr></thead>
              <tbody>${linhas}</tbody>
            </table></div>
            <p class="legenda">Contam as aulas com sumário registado e as faltas de presença.
              A laranja quando as faltas chegam a 10% das aulas da disciplina.
              Faltas de material: ${Number(outras.material) || 0} · disciplinares: ${Number(outras.disciplinar) || 0}.</p>`
          : vazio('A turma ainda não tem horário.')
      }
    </section>`;

  res.html(pagina(req, { titulo: 'Estatísticas', ativo: 'estatisticas', subtitulo: 'Assiduidade e avaliação ao longo do ano' }, conteudo));
});

// ---------- Dados pessoais (só consulta: as alterações são feitas pela secretaria) ----------
get('/aluno/dados', async (req, res) => {
  const a = req.aluno;
  if (!a) return semFicha(req, res, 'Dados pessoais', 'dados');
  const anos = idade(a.data_nascimento);
  const conteudo = `
    <section class="cartao">
      <dl class="dados-pessoais">
        <dt>Nome completo</dt><dd>${h(a.nome)}</dd>
        <dt>N.º de processo</dt><dd>${h(a.numero_processo)}</dd>
        <dt>Data de nascimento</dt><dd>${h(formatarData(a.data_nascimento))}${anos !== null ? ` <span class="texto-suave">(${anos} anos)</span>` : ''}</dd>
        <dt>Contacto</dt><dd>${h(a.contacto || '—')}</dd>
        <dt>Mãe / Encarregado de educação</dt><dd>${h(a.encarregado_nome || '—')}</dd>
        <dt>Turma</dt><dd>${h(a.turma || '—')}${a.ano_letivo ? ` <span class="texto-suave">· ${h(a.ano_letivo)}</span>` : ''}</dd>
        <dt>Curso</dt><dd>${h(a.curso || '—')}</dd>
        <dt>Diretor de turma</dt><dd>${h(a.diretor || '—')}${a.diretor_email ? ` · <a href="mailto:${h(a.diretor_email)}">${h(a.diretor_email)}</a>` : ''}</dd>
      </dl>
      <p class="legenda">Se algum dado estiver errado, fale com a secretaria da escola.</p>
    </section>`;
  res.html(pagina(req, { titulo: 'Dados pessoais', ativo: 'dados' }, conteudo));
});

function tabelaFaltas(faltas) {
  if (!faltas.length) return vazio('Não tem faltas registadas.');
  return `<div class="tabela-scroll"><table class="tabela">
    <thead><tr><th>Data</th><th>Tempo</th><th>Disciplina</th><th>Tipo</th><th>Estado</th></tr></thead>
    <tbody>${faltas
      .map(
        (f) => `<tr>
        <td>${h(formatarDataLonga(f.data))}</td>
        <td>${h(f.hora_inicio)}–${h(f.hora_fim)}</td>
        <td>${h(f.disciplina)}</td>
        <td>${h(TIPOS_FALTA[f.tipo])}</td>
        <td>${etiquetaFalta(f)}${f.justificada && f.justificacao ? `<small class="bloco texto-suave">${h(f.justificacao)}</small>` : ''}</td>
      </tr>`
      )
      .join('')}</tbody></table></div>`;
}

get('/aluno/faltas', async (req, res) => {
  if (!req.aluno) return semFicha(req, res, 'Faltas', 'faltas');
  const estado = req.query.estado || 'todas';
  const disciplina = req.query.disciplina || '';
  const todas = await faltasDoAluno(req.aluno.id);

  // Resumo por disciplina
  const resumo = new Map();
  for (const f of todas) {
    const r = resumo.get(f.disciplina_id) || { nome: f.disciplina, total: 0, injustificadas: 0 };
    r.total++;
    if (!f.justificada) r.injustificadas++;
    resumo.set(f.disciplina_id, r);
  }

  const filtradas = todas.filter(
    (f) =>
      (estado === 'todas' || (estado === 'justificadas' ? f.justificada : !f.justificada)) &&
      (!disciplina || String(f.disciplina_id) === disciplina)
  );

  const conteudo = `
    ${
      resumo.size
        ? `<section class="cartao"><h2>Resumo por disciplina</h2>
      <div class="resumo-disciplinas">${[...resumo.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(
          ([id, r]) => `<a href="?disciplina=${id}" class="resumo-item${disciplina === String(id) ? ' ativo' : ''}">
            <span>${h(r.nome)}</span><strong>${r.total}</strong>
            <small>${r.injustificadas ? `${r.injustificadas} por justificar` : 'todas justificadas'}</small></a>`
        )
        .join('')}</div></section>`
        : ''
    }
    <section class="cartao">
      <form class="filtros" method="get">
        <label>Estado
          <select name="estado" data-submeter>
            <option value="todas"${estado === 'todas' ? ' selected' : ''}>Todas</option>
            <option value="injustificadas"${estado === 'injustificadas' ? ' selected' : ''}>Injustificadas</option>
            <option value="justificadas"${estado === 'justificadas' ? ' selected' : ''}>Justificadas</option>
          </select>
        </label>
        ${disciplina ? `<input type="hidden" name="disciplina" value="${h(disciplina)}"><a class="botao botao-secundario" href="?estado=${h(estado)}">Todas as disciplinas</a>` : ''}
        <span class="contador">${filtradas.length} falta(s)</span>
      </form>
      ${tabelaFaltas(filtradas)}
    </section>`;

  res.html(pagina(req, { titulo: 'Faltas', ativo: 'faltas', subtitulo: 'Faltas registadas pelos professores', acoes: botaoImprimir() }, conteudo));
});

// Sumários de todas as lições da turma (numeradas por disciplina), com as aulas em que o aluno faltou
get('/aluno/sumarios', async (req, res) => {
  if (!req.aluno?.turma_id) return semTurma(req, res, 'Sumários', 'sumarios');
  const disciplina = String(req.query.disciplina || '');
  const licoes = await todos(
    `SELECT l.data, l.sumario, hr.hora_inicio, hr.hora_fim, d.id AS disciplina_id, d.nome AS disciplina, p.nome AS professor,
            m.numero AS modulo_numero, m.nome AS modulo_nome,
            ROW_NUMBER() OVER (PARTITION BY hr.disciplina_id ORDER BY l.data, hr.hora_inicio) AS numero,
            EXISTS (SELECT 1 FROM faltas f WHERE f.horario_id = l.horario_id AND f.data = l.data AND f.aluno_id = ? AND f.tipo = 'presenca') AS faltou
       FROM licoes l
       JOIN horario hr ON hr.id = l.horario_id
       JOIN disciplinas d ON d.id = hr.disciplina_id
       LEFT JOIN professores p ON p.id = hr.professor_id
       LEFT JOIN modulos m ON m.id = l.modulo_id
      WHERE hr.turma_id = ?
      ORDER BY l.data DESC, hr.hora_inicio DESC`,
    req.aluno.id,
    req.aluno.turma_id
  );
  const disciplinas = [...new Map(licoes.map((l) => [l.disciplina_id, l.disciplina])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const filtradas = licoes.filter((l) => !disciplina || String(l.disciplina_id) === disciplina).slice(0, 200);

  const conteudo = `
    <section class="cartao">
      ${
        disciplinas.length
          ? `<nav class="separadores" aria-label="Disciplinas">
              <a href="/aluno/sumarios" class="${disciplina ? '' : 'ativo'}">Todas</a>
              ${disciplinas.map(([id, nome]) => `<a href="?disciplina=${id}" class="${disciplina === String(id) ? 'ativo' : ''}">${h(nome)}</a>`).join('')}
            </nav>`
          : ''
      }
      ${
        filtradas.length
          ? `<ul class="lista-simples lista-licoes">${filtradas
              .map(
                (l) => `<li${l.faltou ? ' class="faltou"' : ''}><span class="hora">${h(formatarDataLonga(l.data))}<small>${h(l.hora_inicio)}</small></span>
                <span><strong>${h(l.disciplina)} · lição n.º ${l.numero}</strong>
                ${l.modulo_numero ? `<small>Módulo ${l.modulo_numero} – ${h(l.modulo_nome)}</small>` : ''}
                <span class="sumario">${h(l.sumario)}</span>
                <small>${h(l.professor || '')}${l.faltou ? ' · <span class="etiqueta etiqueta-aviso">Faltou a esta aula</span>' : ''}</small></span></li>`
              )
              .join('')}</ul>`
          : vazio('Ainda não há sumários registados.')
      }
    </section>`;
  res.html(pagina(req, { titulo: 'Sumários', ativo: 'sumarios', subtitulo: 'O que foi dado em cada aula' }, conteudo));
});

get('/aluno/avaliacao', async (req, res) => {
  if (!req.aluno) return semFicha(req, res, 'Avaliação', 'avaliacao');
  const conteudo = `<section class="cartao">${await pautaDoAluno(req.aluno)}</section>`;
  res.html(pagina(req, { titulo: 'Avaliação', ativo: 'avaliacao', subtitulo: 'Classificações por módulo', acoes: botaoImprimir() }, conteudo));
});

get('/aluno/testes', async (req, res) => {
  if (!req.aluno?.turma_id) return semTurma(req, res, 'Testes e avaliações', 'testes');
  const testes = await testesDaTurma(req.aluno.turma_id);
  const proximos = testes.filter((t) => t.data >= hoje());
  const passados = testes.filter((t) => t.data < hoje()).reverse();

  const conteudo = `
    <section class="cartao"><h2>Próximas avaliações</h2>${listaTestes(proximos)}</section>
    <section class="cartao"><h2>Avaliações realizadas</h2>${listaTestes(passados)}</section>`;
  res.html(pagina(req, { titulo: 'Testes e avaliações', ativo: 'testes', subtitulo: `Turma ${h(req.aluno.turma)}` }, conteudo));
});

get('/aluno/horario', async (req, res) => {
  if (!req.aluno?.turma_id) return semTurma(req, res, 'Horário', 'horario');
  const conteudo = `<section class="cartao">${grelhaHorario(await horarioDaTurma(req.aluno.turma_id))}</section>`;
  res.html(pagina(req, { titulo: 'Horário', ativo: 'horario', subtitulo: `Turma ${h(req.aluno.turma)}`, acoes: botaoImprimir() }, conteudo));
});

module.exports = { horarioDaTurma, testesDaTurma, faltasDoAluno, etiquetaFalta, listaTestes };
