// Painel do Administrador: gestão de professores e de disciplinas
const { get, post } = require('../lib/servidor');
const { todos, um, executar, transacao } = require('../db');
const { pagina, vazio, grelhaHorario, botaoImprimir } = require('../vistas/layout');
const { h, gerarHash, comoLista, iniciais, emailInstitucionalValido, DOMINIO_EMAIL } = require('../lib/util');
const { registarLog } = require('../lib/auditoria');

const temErros = (erros) => Object.keys(erros).length > 0;
const alertaErros = (erros) =>
  temErros(erros) ? `<div class="alerta alerta-erro" role="alert">Corrija os campos assinalados.</div>` : '';

function ajudantesCampos(erros) {
  return {
    erro: (campo) => (erros[campo] ? `<small class="erro-campo">${h(erros[campo])}</small>` : ''),
    cls: (campo) => (erros[campo] ? ' class="invalido"' : ''),
  };
}

// =====================================================================
//  PROFESSORES
// =====================================================================

async function lerFormularioProfessor(corpo, professor = null) {
  const dados = {
    nome: String(corpo.nome || '').trim().replace(/\s+/g, ' '),
    numero_processo: String(corpo.numero_processo || '').trim(),
    email: String(corpo.email || '').trim(),
    password: String(corpo.password || ''),
    disciplinas: comoLista(corpo.disciplinas).map(Number).filter(Number.isInteger),
  };
  const erros = {};

  if (dados.nome.length < 3 || dados.nome.length > 120) erros.nome = 'Indique o nome completo (3 a 120 caracteres).';
  if (!/^[A-Za-z0-9-]{1,20}$/.test(dados.numero_processo)) {
    erros.numero_processo = 'Use apenas letras, números ou hífen (máx. 20).';
  } else if (await um('SELECT 1 FROM utilizadores WHERE username = ? AND NOT (id <=> ?)', dados.numero_processo, professor?.utilizador_id ?? null)) {
    erros.numero_processo = 'Já existe um utilizador com este número.';
  }
  if (dados.email && !emailInstitucionalValido(dados.email)) erros.email = `O email tem de acabar em @${DOMINIO_EMAIL}.`;
  if (!professor && dados.password.length < 6) erros.password = 'A palavra-passe deve ter pelo menos 6 caracteres.';
  if (professor && dados.password && dados.password.length < 6) erros.password = 'A palavra-passe deve ter pelo menos 6 caracteres.';

  return { dados, erros };
}

async function formularioProfessor({ professor = {}, erros = {}, acao, titulo, editar = false }) {
  const disciplinas = await todos('SELECT * FROM disciplinas ORDER BY nome');
  const marcadas = new Set((professor.disciplinas || []).map(Number));
  const { erro, cls } = ajudantesCampos(erros);

  return `
    ${alertaErros(erros)}
    <form method="post" action="${acao}" class="cartao formulario">
      <div class="grelha-form">
        <label class="coluna-toda">Nome completo *
          <input name="nome" value="${h(professor.nome)}" required maxlength="120"${cls('nome')}>${erro('nome')}</label>
        <label>Número de processo *
          <input name="numero_processo" value="${h(professor.numero_processo)}" required maxlength="20" autocomplete="off"${cls('numero_processo')}>
          ${erro('numero_processo') || '<small class="texto-suave">Também é o nome de utilizador do professor.</small>'}</label>
        <label>Email institucional
          <input type="email" name="email" value="${h(professor.email)}" maxlength="120" placeholder="nome@${DOMINIO_EMAIL}"${cls('email')}>
          ${erro('email') || `<small class="texto-suave">Tem de acabar em @${DOMINIO_EMAIL}.</small>`}</label>
        <label class="coluna-toda">${editar ? 'Nova palavra-passe' : 'Palavra-passe de acesso *'}
          <input type="password" name="password" autocomplete="new-password" minlength="6" ${editar ? 'placeholder="Deixe em branco para manter a atual"' : 'required'}${cls('password')}>
          ${erro('password') || '<small class="texto-suave">Assim que entrar, o professor tem de a substituir por uma escolhida por ele.</small>'}</label>
      </div>
      <fieldset class="grupo-checks">
        <legend>Disciplinas que leciona</legend>
        ${
          disciplinas.length
            ? disciplinas
                .map(
                  (d) => `<label class="linha-check"><input type="checkbox" name="disciplinas" value="${d.id}"${marcadas.has(d.id) ? ' checked' : ''}>
                  <span class="sigla-mini cor-${d.id % 8}">${h(d.sigla)}</span> ${h(d.nome)}</label>`
                )
                .join('')
            : `<p class="texto-suave">Ainda não existem disciplinas. <a href="/admin/disciplinas">Criar disciplinas</a></p>`
        }
      </fieldset>
      <p class="legenda">Só as disciplinas marcadas aparecem para este professor no editor de horários.</p>
      <div class="barra-acoes"><button class="botao">${h(titulo)}</button></div>
    </form>`;
}

