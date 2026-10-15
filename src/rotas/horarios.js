// Painel do Administrador: editor de horários por turma (arrastar e largar aulas)
const { get, post } = require('../lib/servidor');
const { todos, um, transacao } = require('../db');
const { pagina, vazio } = require('../vistas/layout');
const { h, DIAS_SEMANA } = require('../lib/util');

// JSON seguro para colocar dentro de <script>
const jsonParaHtml = (valor) => JSON.stringify(valor).replace(/</g, '\\u003c');

get('/admin/horarios', async (req, res) => {
  const primeira = await um('SELECT id FROM turmas ORDER BY ano_letivo DESC, nome LIMIT 1');
  if (primeira) return res.redirecionar(`/admin/turmas/${primeira.id}/horario`);
  res.html(
    pagina(
      req,
      { titulo: 'Horários', ativo: 'horarios' },
      vazio('Ainda não existem turmas.') + `<p class="centro"><a class="botao" href="/admin/turmas">Criar turma</a></p>`
    )
  );
});

// Tempos letivos + horas usadas em aulas antigas que não estejam na tabela de tempos
async function temposDaGrelha(turmaId) {
  const tempos = await todos('SELECT hora_inicio, hora_fim FROM tempos ORDER BY hora_inicio');
  const extra = await todos(
    `SELECT DISTINCT hora_inicio, hora_fim FROM horario WHERE turma_id = ? AND ativo = 1
      AND hora_inicio NOT IN (SELECT hora_inicio FROM tempos)`,
    turmaId
  );
  return [...tempos, ...extra].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
}

get('/admin/turmas/:id/horario', async (req, res) => {
  const turma = await um('SELECT * FROM turmas WHERE id = ?', req.params.id);
  if (!turma) return res.redirecionar('/admin/horarios');

  const turmas = await todos('SELECT id, nome FROM turmas ORDER BY ano_letivo DESC, nome');
  const dados = {
    turma: { id: turma.id, nome: turma.nome },
    tempos: await temposDaGrelha(turma.id),
    disciplinas: await todos('SELECT id, nome, sigla FROM disciplinas ORDER BY nome'),
    professores: await todos('SELECT id, nome FROM professores ORDER BY nome'),
    // Pares disciplina + professor que podem ser arrastados para a grelha
    ofertas: await todos(
      `SELECT pd.disciplina_id, pd.professor_id FROM professor_disciplinas pd
         JOIN disciplinas d ON d.id = pd.disciplina_id JOIN professores p ON p.id = pd.professor_id
        ORDER BY d.nome, p.nome`
    ),
    aulas: await todos(
      `SELECT hr.id, hr.disciplina_id, hr.professor_id, hr.dia_semana AS dia, hr.hora_inicio, hr.sala,
              (SELECT COUNT(*) FROM faltas f WHERE f.horario_id = hr.id) AS faltas,
              (SELECT COUNT(*) FROM licoes l WHERE l.horario_id = hr.id) AS licoes
         FROM horario hr WHERE hr.turma_id = ? AND hr.ativo = 1`,
      turma.id
    ),
    // Aulas das outras turmas (para detetar professores e salas ocupados)
    ocupacao: await todos(
      `SELECT hr.professor_id, hr.sala, hr.dia_semana AS dia, hr.hora_inicio, t.nome AS turma
         FROM horario hr JOIN turmas t ON t.id = hr.turma_id
        WHERE hr.turma_id <> ? AND hr.ativo = 1`,
      turma.id
    ),
  };

  const separadores = turmas
    .map((t) => `<a href="/admin/turmas/${t.id}/horario" class="${t.id === turma.id ? 'ativo' : ''}" data-link-turma>${h(t.nome)}</a>`)
    .join('');

  const conteudo = `
    <nav class="separadores" aria-label="Turmas">${separadores}</nav>
    <div class="editor-horario" data-editor-horario>
      <aside class="cartao paleta" data-paleta>
        <h2>Aulas</h2>
        <p class="legenda">Arraste uma aula para a grelha, ou clique numa aula e depois num tempo.</p>
        <input type="search" placeholder="Filtrar disciplina ou professor" data-filtro-paleta aria-label="Filtrar aulas">
        <div class="lista-ofertas" data-lista-ofertas></div>
        <div class="lixo" data-lixo>Largue aqui para remover</div>
        <p class="legenda">Faltam disciplinas ou professores? Associe-os em <a href="/admin/professores">Professores</a>.</p>
      </aside>

      <section class="cartao grelha-editor">
        <div class="cartao-topo">
          <div>
            <h2>Horário · ${h(turma.nome)}</h2>
            <p class="texto-suave" data-estado-editor>Sem alterações.</p>
          </div>
          <div class="barra-acoes sem-margem">
            <button type="button" class="botao botao-secundario" data-descartar disabled>Descartar</button>
            <button type="button" class="botao" data-guardar disabled>Guardar horário</button>
          </div>
        </div>
        <div data-mensagens-editor></div>
        <div class="tabela-scroll"><table class="horario horario-editor" data-grelha></table></div>

        <div class="painel-aula" data-painel-aula hidden></div>

        <h3 class="titulo-resumo">Tempos por disciplina</h3>
        <div class="resumo-tempos" data-resumo></div>
      </section>
    </div>
    <script type="application/json" id="dados-horario">${jsonParaHtml(dados)}</script>
    <script src="/static/editor-horario.js" defer></script>`;

  res.html(
    pagina(
      req,
      {
        titulo: 'Horários',
        ativo: 'horarios',
        subtitulo: 'Monte o horário semanal de cada turma',
        acoes: `<a class="botao botao-secundario" href="/admin/turmas/${turma.id}">Ver turma</a>`,
      },
      conteudo
    )
  );
});

