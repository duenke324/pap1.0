// Painel da plataforma: só para o gestor (quem instala e vende a aplicação), fora de qualquer escola.
// Aqui criam-se as escolas: nome, domínio de email (o que vem depois do @) e nome da direção.
// Cada escola fica com a sua base de dados e com uma conta de administrador para a direção, que
// depois cria os alunos, professores, disciplinas e módulos no painel de administração da escola.
//
// Inclui também as duas páginas públicas de escolha da escola:
//   /escolas          lista das escolas (aparece quando há mais do que uma e o browser ainda não escolheu)
//   /escola/<codigo>  endereço de entrada de uma escola: memoriza-a neste browser e segue para o login
const { get, post, renovarSessao, terminarSessao, acrescentarCookie } = require('../lib/servidor');
const { plataforma, escolasAtivas, escolaPorCodigo } = require('../db');
const { documento, paginaEntrada, mensagensFlash, botaoTema, icone, LOGO } = require('../vistas/layout');
const { COOKIE_ESCOLA, criarEscola, reporPasswordDirecao, normalizarDominio, DOMINIO_VALIDO } = require('../lib/escolas');
const { h, gerarHash, verificarPassword, formatarData } = require('../lib/util');

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

// ---------- Página do painel ----------
function paginaPlataforma(req, titulo, conteudo) {
  return documento(
    `${titulo} · Plataforma`,
    `<header class="entrada-topo">
      <a class="marca" href="/plataforma">${LOGO}<span><strong>Plataforma</strong><small>Gestão das escolas</small></span></a>
      <div class="utilizador">
        ${req.gestor ? `<div class="utilizador-info"><strong>${h(req.gestor.nome)}</strong><small>Gestor da plataforma</small></div>` : ''}
        ${botaoTema()}
        ${req.gestor ? `<form method="post" action="/plataforma/logout"><button class="botao-icone" title="Terminar sessão" aria-label="Terminar sessão">${icone('sair')}</button></form>` : ''}
      </div>
    </header>
    <main class="plataforma-conteudo">
      <h1>${h(titulo)}</h1>
      ${mensagensFlash(req.lerFlash())}
      ${conteudo}
    </main>`,
    'plataforma'
  );
}