async function guardarDisciplinasProfessor(tx, professorId, disciplinas) {
  await tx.executar('DELETE FROM professor_disciplinas WHERE professor_id = ?', professorId);
  for (const d of disciplinas) {
    await tx.executar(
      'INSERT IGNORE INTO professor_disciplinas (professor_id, disciplina_id) SELECT ?, id FROM disciplinas WHERE id = ?',
      professorId,
      d
    );
  }
}

async function carregarProfessor(id) {
  const p = await um('SELECT * FROM professores WHERE id = ?', id);
  if (p) p.disciplinas = (await todos('SELECT disciplina_id FROM professor_disciplinas WHERE professor_id = ?', p.id)).map((l) => l.disciplina_id);
  return p;
}

get('/admin/professores', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const professores = await todos(
    `SELECT p.*,
            (SELECT GROUP_CONCAT(d.sigla ORDER BY d.sigla SEPARATOR ', ')
               FROM professor_disciplinas pd JOIN disciplinas d ON d.id = pd.disciplina_id WHERE pd.professor_id = p.id) AS disciplinas,
            (SELECT COUNT(*) FROM horario hr WHERE hr.professor_id = p.id AND hr.ativo = 1) AS tempos,
            (SELECT GROUP_CONCAT(DISTINCT t.nome ORDER BY t.nome SEPARATOR ', ')
               FROM horario hr JOIN turmas t ON t.id = hr.turma_id WHERE hr.professor_id = p.id AND hr.ativo = 1) AS turmas
       FROM professores p
      WHERE (? = '' OR p.nome LIKE ? OR p.numero_processo LIKE ? OR p.email LIKE ?)
      ORDER BY p.nome`,
    q,
    `%${q}%`,
    `%${q}%`,
    `%${q}%`
  );

  const conteudo = `
    <section class="cartao">
      <form class="filtros" method="get">
        <label class="crescer">Pesquisar
          <input type="search" name="q" value="${h(q)}" placeholder="Nome, número de processo ou email"></label>
        <button class="botao botao-secundario">Filtrar</button>
        <span class="contador">${professores.length} professor(es)</span>
      </form>
      ${
        professores.length
          ? `<div class="tabela-scroll"><table class="tabela">
          <thead><tr><th>Professor</th><th>N.º de processo</th><th>Disciplinas</th><th>Turmas</th><th class="direita">Tempos/semana</th><th></th></tr></thead>
          <tbody>${professores
            .map(
              (p) => `<tr>
              <td><a class="aluno-linha" href="/admin/professores/${p.id}"><span class="avatar pequeno">${h(iniciais(p.nome))}</span>
                <span>${h(p.nome)}<small>${h(p.email || '')}</small></span></a></td>
              <td>${h(p.numero_processo)}</td>
              <td>${h(p.disciplinas || '—')}</td>
              <td>${h(p.turmas || '—')}</td>
              <td class="direita">${p.tempos}</td>
              <td class="direita"><a class="botao-texto" href="/admin/professores/${p.id}/editar">Editar</a></td>
            </tr>`
            )
            .join('')}</tbody></table></div>`
          : vazio('Nenhum professor encontrado.')
      }
    </section>`;

  res.html(
    pagina(req, { titulo: 'Professores', ativo: 'professores', acoes: `<a class="botao" href="/admin/professores/novo">+ Novo professor</a>` }, conteudo)
  );
});

