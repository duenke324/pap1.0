// Tarefas da app Conversas (como as do Microsoft Teams).
//  - O professor cria uma tarefa num canal ou grupo de uma turma que leciona: título, instruções,
//    ficheiro opcional (enunciado), data limite e pontos. Fica atribuída a todos os alunos desse
//    canal/grupo, e aparece uma mensagem no canal a avisar.
//  - O aluno vê as suas tarefas (por entregar, entregues, devolvidas), escreve a resposta e/ou junta
//    um ficheiro e entrega. Pode anular a entrega e entregar outra vez enquanto não for devolvida.
//  - O professor vê quem entregou, descarrega os trabalhos e devolve com nota e comentário.
// Tudo é verificado do lado do servidor com canalAcessivel (o professor tem de lecionar a turma;
// o aluno tem de ser membro do canal/grupo).
const { get, post } = require('../src/lib/servidor');
const { todos, um, executar } = require('../src/db');
const { h } = require('../src/lib/util');
const { pagina, vazio, icone, avatarHtml, azulejoEquipa } = require('./vistas');
const { canalAcessivel, arvoreDoUtilizador } = require('./rotas');
const { guardarFicheiroTarefa, apagarFicheiroTarefa, enviarFicheiroTarefa, ACEITES } = require('./ficheiros');