// ---------- Entrar e sair ----------
function paginaLoginPlataforma(req, { username = '', erro = '' } = {}) {
  return paginaEntrada('Plataforma', {
    tituloPainel: 'Plataforma',
    painel: `
      <p class="entrada-texto">Área reservada ao gestor da plataforma, para criar e gerir as escolas.</p>
      ${mensagensFlash(req.lerFlash())}
      ${erro ? `<div class="alerta alerta-erro" role="alert">${h(erro)}</div>` : ''}
      <form method="post" action="/plataforma/login" class="entrada-form">
        <label>Utilizador
          <input name="username" value="${h(username)}" autocomplete="username" required autofocus>
        </label>
        <label>Palavra-passe
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <button class="botao botao-bloco">Entrar</button>
      </form>`,
  });
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

// ---------- Painel ----------
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
  <section class="cartao">
    <h2>${obrigatorio ? 'Escolha a sua palavra-passe' : 'Alterar a minha palavra-passe'}</h2>
    ${obrigatorio ? '<p>Está a usar a palavra-passe inicial. Escolha uma só sua antes de continuar.</p>' : ''}
    <form method="post" action="/plataforma/password" class="filtros">
      <label>Palavra-passe atual <input name="atual" type="password" autocomplete="current-password" required></label>
      <label>Nova palavra-passe <input name="nova" type="password" minlength="8" autocomplete="new-password" required></label>
      <label>Confirmar <input name="confirmar" type="password" minlength="8" autocomplete="new-password" required></label>
      <button class="botao${obrigatorio ? '' : ' botao-secundario'}">Guardar</button>
    </form>
  </section>`;

get('/plataforma', async (req, res) => {
  if (req.gestor.deve_redefinir_password) return res.html(paginaPlataforma(req, 'Escolas', cartaoPassword(true)));

  const escolas = await plataforma.todos('SELECT * FROM escolas ORDER BY nome');
  for (const e of escolas) e.resumo = await resumoDaEscola(e);

  const linhas = escolas
    .map((e) => {
      const base = `/plataforma/escolas/${e.id}`;
      return `<tr${e.ativa ? '' : ' class="inativa"'}>
        <td><strong>${h(e.nome)}</strong>
          <small class="bloco texto-suave">Direção: ${h(e.direcao_nome || '—')} · criada em ${h(formatarData(e.criado_em))}</small>
          <details class="plataforma-editar">
            <summary>Editar</summary>
            <form method="post" action="${base}/editar" class="filtros">
              <label class="crescer">Nome da escola <input name="nome" maxlength="120" value="${h(e.nome)}" required></label>
              <label>Domínio de email <input name="dominio" maxlength="120" value="${h(e.dominio_email)}" required></label>
              <label>Nome da direção <input name="direcao" maxlength="120" value="${h(e.direcao_nome || '')}"></label>
              <button class="botao botao-secundario">Guardar</button>
            </form>
            <p class="legenda">Mudar o domínio não altera os emails que já foram criados; vale para os próximos.</p>
          </details></td>
        <td>@${h(e.dominio_email)}</td>
        <td>${e.ativa ? `<a href="/escola/${h(e.codigo)}">/escola/${h(e.codigo)}</a>` : `<span class="texto-suave">/escola/${h(e.codigo)}</span>`}</td>
        <td class="direita">${e.resumo ? `${e.resumo.alunos} alunos · ${e.resumo.professores} prof. · ${e.resumo.turmas} turmas` : '<span class="etiqueta etiqueta-perigo">Base de dados em falta</span>'}</td>
        <td>${e.ativa ? '<span class="etiqueta etiqueta-ok">Ativa</span>' : '<span class="etiqueta etiqueta-aviso">Inativa</span>'}</td>
        <td class="acoes-linha">
          <form method="post" action="${base}/password" data-confirmar="Gerar uma palavra-passe nova para a direção de ${h(e.nome)}? A atual deixa de funcionar.">
            <button class="botao-texto">Repor palavra-passe da direção</button></form>
          <form method="post" action="${base}/${e.ativa ? 'desativar' : 'ativar'}"${e.ativa ? ` data-confirmar="Desativar ${h(e.nome)}? Ninguém dessa escola consegue entrar até a voltar a ativar. Os dados ficam guardados."` : ''}>
            <button class="botao-texto${e.ativa ? ' perigo' : ''}">${e.ativa ? 'Desativar' : 'Ativar'}</button></form>
        </td>
      </tr>`;
    })
    .join('');

  const conteudo = `
    <section class="cartao">
      <h2>Nova escola</h2>
      <p class="texto-suave">Ao criar, a escola fica com uma base de dados própria e com a conta da direção, que cria depois os alunos, professores, disciplinas e módulos.</p>
      <form method="post" action="/plataforma/escolas" class="grelha-form">
        <label>Nome da escola
          <input name="nome" maxlength="120" placeholder="Ex.: Escola Secundária de Alcochete" required></label>
        <label>Domínio de email <small class="texto-suave">(o que vem depois do @)</small>
          <input name="dominio" maxlength="120" placeholder="Ex.: esalcochete.edu.pt" required></label>
        <label>Nome da direção <small class="texto-suave">(quem vai administrar a escola)</small>
          <input name="direcao" maxlength="120" placeholder="Ex.: Direção ou Maria Silva" required></label>
        <div class="coluna-toda barra-acoes"><button class="botao">Criar escola</button></div>
      </form>
    </section>
    <section class="cartao">
      <div class="cartao-topo"><h2>Escolas</h2><span class="contador">${escolas.length} escola(s)</span></div>
      <div class="tabela-scroll"><table class="tabela">
        <thead><tr><th>Escola</th><th>Emails</th><th>Endereço de entrada</th><th class="direita">Dimensão</th><th>Estado</th><th></th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
    </section>
    ${cartaoPassword(false)}`;
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