get('/admin/professores/novo', async (req, res) => {
  res.html(
    pagina(
      req,
      { titulo: 'Novo professor', ativo: 'professores' },
      `<p><a class="voltar" href="/admin/professores">← Professores</a></p>` +
        (await formularioProfessor({ acao: '/admin/professores/novo', titulo: 'Criar professor' }))
    )
  );
});

post('/admin/professores/novo', async (req, res) => {
  const { dados, erros } = await lerFormularioProfessor(req.corpo);
  if (temErros(erros)) {
    return res.html(
      pagina(
        req,
        { titulo: 'Novo professor', ativo: 'professores' },
        `<p><a class="voltar" href="/admin/professores">← Professores</a></p>` +
          (await formularioProfessor({ professor: dados, erros, acao: '/admin/professores/novo', titulo: 'Criar professor' }))
      ),
      422
    );
  }

  const professorId = await transacao(async (tx) => {
    const u = await tx.executar(
      `INSERT INTO utilizadores (username, password_hash, papel, nome, deve_redefinir_password) VALUES (?, ?, 'professor', ?, 1)`,
      dados.numero_processo,
      gerarHash(dados.password),
      dados.nome
    );
    const p = await tx.executar(
      'INSERT INTO professores (utilizador_id, numero_processo, nome, email) VALUES (?, ?, ?, ?)',
      u.lastInsertRowid,
      dados.numero_processo,
      dados.nome,
      dados.email || null
    );
    await guardarDisciplinasProfessor(tx, p.lastInsertRowid, dados.disciplinas);
    return p.lastInsertRowid;
  });

  await registarLog(req, 'criar', 'professor', professorId, `Criou o professor "${dados.nome}" (n.º processo ${dados.numero_processo}).`);
  req.flash('sucesso', `Professor ${dados.nome} criado. Utilizador: ${dados.numero_processo}.`);
  res.redirecionar(`/admin/professores/${professorId}`);
});

get('/admin/professores/:id', async (req, res) => {
  const p = await carregarProfessor(req.params.id);
  if (!p) return res.redirecionar('/admin/professores');
  const disciplinas = await todos(
    `SELECT d.* FROM professor_disciplinas pd JOIN disciplinas d ON d.id = pd.disciplina_id WHERE pd.professor_id = ? ORDER BY d.nome`,
    p.id
  );
  const aulas = await todos(
    `SELECT hr.*, d.nome AS disciplina, d.sigla, t.nome AS turma
       FROM horario hr JOIN disciplinas d ON d.id = hr.disciplina_id JOIN turmas t ON t.id = hr.turma_id
      WHERE hr.professor_id = ? AND hr.ativo = 1 ORDER BY hr.dia_semana, hr.hora_inicio`,
    p.id
  );
  const turmas = [...new Map(aulas.map((a) => [a.turma_id, a.turma])).entries()];

  const conteudo = `
    <p><a class="voltar" href="/admin/professores">← Professores</a></p>
    <div class="grelha-ficha">
      <section class="cartao ficha">
        <span class="avatar grande">${h(iniciais(p.nome))}</span>
        <h2>${h(p.nome)}</h2>
        <dl class="dados">
          <dt>N.º de processo</dt><dd>${h(p.numero_processo)}</dd>
          <dt>Email</dt><dd>${p.email ? `<a href="mailto:${h(p.email)}">${h(p.email)}</a>` : '—'}</dd>
          <dt>Disciplinas</dt><dd>${disciplinas.length ? disciplinas.map((d) => `<span class="sigla-mini cor-${d.id % 8}" title="${h(d.nome)}">${h(d.sigla)}</span>`).join(' ') : '—'}</dd>
          <dt>Turmas</dt><dd>${turmas.length ? turmas.map(([id, nome]) => `<a href="/admin/turmas/${id}/horario">${h(nome)}</a>`).join(', ') : '—'}</dd>
          <dt>Carga semanal</dt><dd>${aulas.length} tempo(s)</dd>
        </dl>
        <div class="barra-acoes">
          <a class="botao" href="/admin/professores/${p.id}/editar">Editar</a>
          <form method="post" action="/admin/professores/${p.id}/apagar" data-confirmar="Apagar o professor ${h(p.nome)}? As aulas dele ficam sem professor no horário.">
            <button class="botao botao-perigo">Apagar</button>
          </form>
        </div>
      </section>
      <section class="cartao">
        <h2>Horário do professor</h2>
        ${grelhaHorario(aulas, { mostrarTurma: true })}
        <p class="legenda">Para alterar, abra o horário de cada turma em <a href="/admin/horarios">Horários</a>.</p>
      </section>
    </div>`;
  res.html(pagina(req, { titulo: 'Ficha do professor', ativo: 'professores', acoes: botaoImprimir() }, conteudo));
});