// ---------- Datas ----------
const doisDigitos = (n) => String(n).padStart(2, '0');
// Agora, no mesmo formato que o MySQL devolve as datas ('AAAA-MM-DD HH:MM:SS'), para comparar texto com texto
function agora() {
  const d = new Date();
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}:${doisDigitos(d.getSeconds())}`;
}
const DIAS = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
function dataLegivel(texto) {
  if (!texto) return '';
  const [data, hora = '00:00'] = String(texto).split(' ');
  const [ano, mes, dia] = data.split('-').map(Number);
  const semana = DIAS[new Date(ano, mes - 1, dia).getDay()];
  return `${semana} ${doisDigitos(dia)}/${doisDigitos(mes)}/${ano}, ${hora.slice(0, 5)}`;
}
const numero = (n) => (n === null || n === undefined ? '' : String(Number(n)).replace('.', ','));

// ---------- Estado de uma entrega ----------
function estadoEntrega(tarefa, entrega) {
  const atrasada = (quando) => tarefa.data_limite && quando > tarefa.data_limite;
  if (entrega?.devolvida_em) return { chave: 'devolvida', texto: 'Devolvida' };
  if (entrega?.entregue_em) return atrasada(entrega.entregue_em) ? { chave: 'entregue', texto: 'Entregue com atraso' } : { chave: 'entregue', texto: 'Entregue' };
  if (atrasada(agora())) return { chave: 'atraso', texto: 'Em atraso' };
  return { chave: 'atribuida', texto: 'Atribuída' };
}
const etiquetaEstado = (e) => `<span class="estado-tarefa estado-${e.chave}">${h(e.texto)}</span>`;

// ---------- Consultas ----------
const COLUNAS_TAREFA = `t.*, c.nome AS canal, c.tipo AS canal_tipo, c.turma_id, tu.nome AS turma, p.nome AS professor`;
const JUNTAR_TAREFA = `FROM tarefas t JOIN canais c ON c.id = t.canal_id JOIN turmas tu ON tu.id = c.turma_id
  LEFT JOIN professores p ON p.id = t.professor_id`;

// Tarefas que este utilizador vê (opcionalmente só de um canal), mais recentes primeiro
function tarefasDoUtilizador(req, canalId = null) {
  const filtroCanal = canalId ? 'AND t.canal_id = ?' : '';
  const extra = canalId ? [canalId] : [];
  if (req.professor) {
    return todos(
      `SELECT ${COLUNAS_TAREFA},
              (SELECT COUNT(*) FROM canal_membros cm WHERE cm.canal_id = c.id) AS atribuidos,
              (SELECT COUNT(*) FROM tarefa_entregas e WHERE e.tarefa_id = t.id AND e.entregue_em IS NOT NULL) AS entregues,
              (SELECT COUNT(*) FROM tarefa_entregas e WHERE e.tarefa_id = t.id AND e.entregue_em IS NOT NULL AND e.devolvida_em IS NULL) AS por_avaliar
         ${JUNTAR_TAREFA}
        WHERE c.turma_id IN (SELECT turma_id FROM horario WHERE professor_id = ? AND ativo = 1) ${filtroCanal}
        ORDER BY t.criado_em DESC, t.id DESC`,
      req.professor.id,
      ...extra
    );
  }
  return todos(
    `SELECT ${COLUNAS_TAREFA}, e.entregue_em, e.devolvida_em, e.nota
       ${JUNTAR_TAREFA}
       JOIN canal_membros membro ON membro.canal_id = c.id AND membro.aluno_id = ?
       LEFT JOIN tarefa_entregas e ON e.tarefa_id = t.id AND e.aluno_id = ?
      WHERE 1 = 1 ${filtroCanal}
      ORDER BY (t.data_limite IS NULL), t.data_limite, t.id DESC`,
    req.aluno.id,
    req.aluno.id,
    ...extra
  );
}

// Número de tarefas que o aluno ainda tem por entregar (para o número vermelho no botão "Tarefas")
async function contarPorEntregar(alunoId) {
  const l = await um(
    `SELECT COUNT(*) AS n FROM tarefas t JOIN canal_membros cm ON cm.canal_id = t.canal_id AND cm.aluno_id = ?
       LEFT JOIN tarefa_entregas e ON e.tarefa_id = t.id AND e.aluno_id = ?
      WHERE e.entregue_em IS NULL AND e.devolvida_em IS NULL`,
    alunoId,
    alunoId
  );
  return Number(l?.n || 0);
}

// Tarefa + canal, só se este utilizador lhe tiver acesso (caso contrário null)
async function tarefaAcessivel(req, id) {
  const tarefa = await um(`SELECT ${COLUNAS_TAREFA} ${JUNTAR_TAREFA} WHERE t.id = ?`, Number(id) || 0);
  if (!tarefa) return null;
  const canal = await canalAcessivel(req, tarefa.canal_id);
  return canal ? { tarefa, canal } : null;
}

// ---------- Lista à esquerda (filtros por canal) ----------
async function listaLateral(req, canalAtivo) {
  const arvore = await arvoreDoUtilizador(req);
  const grupos = arvore
    .filter((g) => g.canais.length)
    .map(
      ({ turma, canais }) => `<div class="turma-grupo">
        <div class="turma-cabecalho">${azulejoEquipa(turma.nome)}<span class="turma-nome">${h(turma.nome)}</span></div>
        ${canais
          .map(
            (c) => `<a href="/tarefas?canal=${c.id}" class="canal-link${c.id === canalAtivo ? ' ativo' : ''}"${c.id === canalAtivo ? ' aria-current="page"' : ''}>
              ${c.tipo === 'grupo' ? `<span class="hash">${icone('grupo', 'icone icone-grupo')}</span>` : '<span class="hash">#</span>'}<span>${h(c.nome)}</span></a>`
          )
          .join('')}
      </div>`
    )
    .join('');
  return `<div class="lista-cabecalho-linha">
      <h2 class="lista-cabecalho">Tarefas</h2>
      ${req.professor ? `<a class="botao-icone" href="/tarefas/nova${canalAtivo ? `?canal=${canalAtivo}` : ''}" title="Nova tarefa" aria-label="Nova tarefa">${icone('nova')}</a>` : ''}
    </div>
    <nav class="arvore" aria-label="Filtrar tarefas por canal">
      <a href="/tarefas" class="canal-link${canalAtivo ? '' : ' ativo'}"${canalAtivo ? '' : ' aria-current="page"'}><span class="hash">${icone('tarefas', 'icone icone-grupo')}</span><span>Todas as tarefas</span></a>
      ${grupos || '<p class="turma-vazia">Ainda não há canais.</p>'}
    </nav>`;
}

// ---------- Cartões ----------
function cartaoTarefa(req, t) {
  const limite = t.data_limite ? `<span class="tarefa-limite">Entrega até ${h(dataLegivel(t.data_limite))}</span>` : '<span class="tarefa-limite">Sem data limite</span>';
  const origem = `<span class="tarefa-origem">${t.canal_tipo === 'grupo' ? icone('grupo', 'icone icone-grupo') : '#'} ${h(t.canal)} · ${h(t.turma)}</span>`;
  let lado;
  if (req.professor) {
    lado = `<span class="tarefa-contagem"><strong>${t.entregues}</strong>/${t.atribuidos} entregues</span>
      ${t.por_avaliar ? `<span class="estado-tarefa estado-entregue">${t.por_avaliar} por avaliar</span>` : ''}`;
  } else {
    const estado = estadoEntrega(t, t);
    lado = `${etiquetaEstado(estado)}${t.devolvida_em && t.nota !== null && t.pontos ? `<span class="tarefa-nota">${numero(t.nota)}/${t.pontos}</span>` : ''}`;
  }
  return `<a class="cartao-tarefa" href="/tarefas/${t.id}">
    <span class="tarefa-icone">${icone('tarefas')}</span>
    <span class="tarefa-info"><strong>${h(t.titulo)}</strong>${origem}${limite}</span>
    <span class="tarefa-lado">${lado}</span>
  </a>`;
}

function seccaoTarefas(req, titulo, lista, textoVazio) {
  return `<section class="seccao-tarefas">
    <h2>${h(titulo)} <span class="contagem">${lista.length}</span></h2>
    ${lista.length ? `<div class="lista-tarefas">${lista.map((t) => cartaoTarefa(req, t)).join('')}</div>` : vazio(textoVazio)}
  </section>`;
}

// Campo de ficheiro: lido pelo browser (teams/publico/app.js) para os dois campos escondidos
function campoFicheiro(rotulo, atual = null) {
  return `<div class="campo-ficheiro" data-ficheiro-tarefa>
    <span class="campo-rotulo">${h(rotulo)} <small class="texto-suave">(opcional · máx. 4 MB · PDF, Word, Excel, PowerPoint, imagem, ZIP ou TXT)</small></span>
    <label class="botao botao-secundario botao-ficheiro">${icone('anexo')}<span data-ficheiro-nome>${atual ? 'Trocar ficheiro' : 'Escolher ficheiro'}</span>
      <input type="file" accept="${ACEITES}" data-ficheiro-entrada></label>
    <input type="hidden" name="ficheiro_dados" data-ficheiro-dados>
    <input type="hidden" name="ficheiro_nome" data-ficheiro-original>
  </div>`;
}

const ligacaoFicheiro = (href, nome) => `<a class="anexo" href="${href}" download>${icone('anexo')}<span>${h(nome)}</span></a>`;

// ---------- Lista de tarefas ----------
get('/tarefas', async (req, res) => {
  const canalId = Number(req.query.canal) || null;
  let canal = null;
  if (canalId) {
    canal = await canalAcessivel(req, canalId);
    if (!canal) return res.redirecionar('/tarefas');
  }
  const lista = await tarefasDoUtilizador(req, canalId);
  let conteudo;
  if (req.professor) {
    const porAvaliar = lista.filter((t) => t.por_avaliar > 0);
    const restantes = lista.filter((t) => !(t.por_avaliar > 0));
    conteudo = `<div class="pagina-tarefas">
      <div class="tarefas-topo">
        <p class="texto-suave">${canal ? `Tarefas de ${canal.tipo === 'grupo' ? 'grupo' : 'canal'} "${h(canal.nome)}".` : 'Tarefas de todas as turmas que leciona.'}</p>
        <a class="botao" href="/tarefas/nova${canalId ? `?canal=${canalId}` : ''}">${icone('nova')}<span>Nova tarefa</span></a>
      </div>
      ${porAvaliar.length ? seccaoTarefas(req, 'Com trabalhos por avaliar', porAvaliar, '') : ''}
      ${seccaoTarefas(req, porAvaliar.length ? 'Outras tarefas' : 'Tarefas', restantes, lista.length ? 'Não há mais tarefas.' : 'Ainda não criou nenhuma tarefa. Use "Nova tarefa".')}
    </div>`;
  } else {
    const comEstado = lista.map((t) => ({ ...t, estado: estadoEntrega(t, t) }));
    const porEntregar = comEstado.filter((t) => ['atribuida', 'atraso'].includes(t.estado.chave));
    const entregues = comEstado.filter((t) => t.estado.chave === 'entregue');
    const devolvidas = comEstado.filter((t) => t.estado.chave === 'devolvida');
    conteudo = `<div class="pagina-tarefas">
      ${canal ? `<p class="texto-suave">Tarefas de "${h(canal.nome)}".</p>` : ''}
      ${seccaoTarefas(req, 'Por entregar', porEntregar, 'Não tem tarefas por entregar.')}
      ${seccaoTarefas(req, 'Entregues', entregues, 'Ainda não entregou nenhuma tarefa.')}
      ${seccaoTarefas(req, 'Devolvidas (avaliadas)', devolvidas, 'Ainda não tem tarefas devolvidas.')}
    </div>`;
  }
  res.html(
    pagina(
      req,
      {
        secaoAtiva: 'tarefas',
        lista: await listaLateral(req, canalId),
        titulo: canal ? canal.nome : 'Tarefas',
        subtitulo: canal ? canal.turma : '',
        canalAtivoId: canal ? canal.id : null,
        separadores: canal
          ? [
              ['Publicações', `/turma/${canal.turma_id}/canal/${canal.id}`, false],
              ['Tarefas', '', true],
            ]
          : null,
      },
      conteudo
    )
  );
});

// ---------- Nova tarefa (professor) ----------
get('/tarefas/nova', async (req, res) => {
  if (!req.professor) return res.redirecionar('/tarefas');
  const canalEscolhido = Number(req.query.canal) || 0;
  const arvore = await arvoreDoUtilizador(req);
  const opcoes = arvore
    .filter((g) => g.canais.length)
    .map(
      ({ turma, canais }) => `<optgroup label="${h(turma.nome)}">${canais
        .map((c) => `<option value="${c.id}"${c.id === canalEscolhido ? ' selected' : ''}>${c.tipo === 'grupo' ? 'Grupo: ' : '# '}${h(c.nome)}</option>`)
        .join('')}</optgroup>`
    )
    .join('');
  const conteudo = opcoes
    ? `<form class="form-tarefa" method="post" action="/tarefas">
        <label>Canal ou grupo <small class="texto-suave">(a tarefa fica atribuída a todos os alunos que lá estão)</small>
          <select name="canal_id" required>${canalEscolhido ? '' : '<option value="">Escolha…</option>'}${opcoes}</select></label>
        <label>Título <input name="titulo" maxlength="150" required placeholder="Ex.: Ficha 3 — Funções"></label>
        <label>Instruções <textarea name="instrucoes" rows="6" maxlength="5000" placeholder="O que os alunos têm de fazer…"></textarea></label>
        ${campoFicheiro('Ficheiro para os alunos (enunciado)')}
        <div class="linha-campos">
          <label>Data limite <input type="date" name="data"></label>
          <label>Hora <input type="time" name="hora" value="23:59"></label>
          <label>Pontos <small class="texto-suave">(nota máxima)</small> <input type="number" name="pontos" min="1" max="1000" placeholder="Ex.: 20"></label>
        </div>
        <p class="texto-suave pequeno">Sem data limite, a tarefa nunca fica "em atraso". Sem pontos, devolve-se só com comentário.</p>
        <div class="linha-botoes">
          <button class="botao">Atribuir tarefa</button>
          <a class="botao botao-secundario" href="/tarefas${canalEscolhido ? `?canal=${canalEscolhido}` : ''}">Cancelar</a>
        </div>
      </form>`
    : vazio('Primeiro crie um canal ou grupo numa das suas turmas (em Equipas).');
  res.html(pagina(req, { secaoAtiva: 'tarefas', lista: await listaLateral(req, canalEscolhido || null), titulo: 'Nova tarefa' }, `<div class="pagina-tarefas">${conteudo}</div>`));
});

post('/tarefas', async (req, res) => {
  if (!req.professor) return res.redirecionar('/tarefas');
  const canal = await canalAcessivel(req, req.corpo.canal_id);
  const voltar = `/tarefas/nova${canal ? `?canal=${canal.id}` : ''}`;
  const titulo = String(req.corpo.titulo || '').trim().slice(0, 150);
  const instrucoes = String(req.corpo.instrucoes || '').trim().slice(0, 5000);
  const data = String(req.corpo.data || '').trim();
  const hora = String(req.corpo.hora || '').trim() || '23:59';
  const pontos = req.corpo.pontos === undefined || req.corpo.pontos === '' ? null : Number(req.corpo.pontos);
  let erro = '';
  if (!canal) erro = 'Escolha o canal ou grupo.';
  else if (!titulo) erro = 'Escreva o título da tarefa.';
  else if (data && (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora) || Number.isNaN(Date.parse(`${data}T${hora}`)))) erro = 'A data limite não é válida.';
  else if (pontos !== null && (!Number.isInteger(pontos) || pontos < 1 || pontos > 1000)) erro = 'Os pontos têm de ser um número inteiro entre 1 e 1000.';
  if (erro) {
    req.flash('erro', erro);
    return res.redirecionar(voltar);
  }
  let anexo = null;
  try {
    anexo = guardarFicheiroTarefa(req.corpo.ficheiro_dados, req.corpo.ficheiro_nome, 'enunciado');
  } catch (e) {
    req.flash('erro', e.message);
    return res.redirecionar(voltar);
  }
  const dataLimite = data ? `${data} ${hora}:00` : null;
  const r = await executar(
    `INSERT INTO tarefas (canal_id, professor_id, titulo, instrucoes, ficheiro, ficheiro_nome, data_limite, pontos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    canal.id,
    req.professor.id,
    titulo,
    instrucoes || null,
    anexo?.ficheiro || null,
    anexo?.ficheiro_nome || null,
    dataLimite,
    pontos
  );
  // Aviso no canal (como no Teams), para os alunos verem logo nas publicações
  await executar(
    'INSERT INTO canal_mensagens (canal_id, utilizador_id, texto) VALUES (?, ?, ?)',
    canal.id,
    req.utilizador.id,
    `📋 Nova tarefa: ${titulo}${dataLimite ? ` — entrega até ${dataLegivel(dataLimite)}` : ''}. Veja e entregue em "Tarefas".`
  );
  req.flash('sucesso', `Tarefa "${titulo}" atribuída em "${canal.nome}".`);
  res.redirecionar(`/tarefas/${r.lastInsertRowid}`);
});

