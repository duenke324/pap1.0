// Painel do Administrador: gestão de outros funcionários (pessoal não-docente)
const { get, post } = require('../lib/servidor');
const { todos, um, executar, transacao } = require('../db');
const { pagina, vazio } = require('../vistas/layout');
const { h, gerarHash, iniciais, emailInstitucionalValido, DOMINIO_EMAIL, CARGOS_FUNCIONARIO } = require('../lib/util');
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

async function lerFormularioFuncionario(corpo, funcionario = null) {
  const dados = {
    nome: String(corpo.nome || '').trim().replace(/\s+/g, ' '),
    numero_processo: String(corpo.numero_processo || '').trim(),
    cargo: String(corpo.cargo || '').trim(),
    email: String(corpo.email || '').trim(),
    contacto: String(corpo.contacto || '').trim(),
    password: String(corpo.password || ''),
  };
  const erros = {};

  if (dados.nome.length < 3 || dados.nome.length > 120) erros.nome = 'Indique o nome completo (3 a 120 caracteres).';
  if (!/^[A-Za-z0-9-]{1,20}$/.test(dados.numero_processo)) {
    erros.numero_processo = 'Use apenas letras, números ou hífen (máx. 20).';
  } else if (
    await um('SELECT 1 FROM utilizadores WHERE username = ? AND NOT (id <=> ?)', dados.numero_processo, funcionario?.utilizador_id ?? null)
  ) {
    erros.numero_processo = 'Já existe um utilizador com este número.';
  }
  if (!(dados.cargo in CARGOS_FUNCIONARIO)) erros.cargo = 'Escolha um cargo.';
  if (dados.email && !emailInstitucionalValido(dados.email)) erros.email = `O email tem de acabar em @${DOMINIO_EMAIL}.`;
  if (dados.contacto && !/^\+?[\d\s]{9,20}$/.test(dados.contacto)) erros.contacto = 'Contacto inválido (ex.: 912 345 678).';
  if (!funcionario && dados.password.length < 6) erros.password = 'A palavra-passe deve ter pelo menos 6 caracteres.';
  if (funcionario && dados.password && dados.password.length < 6) erros.password = 'A palavra-passe deve ter pelo menos 6 caracteres.';

  return { dados, erros };
}

function formularioFuncionario({ funcionario = {}, erros = {}, acao, titulo, editar = false }) {
  const { erro, cls } = ajudantesCampos(erros);
  return `
    ${alertaErros(erros)}
    <form method="post" action="${acao}" class="cartao formulario">
      <div class="grelha-form">
        <label class="coluna-toda">Nome completo *
          <input name="nome" value="${h(funcionario.nome)}" required maxlength="120"${cls('nome')}>${erro('nome')}</label>
        <label>Número de processo *
          <input name="numero_processo" value="${h(funcionario.numero_processo)}" required maxlength="20" autocomplete="off"${cls('numero_processo')}>
          ${erro('numero_processo') || '<small class="texto-suave">Também é o nome de utilizador do funcionário.</small>'}</label>
        <label>Cargo *
          <select name="cargo" required${cls('cargo')}>
            <option value="">— Escolha —</option>
            ${Object.entries(CARGOS_FUNCIONARIO)
              .map(([v, rotulo]) => `<option value="${v}"${v === funcionario.cargo ? ' selected' : ''}>${h(rotulo)}</option>`)
              .join('')}
          </select>${erro('cargo')}</label>
        <label>Email institucional
          <input type="email" name="email" value="${h(funcionario.email)}" maxlength="120" placeholder="nome@${DOMINIO_EMAIL}"${cls('email')}>
          ${erro('email') || `<small class="texto-suave">Opcional. Se indicado, tem de acabar em @${DOMINIO_EMAIL}.</small>`}</label>
        <label>Contacto
          <input name="contacto" value="${h(funcionario.contacto)}" maxlength="20" placeholder="Ex.: 912 345 678"${cls('contacto')}>${erro('contacto')}</label>
        <label class="coluna-toda">${editar ? 'Nova palavra-passe' : 'Palavra-passe de acesso *'}
          <input type="password" name="password" autocomplete="new-password" minlength="6" ${editar ? 'placeholder="Deixe em branco para manter a atual"' : 'required'}${cls('password')}>
          ${erro('password') || '<small class="texto-suave">Assim que entrar, o funcionário tem de a substituir por uma escolhida por ele.</small>'}</label>
      </div>
      <div class="barra-acoes"><button class="botao">${h(titulo)}</button></div>
    </form>`;
}

async function carregarFuncionario(id) {
  return um('SELECT * FROM funcionarios WHERE id = ?', id);
}

