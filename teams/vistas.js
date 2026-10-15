// Vistas (HTML) da app "Conversas" — visual inspirado no Microsoft Teams (faixa escura de
// navegação + lista clara + canais com #), com duas secções: Equipas (canais por disciplina,
// dentro de cada turma) e Mensagens (conversas privadas 1 para 1).
const { h, iniciais } = require('../src/lib/util');

const ICONES = {
  sair: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  lua: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  enviar: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>',
  equipas: '<circle cx="9" cy="9" r="3.2"/><circle cx="16.5" cy="10.3" r="2.6"/><path d="M3.3 19c.5-3.2 2.8-5 5.7-5s5.2 1.8 5.7 5"/><path d="M15.3 14.4c2 .3 3.5 1.8 3.9 4.6"/>',
  mensagens: '<path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v8A1.5 1.5 0 0 1 18.5 16H10l-4.5 3.5V16H5.5A1.5 1.5 0 0 1 4 14.5v-8Z"/><path d="M8 9.5h8M8 12h5"/>',
  nova: '<path d="M12 5v14M5 12h14"/>',
  pesquisar: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
};

function icone(nome, classe = 'icone') {
  return `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] || ''}</svg>`;
}

const LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10A1.5 1.5 0 0 1 18.5 17H9l-5 4z"/></svg>`;

// Cor do avatar derivada do nome (determinística): a mesma pessoa fica sempre com a mesma cor.
const CORES_AVATAR = 8;
function corAvatar(nome) {
  const texto = String(nome || '');
  let soma = 0;
  for (let i = 0; i < texto.length; i++) soma += texto.charCodeAt(i);
  return soma % CORES_AVATAR;
}

function avatarHtml(nome, classe = 'avatar', titulo = '') {
  return `<span class="${classe} avatar-cor-${corAvatar(nome)}"${titulo ? ` title="${h(titulo)}"` : ''}>${h(iniciais(nome))}</span>`;
}

function botaoTema() {
  return `<button type="button" class="botao-icone botao-tema" data-alternar-tema title="Mudar para tema escuro/claro" aria-label="Alternar tema claro/escuro">
    <span class="tema-lua">${icone('lua')}</span><span class="tema-sol">${icone('sol')}</span></button>`;
}

function mensagensFlash(mensagens) {
  if (!mensagens || !mensagens.length) return '';
  return mensagens.map((m) => `<div class="alerta alerta-${h(m.tipo)}" role="status">${h(m.mensagem)}</div>`).join('');
}

