// Estrutura base das páginas: a mesma caderneta para todos os papéis (cabeçalho, índice, folha com margem)
const fs = require('node:fs');
const path = require('node:path');
const { pastaBase } = require('../lib/recursos');
const { h, iniciais, DIAS_CURTOS, anoLetivoAtual, CARGOS_FUNCIONARIO } = require('../lib/util');

const MENUS = {
  aluno: [
    { href: '/aluno', chave: 'inicio', texto: 'Informações' },
    { href: '/aluno/estatisticas', chave: 'estatisticas', texto: 'Estatísticas' },
    { href: '/aluno/dados', chave: 'dados', texto: 'Dados pessoais' },
    { href: '/aluno/avaliacao', chave: 'avaliacao', texto: 'Avaliações' },
    { href: '/aluno/faltas', chave: 'faltas', texto: 'Faltas' },
    { href: '/aluno/sumarios', chave: 'sumarios', texto: 'Sumários' },
    { href: '/aluno/testes', chave: 'testes', texto: 'Testes' },
    { href: '/aluno/horario', chave: 'horario', texto: 'Horário' },
  ],
  professor: [
    { href: '/professor/turmas', chave: 'turmas', texto: 'As minhas turmas' },
    { href: '/professor/aula', chave: 'aula', texto: 'Dar aula' },
    { href: '/professor/justificativos', chave: 'justificativos', texto: 'Justificativos' },
    { href: '/professor/avaliacao', chave: 'avaliacao', texto: 'Avaliação' },
    { href: '/professor/testes', chave: 'testes', texto: 'Testes e avaliações' },
    { href: '/professor/horario', chave: 'horario', texto: 'Horário' },
  ],
  admin: [
    { href: '/admin', chave: 'inicio', texto: 'Painel' },
    { href: '/admin/turmas', chave: 'turmas', texto: 'Turmas' },
    { href: '/admin/alunos', chave: 'alunos', texto: 'Alunos' },
    { href: '/admin/professores', chave: 'professores', texto: 'Professores' },
    { href: '/admin/disciplinas', chave: 'disciplinas', texto: 'Disciplinas' },
    { href: '/admin/horarios', chave: 'horarios', texto: 'Horários' },
    { href: '/admin/calendario', chave: 'calendario', texto: 'Calendário e avisos' },
    { href: '/admin/faltas', chave: 'faltas', texto: 'Faltas' },
    { href: '/admin/justificativos', chave: 'justificativos', texto: 'Justificativos' },
    { href: '/admin/funcionarios', chave: 'funcionarios', texto: 'Funcionários' },
    { href: '/admin/auditoria', chave: 'auditoria', texto: 'Auditoria' },
  ],
  funcionario: [
    { href: '/funcionario', chave: 'inicio', texto: 'Painel' },
    { href: '/funcionario/dados', chave: 'dados', texto: 'Dados pessoais' },
  ],
  encarregado: [
    { href: '/encarregado', chave: 'inicio', texto: 'Painel' },
    { href: '/encarregado/faltas', chave: 'faltas', texto: 'Faltas' },
    { href: '/encarregado/justificativos', chave: 'justificativos', texto: 'Justificativos' },
  ],
};

const NOMES_PAPEL = {
  aluno: 'Aluno',
  professor: 'Professor',
  admin: 'Administrador',
  funcionario: 'Funcionário',
  encarregado: 'Encarregado de educação',
};

// O funcionário mostra o cargo (ex.: "Biblioteca") em vez do rótulo genérico "Funcionário"
function rotuloPapel(req) {
  if (req.utilizador.papel === 'funcionario' && req.funcionario) {
    return CARGOS_FUNCIONARIO[req.funcionario.cargo] || NOMES_PAPEL.funcionario;
  }
  return NOMES_PAPEL[req.utilizador.papel];
}

const ICONES = {
  lua: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  sair: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  imprimir: '<path d="M8 9V4h8v5"/><rect x="5" y="9" width="14" height="7" rx="1"/><path d="M8 16v4h8v-4"/>',
  microfone: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
};

function icone(nome) {
  return `<svg class="icone" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] || ''}</svg>`;
}

// Logótipo: o capelo do site InformaNege (o mesmo desenho de informanege/vistas.js), para a marca
// ser a mesma no site de apresentação e na aplicação. A cor vem do CSS (tema claro e escuro).
const LOGO =
  '<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/><path d="M22 10v6.5"/></svg>';

// Botão para alternar entre o tema claro e o escuro (a escolha fica guardada no browser)
function botaoTema() {
  return `<button type="button" class="botao-icone botao-tema" data-alternar-tema title="Mudar para tema escuro/claro" aria-label="Alternar tema claro/escuro">
    <span class="tema-lua">${icone('lua')}</span><span class="tema-sol">${icone('sol')}</span></button>`;
}