get('/admin/funcionarios', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const cargo = String(req.query.cargo || '').trim();
  const funcionarios = await todos(
    `SELECT * FROM funcionarios
      WHERE (? = '' OR cargo = ?)
        AND (? = '' OR nome LIKE ? OR numero_processo LIKE ? OR email LIKE ?)
      ORDER BY nome`,
    cargo,
    cargo,
    q,
    `%${q}%`,
    `%${q}%`,
    `%${q}%`
  );

  const conteudo = `
    <section class="cartao">
      <form class="filtros" method="get">
        <label>Cargo
          <select name="cargo" data-submeter>
            <option value="">Todos</option>
            ${Object.entries(CARGOS_FUNCIONARIO).map(([v, rotulo]) => `<option value="${v}"${v === cargo ? ' selected' : ''}>${h(rotulo)}</option>`).join('')}
          </select></label>
        <label class="crescer">Pesquisar
          <input type="search" name="q" value="${h(q)}" placeholder="Nome, número de processo ou email"></label>
        <button class="botao botao-secundario">Filtrar</button>
        <span class="contador">${funcionarios.length} funcionário(s)</span>
      </form>
      ${
        funcionarios.length
          ? `<div class="tabela-scroll"><table class="tabela">
          <thead><tr><th>Funcionário</th><th>N.º de processo</th><th>Cargo</th><th>Contacto</th><th></th></tr></thead>
          <tbody>${funcionarios
            .map(
              (f) => `<tr>
              <td><a class="aluno-linha" href="/admin/funcionarios/${f.id}"><span class="avatar pequeno">${h(iniciais(f.nome))}</span>
                <span>${h(f.nome)}<small>${h(f.email || '')}</small></span></a></td>
              <td>${h(f.numero_processo)}</td>
              <td>${h(CARGOS_FUNCIONARIO[f.cargo] || f.cargo)}</td>
              <td>${h(f.contacto || '—')}</td>
              <td class="direita"><a class="botao-texto" href="/admin/funcionarios/${f.id}/editar">Editar</a></td>
            </tr>`
            )
            .join('')}</tbody></table></div>`
          : vazio('Nenhum funcionário encontrado.')
      }
    </section>`;

  res.html(
    pagina(
      req,
      { titulo: 'Funcionários', ativo: 'funcionarios', acoes: `<a class="botao" href="/admin/funcionarios/novo">+ Novo funcionário</a>` },
      conteudo
    )
  );
});

get('/admin/funcionarios/novo', (req, res) => {
  res.html(
    pagina(
      req,
      { titulo: 'Novo funcionário', ativo: 'funcionarios' },
      `<p><a class="voltar" href="/admin/funcionarios">← Funcionários</a></p>` +
        formularioFuncionario({ acao: '/admin/funcionarios/novo', titulo: 'Criar funcionário' })
    )
  );
});

post('/admin/funcionarios/novo', async (req, res) => {
  const { dados, erros } = await lerFormularioFuncionario(req.corpo);
  if (temErros(erros)) {
    return res.html(
      pagina(
        req,
        { titulo: 'Novo funcionário', ativo: 'funcionarios' },
        `<p><a class="voltar" href="/admin/funcionarios">← Funcionários</a></p>` +
          formularioFuncionario({ funcionario: dados, erros, acao: '/admin/funcionarios/novo', titulo: 'Criar funcionário' })
      ),
      422
    );
  }

  const funcionarioId = await transacao(async (tx) => {
    const u = await tx.executar(
      `INSERT INTO utilizadores (username, password_hash, papel, nome, deve_redefinir_password) VALUES (?, ?, 'funcionario', ?, 1)`,
      dados.numero_processo,
      gerarHash(dados.password),
      dados.nome
    );
    const f = await tx.executar(
      'INSERT INTO funcionarios (utilizador_id, numero_processo, nome, cargo, email, contacto) VALUES (?, ?, ?, ?, ?, ?)',
      u.lastInsertRowid,
      dados.numero_processo,
      dados.nome,
      dados.cargo,
      dados.email || null,
      dados.contacto || null
    );
    return f.lastInsertRowid;
  });

  await registarLog(
    req,
    'criar',
    'funcionario',
    funcionarioId,
    `Criou o funcionário "${dados.nome}" (${CARGOS_FUNCIONARIO[dados.cargo]}, n.º processo ${dados.numero_processo}).`
  );
  req.flash('sucesso', `Funcionário ${dados.nome} criado. Utilizador: ${dados.numero_processo}.`);
  res.redirecionar(`/admin/funcionarios/${funcionarioId}`);
});

