// Vistas (HTML) da app "Conversas" — visual inspirado no Microsoft Teams (faixa escura de
// navegação + lista clara + canais com #), com duas secções: Equipas (canais por disciplina,
// dentro de cada turma) e Mensagens (conversas privadas 1 para 1).
const { h, iniciais } = require('../src/lib/util');
const fs = require('node:fs');
const path = require('node:path');
const { escolaAtual } = require('../src/lib/contexto');

// Endereço de um ficheiro de publico/ com a data da última alteração (ex.: /static/estilo.css?v=mh3k2a):
// quando o ficheiro muda, o endereço muda, e o browser nunca usa uma cópia antiga do CSS ou do JavaScript.
function estatico(ficheiro) {
  let versao = '0';
  try {
    versao = Math.round(fs.statSync(path.join(__dirname, 'publico', ficheiro)).mtimeMs).toString(36);
  } catch {
    // ficheiro em falta: o pedido dá 404, como antes
  }
  return `/static/${ficheiro}?v=${versao}`;
}

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
  mais: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
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

function documento(titulo, corpo, classeBody = '') {
  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${h(titulo)} · Conversas</title>
  <meta name="color-scheme" content="light dark">
  <script>try { var t = localStorage.getItem('tema-conversas'); if (t === 'claro' || t === 'escuro') document.documentElement.dataset.tema = t; } catch (e) {}</script>
  <link rel="stylesheet" href="${estatico('estilo.css')}">
  <link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
  <script src="${estatico('app.js')}" defer></script>
</head>
<body class="${classeBody}">
${corpo}
</body>
</html>`;
}

// Páginas de entrada (login e erros): o mesmo desenho da Gestão Escolar — barra branca com o
// logótipo, faixa com a imagem da escola e um painel translúcido ao centro, e (só no login)
// colunas de informação por baixo. Fica com o logótipo e o roxo da Conversas, para se perceber
// que é a outra aplicação.
function paginaEntrada(titulo, { tituloPainel = '', painel, informacao = '' }) {
  return documento(
    titulo,
    `<header class="entrada-topo">
      <a class="marca" href="/login">${LOGO}<span><strong>Conversas</strong><small>Mensagens e canais da sua turma</small></span></a>
    </header>
    <main class="entrada-capa">
      <div class="entrada-painel">
        ${tituloPainel ? `<h1>${tituloPainel}</h1>` : ''}
        ${painel}
      </div>
    </main>
    ${informacao ? `<section class="entrada-info">${informacao}</section>` : ''}`,
    'entrada'
  );
}

// Nome a mostrar nos textos: o da escola (no endereço de uma escola), ou "Gestão Escolar" no /login geral
const nomeDaEscola = () => (escolaAtual().id ? escolaAtual().nome : 'Gestão Escolar');

const informacaoLogin = () => `
  <div>
    <h2>Conversas</h2>
    <p>A Conversas é a aplicação de mensagens da escola, para professores e alunos. Permite:</p>
    <ul>
      <li>Conversar nos canais de cada disciplina da turma;</li>
      <li>Trocar mensagens privadas com os professores.</li>
    </ul>
  </div>
  <div>
    <h2>Como entrar?</h2>
    <p>Use o <strong>email institucional</strong> e a mesma palavra-passe da ${h(nomeDaEscola())}.</p>
    <p>Se é a primeira vez, entre primeiro na plataforma da ${h(nomeDaEscola())} para escolher a sua palavra-passe.</p>
  </div>
  <div>
    <h2>Ajuda</h2>
    <p>Se se esqueceu da palavra-passe, recupere-a na página de entrada da <strong>${h(nomeDaEscola())}</strong>.
      Para outra ajuda, contacte a secretaria da escola.</p>
  </div>`;

function paginaLogin({ email = '', erro = '', mensagens = [] } = {}) {
  return paginaEntrada('Entrar', {
    tituloPainel: 'Bem-vindo à Conversas',
    painel: `
      ${escolaAtual().id ? `<p class="entrada-escola">${h(escolaAtual().nome)}</p>` : ''}
      ${mensagensFlash(mensagens)}
      ${erro ? `<div class="alerta alerta-erro" role="alert">${h(erro)}</div>` : ''}
      <form method="post" action="/login" class="entrada-form">
        <p class="entrada-rotulo">Professores e alunos, com o email institucional</p>
        <label>Email institucional
          <input type="email" name="email" value="${h(email)}" placeholder="nome.apelido.numero@${h(escolaAtual().id ? escolaAtual().dominio_email : 'escola.pt')}" autocomplete="username" required autofocus>
        </label>
        <label>Palavra-passe
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <button class="botao botao-bloco">Entrar</button>
      </form>
      <hr class="entrada-linha">
      <p class="entrada-texto">Use o mesmo email e a mesma palavra-passe da ${h(nomeDaEscola())}.</p>`,
    informacao: informacaoLogin(),
  });
}

// Azulejo quadrado com as iniciais da turma (o Teams mostra cada equipa assim); a cor sai do nome
function azulejoEquipa(nome, classe = 'azulejo-equipa') {
  return `<span class="${classe} avatar-cor-${corAvatar(nome)}" aria-hidden="true">${h(iniciais(nome))}</span>`;
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
      <div class="turma-cabecalho">${azulejoEquipa(turma.nome)}<span class="turma-nome" title="${h(turma.nome)}">${h(turma.nome)}</span>${podeGerir ? `<a href="/turma/${turma.id}" class="turma-gerir" title="Gerir canais de ${h(turma.nome)}" aria-label="Gerir canais de ${h(turma.nome)}">${icone('mais')}</a>` : ''}</div>
      ${
        canais.length
          ? canais
              .map(
                (c) => `<a href="/turma/${turma.id}/canal/${c.id}" class="canal-link${c.id === canalAtivoId ? ' ativo' : ''}"${c.id === canalAtivoId ? ' aria-current="page"' : ''} title="${h(c.nome)}">
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
      (c) => `<a href="/mensagens/${c.id}" class="conversa-link${c.id === conversaAtivaId ? ' ativo' : ''}"${c.id === conversaAtivaId ? ' aria-current="page"' : ''} title="${h(c.outro_nome)}">
      ${avatarHtml(c.outro_nome, 'avatar conversa-avatar')}
      <span class="conversa-info"><strong>${h(c.outro_nome)}</strong><small>${c.outro_papel === 'professor' ? 'Professor' : 'Aluno'}</small></span>
    </a>`
    )
    .join('');
}

