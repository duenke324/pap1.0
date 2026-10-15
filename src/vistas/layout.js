// Estrutura base das páginas (cabeçalho, menu lateral e mensagens)
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
    { href: '/professor/turmas', chave: 'turmas', texto: 'As minhas turmas', icone: 'grupo' },
    { href: '/professor/aula', chave: 'aula', texto: 'Dar aula', icone: 'lapis' },
    { href: '/professor/avaliacao', chave: 'avaliacao', texto: 'Avaliação', icone: 'medalha' },
    { href: '/professor/testes', chave: 'testes', texto: 'Testes e avaliações', icone: 'calendario' },
    { href: '/professor/horario', chave: 'horario', texto: 'Horário', icone: 'relogio' },
  ],
  admin: [
    { href: '/admin', chave: 'inicio', texto: 'Painel', icone: 'casa' },
    { href: '/admin/turmas', chave: 'turmas', texto: 'Turmas', icone: 'turma' },
    { href: '/admin/alunos', chave: 'alunos', texto: 'Alunos', icone: 'grupo' },
    { href: '/admin/professores', chave: 'professores', texto: 'Professores', icone: 'professor' },
    { href: '/admin/disciplinas', chave: 'disciplinas', texto: 'Disciplinas', icone: 'livro' },
    { href: '/admin/horarios', chave: 'horarios', texto: 'Horários', icone: 'relogio' },
    { href: '/admin/calendario', chave: 'calendario', texto: 'Calendário e avisos', icone: 'calendario' },
    { href: '/admin/faltas', chave: 'faltas', texto: 'Faltas', icone: 'falta' },
    { href: '/admin/funcionarios', chave: 'funcionarios', texto: 'Funcionários', icone: 'mala' },
    { href: '/admin/auditoria', chave: 'auditoria', texto: 'Auditoria', icone: 'auditoria' },
  ],
  funcionario: [
    { href: '/funcionario', chave: 'inicio', texto: 'Painel', icone: 'casa' },
    { href: '/funcionario/dados', chave: 'dados', texto: 'Dados pessoais', icone: 'professor' },
  ],
};

const NOMES_PAPEL = { aluno: 'Aluno', professor: 'Professor', admin: 'Administrador', funcionario: 'Funcionário' };

// O funcionário mostra o cargo (ex.: "Biblioteca") em vez do rótulo genérico "Funcionário"
function rotuloPapel(req) {
  if (req.utilizador.papel === 'funcionario' && req.funcionario) {
    return CARGOS_FUNCIONARIO[req.funcionario.cargo] || NOMES_PAPEL.funcionario;
  }
  return NOMES_PAPEL[req.utilizador.papel];
}

const ICONES = {
  casa: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  falta: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  grupo: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.6c2.6.1 4.4 1.8 5 4.9"/>',
  turma: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4M7 9h6M7 12h10"/>',
  professor: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c.7-4 3.4-6 7-6s6.3 2 7 6M9.5 14.5 12 17l2.5-2.5"/>',
  livro: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  lapis: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  medalha: '<circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.5-1.5 7.5 5-2.5 5 2.5-1.5-7.5"/>',
  auditoria: '<circle cx="11" cy="11" r="7"/><path d="M16 16l5 5M8 11h6"/>',
  lua: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  sair: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  imprimir: '<path d="M8 9V4h8v5"/><rect x="5" y="9" width="14" height="7" rx="1"/><path d="M8 16v4h8v-4"/>',
};

function icone(nome) {
  return `<svg class="icone" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] || ''}</svg>`;
}

// Logótipo: uma caderneta com marcador (as cores vêm do CSS, para funcionar no tema claro e no escuro)
const LOGO = `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
  <rect x="6" y="3" width="21" height="26" rx="2.5" class="logo-capa"/>
  <rect x="6" y="3" width="4.5" height="26" rx="1.5" class="logo-lombada"/>
  <path d="M14.5 12h8M14.5 16h8M14.5 20h5" class="logo-linhas"/>
  <path d="M21 3v8.5l-2-1.6-2 1.6V3z" class="logo-fita"/>
</svg>`;

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

