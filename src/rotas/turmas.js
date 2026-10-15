// Painel do Administrador: gestão de turmas (criar, editar, apagar)
const { get, post } = require('../lib/servidor');
const { todos, um, executar } = require('../db');
const { pagina, vazio, avatar } = require('../vistas/layout');
const { h, formatarData, anoLetivoAtual, selecionado } = require('../lib/util');
const { registarLog } = require('../lib/auditoria');

const listaProfessores = () => todos('SELECT id, nome FROM professores ORDER BY nome');

async function lerFormularioTurma(corpo, turmaId = null) {
  const dados = {
    nome: String(corpo.nome || '').trim().replace(/\s+/g, ' '),
    ano_letivo: String(corpo.ano_letivo || '').trim(),
    curso: String(corpo.curso || '').trim().replace(/\s+/g, ' '),
    diretor_id: corpo.diretor_id ? Number(corpo.diretor_id) : null,
  };
  const erros = {};

  if (dados.nome.length < 2 || dados.nome.length > 50) {
    erros.nome = 'Indique o nome da turma (2 a 50 caracteres).';
  } else if (await um('SELECT 1 FROM turmas WHERE nome = ? AND NOT (id <=> ?)', dados.nome, turmaId)) {
    erros.nome = 'Já existe uma turma com este nome.';
  }

  const m = /^(\d{4})\/(\d{4})$/.exec(dados.ano_letivo);
  if (!m || Number(m[2]) !== Number(m[1]) + 1) erros.ano_letivo = 'Use o formato 2026/2027.';
  if (dados.curso.length > 120) erros.curso = 'Nome do curso demasiado longo (máx. 120).';
  if (dados.diretor_id !== null && (!Number.isInteger(dados.diretor_id) || !(await um('SELECT 1 FROM professores WHERE id = ?', dados.diretor_id)))) {
    erros.diretor_id = 'Professor inválido.';
  }

  return { dados, erros };
}

function formularioTurma({ turma = {}, erros = {}, acao, titulo, professores = [] }) {
  const erro = (campo) => (erros[campo] ? `<small class="erro-campo">${h(erros[campo])}</small>` : '');
  const cls = (campo) => (erros[campo] ? ' class="invalido"' : '');
  return `
    <form method="post" action="${acao}" class="grelha-form">
      <label>Nome da turma *
        <input name="nome" value="${h(turma.nome)}" required maxlength="50" placeholder="Ex.: 12.º TGPSI"${cls('nome')}>${erro('nome')}</label>
      <label>Ano letivo *
        <input name="ano_letivo" value="${h(turma.ano_letivo || anoLetivoAtual())}" required pattern="\\d{4}/\\d{4}" placeholder="2026/2027"${cls('ano_letivo')}>${erro('ano_letivo')}</label>
      <label class="coluna-toda">Curso
        <input name="curso" value="${h(turma.curso)}" maxlength="120" placeholder="Ex.: Técnico de Gestão e Programação de Sistemas Informáticos"${cls('curso')}>${erro('curso')}</label>
      <label class="coluna-toda">Diretor de turma
        <select name="diretor_id"${cls('diretor_id')}>
          <option value="">— Por definir —</option>
          ${professores.map((p) => `<option value="${p.id}"${selecionado(p.id, turma.diretor_id)}>${h(p.nome)}</option>`).join('')}
        </select>${erro('diretor_id') || '<small class="texto-suave">Aparece aos alunos da turma como contacto.</small>'}</label>
      <div class="coluna-toda barra-acoes"><button class="botao">${h(titulo)}</button></div>
    </form>`;
}

async function listaTurmas() {
  return todos(
    `SELECT t.*, p.nome AS diretor,
            (SELECT COUNT(*) FROM alunos a WHERE a.turma_id = t.id) AS alunos,
            (SELECT COUNT(*) FROM horario hr WHERE hr.turma_id = t.id AND hr.ativo = 1) AS aulas,
            (SELECT COUNT(DISTINCT hr.professor_id) FROM horario hr WHERE hr.turma_id = t.id AND hr.ativo = 1) AS professores
       FROM turmas t LEFT JOIN professores p ON p.id = t.diretor_id
      ORDER BY t.ano_letivo DESC, t.nome`
  );
}