get('/admin/professores/:id/editar', async (req, res) => {
  const p = await carregarProfessor(req.params.id);
  if (!p) return res.redirecionar('/admin/professores');
  res.html(
    pagina(
      req,
      { titulo: 'Editar professor', ativo: 'professores' },
      `<p><a class="voltar" href="/admin/professores/${p.id}">← ${h(p.nome)}</a></p>` +
        (await formularioProfessor({ professor: p, acao: `/admin/professores/${p.id}/editar`, titulo: 'Guardar alterações', editar: true }))
    )
  );
});

post('/admin/professores/:id/editar', async (req, res) => {
  const p = await carregarProfessor(req.params.id);
  if (!p) return res.redirecionar('/admin/professores');
  const { dados, erros } = await lerFormularioProfessor(req.corpo, p);
  if (temErros(erros)) {
    return res.html(
      pagina(
        req,
        { titulo: 'Editar professor', ativo: 'professores' },
        `<p><a class="voltar" href="/admin/professores/${p.id}">← ${h(p.nome)}</a></p>` +
          (await formularioProfessor({ professor: dados, erros, acao: `/admin/professores/${p.id}/editar`, titulo: 'Guardar alterações', editar: true }))
      ),
      422
    );
  }

  await transacao(async (tx) => {
    await tx.executar(
      'UPDATE professores SET numero_processo = ?, nome = ?, email = ? WHERE id = ?',
      dados.numero_processo,
      dados.nome,
      dados.email || null,
      p.id
    );
    await tx.executar('UPDATE utilizadores SET username = ?, nome = ? WHERE id = ?', dados.numero_processo, dados.nome, p.utilizador_id);
    if (dados.password) {
      await tx.executar(
        'UPDATE utilizadores SET password_hash = ?, deve_redefinir_password = 1 WHERE id = ?',
        gerarHash(dados.password),
        p.utilizador_id
      );
    }
    await guardarDisciplinasProfessor(tx, p.id, dados.disciplinas);
  });

  // "Cargo" aqui equivale às disciplinas que o professor passa a lecionar — é a alteração crítica a auditar
  const disciplinasMudaram = comoLista(p.disciplinas).sort().join(',') !== comoLista(dados.disciplinas).sort().join(',');
  await registarLog(
    req,
    'editar',
    'professor',
    p.id,
    `Editou o professor "${p.nome}"${dados.password ? ' (incl. nova palavra-passe)' : ''}${disciplinasMudaram ? ' — alterou as disciplinas que leciona' : ''}.`
  );

  req.flash('sucesso', `Dados de ${dados.nome} atualizados.`);
  res.redirecionar(`/admin/professores/${p.id}`);
});