// ---------- Ver uma tarefa ----------
function cabecalhoTarefa(tarefa) {
  return `<section class="cartao-detalhe">
    <div class="detalhe-linha">
      ${tarefa.data_limite ? `<span><strong>Entrega até</strong> ${h(dataLegivel(tarefa.data_limite))}</span>` : '<span>Sem data limite</span>'}
      <span><strong>Pontos</strong> ${tarefa.pontos ? tarefa.pontos : 'sem nota'}</span>
      <span><strong>Criada por</strong> ${h(tarefa.professor || '—')}</span>
    </div>
    ${tarefa.instrucoes ? `<h2>Instruções</h2><p class="texto-livre">${h(tarefa.instrucoes)}</p>` : '<p class="texto-suave">Sem instruções.</p>'}
    ${tarefa.ficheiro ? `<h2>Ficheiro</h2>${ligacaoFicheiro(`/tarefas/${tarefa.id}/ficheiro`, tarefa.ficheiro_nome)}` : ''}
  </section>`;
}

function paginaTarefa(req, res, { tarefa, canal }, conteudo) {
  res.html(
    pagina(
      req,
      {
        secaoAtiva: 'tarefas',
        lista: req.listaTarefas || '',
        titulo: tarefa.titulo,
        subtitulo: `${canal.tipo === 'grupo' ? 'Grupo' : '#'} ${tarefa.canal} · ${tarefa.turma}`,
      },
      `<div class="pagina-tarefas">
        <a class="voltar" href="/tarefas?canal=${canal.id}">${icone('voltar')}<span>Tarefas de ${h(tarefa.canal)}</span></a>
        ${conteudo}
      </div>`
    )
  );
}

