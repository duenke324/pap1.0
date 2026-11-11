// Painel da plataforma: só para o gestor (quem instala e vende a aplicação), fora de qualquer escola.
// Aqui criam-se as escolas: nome, domínio de email (o que vem depois do @) e nome da direção.
// Cada escola fica com a sua base de dados e com uma conta de administrador para a direção, que
// depois cria os alunos, professores, disciplinas e módulos no painel de administração da escola.
// O gestor vê também os alunos de cada escola por turma e pode gerar palavras-passe novas
// (de um aluno, de uma turma ou da escola toda) e exportá-las num ficheiro para as entregar.
// Tem um aspeto próprio, escuro, diferente do das escolas (public/plataforma.css).
//
// Inclui também as duas páginas públicas de escolha da escola:
//   /escolas          lista das escolas (aparece quando há mais do que uma e o browser ainda não escolheu)
//   /escola/<codigo>  endereço de entrada de uma escola: memoriza-a neste browser e segue para o login
const { get, post, renovarSessao, terminarSessao, acrescentarCookie } = require('../lib/servidor');
const { plataforma, escolasAtivas, escolaPorCodigo } = require('../db');
const { documento, paginaEntrada, mensagensFlash, icone, LOGO } = require('../vistas/layout');
const {
  COOKIE_ESCOLA,
  criarEscola,
  reporPasswordDirecao,
  normalizarDominio,
  DOMINIO_VALIDO,
  alunosPorTurma,
  gerarPasswordsAlunos,
} = require('../lib/escolas');
const { h, gerarHash, verificarPassword, formatarData, hoje, iniciais } = require('../lib/util');

// ---------- Escolha da escola (público) ----------
get('/escolas', async (req, res) => {
  const escolas = await escolasAtivas();
  res.html(
    paginaEntrada('Escolher escola', {
      tituloPainel: 'A sua escola',
      painel: escolas.length
        ? `<p class="entrada-texto">Escolha a sua escola para entrar. Este browser fica a lembrar-se da escolha.</p>
           <div class="entrada-form">${escolas
             .map((e) => `<a class="botao botao-bloco" href="/escola/${h(e.codigo)}">${h(e.nome)}</a>`)
             .join('')}</div>`
        : '<p class="entrada-texto">Ainda não há nenhuma escola a usar a plataforma.</p>',
    })
  );
});

// Só aceita destinos dentro do próprio site ("/login", "/recuperar-password/..."), nunca outro endereço
function destinoInterno(ir) {
  const destino = String(ir || '');
  return /^\/(?!\/)[\w\-./]*$/.test(destino) ? destino : '/login';
}

get('/escola/:codigo', async (req, res) => {
  const escola = await escolaPorCodigo(req.params.codigo);
  if (!escola) return res.redirecionar('/escolas');
  acrescentarCookie(res, `${COOKIE_ESCOLA}=${encodeURIComponent(escola.codigo)}; SameSite=Lax; Path=/; Max-Age=31536000`);
  res.redirecionar(destinoInterno(req.query.ir));
});

// ---------- Estrutura das páginas do painel ----------
const ICONES_PF = {
  escolas: '<path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M9.5 21v-6h5v6M9 11h.01M15 11h.01"/>',
  alunos: '<circle cx="9" cy="9" r="3.2"/><circle cx="16.5" cy="10.3" r="2.6"/><path d="M3.3 19c.5-3.2 2.8-5 5.7-5s5.2 1.8 5.7 5"/><path d="M15.3 14.4c2 .3 3.5 1.8 3.9 4.6"/>',
  chave: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/>',
  descarregar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  seta: '<path d="M15 6l-6 6 6 6"/>',
  lupa: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
};
const iconePf = (nome) => `<svg class="pf-icone" viewBox="0 0 24 24" aria-hidden="true">${ICONES_PF[nome] || ''}</svg>`;