async function paginaTurmas(req, res, { dados = {}, erros = {} } = {}, estado = 200) {
  const turmas = await listaTurmas();
  const conteudo = `
    <section class="cartao">
      <h2>Criar nova turma</h2>
      ${Object.keys(erros).length ? `<div class="alerta alerta-erro" role="alert">Corrija os campos assinalados.</div>` : ''}
      ${formularioTurma({ turma: dados, erros, acao: '/admin/turmas', titulo: 'Criar turma', professores: await listaProfessores() })}
    </section>
    <section class="cartao">
      <div class="cartao-topo"><h2>Turmas existentes</h2><span class="contador">${turmas.length} turma(s)</span></div>
      ${
        turmas.length
          ? `<div class="tabela-scroll"><table class="tabela">
          <thead><tr><th>Turma</th><th>Ano letivo</th><th>Diretor de turma</th><th class="direita">Alunos</th><th class="direita">Aulas no horário</th><th class="direita">Professores</th><th></th></tr></thead>
          <tbody>${turmas
            .map(
              (t) => `<tr>
              <td><a href="/admin/turmas/${t.id}"><strong>${h(t.nome)}</strong></a></td>
              <td>${h(t.ano_letivo)}</td>
              <td>${h(t.diretor || '—')}</td>
              <td class="direita">${t.alunos}</td>
              <td class="direita">${t.aulas}</td>
              <td class="direita">${t.professores}</td>
              <td class="direita"><a class="botao-texto" href="/admin/turmas/${t.id}">Abrir</a></td>
            </tr>`
            )
            .join('')}</tbody></table></div>`
          : vazio('Ainda não existem turmas.')
      }
    </section>`;
  res.html(pagina(req, { titulo: 'Turmas', ativo: 'turmas', subtitulo: 'Criar e gerir as turmas da escola' }, conteudo), estado);
}

get('/admin/turmas', async (req, res) => paginaTurmas(req, res));

post('/admin/turmas', async (req, res) => {
  const { dados, erros } = await lerFormularioTurma(req.corpo);
  if (Object.keys(erros).length) return paginaTurmas(req, res, { dados, erros }, 422);

  const r = await executar(
    'INSERT INTO turmas (nome, ano_letivo, curso, diretor_id) VALUES (?, ?, ?, ?)',
    dados.nome,
    dados.ano_letivo,
    dados.curso || null,
    dados.diretor_id
  );
  await registarLog(req, 'criar', 'turma', r.lastInsertRowid, `Criou a turma "${dados.nome}" (${dados.ano_letivo})${dados.curso ? `, curso "${dados.curso}"` : ''}.`);
  req.flash('sucesso', `Turma ${dados.nome} criada. Agora pode montar o horário.`);
  res.redirecionar(`/admin/turmas/${r.lastInsertRowid}`);
});

// Faltas ou lições (sumários) registadas nas aulas desta turma
async function temHistorico(turmaId) {
  return !!(await um(
    `SELECT 1 FROM faltas f JOIN horario hr ON hr.id = f.horario_id WHERE hr.turma_id = ?
     UNION SELECT 1 FROM licoes l JOIN horario hr ON hr.id = l.horario_id WHERE hr.turma_id = ? LIMIT 1`,
    turmaId,
    turmaId
  ));
}

async function paginaTurma(req, res, turma, { dados, erros = {} } = {}, estado = 200) {
  const alunos = await todos(
    `SELECT a.*, (SELECT COUNT(*) FROM faltas f WHERE f.aluno_id = a.id AND f.justificada = 0) AS injustificadas
       FROM alunos a WHERE a.turma_id = ? ORDER BY a.nome`,
    turma.id
  );
  const disciplinas = await todos(
    `SELECT d.nome, p.nome AS professor, COUNT(*) AS tempos
       FROM horario hr JOIN disciplinas d ON d.id = hr.disciplina_id LEFT JOIN professores p ON p.id = hr.professor_id
      WHERE hr.turma_id = ? AND hr.ativo = 1 GROUP BY d.id, d.nome, p.nome ORDER BY d.nome`,
    turma.id
  );
  const podeApagar = !alunos.length && !(await temHistorico(turma.id));

  const conteudo = `
    <p><a class="voltar" href="/admin/turmas">← Turmas</a></p>
    <div class="grelha-2">
      <section class="cartao">
        <h2>Dados da turma</h2>
        ${Object.keys(erros).length ? `<div class="alerta alerta-erro" role="alert">Corrija os campos assinalados.</div>` : ''}
        ${formularioTurma({ turma: dados || turma, erros, acao: `/admin/turmas/${turma.id}/editar`, titulo: 'Guardar alterações', professores: await listaProfessores() })}
        <hr class="separador">
        ${
          podeApagar
            ? `<form method="post" action="/admin/turmas/${turma.id}/apagar" data-confirmar="Apagar a turma ${h(turma.nome)}? O horário e os testes desta turma também serão apagados.">
                 <button class="botao botao-perigo">Apagar turma</button></form>`
            : `<p class="legenda">Só é possível apagar uma turma sem alunos, faltas nem sumários registados.
                 Para a apagar, mude primeiro os alunos de turma.</p>`
        }
      </section>
      <section class="cartao">
        <div class="cartao-topo"><h2>Disciplinas e professores</h2><a class="botao" href="/admin/turmas/${turma.id}/horario">Editar horário</a></div>
        ${
          disciplinas.length
            ? `<ul class="lista-simples">${disciplinas
                .map((d) => `<li><span class="hora">${d.tempos} tempo(s)</span><span><strong>${h(d.nome)}</strong><small>${h(d.professor || 'Sem professor')}</small></span></li>`)
                .join('')}</ul>`
            : vazio('Esta turma ainda não tem horário. Use o botão Editar horário para o criar.')
        }
      </section>
    </div>
    <section class="cartao">
      <div class="cartao-topo">
        <h2>Alunos (${alunos.length})</h2>
        <a class="botao" href="/admin/alunos/novo?turma=${turma.id}">+ Adicionar aluno</a>
      </div>
      ${
        alunos.length
          ? `<div class="tabela-scroll"><table class="tabela">
          <thead><tr><th>Aluno</th><th>Processo</th><th>Nascimento</th><th class="direita">Faltas inj.</th><th></th></tr></thead>
          <tbody>${alunos
            .map(
              (a) => `<tr>
              <td><a class="aluno-linha" href="/admin/alunos/${a.id}">${avatar(a, 'pequeno')}<span>${h(a.nome)}</span></a></td>
              <td>${h(a.numero_processo)}</td>
              <td>${h(formatarData(a.data_nascimento))}</td>
              <td class="direita">${a.injustificadas}</td>
              <td class="direita"><a class="botao-texto" href="/admin/alunos/${a.id}/editar">Editar</a></td>
            </tr>`
            )
            .join('')}</tbody></table></div>`
          : vazio('Esta turma ainda não tem alunos.')
      }
    </section>`;

  res.html(pagina(req, { titulo: `Turma ${turma.nome}`, ativo: 'turmas', subtitulo: `Ano letivo ${h(turma.ano_letivo)}${turma.curso ? ` · ${h(turma.curso)}` : ''}` }, conteudo), estado);
}