function documento(titulo, corpo, classeBody = '') {
  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${h(titulo)} · Gestão Escolar</title>
  <meta name="color-scheme" content="light dark">
  <script>try { var t = localStorage.getItem('tema'); if (t === 'claro' || t === 'escuro') document.documentElement.dataset.tema = t; } catch (e) {}</script>
  <link rel="stylesheet" href="/static/estilo.css">
  <link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
  <script src="/static/app.js" defer></script>
</head>
<body class="${classeBody}">
${corpo}
</body>
</html>`;
}

// Página com menu lateral (depois do login). O aluno tem uma página diferente, com separadores.
function pagina(req, opcoes, conteudo) {
  if (req.utilizador.papel === 'aluno') return paginaAluno(req, opcoes, conteudo);
  const { titulo, ativo, subtitulo = '', acoes = '' } = opcoes;
  const u = req.utilizador;
  const menu = MENUS[u.papel]
    .map(
      (item) =>
        `<a href="${item.href}" class="${item.chave === ativo ? 'ativo' : ''}"${item.chave === ativo ? ' aria-current="page"' : ''}>${icone(item.icone)}<span>${h(item.texto)}</span></a>`
    )
    .join('');
  const dataTexto = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  const hojeTexto = dataTexto.charAt(0).toUpperCase() + dataTexto.slice(1);

  return documento(
    titulo,
    `
<div class="app">
  <aside class="lateral" id="lateral">
    <div class="marca">
      ${LOGO}
      <div><strong>Gestão Escolar</strong><small>Ano letivo ${h(anoLetivoAtual())}</small></div>
    </div>
    <nav class="menu" aria-label="Menu principal">${menu}</nav>
    <div class="utilizador">
      <span class="avatar pequeno">${h(iniciais(u.nome))}</span>
      <div class="utilizador-info"><strong>${h(u.nome)}</strong><small>${NOMES_PAPEL[u.papel]}</small></div>
      ${botaoTema()}
      <form method="post" action="/logout"><button class="botao-icone" title="Terminar sessão" aria-label="Terminar sessão">${icone('sair')}</button></form>
    </div>
  </aside>
  <main class="conteudo">
    <header class="topo">
      <button class="botao-icone so-movel" data-alternar-menu aria-label="Abrir menu">${icone('menu')}</button>
      <div>
        <p class="data-hoje">${h(hojeTexto)}</p>
        <h1>${h(titulo)}</h1>
        ${subtitulo ? `<p class="subtitulo">${subtitulo}</p>` : ''}
      </div>
      <div class="acoes-topo">${acoes}</div>
    </header>
    ${mensagensFlash(req.lerFlash())}
    ${conteudo}
  </main>
</div>`
  );
}

// Página do aluno: barra de topo, ficha de identificação (fotografia + dados) e separadores
function paginaAluno(req, { titulo, ativo, subtitulo = '', acoes = '' }, conteudo) {
  const a = req.aluno || { nome: req.utilizador.nome };
  const separadores = MENUS.aluno
    .map(
      (item) =>
        `<a href="${item.href}" class="${item.chave === ativo ? 'ativo' : ''}"${item.chave === ativo ? ' aria-current="page"' : ''}>${h(item.texto)}</a>`
    )
    .join('');
  // O title mostra o texto completo quando não cabe na caixa (ex.: nomes de cursos compridos)
  const campo = (rotulo, valor, classe = '', completo = '') =>
    `<div class="id-campo ${classe}"><span class="id-rotulo">${rotulo}</span><span class="id-valor"${completo ? ` title="${h(completo)}"` : ''}>${valor}</span></div>`;
  const situacao = a.turma_id
    ? '<strong class="id-situacao ok">Matriculado</strong>'
    : '<strong class="id-situacao">Sem turma</strong>';

  return documento(
    titulo,
    `
<header class="barra-aluno">
  <form method="post" action="/logout"><button class="botao-barra">${icone('sair')}<span>Terminar sessão</span></button></form>
  <span class="barra-aluno-escola">Gestão Escolar · Ano letivo ${h(a.ano_letivo || anoLetivoAtual())}</span>
  ${botaoTema()}
</header>
<div class="pagina-aluno">
  <section class="identificacao" aria-label="Identificação do aluno">
    <div class="id-marca">${LOGO}<span>Gestão<br>Escolar</span></div>
    <div class="id-foto">${avatar(a, 'foto')}</div>
    <div class="id-dados">
      ${campo('Processo', h(a.numero_processo || '—'), 'curto')}
      ${campo('Nome', h(a.nome), 'largo', a.nome)}
      ${campo('Situação', situacao, 'fim')}
      ${campo('Ano letivo', h(a.ano_letivo || '—'), 'curto')}
      ${campo('Curso', h(a.curso || '—'), 'largo', a.curso)}
      ${campo('Turma', h(a.turma || '—'), 'fim')}
      ${campo('Diretor de turma', h(a.diretor || '—'), 'medio')}
      ${campo('Encarregado de educação', h(a.encarregado_nome || '—'), 'medio')}
    </div>
  </section>
  <nav class="abas" aria-label="Secções">${separadores}</nav>
  <main class="abas-painel">
    <header class="abas-titulo">
      <div>
        <h1>${h(titulo)}</h1>
        ${subtitulo ? `<p class="subtitulo">${subtitulo}</p>` : ''}
      </div>
      ${acoes ? `<div class="acoes-topo">${acoes}</div>` : ''}
    </header>
    ${mensagensFlash(req.lerFlash())}
    ${conteudo}
  </main>
</div>`,
    'corpo-aluno'
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

module.exports = { documento, pagina, avatar, vazio, grelhaHorario, icone, mensagensFlash, botaoTema, botaoImprimir, LOGO };