post('/admin/professores/:id/apagar', async (req, res) => {
  const p = await carregarProfessor(req.params.id);
  if (p) {
    // Apagar a conta apaga também a ficha (ON DELETE CASCADE); as aulas ficam sem professor
    await executar('DELETE FROM utilizadores WHERE id = ?', p.utilizador_id);
    await registarLog(req, 'apagar', 'professor', p.id, `Apagou o professor "${p.nome}" (n.º processo ${p.numero_processo}).`);
    req.flash('sucesso', `Professor ${p.nome} apagado.`);
  }
  res.redirecionar('/admin/professores');
});

// =====================================================================
//  DISCIPLINAS
// =====================================================================

async function lerFormularioDisciplina(corpo, disciplinaId = null) {
  const dados = {
    nome: String(corpo.nome || '').trim().replace(/\s+/g, ' '),
    sigla: String(corpo.sigla || '').trim().toUpperCase(),
  };
  const erros = {};
  if (dados.nome.length < 2 || dados.nome.length > 100) {
    erros.nome = 'Indique o nome (2 a 100 caracteres).';
  } else if (await um('SELECT 1 FROM disciplinas WHERE nome = ? AND NOT (id <=> ?)', dados.nome, disciplinaId)) {
    erros.nome = 'Já existe uma disciplina com este nome.';
  }
  if (!/^[A-Z0-9ÁÉÍÓÚÂÊÔÃÕÇ]{1,10}$/.test(dados.sigla)) erros.sigla = 'Sigla de 1 a 10 letras ou números.';
  return { dados, erros };
}

function formularioDisciplina({ disciplina = {}, erros = {}, acao, titulo }) {
  const { erro, cls } = ajudantesCampos(erros);
  return `
    ${alertaErros(erros)}
    <form method="post" action="${acao}" class="grelha-form">
      <label class="coluna-dupla">Nome *
        <input name="nome" value="${h(disciplina.nome)}" required maxlength="100" placeholder="Ex.: Física e Química"${cls('nome')}>${erro('nome')}</label>
      <label>Sigla *
        <input name="sigla" value="${h(disciplina.sigla)}" required maxlength="10" placeholder="Ex.: FQ"${cls('sigla')}>${erro('sigla')}</label>
      <div class="coluna-toda barra-acoes"><button class="botao">${h(titulo)}</button></div>
    </form>`;
}

async function paginaDisciplinas(req, res, { dados = {}, erros = {} } = {}, estado = 200) {
  const disciplinas = await todos(
    `SELECT d.*,
            (SELECT COUNT(*) FROM professor_disciplinas pd WHERE pd.disciplina_id = d.id) AS professores,
            (SELECT COUNT(*) FROM horario hr WHERE hr.disciplina_id = d.id AND hr.ativo = 1) AS tempos,
            (SELECT COUNT(*) FROM modulos m WHERE m.disciplina_id = d.id) AS modulos
       FROM disciplinas d ORDER BY d.nome`
  );
  const conteudo = `
    <section class="cartao">
      <h2>Criar disciplina</h2>
      ${formularioDisciplina({ disciplina: dados, erros, acao: '/admin/disciplinas', titulo: 'Criar disciplina' })}
    </section>
    <section class="cartao">
      <div class="cartao-topo"><h2>Disciplinas</h2><span class="contador">${disciplinas.length} disciplina(s)</span></div>
      ${
        disciplinas.length
          ? `<div class="tabela-scroll"><table class="tabela">
          <thead><tr><th>Sigla</th><th>Nome</th><th class="direita">Módulos</th><th class="direita">Professores</th><th class="direita">Tempos/semana (todas as turmas)</th><th></th></tr></thead>
          <tbody>${disciplinas
            .map(
              (d) => `<tr>
              <td><span class="sigla-mini cor-${d.id % 8}">${h(d.sigla)}</span></td>
              <td>${h(d.nome)}</td>
              <td class="direita">${d.modulos}</td>
              <td class="direita">${d.professores}</td>
              <td class="direita">${d.tempos}</td>
              <td class="direita"><a class="botao-texto" href="/admin/disciplinas/${d.id}">Editar</a></td>
            </tr>`
            )
            .join('')}</tbody></table></div>`
          : vazio('Ainda não existem disciplinas.')
      }
    </section>`;
  res.html(pagina(req, { titulo: 'Disciplinas', ativo: 'disciplinas' }, conteudo), estado);
}