get('/admin/turmas/:id', async (req, res) => {
  const turma = await um('SELECT * FROM turmas WHERE id = ?', req.params.id);
  if (!turma) return res.redirecionar('/admin/turmas');
  return paginaTurma(req, res, turma);
});

post('/admin/turmas/:id/editar', async (req, res) => {
  const turma = await um('SELECT * FROM turmas WHERE id = ?', req.params.id);
  if (!turma) return res.redirecionar('/admin/turmas');
  const { dados, erros } = await lerFormularioTurma(req.corpo, turma.id);
  if (Object.keys(erros).length) return paginaTurma(req, res, turma, { dados, erros }, 422);

  await executar(
    'UPDATE turmas SET nome = ?, ano_letivo = ?, curso = ?, diretor_id = ? WHERE id = ?',
    dados.nome,
    dados.ano_letivo,
    dados.curso || null,
    dados.diretor_id,
    turma.id
  );

  // As mudanças de curso e de diretor de turma são as que o guião pede para auditar com mais destaque
  const alteracoes = [];
  if ((turma.curso || null) !== (dados.curso || null)) {
    alteracoes.push(`curso: "${turma.curso || '—'}" → "${dados.curso || '—'}"`);
  }
  if ((turma.diretor_id || null) !== (dados.diretor_id || null)) {
    const [antigo, novo] = await Promise.all([
      turma.diretor_id ? um('SELECT nome FROM professores WHERE id = ?', turma.diretor_id) : null,
      dados.diretor_id ? um('SELECT nome FROM professores WHERE id = ?', dados.diretor_id) : null,
    ]);
    alteracoes.push(`diretor de turma: "${antigo?.nome || '—'}" → "${novo?.nome || '—'}"`);
  }
  await registarLog(
    req,
    'editar',
    'turma',
    turma.id,
    `Editou a turma "${turma.nome}"${alteracoes.length ? ` — ${alteracoes.join('; ')}` : ''}.`
  );

  req.flash('sucesso', `Turma ${dados.nome} atualizada.`);
  res.redirecionar(`/admin/turmas/${turma.id}`);
});

post('/admin/turmas/:id/apagar', async (req, res) => {
  const turma = await um('SELECT * FROM turmas WHERE id = ?', req.params.id);
  if (!turma) return res.redirecionar('/admin/turmas');

  // Proteção: não apagar turmas com alunos, faltas ou sumários (perdia-se o histórico)
  const alunos = (await um('SELECT COUNT(*) AS n FROM alunos WHERE turma_id = ?', turma.id)).n;
  if (alunos || (await temHistorico(turma.id))) {
    req.flash('erro', 'Não é possível apagar uma turma com alunos, faltas ou sumários registados.');
    return res.redirecionar(`/admin/turmas/${turma.id}`);
  }

  await executar('DELETE FROM turmas WHERE id = ?', turma.id);
  await registarLog(req, 'apagar', 'turma', turma.id, `Apagou a turma "${turma.nome}" (${turma.ano_letivo}).`);
  req.flash('sucesso', `Turma ${turma.nome} apagada.`);
  res.redirecionar('/admin/turmas');
});