function pagina(
  req,
  {
    secaoAtiva = 'equipas',
    arvore = [],
    canalAtivoId = null,
    conversas = [],
    conversaAtivaId = null,
    titulo,
    subtitulo = '',
    distintivoTitulo = '',
    cabecalhoAvatar = '',
    cabecalhoExtra = '',
    separador = '',
  },
  conteudo
) {
  const u = req.utilizador;
  const equipasAtivo = secaoAtiva === 'equipas';
  const papel = u.papel === 'professor' ? 'Professor' : 'Aluno';
  const listaHtml = equipasAtivo
    ? `<div class="lista-cabecalho-linha"><h2 class="lista-cabecalho">Equipas</h2></div>
       <nav class="arvore" aria-label="Turmas e canais">${arvoreHtml(arvore, canalAtivoId)}</nav>`
    : `<div class="lista-cabecalho-linha">
         <h2 class="lista-cabecalho">Chat</h2>
         <a class="botao-icone" href="/mensagens/nova" title="Nova conversa" aria-label="Nova conversa">${icone('nova')}</a>
       </div>
       <nav class="arvore" aria-label="Conversas">${listaConversasHtml(conversas, conversaAtivaId)}</nav>`;
  // Cabeçalho do conteúdo: num canal, o azulejo da turma; numa conversa, o avatar da pessoa
  const iconeTitulo = canalAtivoId && subtitulo ? azulejoEquipa(subtitulo, 'azulejo-equipa grande') : cabecalhoAvatar;
  const nomeSeparador = separador || (canalAtivoId ? 'Publicações' : conversaAtivaId ? 'Chat' : '');

  return documento(
    titulo,
    `
<div class="app">
  <header class="barra-titulo">
    <button class="botao-icone so-movel" data-alternar-menu aria-controls="lateral" aria-label="Abrir lista">${icone('menu')}</button>
    <a href="/" class="barra-marca" aria-label="Conversas — página inicial">${LOGO}<span>Conversas</span></a>
    <form class="barra-pesquisa" method="get" action="/mensagens/nova" role="search">
      ${icone('pesquisar')}
      <input type="search" name="q" placeholder="Pesquisar pessoas" aria-label="Pesquisar pessoas para conversar">
    </form>
    <div class="barra-conta">
      ${botaoTema()}
      <span class="barra-avatar" title="${h(u.nome)} · ${papel}">${avatarHtml(u.nome, 'avatar')}<span class="presenca" aria-hidden="true"></span></span>
      <form method="post" action="/logout"><button class="botao-icone" title="Terminar sessão" aria-label="Terminar sessão">${icone('sair')}</button></form>
    </div>
  </header>
  <div class="app-corpo">
    <nav class="rail" aria-label="Secções">
      <a href="/mensagens" class="rail-botao${!equipasAtivo ? ' ativo' : ''}"${!equipasAtivo ? ' aria-current="page"' : ''}>${icone('mensagens')}<span>Chat</span></a>
      <a href="/" class="rail-botao${equipasAtivo ? ' ativo' : ''}"${equipasAtivo ? ' aria-current="page"' : ''}>${icone('equipas')}<span>Equipas</span></a>
    </nav>
    <aside class="lista-canais" id="lateral">${listaHtml}</aside>
    <main class="conteudo">
      <header class="topo-canal">
        <div class="topo-canal-linha">
          ${iconeTitulo}
          <div class="topo-canal-titulo">
            <h1>${h(titulo)}${distintivoTitulo ? ` ${distintivoTitulo}` : ''}</h1>
            ${subtitulo ? `<span class="etiqueta-turma">${h(subtitulo)}</span>` : ''}
          </div>
          <div class="topo-canal-extra">${cabecalhoExtra}</div>
        </div>
        ${nomeSeparador ? `<nav class="separadores" aria-label="Separadores"><span class="separador ativo" aria-current="page">${h(nomeSeparador)}</span></nav>` : ''}
      </header>
      ${mensagensFlash(req.lerFlash())}
      ${conteudo}
    </main>
  </div>
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
  const removido = !m.autor;
  const autor = m.autor || 'Utilizador removido';
  const papel = removido ? 'Conta removida' : rotuloPapel(m.autor_papel);
  return `<article class="mensagem${m.utilizador_id === meuId ? ' minha' : ''}" data-mensagem-id="${m.id}" data-autor-id="${m.utilizador_id ?? ''}" data-criado-em="${h(String(m.criado_em))}">
    ${avatarHtml(autor, 'avatar mensagem-avatar')}
    <div class="mensagem-corpo">
      <div class="mensagem-cabecalho">
        <strong>${h(autor)}</strong>
        ${papel ? `<span class="distintivo-papel">${papel}</span>` : ''}
        <time datetime="${h(isoDatetime(m.criado_em))}" title="${h(dataHoraCompleta(m.criado_em))}">${h(horaMensagem(m.criado_em))}</time>
      </div>
      <p>${h(m.texto)}</p>
    </div>
  </article>`;
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

module.exports = { documento, paginaLogin, paginaEntrada, pagina, icone, avatarHtml, mensagemHtml, vazio, ecraVazioDecorado, mensagensFlash };