get('/admin/disciplinas', async (req, res) => paginaDisciplinas(req, res));

post('/admin/disciplinas', async (req, res) => {
  const { dados, erros } = await lerFormularioDisciplina(req.corpo);
  if (temErros(erros)) return paginaDisciplinas(req, res, { dados, erros }, 422);
  const r = await executar('INSERT INTO disciplinas (nome, sigla) VALUES (?, ?)', dados.nome, dados.sigla);
  await registarLog(req, 'criar', 'disciplina', r.lastInsertRowid, `Criou a disciplina "${dados.nome}" (${dados.sigla}).`);
  req.flash('sucesso', `Disciplina ${dados.nome} criada. Associe-a aos professores que a lecionam.`);
  res.redirecionar('/admin/disciplinas');
});

// Uma disciplina não pode ser apagada depois de usada num horário, teste ou classificação
// (a mesma condição serve para mostrar o aviso e para bloquear o apagar, para nunca desalinharem)
async function disciplinaEmUso(disciplinaId) {
  return !!(await um(
    `SELECT 1 FROM horario WHERE disciplina_id = ? UNION SELECT 1 FROM testes WHERE disciplina_id = ?
     UNION SELECT 1 FROM notas n JOIN modulos m ON m.id = n.modulo_id WHERE m.disciplina_id = ? LIMIT 1`,
    disciplinaId,
    disciplinaId,
    disciplinaId
  ));
}