function documento(titulo, corpo) {
  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${h(titulo)} · Conversas</title>
  <meta name="color-scheme" content="light dark">
  <script>try { var t = localStorage.getItem('tema-conversas'); if (t === 'claro' || t === 'escuro') document.documentElement.dataset.tema = t; } catch (e) {}</script>
  <link rel="stylesheet" href="/static/estilo.css">
  <link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
  <script src="/static/app.js" defer></script>
</head>
<body>
${corpo}
</body>
</html>`;
}

function paginaLogin({ email = '', erro = '', mensagens = [] } = {}) {
  return documento(
    'Entrar',
    `<div class="ecra-centro">
      <div class="fundo-animado" aria-hidden="true"><span class="mancha mancha-1"></span><span class="mancha mancha-2"></span><span class="mancha mancha-3"></span></div>
      <div class="cartao-login">
        <div class="marca">
          ${LOGO}
          <div><strong>Conversas</strong><small>Escola · canais por turma</small></div>
        </div>
        ${mensagensFlash(mensagens)}
        ${erro ? `<div class="alerta alerta-erro" role="alert">${h(erro)}</div>` : ''}
        <form method="post" action="/login" class="formulario">
          <label>Email institucional
            <input type="email" name="email" value="${h(email)}" placeholder="nome.apelido.numero@epmontijo.edu.pt" autocomplete="username" required autofocus>
          </label>
          <label>Palavra-passe
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
          <button class="botao botao-bloco">Entrar</button>
        </form>
      </div>
    </div>`
  );
}

// estrutura: [{ turma: {id, nome}, canais: [{id, nome}] }]
function arvoreHtml(estrutura, canalAtivoId) {
  if (!estrutura.length) {
    return `<p class="turma-vazia">Ainda não tem turmas ou canais associados.</p>`;
  }
  return estrutura
    .map(
      ({ turma, canais, podeGerir }) => `
    <div class="turma-grupo">
      <div class="turma-cabecalho"><span>${h(turma.nome)}</span>${podeGerir ? `<a href="/turma/${turma.id}">Gerir</a>` : ''}</div>
      ${
        canais.length
          ? canais
              .map(
                (c) => `<a href="/turma/${turma.id}/canal/${c.id}" class="canal-link${c.id === canalAtivoId ? ' ativo' : ''}">
                  <span class="hash">#</span><span>${h(c.nome)}</span>
                  ${c.nao_lidas ? `<span class="badge-nao-lidas">${c.nao_lidas > 99 ? '99+' : c.nao_lidas}</span>` : ''}
                </a>`
              )
              .join('')
          : `<p class="turma-vazia">${podeGerir ? 'Ainda sem canais — crie um.' : 'Sem canais ainda.'}</p>`
      }
    </div>`
    )
    .join('');
}

// conversas: [{ id, outro_id, outro_nome, outro_papel }]
function listaConversasHtml(conversas, conversaAtivaId) {
  if (!conversas.length) {
    return `<p class="turma-vazia">Ainda não tem conversas.</p>`;
  }
  return conversas
    .map(
      (c) => `<a href="/mensagens/${c.id}" class="conversa-link${c.id === conversaAtivaId ? ' ativo' : ''}">
      ${avatarHtml(c.outro_nome, 'avatar conversa-avatar')}
      <span class="conversa-info"><strong>${h(c.outro_nome)}</strong><small>${c.outro_papel === 'professor' ? 'Professor' : 'Aluno'}</small></span>
    </a>`
    )
    .join('');
}

function pagina(
  req,
  { secaoAtiva = 'equipas', arvore = [], canalAtivoId = null, conversas = [], conversaAtivaId = null, titulo, subtitulo = '', cabecalhoExtra = '' },
  conteudo
) {
  const u = req.utilizador;
  const equipasAtivo = secaoAtiva === 'equipas';
  const listaHtml = equipasAtivo
    ? `<div class="lista-cabecalho">Equipas</div>
       <nav class="arvore" aria-label="Turmas e canais">${arvoreHtml(arvore, canalAtivoId)}</nav>`
    : `<div class="lista-cabecalho-linha">
         <div class="lista-cabecalho">Mensagens</div>
         <a class="botao-icone" href="/mensagens/nova" title="Nova conversa" aria-label="Nova conversa">${icone('nova')}</a>
       </div>
       <nav class="arvore" aria-label="Conversas">${listaConversasHtml(conversas, conversaAtivaId)}</nav>`;

  return documento(
    titulo,
    `
<div class="app">
  <nav class="rail" aria-label="Conversas">
    <a href="/" class="rail-logo" title="Conversas" aria-label="Página inicial">${LOGO}</a>
    <div class="rail-nav">
      <a href="/" class="rail-botao${equipasAtivo ? ' ativo' : ''}" title="Equipas" aria-label="Equipas">${icone('equipas')}</a>
      <a href="/mensagens" class="rail-botao${!equipasAtivo ? ' ativo' : ''}" title="Mensagens" aria-label="Mensagens">${icone('mensagens')}</a>
    </div>
    <div class="rail-fim">
      ${botaoTema()}
      ${avatarHtml(u.nome, 'avatar rail-avatar', `${u.nome} · ${u.papel === 'professor' ? 'Professor' : 'Aluno'}`)}
      <form method="post" action="/logout"><button class="botao-icone" title="Terminar sessão" aria-label="Terminar sessão">${icone('sair')}</button></form>
    </div>
  </nav>
  <aside class="lista-canais" id="lateral">${listaHtml}</aside>
  <main class="conteudo">
    <header class="topo-canal">
      <button class="botao-icone so-movel" data-alternar-menu aria-label="Abrir menu">${icone('menu')}</button>
      <div class="topo-canal-titulo"><span class="etiqueta-turma">${subtitulo ? h(subtitulo) : ''}</span><h1>${canalAtivoId ? '# ' : ''}${h(titulo)}</h1></div>
      <div class="topo-canal-extra">${cabecalhoExtra}</div>
    </header>
    ${mensagensFlash(req.lerFlash())}
    ${conteudo}
  </main>
</div>`
  );
}

// Só a hora na mensagem (HH:mm) — a data completa fica no title do <time>, e o dia é mostrado
// à parte, num separador (ver app.js: separadorHtml/talvezInserirSeparador).
function horaMensagem(criadoEm) {
  const [, hora] = String(criadoEm).split(' ');
  return hora.slice(0, 5);
}

function dataHoraCompleta(criadoEm) {
  const [data, hora] = String(criadoEm).split(' ');
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano} ${hora.slice(0, 5)}`;
}

// 'AAAA-MM-DD HH:MM:SS' -> 'AAAA-MM-DDTHH:MM:SS' (datetime do <time>, formato ISO 8601)
function isoDatetime(criadoEm) {
  return String(criadoEm).replace(' ', 'T');
}

function rotuloPapel(papel) {
  if (papel === 'professor') return 'Professor';
  if (papel === 'aluno') return 'Aluno';
  return '';
}

function mensagemHtml(m, meuId) {
  const autor = m.autor || 'Utilizador removido';
  const papel = rotuloPapel(m.autor_papel);
  return `<div class="mensagem${m.utilizador_id === meuId ? ' minha' : ''}" data-mensagem-id="${m.id}" data-autor-id="${m.utilizador_id ?? ''}" data-criado-em="${h(String(m.criado_em))}">
    ${avatarHtml(autor, 'avatar mensagem-avatar')}
    <div class="mensagem-corpo">
      <div class="mensagem-cabecalho">
        <strong>${h(autor)}</strong>
        ${papel ? `<span class="distintivo-papel">${papel}</span>` : ''}
        <time datetime="${h(isoDatetime(m.criado_em))}" title="${h(dataHoraCompleta(m.criado_em))}">${h(horaMensagem(m.criado_em))}</time>
      </div>
      <p>${h(m.texto)}</p>
    </div>
  </div>`;
}

function vazio(texto) {
  return `<div class="vazio">${h(texto)}</div>`;
}

// Ecrã vazio "de boas-vindas" (janela flutuante decorativa + texto), usado nas duas secções
// quando ainda não há nada selecionado. A janela é abstrata — não é uma captura de ecrã.
function ecraVazioDecorado(mensagem, extra = '') {
  return `<div class="ecra-vazio"><div class="ecra-vazio-caixa">
    <div class="vazio-visual" aria-hidden="true">
      <div class="mock-janela mock-flutuante">
        <div class="mock-barra"><span></span><span></span><span></span></div>
        <div class="mock-chat"><div class="mock-bolha"></div><div class="mock-bolha mock-bolha-min"></div><div class="mock-bolha mock-bolha-eu"></div></div>
      </div>
    </div>
    ${vazio(mensagem)}
    ${extra}
  </div></div>`;
}

module.exports = { documento, paginaLogin, pagina, icone, avatarHtml, mensagemHtml, vazio, ecraVazioDecorado, mensagensFlash };