get('/tarefas/:id', async (req, res) => {
  const acesso = await tarefaAcessivel(req, req.params.id);
  if (!acesso) return res.redirecionar('/tarefas');
  const { tarefa, canal } = acesso;
  req.listaTarefas = await listaLateral(req, canal.id);

  if (req.professor) {
    // Alunos do canal/grupo e quem já tiver entregue (mesmo que entretanto tenha saído)
    const alunos = await todos(
      `SELECT e.*, a.id AS aluno_id, a.nome, a.numero_processo
         FROM alunos a LEFT JOIN tarefa_entregas e ON e.tarefa_id = ? AND e.aluno_id = a.id
        WHERE a.id IN (SELECT aluno_id FROM canal_membros WHERE canal_id = ?)
           OR a.id IN (SELECT aluno_id FROM tarefa_entregas WHERE tarefa_id = ?)
        ORDER BY (e.entregue_em IS NOT NULL AND e.devolvida_em IS NULL) DESC, a.nome`,
      tarefa.id,
      canal.id,
      tarefa.id
    );
    const entregues = alunos.filter((a) => a.entregue_em).length;
    const linhas = alunos
      .map((a) => {
        const estado = estadoEntrega(tarefa, a);
        return `<article class="entrega${estado.chave === 'entregue' ? ' por-avaliar' : ''}">
          <header class="entrega-topo">
            ${avatarHtml(a.nome, 'avatar')}
            <span class="entrega-nome"><strong>${h(a.nome)}</strong><small class="texto-suave">Proc. ${h(a.numero_processo)}${a.entregue_em ? ` · entregue ${h(dataLegivel(a.entregue_em))}` : ''}</small></span>
            ${etiquetaEstado(estado)}
            ${a.devolvida_em && a.nota !== null && tarefa.pontos ? `<span class="tarefa-nota">${numero(a.nota)}/${tarefa.pontos}</span>` : ''}
          </header>
          ${a.texto ? `<p class="texto-livre entrega-texto">${h(a.texto)}</p>` : ''}
          ${a.ficheiro ? ligacaoFicheiro(`/tarefas/${tarefa.id}/entregas/${a.aluno_id}/ficheiro`, a.ficheiro_nome) : ''}
          <details class="entrega-avaliar"${estado.chave === 'entregue' ? ' open' : ''}>
            <summary>${a.devolvida_em ? 'Alterar avaliação' : 'Avaliar e devolver'}</summary>
            <form method="post" action="/tarefas/${tarefa.id}/devolver/${a.aluno_id}" class="form-avaliar">
              ${tarefa.pontos ? `<label>Nota <span class="nota-campo"><input type="number" name="nota" min="0" max="${tarefa.pontos}" step="0.1" value="${h(numero(a.nota).replace(',', '.'))}"> / ${tarefa.pontos}</span></label>` : ''}
              <label>Comentário <textarea name="comentario" rows="2" maxlength="1000" placeholder="Opcional">${h(a.comentario || '')}</textarea></label>
              <button class="botao">${a.devolvida_em ? 'Guardar e devolver' : 'Devolver'}</button>
            </form>
          </details>
        </article>`;
      })
      .join('');
    return paginaTarefa(
      req,
      res,
      acesso,
      `${cabecalhoTarefa(tarefa)}
      <section class="cartao-detalhe">
        <div class="detalhe-titulo">
          <h2>Trabalhos dos alunos <span class="contagem">${entregues}/${alunos.length} entregues</span></h2>
          <form method="post" action="/tarefas/${tarefa.id}/apagar" data-confirmar="Apagar a tarefa &quot;${h(tarefa.titulo)}&quot; e todos os trabalhos entregues? Não se pode desfazer.">
            <button class="botao-texto perigo">Apagar tarefa</button></form>
        </div>
        ${alunos.length ? `<div class="lista-entregas">${linhas}</div>` : vazio('Ainda não há alunos neste canal/grupo.')}
      </section>`
    );
  }

  // Aluno
  const entrega = await um('SELECT * FROM tarefa_entregas WHERE tarefa_id = ? AND aluno_id = ?', tarefa.id, req.aluno.id);
  const estado = estadoEntrega(tarefa, entrega);
  let trabalho;
  if (entrega?.devolvida_em) {
    trabalho = `<div class="avaliacao">
        ${tarefa.pontos && entrega.nota !== null ? `<p class="avaliacao-nota"><span>Nota</span><strong>${numero(entrega.nota)}</strong><small>/ ${tarefa.pontos}</small></p>` : ''}
        ${entrega.comentario ? `<p><strong>Comentário do professor</strong></p><p class="texto-livre">${h(entrega.comentario)}</p>` : ''}
        <p class="texto-suave pequeno">Devolvida ${h(dataLegivel(entrega.devolvida_em))}.</p>
      </div>
      ${entrega.texto ? `<h3>A sua resposta</h3><p class="texto-livre">${h(entrega.texto)}</p>` : ''}
      ${entrega.ficheiro ? ligacaoFicheiro(`/tarefas/${tarefa.id}/entregas/${req.aluno.id}/ficheiro`, entrega.ficheiro_nome) : ''}`;
  } else {
    const entregue = Boolean(entrega?.entregue_em);
    trabalho = `${entregue ? `<p class="aviso-entregue">Entregue ${h(dataLegivel(entrega.entregue_em))}. Pode alterar e entregar outra vez até o professor devolver.</p>` : ''}
      <form method="post" action="/tarefas/${tarefa.id}/entregar" class="form-tarefa">
        <label>A sua resposta <textarea name="texto" rows="5" maxlength="10000" placeholder="Escreva aqui (opcional se juntar um ficheiro)">${h(entrega?.texto || '')}</textarea></label>
        ${entrega?.ficheiro ? `<p class="anexo-atual">Ficheiro entregue: ${ligacaoFicheiro(`/tarefas/${tarefa.id}/entregas/${req.aluno.id}/ficheiro`, entrega.ficheiro_nome)}</p>` : ''}
        ${campoFicheiro(entrega?.ficheiro ? 'Trocar o ficheiro' : 'Juntar um ficheiro', entrega?.ficheiro)}
        <div class="linha-botoes">
          <button class="botao">${entregue ? 'Entregar outra vez' : 'Entregar'}</button>
        </div>
      </form>
      ${entregue ? `<form method="post" action="/tarefas/${tarefa.id}/anular" data-confirmar="Anular a entrega? O professor deixa de a ver como entregue até a entregar outra vez."><button class="botao-texto">Anular entrega</button></form>` : ''}`;
  }
  paginaTarefa(
    req,
    res,
    acesso,
    `${cabecalhoTarefa(tarefa)}
    <section class="cartao-detalhe">
      <div class="detalhe-titulo"><h2>O seu trabalho</h2>${etiquetaEstado(estado)}</div>
      ${trabalho}
    </section>`
  );
});