// Guarda o horário completo de uma turma (recebe a lista de aulas em JSON)
post('/admin/turmas/:id/horario', async (req, res) => {
  const turma = await um('SELECT * FROM turmas WHERE id = ?', req.params.id);
  if (!turma) return res.json({ ok: false, erros: ['Turma não encontrada.'] }, 404);

  let lista;
  try {
    lista = JSON.parse(String(req.corpo.aulas || '[]'));
    if (!Array.isArray(lista) || lista.length > 5 * 20) throw new Error();
  } catch {
    return res.json({ ok: false, erros: ['Dados inválidos.'] }, 400);
  }

  const horas = new Map((await temposDaGrelha(turma.id)).map((t) => [t.hora_inicio, t.hora_fim]));
  const disciplinas = new Map((await todos('SELECT id, nome FROM disciplinas')).map((d) => [d.id, d.nome]));
  const professores = new Map((await todos('SELECT id, nome FROM professores')).map((p) => [p.id, p.nome]));

  // 1) Validar cada aula
  const erros = [];
  const aulas = [];
  const ocupados = new Set();
  for (const a of lista) {
    const aula = {
      id: Number.isInteger(a?.id) ? a.id : null,
      dia: Number(a?.dia),
      hora_inicio: String(a?.hora_inicio || ''),
      disciplina_id: Number(a?.disciplina_id),
      professor_id: a?.professor_id ? Number(a.professor_id) : null,
      sala: String(a?.sala || '').trim().slice(0, 20),
    };
    if (!(aula.dia >= 1 && aula.dia <= 5) || !horas.has(aula.hora_inicio)) {
      erros.push('Existe uma aula num tempo inválido.');
      continue;
    }
    if (!disciplinas.has(aula.disciplina_id)) {
      erros.push('Existe uma aula com uma disciplina que já não existe.');
      continue;
    }
    if (aula.professor_id && !professores.has(aula.professor_id)) aula.professor_id = null;
    const chave = `${aula.dia}|${aula.hora_inicio}`;
    if (ocupados.has(chave)) {
      erros.push(`Há duas aulas à ${DIAS_SEMANA[aula.dia].toLowerCase()} às ${aula.hora_inicio}.`);
      continue;
    }
    ocupados.add(chave);
    aula.hora_fim = horas.get(aula.hora_inicio);
    aulas.push(aula);
  }

  // 2) Conflitos com outras turmas (o mesmo professor ou a mesma sala ao mesmo tempo)
  const outras = await todos(
    `SELECT hr.professor_id, hr.sala, hr.dia_semana, hr.hora_inicio, t.nome AS turma
       FROM horario hr JOIN turmas t ON t.id = hr.turma_id WHERE hr.turma_id <> ? AND hr.ativo = 1`,
    turma.id
  );
  for (const a of aulas) {
    const quando = `${DIAS_SEMANA[a.dia].toLowerCase()} às ${a.hora_inicio}`;
    for (const o of outras) {
      if (o.dia_semana !== a.dia || o.hora_inicio !== a.hora_inicio) continue;
      if (a.professor_id && o.professor_id === a.professor_id) {
        erros.push(`${professores.get(a.professor_id)} já tem aula com a turma ${o.turma} à ${quando}.`);
      }
      if (a.sala && o.sala && o.sala.toLowerCase() === a.sala.toLowerCase()) {
        erros.push(`A sala ${a.sala} já está ocupada pela turma ${o.turma} à ${quando}.`);
      }
    }
  }
  if (erros.length) return res.json({ ok: false, erros: [...new Set(erros)] }, 422);

  // 3) Gravar. As aulas com faltas ou sumários não são apagadas: ficam inativas para manter o histórico.
  const resumo = await transacao(async (tx) => {
    const existentes = await tx.todos(
      `SELECT hr.*, (SELECT COUNT(*) FROM faltas f WHERE f.horario_id = hr.id)
                    + (SELECT COUNT(*) FROM licoes l WHERE l.horario_id = hr.id) AS historico
         FROM horario hr WHERE hr.turma_id = ? AND hr.ativo = 1`,
      turma.id
    );
    const porId = new Map(existentes.map((e) => [e.id, e]));
    const mantidas = new Set();
    let criadas = 0;
    let retiradas = 0;

    for (const a of aulas) {
      const e = a.id && porId.get(a.id);
      const mesmaAula = e && !mantidas.has(e.id) && e.disciplina_id === a.disciplina_id && e.professor_id === a.professor_id;
      // Uma aula com faltas ou sumários não pode mudar de dia/hora: o histórico passaria a mostrar o tempo novo.
      // Nesse caso cria-se uma aula nova e a antiga fica inativa (mais abaixo).
      const mudouTempo = e && (e.dia_semana !== a.dia || e.hora_inicio !== a.hora_inicio);
      if (mesmaAula && !(e.historico > 0 && mudouTempo)) {
        // Mesma aula (pode ter mudado de sala, ou de dia/hora se ainda não tem histórico)
        await tx.executar(
          'UPDATE horario SET dia_semana = ?, hora_inicio = ?, hora_fim = ?, sala = ? WHERE id = ?',
          a.dia,
          a.hora_inicio,
          a.hora_fim,
          a.sala || null,
          e.id
        );
        mantidas.add(e.id);
      } else {
        await tx.executar(
          `INSERT INTO horario (turma_id, disciplina_id, professor_id, dia_semana, hora_inicio, hora_fim, sala) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          turma.id,
          a.disciplina_id,
          a.professor_id,
          a.dia,
          a.hora_inicio,
          a.hora_fim,
          a.sala || null
        );
        criadas++;
      }
    }

    for (const e of existentes) {
      if (mantidas.has(e.id)) continue;
      if (e.historico > 0) await tx.executar('UPDATE horario SET ativo = 0 WHERE id = ?', e.id);
      else await tx.executar('DELETE FROM horario WHERE id = ?', e.id);
      retiradas++;
    }
    return { criadas, retiradas, total: aulas.length };
  });

  req.flash('sucesso', `Horário da turma ${turma.nome} guardado: ${resumo.total} tempo(s) por semana.`);
  res.json({ ok: true, ...resumo });
});