// Imprime a página atual (o browser oferece "Guardar como PDF" no diálogo de impressão).
// A folha de estilos (@media print) esconde o menu, filtros e botões de ação.
function botaoImprimir(texto = 'Imprimir / Exportar PDF') {
  return `<button type="button" class="botao botao-secundario no-imprimir" data-imprimir>${icone('imprimir')}<span>${h(texto)}</span></button>`;
}

function mensagensFlash(mensagens) {
  if (!mensagens || !mensagens.length) return '';
  return mensagens.map((m) => `<div class="alerta alerta-${h(m.tipo)}" role="status">${h(m.mensagem)}</div>`).join('');
}

// Endereço de um ficheiro de public/ com a data da última alteração (ex.: /static/estilo.css?v=mh3k2a).
// Quando o ficheiro muda, o endereço muda, e nem o browser nem o service worker podem responder
// com a cópia antiga que tinham guardada — sem isto, depois de uma atualização via-se a página
// nova com o CSS antigo.
const PASTA_PUBLICA = path.join(pastaBase(), 'public');
function estatico(ficheiro) {
  let versao = '0';
  try {
    versao = Math.round(fs.statSync(path.join(PASTA_PUBLICA, ficheiro)).mtimeMs).toString(36);
  } catch {
    // ficheiro em falta: o endereço fica sem versão útil e o pedido dá 404, como antes
  }
  return `/static/${ficheiro}?v=${versao}`;
}