// ---------- Aluno: entregar / anular ----------
post('/tarefas/:id/entregar', async (req, res) => {
  const acesso = await tarefaAcessivel(req, req.params.id);
  if (!acesso || !req.aluno) return res.redirecionar('/tarefas');
  const { tarefa } = acesso;
  const voltar = `/tarefas/${tarefa.id}`;
  const atual = await um('SELECT * FROM tarefa_entregas WHERE tarefa_id = ? AND aluno_id = ?', tarefa.id, req.aluno.id);
  if (atual?.devolvida_em) {
    req.flash('erro', 'Esta tarefa já foi devolvida pelo professor: não pode ser alterada.');
    return res.redirecionar(voltar);
  }
  const texto = String(req.corpo.texto || '').trim().slice(0, 10000);
  let anexo = null;
  try {
    anexo = guardarFicheiroTarefa(req.corpo.ficheiro_dados, req.corpo.ficheiro_nome, 'entrega');
  } catch (e) {
    req.flash('erro', e.message);
    return res.redirecionar(voltar);
  }
  if (!texto && !anexo && !atual?.ficheiro) {
    req.flash('erro', 'Escreva a resposta ou junte um ficheiro antes de entregar.');
    return res.redirecionar(voltar);
  }
  await executar(
    `INSERT INTO tarefa_entregas (tarefa_id, aluno_id, texto, ficheiro, ficheiro_nome, entregue_em) VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE texto = VALUES(texto), ficheiro = COALESCE(VALUES(ficheiro), ficheiro),
       ficheiro_nome = COALESCE(VALUES(ficheiro_nome), ficheiro_nome), entregue_em = NOW()`,
    tarefa.id,
    req.aluno.id,
    texto || null,
    anexo?.ficheiro || null,
    anexo?.ficheiro_nome || null
  );
  if (anexo && atual?.ficheiro) apagarFicheiroTarefa(atual.ficheiro);
  req.flash('sucesso', 'Tarefa entregue.');
  res.redirecionar(voltar);
});