function paginaPlataforma(req, titulo, conteudo, { ativo = 'escolas' } = {}) {
  return documento(
    `${titulo} · Plataforma`,
    `<header class="pf-topo">
      <a class="pf-marca" href="/plataforma">${LOGO}<span><strong>Plataforma</strong><small>Consola das escolas</small></span></a>
      <nav class="pf-nav" aria-label="Painel da plataforma">
        <a href="/plataforma" class="${ativo === 'escolas' ? 'ativo' : ''}">${iconePf('escolas')}<span>Escolas</span></a>
      </nav>
      <div class="pf-conta">
        ${req.gestor ? `<span class="pf-iniciais" aria-hidden="true">${h(iniciais(req.gestor.nome))}</span><span class="pf-conta-nome"><strong>${h(req.gestor.nome)}</strong><small>Gestor da plataforma</small></span>` : ''}
        ${req.gestor ? `<form method="post" action="/plataforma/logout"><button class="pf-sair" title="Terminar sessão" aria-label="Terminar sessão">${icone('sair')}</button></form>` : ''}
      </div>
    </header>
    <main class="pf-conteudo" id="conteudo-principal" tabindex="-1">
      ${mensagensFlash(req.lerFlash())}
      ${conteudo}
    </main>`,
    'plataforma',
    ['plataforma.css']
  );
}

// ---------- Entrar e sair ----------
function paginaLoginPlataforma(req, { username = '', erro = '' } = {}) {
  return documento(
    'Entrar · Plataforma',
    `<main class="pf-entrada">
      <div class="pf-entrada-cartao">
        <div class="pf-marca">${LOGO}<span><strong>Plataforma</strong><small>Consola das escolas</small></span></div>
        <h1>Entrar</h1>
        <p class="pf-suave">Área reservada ao gestor da plataforma, para criar e gerir as escolas.</p>
        ${mensagensFlash(req.lerFlash())}
        ${erro ? `<div class="alerta alerta-erro" role="alert">${h(erro)}</div>` : ''}
        <form method="post" action="/plataforma/login" class="pf-form">
          <label>Utilizador
            <input name="username" value="${h(username)}" autocomplete="username" required autofocus>
          </label>
          <label>Palavra-passe
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
          <button class="pf-botao pf-botao-bloco">Entrar</button>
        </form>
      </div>
    </main>`,
    'plataforma',
    ['plataforma.css']
  );
}

get('/plataforma/login', (req, res) => {
  if (req.gestor) return res.redirecionar('/plataforma');
  res.html(paginaLoginPlataforma(req));
});

post('/plataforma/login', async (req, res) => {
  const username = String(req.corpo.username || '').trim();
  const gestor = await plataforma.um('SELECT * FROM gestores WHERE username = ?', username);
  if (!gestor || !verificarPassword(String(req.corpo.password || ''), gestor.password_hash)) {
    return res.html(paginaLoginPlataforma(req, { username, erro: 'Utilizador ou palavra-passe incorretos.' }), 401);
  }
  (await renovarSessao(req)).dados.gestorId = gestor.id;
  res.redirecionar('/plataforma');
});