async function paginaDisciplina(req, res, d, { dados, erros = {}, modulo = null, errosModulo = {} } = {}, estado = 200) {
  const emUso = await disciplinaEmUso(d.id);
  const modulos = await todos(
    `SELECT m.*, (SELECT COUNT(*) FROM notas n WHERE n.modulo_id = m.id) AS notas,
            (SELECT COUNT(*) FROM licoes l WHERE l.modulo_id = m.id) AS licoes
       FROM modulos m WHERE m.disciplina_id = ? ORDER BY m.numero`,
    d.id
  );
  const proximo = modulos.length ? Math.max(...modulos.map((m) => m.numero)) + 1 : 1;
  const { erro, cls } = ajudantesCampos(errosModulo);

  const conteudo = `
    <p><a class="voltar" href="/admin/disciplinas">← Disciplinas</a></p>
    <section class="cartao">
      ${formularioDisciplina({ disciplina: dados || d, erros, acao: `/admin/disciplinas/${d.id}`, titulo: 'Guardar alterações' })}
      <hr class="separador">
      ${
        emUso
          ? `<p class="legenda">Esta disciplina não pode ser apagada porque já foi usada em horários, testes ou classificações.</p>`
          : `<form method="post" action="/admin/disciplinas/${d.id}/apagar" data-confirmar="Apagar a disciplina ${h(d.nome)}${modulos.length ? ' e os seus módulos' : ''}?">
               <button class="botao botao-perigo">Apagar disciplina</button></form>`
      }
    </section>
    <section class="cartao">
      <div class="cartao-topo"><h2>Módulos</h2><span class="contador">${modulos.length} módulo(s)</span></div>
      ${
        modulos.length
          ? `<div class="tabela-scroll"><table class="tabela tabela-modulos">
              <thead><tr><th>N.º</th><th>Nome</th><th>Horas</th><th class="direita">Uso</th><th></th></tr></thead>
              <tbody>${modulos
                .map(
                  (m) => `<tr>
                  <td><input form="modulo-${m.id}" name="numero" type="number" min="1" max="99" value="${m.numero}" required aria-label="Número"></td>
                  <td><input form="modulo-${m.id}" name="nome" value="${h(m.nome)}" maxlength="120" required aria-label="Nome"></td>
                  <td><input form="modulo-${m.id}" name="horas" type="number" min="1" max="999" value="${h(m.horas)}" aria-label="Horas"></td>
                  <td class="direita texto-suave">${m.licoes} lição(ões) · ${m.notas} nota(s)</td>
                  <td class="direita acoes-linha">
                    <form id="modulo-${m.id}" method="post" action="/admin/modulos/${m.id}"><button class="botao-texto">Guardar</button></form>
                    ${
                      m.notas
                        ? ''
                        : `<form method="post" action="/admin/modulos/${m.id}/apagar" data-confirmar="Apagar o módulo ${m.numero}?"><button class="botao-texto perigo">Apagar</button></form>`
                    }
                  </td>
                </tr>`
                )
                .join('')}</tbody>
            </table></div>`
          : vazio('Esta disciplina ainda não tem módulos.')
      }
      <h3>Novo módulo</h3>
      ${Object.keys(errosModulo).length ? `<div class="alerta alerta-erro" role="alert">Corrija os campos do módulo.</div>` : ''}
      <form method="post" action="/admin/disciplinas/${d.id}/modulos" class="grelha-form">
        <label>N.º *
          <input name="numero" type="number" min="1" max="99" value="${h(modulo?.numero ?? proximo)}" required${cls('numero')}>${erro('numero')}</label>
        <label class="coluna-dupla">Nome *
          <input name="nome" value="${h(modulo?.nome)}" maxlength="120" required placeholder="Ex.: Estruturas de controlo"${cls('nome')}>${erro('nome')}</label>
        <label>Horas
          <input name="horas" type="number" min="1" max="999" value="${h(modulo?.horas)}" placeholder="Ex.: 30"${cls('horas')}>${erro('horas')}</label>
        <div class="coluna-toda barra-acoes"><button class="botao">Adicionar módulo</button></div>
      </form>
      <p class="legenda">Os professores escolhem o módulo quando dão a aula e lançam as classificações por módulo (0 a 20, NC ou EF).
        As horas servem para calcular a percentagem de faltas de cada aluno no módulo.</p>
    </section>`;
  res.html(pagina(req, { titulo: `Disciplina ${d.nome}`, ativo: 'disciplinas' }, conteudo), estado);
}

// ---------- Módulos ----------
async function lerFormularioModulo(corpo, disciplinaId, moduloId = null) {
  const dados = {
    numero: Number(corpo.numero),
    nome: String(corpo.nome || '').trim().replace(/\s+/g, ' '),
    horas: String(corpo.horas ?? '').trim() === '' ? null : Number(corpo.horas),
  };
  const erros = {};
  if (!Number.isInteger(dados.numero) || dados.numero < 1 || dados.numero > 99) {
    erros.numero = 'Número de 1 a 99.';
  } else if (await um('SELECT 1 FROM modulos WHERE disciplina_id = ? AND numero = ? AND NOT (id <=> ?)', disciplinaId, dados.numero, moduloId)) {
    erros.numero = `Já existe o módulo ${dados.numero}.`;
  }
  if (dados.nome.length < 2 || dados.nome.length > 120) erros.nome = 'Nome de 2 a 120 caracteres.';
  if (dados.horas !== null && (!Number.isInteger(dados.horas) || dados.horas < 1 || dados.horas > 999)) erros.horas = 'Horas de 1 a 999.';
  return { dados, erros };
}