post('/tarefas/:id/anular', async (req, res) => {
  const acesso = await tarefaAcessivel(req, req.params.id);
  if (!acesso || !req.aluno) return res.redirecionar('/tarefas');
  await executar('UPDATE tarefa_entregas SET entregue_em = NULL WHERE tarefa_id = ? AND aluno_id = ? AND devolvida_em IS NULL', acesso.tarefa.id, req.aluno.id);
  req.flash('sucesso', 'Entrega anulada. Pode alterar e entregar outra vez.');
  res.redirecionar(`/tarefas/${acesso.tarefa.id}`);
});

// ---------- Professor: devolver com nota / apagar ----------
post('/tarefas/:id/devolver/:alunoId', async (req, res) => {
  const acesso = await tarefaAcessivel(req, req.params.id);
  if (!acesso || !req.professor) return res.redirecionar('/tarefas');
  const { tarefa, canal } = acesso;
  const voltar = `/tarefas/${tarefa.id}`;
  const aluno = await um(
    `SELECT a.id, a.nome FROM alunos a
      WHERE a.id = ? AND (a.id IN (SELECT aluno_id FROM canal_membros WHERE canal_id = ?) OR a.id IN (SELECT aluno_id FROM tarefa_entregas WHERE tarefa_id = ?))`,
    Number(req.params.alunoId) || 0,
    canal.id,
    tarefa.id
  );
  if (!aluno) return res.redirecionar(voltar);
  let nota = null;
  const textoNota = String(req.corpo.nota ?? '').trim().replace(',', '.');
  if (tarefa.pontos && textoNota !== '') {
    nota = Number(textoNota);
    if (!Number.isFinite(nota) || nota < 0 || nota > tarefa.pontos) {
      req.flash('erro', `A nota de ${aluno.nome} tem de estar entre 0 e ${tarefa.pontos}.`);
      return res.redirecionar(voltar);
    }
    nota = Math.round(nota * 10) / 10;
  }
  const comentario = String(req.corpo.comentario || '').trim().slice(0, 1000);
  await executar(
    `INSERT INTO tarefa_entregas (tarefa_id, aluno_id, nota, comentario, devolvida_em) VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE nota = VALUES(nota), comentario = VALUES(comentario), devolvida_em = NOW()`,
    tarefa.id,
    aluno.id,
    nota,
    comentario || null
  );
  req.flash('sucesso', `Tarefa devolvida a ${aluno.nome}.`);
  res.redirecionar(voltar);
});