post('/plataforma/logout', async (req, res) => {
  await terminarSessao(req);
  res.setHeader('Set-Cookie', 'sid_plataforma=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.redirecionar('/plataforma/login');
});

// ---------- Visão geral: as escolas ----------
// Números de cada escola, lidos da base de dados dela (o nome foi validado quando a escola foi criada)
async function resumoDaEscola(escola) {
  try {
    const bd = `\`${escola.base_dados}\``;
    return await plataforma.um(
      `SELECT (SELECT COUNT(*) FROM ${bd}.alunos) AS alunos,
              (SELECT COUNT(*) FROM ${bd}.professores) AS professores,
              (SELECT COUNT(*) FROM ${bd}.turmas) AS turmas`
    );
  } catch {
    return null; // base de dados em falta ou incompleta
  }
}

const cartaoPassword = (obrigatorio) => `
  <section class="pf-cartao${obrigatorio ? ' pf-cartao-alerta' : ''}">
    <h2>${iconePf('chave')} ${obrigatorio ? 'Escolha a sua palavra-passe' : 'A minha palavra-passe'}</h2>
    ${obrigatorio ? '<p class="pf-suave">Está a usar a palavra-passe inicial. Escolha uma só sua antes de continuar.</p>' : ''}
    <form method="post" action="/plataforma/password" class="pf-form">
      <label>Palavra-passe atual <input name="atual" type="password" autocomplete="current-password" required></label>
      <label>Nova palavra-passe <input name="nova" type="password" minlength="8" autocomplete="new-password" required></label>
      <label>Confirmar <input name="confirmar" type="password" minlength="8" autocomplete="new-password" required></label>
      <button class="pf-botao${obrigatorio ? '' : ' pf-botao-sec'}">Guardar</button>
    </form>
  </section>`;

function cartaoEscola(e) {
  const base = `/plataforma/escolas/${e.id}`;
  const r = e.resumo;
  return `<article class="pf-escola${e.ativa ? '' : ' inativa'}">
    <header class="pf-escola-topo">
      <span class="pf-escola-sigla" aria-hidden="true">${h(iniciais(e.nome))}</span>
      <div class="pf-escola-nome">
        <h3>${h(e.nome)}</h3>
        <p><code>@${h(e.dominio_email)}</code> · <a href="/escola/${h(e.codigo)}">/escola/${h(e.codigo)}</a></p>
      </div>
      ${e.ativa ? '<span class="pf-estado ok">Ativa</span>' : '<span class="pf-estado aviso">Inativa</span>'}
    </header>
    ${
      r
        ? `<dl class="pf-numeros">
            <div><dt>Alunos</dt><dd>${r.alunos}</dd></div>
            <div><dt>Professores</dt><dd>${r.professores}</dd></div>
            <div><dt>Turmas</dt><dd>${r.turmas}</dd></div>
          </dl>`
        : '<p class="pf-estado perigo">Base de dados em falta</p>'
    }
    <p class="pf-suave pf-pequeno">Direção: ${h(e.direcao_nome || '—')} · criada em ${h(formatarData(e.criado_em))}</p>
    <div class="pf-escola-acoes">
      <a class="pf-botao" href="${base}">${iconePf('alunos')}<span>Ver alunos</span></a>
      <form method="post" action="${base}/password" data-confirmar="Gerar uma palavra-passe nova para a direção de ${h(e.nome)}? A atual deixa de funcionar.">
        <button class="pf-botao pf-botao-sec">${iconePf('chave')}<span>Repor direção</span></button></form>
      <form method="post" action="${base}/${e.ativa ? 'desativar' : 'ativar'}"${e.ativa ? ` data-confirmar="Desativar ${h(e.nome)}? Ninguém dessa escola consegue entrar até a voltar a ativar. Os dados ficam guardados."` : ''}>
        <button class="pf-botao-texto${e.ativa ? ' perigo' : ''}">${e.ativa ? 'Desativar' : 'Ativar'}</button></form>
    </div>
    <details class="pf-editar">
      <summary>Editar dados da escola</summary>
      <form method="post" action="${base}/editar" class="pf-form">
        <label>Nome da escola <input name="nome" maxlength="120" value="${h(e.nome)}" required></label>
        <label>Domínio de email <input name="dominio" maxlength="120" value="${h(e.dominio_email)}" required></label>
        <label>Nome da direção <input name="direcao" maxlength="120" value="${h(e.direcao_nome || '')}"></label>
        <button class="pf-botao pf-botao-sec">Guardar</button>
      </form>
      <p class="pf-suave pf-pequeno">Mudar o domínio não altera os emails que já foram criados; vale para os próximos.</p>
    </details>
  </article>`;
}

get('/plataforma', async (req, res) => {
  if (req.gestor.deve_redefinir_password) {
    return res.html(paginaPlataforma(req, 'Escolas', `<div class="pf-estreito">${cartaoPassword(true)}</div>`));
  }

  const escolas = await plataforma.todos('SELECT * FROM escolas ORDER BY ativa DESC, nome');
  for (const e of escolas) e.resumo = await resumoDaEscola(e);
  const soma = (campo) => escolas.reduce((s, e) => s + Number(e.resumo?.[campo] || 0), 0);

  const conteudo = `
    <section class="pf-cabeca">
      <div>
        <p class="pf-sobre">Visão geral</p>
        <h1>Escolas</h1>
        <p class="pf-suave">Cada escola tem a sua base de dados, o seu nome nas páginas e o seu domínio de email.</p>
      </div>
    </section>
    <section class="pf-kpis" aria-label="Totais">
      <div class="pf-kpi"><span>Escolas</span><strong>${escolas.length}</strong><small>${escolas.filter((e) => e.ativa).length} ativas</small></div>
      <div class="pf-kpi"><span>Alunos</span><strong>${soma('alunos')}</strong><small>em todas as escolas</small></div>
      <div class="pf-kpi"><span>Professores</span><strong>${soma('professores')}</strong><small>em todas as escolas</small></div>
      <div class="pf-kpi"><span>Turmas</span><strong>${soma('turmas')}</strong><small>em todas as escolas</small></div>
    </section>
    <div class="pf-grelha">
      <section class="pf-escolas" aria-label="Escolas">
        ${escolas.length ? escolas.map(cartaoEscola).join('') : '<p class="pf-vazio">Ainda não há escolas. Crie a primeira ao lado.</p>'}
      </section>
      <aside class="pf-lado">
        <section class="pf-cartao pf-cartao-destaque">
          <h2>${iconePf('mais')} Nova escola</h2>
          <p class="pf-suave">Fica criada a base de dados da escola e a conta da direção, que depois cria os alunos, professores, disciplinas e módulos.</p>
          <form method="post" action="/plataforma/escolas" class="pf-form">
            <label>Nome da escola
              <input name="nome" maxlength="120" placeholder="Ex.: Escola Secundária de Alcochete" required></label>
            <label>Domínio de email <small>(o que vem depois do @)</small>
              <input name="dominio" maxlength="120" placeholder="Ex.: esalcochete.edu.pt" required></label>
            <label>Nome da direção <small>(quem vai administrar a escola)</small>
              <input name="direcao" maxlength="120" placeholder="Ex.: Direção ou Maria Silva" required></label>
            <button class="pf-botao pf-botao-bloco">Criar escola</button>
          </form>
        </section>
        ${cartaoPassword(false)}
      </aside>
    </div>`;
  res.html(paginaPlataforma(req, 'Escolas', conteudo));
});

// Enquanto a palavra-passe inicial não for trocada, só se pode trocá-la
function exigirPasswordPropria(req, res) {
  if (!req.gestor.deve_redefinir_password) return false;
  res.redirecionar('/plataforma');
  return true;
}

post('/plataforma/escolas', async (req, res) => {
  if (exigirPasswordPropria(req, res)) return;
  const r = await criarEscola({ nome: req.corpo.nome, dominio: req.corpo.dominio, direcao: req.corpo.direcao });
  if (r.erro) req.flash('erro', r.erro);
  else {
    req.flash(
      'sucesso',
      `Escola "${r.escola.nome}" criada. Endereço de entrada: /escola/${r.escola.codigo} · Conta da direção: ${r.username} · Palavra-passe temporária: ${r.password} (anote-a agora — não vai voltar a ser mostrada).`
    );
  }
  res.redirecionar('/plataforma');
});

const carregarEscola = (id) => plataforma.um('SELECT * FROM escolas WHERE id = ?', id);

post('/plataforma/escolas/:id/editar', async (req, res) => {
  if (exigirPasswordPropria(req, res)) return;
  const escola = await carregarEscola(req.params.id);
  if (!escola) return res.redirecionar('/plataforma');
  const nome = String(req.corpo.nome || '').trim().slice(0, 120);
  const dominio = normalizarDominio(req.corpo.dominio);
  const direcao = String(req.corpo.direcao || '').trim().slice(0, 120);

  if (!nome) req.flash('erro', 'Indique o nome da escola.');
  else if (!DOMINIO_VALIDO.test(dominio)) req.flash('erro', 'O domínio de email não é válido (exemplo: escola.edu.pt).');
  else if (await plataforma.um('SELECT 1 FROM escolas WHERE dominio_email = ? AND id <> ?', dominio, escola.id)) {
    req.flash('erro', `Já existe outra escola com o domínio @${dominio}.`);
  } else {
    await plataforma.executar('UPDATE escolas SET nome = ?, dominio_email = ?, direcao_nome = ? WHERE id = ?', nome, dominio, direcao || null, escola.id);
    req.flash('sucesso', `Dados de "${nome}" guardados.`);
  }
  res.redirecionar('/plataforma');
});

for (const [acao, ativa] of [['ativar', 1], ['desativar', 0]]) {
  post(`/plataforma/escolas/:id/${acao}`, async (req, res) => {
    if (exigirPasswordPropria(req, res)) return;
    const escola = await carregarEscola(req.params.id);
    if (escola) {
      await plataforma.executar('UPDATE escolas SET ativa = ? WHERE id = ?', ativa, escola.id);
      req.flash('sucesso', `"${escola.nome}" ${ativa ? 'ativada' : 'desativada'}.`);
    }
    res.redirecionar('/plataforma');
  });
}

post('/plataforma/escolas/:id/password', async (req, res) => {
  if (exigirPasswordPropria(req, res)) return;
  const escola = await carregarEscola(req.params.id);
  if (!escola) return res.redirecionar('/plataforma');
  const r = await reporPasswordDirecao(escola).catch(() => null);
  if (!r) req.flash('erro', `Não foi possível repor a palavra-passe: "${escola.nome}" não tem conta de administrador.`);
  else {
    req.flash('sucesso', `Direção de "${escola.nome}": conta ${r.username} · nova palavra-passe temporária: ${r.password} (anote-a agora — não vai voltar a ser mostrada).`);
  }
  res.redirecionar('/plataforma');
});

post('/plataforma/password', async (req, res) => {
  const gestor = await plataforma.um('SELECT * FROM gestores WHERE id = ?', req.gestor.id);
  const nova = String(req.corpo.nova || '');
  let erro = '';
  if (!verificarPassword(String(req.corpo.atual || ''), gestor.password_hash)) erro = 'A palavra-passe atual não está certa.';
  else if (nova.length < 8) erro = 'A palavra-passe nova deve ter pelo menos 8 caracteres.';
  else if (nova !== String(req.corpo.confirmar || '')) erro = 'As palavras-passe não coincidem.';
  else if (verificarPassword(nova, gestor.password_hash)) erro = 'Escolha uma palavra-passe diferente da atual.';

  if (erro) req.flash('erro', erro);
  else {
    await plataforma.executar('UPDATE gestores SET password_hash = ?, deve_redefinir_password = 0 WHERE id = ?', gerarHash(nova), gestor.id);
    req.flash('sucesso', 'Palavra-passe alterada.');
  }
  res.redirecionar('/plataforma');
});

// ---------- Alunos de uma escola, por turma ----------
function estadoConta(a) {
  if (!a.utilizador_id) return '<span class="pf-estado">Sem conta</span>';
  if (a.deve_redefinir_password) return '<span class="pf-estado aviso" title="Ainda não escolheu uma palavra-passe sua">Palavra-passe temporária</span>';
  return '<span class="pf-estado ok">Ativa</span>';
}

function formExportar(escolaId, turmaId, texto, descricao, classe = 'pf-botao pf-botao-sec') {
  return `<form method="post" action="/plataforma/escolas/${escolaId}/exportar-passwords"
      data-confirmar="Gerar palavras-passe novas para ${h(descricao)} e descarregar o ficheiro? As palavras-passe atuais deixam de funcionar e cada aluno tem de escolher uma sua no próximo acesso.">
      <input type="hidden" name="turma" value="${h(turmaId)}">
      <button class="${classe}">${iconePf('descarregar')}<span>${h(texto)}</span></button>
    </form>`;
}

get('/plataforma/escolas/:id', async (req, res) => {
  if (exigirPasswordPropria(req, res)) return;
  const escola = await carregarEscola(req.params.id);
  if (!escola) return res.redirecionar('/plataforma');
  const pesquisa = String(req.query.q || '').trim().slice(0, 60);

  let dados;
  try {
    dados = await alunosPorTurma(escola, pesquisa);
  } catch {
    req.flash('erro', `Não foi possível ler os alunos de "${escola.nome}": a base de dados da escola está em falta ou incompleta.`);
    return res.redirecionar('/plataforma');
  }
  const todosAlunos = dados.grupos.flatMap((g) => g.alunos);
  const porTrocar = todosAlunos.filter((a) => a.utilizador_id && a.deve_redefinir_password).length;

  const seccoes = dados.grupos
    .filter((g) => g.alunos.length || !pesquisa)
    .map(({ turma, alunos }) => {
      const linhas = alunos
        .map(
          (a) => `<tr>
            <td><code>${h(a.numero_processo)}</code></td>
            <td><strong>${h(a.nome)}</strong></td>
            <td class="pf-suave">${h(a.email || '—')}</td>
            <td>${estadoConta(a)}</td>
            <td class="pf-direita">${
              a.utilizador_id
                ? `<form method="post" action="/plataforma/escolas/${escola.id}/alunos/${a.id}/password" data-confirmar="Gerar uma palavra-passe nova para ${h(a.nome)}? A atual deixa de funcionar.">
                    <button class="pf-botao-texto">${iconePf('chave')}<span>Repor</span></button></form>`
                : ''
            }</td>
          </tr>`
        )
        .join('');
      const comConta = alunos.filter((a) => a.utilizador_id).length;
      return `<section class="pf-cartao pf-turma">
        <header class="pf-turma-topo">
          <div>
            <h2>${h(turma.nome)}</h2>
            <p class="pf-suave pf-pequeno">${[turma.curso, turma.ano_letivo].filter(Boolean).map(h).join(' · ') || '&nbsp;'}</p>
          </div>
          <span class="pf-contagem">${alunos.length} aluno(s)</span>
          ${comConta ? formExportar(escola.id, turma.id, 'Novas palavras-passe da turma', `os ${comConta} alunos de ${turma.nome}`) : ''}
        </header>
        ${
          alunos.length
            ? `<div class="pf-tabela-scroll"><table class="pf-tabela">
                <thead><tr><th>N.º</th><th>Nome</th><th>Email</th><th>Conta</th><th></th></tr></thead>
                <tbody>${linhas}</tbody></table></div>`
            : '<p class="pf-vazio">Sem alunos nesta turma.</p>'
        }
      </section>`;
    })
    .join('');

  const conteudo = `
    <a class="pf-voltar" href="/plataforma">${iconePf('seta')}<span>Escolas</span></a>
    <section class="pf-cabeca">
      <div>
        <p class="pf-sobre"><code>@${h(escola.dominio_email)}</code> · /escola/${h(escola.codigo)}</p>
        <h1>${h(escola.nome)}</h1>
        <p class="pf-suave">Alunos por turma. Gerar uma palavra-passe nova obriga o aluno a escolher uma sua no próximo acesso.</p>
      </div>
      ${todosAlunos.some((a) => a.utilizador_id) && !pesquisa ? formExportar(escola.id, 'todas', 'Novas palavras-passe de todos', `todos os alunos de ${escola.nome}`, 'pf-botao') : ''}
    </section>
    <section class="pf-kpis" aria-label="Totais">
      <div class="pf-kpi"><span>Alunos</span><strong>${pesquisa ? todosAlunos.length : dados.total}</strong><small>${pesquisa ? 'encontrados' : 'na escola'}</small></div>
      <div class="pf-kpi"><span>Turmas</span><strong>${dados.grupos.filter((g) => g.turma.id).length}</strong><small>com e sem alunos</small></div>
      <div class="pf-kpi"><span>Por trocar</span><strong>${porTrocar}</strong><small>ainda com palavra-passe temporária</small></div>
    </section>
    <form method="get" class="pf-pesquisa" role="search">
      ${iconePf('lupa')}
      <input type="search" name="q" value="${h(pesquisa)}" placeholder="Procurar por nome, n.º de processo ou email" aria-label="Procurar aluno">
      ${pesquisa ? `<a class="pf-botao-texto" href="/plataforma/escolas/${escola.id}">Limpar</a>` : ''}
    </form>
    ${seccoes || `<p class="pf-vazio">${pesquisa ? 'Nenhum aluno encontrado.' : 'Esta escola ainda não tem turmas nem alunos.'}</p>`}
    <p class="pf-suave pf-pequeno">As palavras-passe atuais não podem ser vistas nem exportadas: a base de dados só guarda uma versão cifrada.
      Por isso, exportar gera palavras-passe novas e o ficheiro é a única cópia delas.</p>`;
  res.html(paginaPlataforma(req, escola.nome, conteudo));
});

post('/plataforma/escolas/:id/alunos/:alunoId/password', async (req, res) => {
  if (exigirPasswordPropria(req, res)) return;
  const escola = await carregarEscola(req.params.id);
  if (!escola) return res.redirecionar('/plataforma');
  const voltar = `/plataforma/escolas/${escola.id}`;
  const [a] = await gerarPasswordsAlunos(escola, { alunoId: Number(req.params.alunoId) }).catch(() => []);
  if (!a) req.flash('erro', 'Aluno não encontrado ou sem conta de acesso.');
  else {
    req.flash(
      'sucesso',
      `${a.nome} (n.º ${a.numero_processo}${a.turma ? `, ${a.turma}` : ''}): nova palavra-passe temporária ${a.password} — anote-a agora, não vai voltar a ser mostrada. Entra com o n.º de processo ${a.username}.`
    );
  }
  res.redirecionar(voltar);
});

// Gera palavras-passe novas e devolve-as num ficheiro CSV para abrir no Excel e entregar aos alunos
function celulaCsv(valor) {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`; // não deixar o Excel ler uma célula como fórmula
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

post('/plataforma/escolas/:id/exportar-passwords', async (req, res) => {
  if (exigirPasswordPropria(req, res)) return;
  const escola = await carregarEscola(req.params.id);
  if (!escola) return res.redirecionar('/plataforma');
  const turma = String(req.corpo.turma || '');
  const filtro = turma === 'todas' ? {} : { turmaId: Number(turma) || 0 };
  const alunos = await gerarPasswordsAlunos(escola, filtro);
  if (!alunos.length) {
    req.flash('erro', 'Não há alunos com conta de acesso para exportar.');
    return res.redirecionar(`/plataforma/escolas/${escola.id}`);
  }

  const linhas = [
    ['Escola', 'Turma', 'N.º de processo (utilizador)', 'Nome', 'Email', 'Palavra-passe temporária', 'Endereço de entrada'],
    ...alunos.map((a) => [escola.nome, a.turma || 'Sem turma', a.username, a.nome, a.email || '', a.password, `/escola/${escola.codigo}`]),
  ];
  const csv = '﻿' + linhas.map((l) => l.map(celulaCsv).join(';')).join('\r\n') + '\r\n';
  const parte = turma === 'todas' ? 'todos' : (alunos[0].turma || 'sem-turma').normalize('NFD').replace(/[^\w-]+/g, '-');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="palavras-passe-${escola.codigo}-${parte}-${hoje()}.csv"`,
    'Cache-Control': 'no-store',
  });
  res.end(csv);
});