get('/admin/funcionarios/:id', async (req, res) => {
  const f = await carregarFuncionario(req.params.id);
  if (!f) return res.redirecionar('/admin/funcionarios');

  const conteudo = `
    <p><a class="voltar" href="/admin/funcionarios">← Funcionários</a></p>
    <section class="cartao ficha">
      <span class="avatar grande">${h(iniciais(f.nome))}</span>
      <h2>${h(f.nome)}</h2>
      <dl class="dados">
        <dt>N.º de processo</dt><dd>${h(f.numero_processo)}</dd>
        <dt>Cargo</dt><dd>${h(CARGOS_FUNCIONARIO[f.cargo] || f.cargo)}</dd>
        <dt>Email</dt><dd>${f.email ? `<a href="mailto:${h(f.email)}">${h(f.email)}</a>` : '—'}</dd>
        <dt>Contacto</dt><dd>${f.contacto ? `<a href="tel:${h(f.contacto)}">${h(f.contacto)}</a>` : '—'}</dd>
      </dl>
      <div class="barra-acoes">
        <a class="botao" href="/admin/funcionarios/${f.id}/editar">Editar</a>
        <form method="post" action="/admin/funcionarios/${f.id}/apagar" data-confirmar="Apagar o funcionário ${h(f.nome)}?">
          <button class="botao botao-perigo">Apagar</button>
        </form>
      </div>
    </section>`;
  res.html(pagina(req, { titulo: 'Ficha do funcionário', ativo: 'funcionarios' }, conteudo));
});

get('/admin/funcionarios/:id/editar', async (req, res) => {
  const f = await carregarFuncionario(req.params.id);
  if (!f) return res.redirecionar('/admin/funcionarios');
  res.html(
    pagina(
      req,
      { titulo: 'Editar funcionário', ativo: 'funcionarios' },
      `<p><a class="voltar" href="/admin/funcionarios/${f.id}">← ${h(f.nome)}</a></p>` +
        formularioFuncionario({ funcionario: f, acao: `/admin/funcionarios/${f.id}/editar`, titulo: 'Guardar alterações', editar: true })
    )
  );
});

post('/admin/funcionarios/:id/editar', async (req, res) => {
  const f = await carregarFuncionario(req.params.id);
  if (!f) return res.redirecionar('/admin/funcionarios');
  const { dados, erros } = await lerFormularioFuncionario(req.corpo, f);
  if (temErros(erros)) {
    return res.html(
      pagina(
        req,
        { titulo: 'Editar funcionário', ativo: 'funcionarios' },
        `<p><a class="voltar" href="/admin/funcionarios/${f.id}">← ${h(f.nome)}</a></p>` +
          formularioFuncionario({ funcionario: dados, erros, acao: `/admin/funcionarios/${f.id}/editar`, titulo: 'Guardar alterações', editar: true })
      ),
      422
    );
  }

  await transacao(async (tx) => {
    await tx.executar(
      'UPDATE funcionarios SET numero_processo = ?, nome = ?, cargo = ?, email = ?, contacto = ? WHERE id = ?',
      dados.numero_processo,
      dados.nome,
      dados.cargo,
      dados.email || null,
      dados.contacto || null,
      f.id
    );
    await tx.executar('UPDATE utilizadores SET username = ?, nome = ? WHERE id = ?', dados.numero_processo, dados.nome, f.utilizador_id);
    if (dados.password) {
      await tx.executar(
        'UPDATE utilizadores SET password_hash = ?, deve_redefinir_password = 1 WHERE id = ?',
        gerarHash(dados.password),
        f.utilizador_id
      );
    }
  });

  const cargoMudou = f.cargo !== dados.cargo;
  await registarLog(
    req,
    'editar',
    'funcionario',
    f.id,
    `Editou o funcionário "${f.nome}"${dados.password ? ' (incl. nova palavra-passe)' : ''}${cargoMudou ? ` — alterou o cargo para ${CARGOS_FUNCIONARIO[dados.cargo]}` : ''}.`
  );
  req.flash('sucesso', `Dados de ${dados.nome} atualizados.`);
  res.redirecionar(`/admin/funcionarios/${f.id}`);
});

post('/admin/funcionarios/:id/apagar', async (req, res) => {
  const f = await carregarFuncionario(req.params.id);
  if (f) {
    // Apagar a conta apaga também a ficha (ON DELETE CASCADE)
    await executar('DELETE FROM utilizadores WHERE id = ?', f.utilizador_id);
    await registarLog(req, 'apagar', 'funcionario', f.id, `Apagou o funcionário "${f.nome}" (n.º processo ${f.numero_processo}).`);
    req.flash('sucesso', `Funcionário ${f.nome} apagado.`);
  }
  res.redirecionar('/admin/funcionarios');
});