post('/tarefas/:id/apagar', async (req, res) => {
  const acesso = await tarefaAcessivel(req, req.params.id);
  if (!acesso || !req.professor) return res.redirecionar('/tarefas');
  const { tarefa, canal } = acesso;
  const ficheiros = await todos('SELECT ficheiro FROM tarefa_entregas WHERE tarefa_id = ? AND ficheiro IS NOT NULL', tarefa.id);
  await executar('DELETE FROM tarefas WHERE id = ?', tarefa.id);
  [tarefa.ficheiro, ...ficheiros.map((l) => l.ficheiro)].forEach(apagarFicheiroTarefa);
  req.flash('sucesso', `Tarefa "${tarefa.titulo}" apagada.`);
  res.redirecionar(`/tarefas?canal=${canal.id}`);
});

// ---------- Ficheiros (sempre descarregados, nunca abertos como página) ----------
get('/tarefas/:id/ficheiro', async (req, res) => {
  const acesso = await tarefaAcessivel(req, req.params.id);
  if (!acesso?.tarefa.ficheiro || !enviarFicheiroTarefa(res, acesso.tarefa.ficheiro, acesso.tarefa.ficheiro_nome)) {
    return res.redirecionar('/tarefas');
  }
});

get('/tarefas/:id/entregas/:alunoId/ficheiro', async (req, res) => {
  const acesso = await tarefaAcessivel(req, req.params.id);
  const alunoId = Number(req.params.alunoId) || 0;
  // O aluno só descarrega o seu próprio trabalho; o professor (que leciona a turma), o de qualquer aluno
  if (!acesso || (req.aluno && req.aluno.id !== alunoId)) return res.redirecionar('/tarefas');
  const entrega = await um('SELECT ficheiro, ficheiro_nome FROM tarefa_entregas WHERE tarefa_id = ? AND aluno_id = ?', acesso.tarefa.id, alunoId);
  if (!entrega?.ficheiro || !enviarFicheiroTarefa(res, entrega.ficheiro, entrega.ficheiro_nome)) return res.redirecionar(`/tarefas/${acesso.tarefa.id}`);
});

module.exports = { contarPorEntregar };