post('/admin/disciplinas/:id/modulos', async (req, res) => {
  const d = await um('SELECT * FROM disciplinas WHERE id = ?', req.params.id);
  if (!d) return res.redirecionar('/admin/disciplinas');
  const { dados, erros } = await lerFormularioModulo(req.corpo, d.id);
  if (temErros(erros)) return paginaDisciplina(req, res, d, { modulo: dados, errosModulo: erros }, 422);
  await executar('INSERT INTO modulos (disciplina_id, numero, nome, horas) VALUES (?, ?, ?, ?)', d.id, dados.numero, dados.nome, dados.horas);
  req.flash('sucesso', `Módulo ${dados.numero} – ${dados.nome} criado.`);
  res.redirecionar(`/admin/disciplinas/${d.id}`);
});

post('/admin/modulos/:id', async (req, res) => {
  const m = await um('SELECT * FROM modulos WHERE id = ?', req.params.id);
  if (!m) return res.redirecionar('/admin/disciplinas');
  const { dados, erros } = await lerFormularioModulo(req.corpo, m.disciplina_id, m.id);
  if (temErros(erros)) {
    req.flash('erro', `Módulo ${m.numero}: ${Object.values(erros).join(' ')}`);
  } else {
    await executar('UPDATE modulos SET numero = ?, nome = ?, horas = ? WHERE id = ?', dados.numero, dados.nome, dados.horas, m.id);
    req.flash('sucesso', `Módulo ${dados.numero} atualizado.`);
  }
  res.redirecionar(`/admin/disciplinas/${m.disciplina_id}`);
});

post('/admin/modulos/:id/apagar', async (req, res) => {
  const m = await um('SELECT * FROM modulos WHERE id = ?', req.params.id);
  if (!m) return res.redirecionar('/admin/disciplinas');
  if (await um('SELECT 1 FROM notas WHERE modulo_id = ? LIMIT 1', m.id)) {
    req.flash('erro', 'Este módulo já tem classificações e não pode ser apagado.');
  } else {
    // As lições deste módulo ficam "sem módulo" (ON DELETE SET NULL)
    await executar('DELETE FROM modulos WHERE id = ?', m.id);
    req.flash('sucesso', `Módulo ${m.numero} apagado.`);
  }
  res.redirecionar(`/admin/disciplinas/${m.disciplina_id}`);
});

get('/admin/disciplinas/:id', async (req, res) => {
  const d = await um('SELECT * FROM disciplinas WHERE id = ?', req.params.id);
  if (!d) return res.redirecionar('/admin/disciplinas');
  return paginaDisciplina(req, res, d);
});

post('/admin/disciplinas/:id', async (req, res) => {
  const d = await um('SELECT * FROM disciplinas WHERE id = ?', req.params.id);
  if (!d) return res.redirecionar('/admin/disciplinas');
  const { dados, erros } = await lerFormularioDisciplina(req.corpo, d.id);
  if (temErros(erros)) return paginaDisciplina(req, res, d, { dados, erros }, 422);
  await executar('UPDATE disciplinas SET nome = ?, sigla = ? WHERE id = ?', dados.nome, dados.sigla, d.id);
  await registarLog(req, 'editar', 'disciplina', d.id, `Editou a disciplina "${d.nome}" → "${dados.nome}" (${dados.sigla}).`);
  req.flash('sucesso', `Disciplina ${dados.nome} atualizada.`);
  res.redirecionar('/admin/disciplinas');
});

post('/admin/disciplinas/:id/apagar', async (req, res) => {
  const d = await um('SELECT * FROM disciplinas WHERE id = ?', req.params.id);
  if (!d) return res.redirecionar('/admin/disciplinas');
  if (await disciplinaEmUso(d.id)) {
    req.flash('erro', 'Esta disciplina já foi usada em horários, testes ou classificações e não pode ser apagada.');
    return res.redirecionar(`/admin/disciplinas/${d.id}`);
  }
  await executar('DELETE FROM disciplinas WHERE id = ?', d.id);
  await registarLog(req, 'apagar', 'disciplina', d.id, `Apagou a disciplina "${d.nome}" (${d.sigla}).`);
  req.flash('sucesso', `Disciplina ${d.nome} apagada.`);
  res.redirecionar('/admin/disciplinas');
});