function documento(titulo, corpo, classeBody = '') {
  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${h(titulo)} · Gestão Escolar</title>
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#000000">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="Gestão Escolar">
  <script>try { var t = localStorage.getItem('tema'); if (t === 'claro' || t === 'escuro') document.documentElement.dataset.tema = t; } catch (e) {}</script>
  <link rel="preload" href="/static/vendor/fontes/plex-sans-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/static/vendor/fontes/newsreader.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${estatico('estilo.css')}">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="${estatico('favicon.svg')}" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">
  <script src="${estatico('app.js')}" defer></script>
</head>
<body class="${classeBody}">
${corpo}
</body>
</html>`;
}

// ---------- Páginas de entrada (login, primeira palavra-passe, erros) ----------
// Barra branca com o logótipo, uma faixa com fotografia e um painel translúcido ao centro e, só no
// login, três colunas de informação por baixo. A fotografia da escola é opcional: basta pôr um
// ficheiro em public/imagens/escola.jpg (sem ele, a faixa usa um degradê).
const FOTO_ESCOLA = path.join(pastaBase(), 'public', 'imagens', 'escola.jpg');

function paginaEntrada(titulo, { tituloPainel = '', painel, informacao = '' }) {
  const comFoto = fs.existsSync(FOTO_ESCOLA);
  return documento(
    titulo,
    `<header class="entrada-topo">
      <a class="marca" href="/login">${LOGO}<span><strong>Gestão Escolar</strong><small>Faltas, sumários e avaliação</small></span></a>
    </header>
    <main class="entrada-capa${comFoto ? ' com-foto' : ''}">
      <div class="entrada-painel">
        ${tituloPainel ? `<h1>${tituloPainel}</h1>` : ''}
        ${painel}
      </div>
    </main>
    ${informacao ? `<section class="entrada-info">${informacao}</section>` : ''}`,
    'entrada'
  );
}

// Ficha de identificação do aluno, por baixo do índice (o guião pede estes dados sempre visíveis)
function identificacaoAluno(a) {
  // O title mostra o texto completo quando não cabe na caixa (ex.: nomes de cursos compridos)
  const campo = (rotulo, valor, completo = '') =>
    `<div class="id-campo"><dt>${rotulo}</dt><dd${completo ? ` title="${h(completo)}"` : ''}>${valor}</dd></div>`;
  const situacao = a.turma_id
    ? '<strong class="id-situacao ok">Matriculado</strong>'
    : '<strong class="id-situacao">Sem turma</strong>';

  return `<section class="identificacao" aria-label="Identificação do aluno">
    <div class="id-foto">${avatar(a, 'foto')}</div>
    <dl class="id-dados">
      ${campo('Nome', h(a.nome), a.nome)}
      ${campo('Processo', h(a.numero_processo || '—'))}
      ${campo('Turma', h(a.turma || '—'))}
      ${campo('Situação', situacao)}
      ${campo('Curso', h(a.curso || '—'), a.curso)}
      ${campo('Ano letivo', h(a.ano_letivo || '—'))}
      ${campo('Diretor de turma', h(a.diretor || '—'))}
      ${campo('Encarregado de educação', h(a.encarregado_nome || '—'))}
    </dl>
  </section>`;
}

// Página depois do login: igual para todos os papéis. Cada entrada do índice tem um número, que
// aparece também na margem da folha ("N.º 03"), como as folhas numeradas de uma caderneta.
function pagina(req, opcoes, conteudo) {
  const { titulo, ativo, subtitulo = '', acoes = '' } = opcoes;
  const u = req.utilizador;
  const numero = (i) => String(i + 1).padStart(2, '0');
  const indice = MENUS[u.papel]
    .map(
      (item, i) =>
        `<a href="${item.href}" class="${item.chave === ativo ? 'ativo' : ''}"${item.chave === ativo ? ' aria-current="page"' : ''}><span class="menu-num">${numero(i)}</span><span>${h(item.texto)}</span></a>`
    )
    .join('');
  const posicao = MENUS[u.papel].findIndex((item) => item.chave === ativo);
  const dataTexto = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  const hojeTexto = dataTexto.charAt(0).toUpperCase() + dataTexto.slice(1);
  const aluno = u.papel === 'aluno' ? req.aluno || { nome: u.nome } : null;

  return documento(
    titulo,
    `
<a href="#conteudo-principal" class="ligacao-saltar">Saltar para o conteúdo</a>
<div class="caderneta">
  <header class="cabecalho">
    <a class="marca" href="/">${LOGO}<strong>Gestão Escolar</strong></a>
    <p class="cabecalho-ano">Ano letivo ${h(aluno?.ano_letivo || anoLetivoAtual())}</p>
    <div class="utilizador">
      <div class="utilizador-info"><strong>${h(u.nome)}</strong><small>${h(rotuloPapel(req))}</small></div>
      ${botaoTema()}
      <form method="post" action="/logout"><button class="botao-icone" title="Terminar sessão" aria-label="Terminar sessão">${icone('sair')}</button></form>
      <button class="botao-icone so-movel" data-alternar-menu aria-controls="lateral" aria-expanded="false" aria-label="Abrir menu">${icone('menu')}</button>
    </div>
  </header>
  <nav class="menu" id="lateral" aria-label="Menu principal">${indice}</nav>
  ${aluno ? identificacaoAluno(aluno) : ''}
  <div class="folha">
    <aside class="margem">
      <div class="margem-folio">
        ${posicao >= 0 ? `<p class="margem-numero"><small>N.º</small><strong>${numero(posicao)}</strong></p>` : ''}
        <p class="margem-data">${h(hojeTexto)}</p>
      </div>
    </aside>
    <main class="conteudo" id="conteudo-principal" tabindex="-1">
      <header class="topo">
        <div>
          <h1>${h(titulo)}</h1>
          ${subtitulo ? `<p class="subtitulo">${subtitulo}</p>` : ''}
        </div>
        ${acoes ? `<div class="acoes-topo">${acoes}</div>` : ''}
      </header>
      ${mensagensFlash(req.lerFlash())}
      ${conteudo}
    </main>
  </div>
</div>`
  );
}

// ---------- Componentes reutilizáveis ----------

function avatar(aluno, tamanho = '') {
  if (aluno.fotografia) {
    return `<img class="avatar ${tamanho}" src="/fotos/${h(aluno.fotografia)}" alt="Fotografia de ${h(aluno.nome)}" loading="lazy">`;
  }
  return `<span class="avatar ${tamanho}" aria-hidden="true">${h(iniciais(aluno.nome))}</span>`;
}

function vazio(texto) {
  return `<div class="vazio">${h(texto)}</div>`;
}

// Grelha semanal do horário (linhas = tempos, colunas = dias úteis)
function grelhaHorario(aulas, { mostrarTurma = false, destacarHoje = true } = {}) {
  if (!aulas.length) return vazio('Ainda não existe horário definido.');
  const tempos = [...new Set(aulas.map((a) => `${a.hora_inicio}|${a.hora_fim}`))].sort();
  const diaHoje = ((new Date().getDay() + 6) % 7) + 1; // 1 = segunda
  const cabecalho = [1, 2, 3, 4, 5]
    .map((d) => `<th class="${destacarHoje && d === diaHoje ? 'hoje' : ''}">${DIAS_CURTOS[d]}</th>`)
    .join('');
  const linhas = tempos
    .map((t) => {
      const [inicio, fim] = t.split('|');
      const celulas = [1, 2, 3, 4, 5]
        .map((d) => {
          const aula = aulas.find((a) => a.dia_semana === d && a.hora_inicio === inicio);
          const classeHoje = destacarHoje && d === diaHoje ? ' hoje' : '';
          if (!aula) return `<td class="livre${classeHoje}"></td>`;
          return `<td class="${classeHoje.trim()}"><div class="aula cor-${aula.disciplina_id % 8}">
            <strong title="${h(aula.disciplina)}">${h(aula.sigla)}</strong>
            <span>${h(mostrarTurma ? aula.turma : aula.professor || '')}</span>
            ${aula.sala ? `<small>Sala ${h(aula.sala)}</small>` : ''}
          </div></td>`;
        })
        .join('');
      return `<tr><th class="tempo">${h(inicio)}<small>${h(fim)}</small></th>${celulas}</tr>`;
    })
    .join('');
  return `<div class="tabela-scroll"><table class="horario"><thead><tr><th></th>${cabecalho}</tr></thead><tbody>${linhas}</tbody></table></div>`;
}

module.exports = { documento, pagina, paginaEntrada, estatico, avatar, vazio, grelhaHorario, icone, mensagensFlash, botaoTema, botaoImprimir, LOGO };
