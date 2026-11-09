// Painel do Encarregado de Educação: acompanha as faltas do(s) educando(s) e envia justificativos
// (PDF ou imagem), que o diretor de turma ou a administração depois aceita ou recusa.
const { get, post } = require('../lib/servidor');
const { todos, transacao } = require('../db');
const { pagina, vazio, avatar, botaoImprimir } = require('../vistas/layout');
const { faltasDoAluno, etiquetaFalta } = require('./aluno');
const {
  guardarFicheiroJustificativo,
  apagarFicheiroJustificativo,
  listarJustificativos,
  listaJustificativos,
} = require('../lib/justificativos');
const { h, formatarData, formatarDataLonga, comoLista, TIPOS_FALTA, LIMITE_FALTAS, aulasDadas } = require('../lib/util');

const MOTIVOS_SUGERIDOS = ['Doença', 'Consulta médica', 'Motivo familiar', 'Falecimento de familiar', 'Transporte'];

// ---------- Consultas ----------
// Os educandos deste encarregado, com o resumo das faltas de cada um.
// "pendentes" = faltas ainda por justificar que já têm um justificativo à espera de validação.
function educandosDoEncarregado(encarregadoId) {
  return todos(
    `SELECT a.*, t.nome AS turma, t.curso, t.ano_letivo, p.nome AS diretor, p.email AS diretor_email,
            (SELECT COUNT(*) FROM licoes l JOIN horario hr ON hr.id = l.horario_id WHERE hr.turma_id = a.turma_id) AS aulas,
            (SELECT COUNT(*) FROM faltas f WHERE f.aluno_id = a.id AND f.tipo = 'presenca') AS faltas_presenca,
            (SELECT COUNT(*) FROM faltas f WHERE f.aluno_id = a.id) AS total_faltas,
            (SELECT COUNT(*) FROM faltas f WHERE f.aluno_id = a.id AND f.justificada = 0) AS injustificadas,
            (SELECT COUNT(DISTINCT jf.falta_id) FROM justificativo_faltas jf
               JOIN justificativos j ON j.id = jf.justificativo_id
               JOIN faltas f ON f.id = jf.falta_id
              WHERE j.aluno_id = a.id AND j.estado = 'pendente' AND f.justificada = 0) AS pendentes
       FROM alunos a
       LEFT JOIN turmas t ON t.id = a.turma_id
       LEFT JOIN professores p ON p.id = t.diretor_id
      WHERE a.encarregado_id = ?
      ORDER BY a.nome`,
    encarregadoId
  );
}

function semEducandos(req, res, titulo, ativo) {
  res.html(
    pagina(req, { titulo, ativo }, vazio('A sua conta ainda não está associada a nenhum aluno. Contacte a secretaria da escola.'))
  );
}

// Escolhe o educando pedido no endereço (?aluno=), ou o primeiro. Só entre os deste encarregado:
// pedir o id de outro aluno devolve simplesmente o primeiro educando.
function escolherEducando(educandos, pedido) {
  return educandos.find((e) => String(e.id) === String(pedido)) || educandos[0];
}

function separadoresEducandos(educandos, atual, base) {
  if (educandos.length < 2) return '';
  return `<nav class="separadores" aria-label="Educandos">${educandos
    .map((e) => `<a href="${base}?aluno=${e.id}" class="${e.id === atual.id ? 'ativo' : ''}">${h(e.nome)}</a>`)
    .join('')}</nav>`;
}

// ---------- Painel ----------
get('/encarregado', async (req, res) => {
  const educandos = req.encarregado ? await educandosDoEncarregado(req.encarregado.id) : [];
  if (!educandos.length) return semEducandos(req, res, 'Painel', 'inicio');

  const turmas = [...new Set(educandos.map((e) => e.turma_id).filter(Boolean))];
  const avisos = await todos(
    `SELECT av.*, t.nome AS turma FROM avisos av LEFT JOIN turmas t ON t.id = av.turma_id
      WHERE av.turma_id IS NULL OR av.turma_id IN (?) ORDER BY av.publicado_em DESC, av.id DESC LIMIT 10`,
    turmas.length ? turmas : [0]
  );
  const pct = (x) => String(x).replace('.', ',');

  const cartoes = educandos
    .map((e) => {
      const base = aulasDadas(e.aulas, e.faltas_presenca);
      const assiduidade = base ? Math.round((1 - e.faltas_presenca / base) * 1000) / 10 : null;
      const abaixo = assiduidade !== null && assiduidade < (1 - LIMITE_FALTAS) * 100;
      const porEnviar = e.injustificadas - e.pendentes;
      return `<section class="cartao">
        <div class="cartao-topo">
          <span class="aluno-linha">${avatar(e, 'pequeno')}<span><strong>${h(e.nome)}</strong>
            <small>${h(e.turma || 'Sem turma')}${e.curso ? ` · ${h(e.curso)}` : ''} · n.º ${h(e.numero_processo)}</small></span></span>
          <a class="botao botao-secundario" href="/encarregado/faltas?aluno=${e.id}">Ver faltas</a>
        </div>
        <div class="estatisticas">
          <div class="estatistica${abaixo ? ' destaque-aviso' : ''}"><span>Assiduidade</span><strong>${assiduidade === null ? '—' : `${pct(assiduidade)}%`}</strong></div>
          <div class="estatistica"><span>Faltas no total</span><strong>${e.total_faltas}</strong></div>
          <a class="estatistica${porEnviar ? ' destaque-aviso' : ''}" href="/encarregado/faltas?aluno=${e.id}"><span>Por justificar</span><strong>${porEnviar}</strong></a>
          <a class="estatistica" href="/encarregado/justificativos"><span>À espera de validação</span><strong>${e.pendentes}</strong></a>
        </div>
        <p class="legenda">Diretor(a) de turma: ${h(e.diretor || '—')}${e.diretor_email ? ` · <a href="mailto:${h(e.diretor_email)}">${h(e.diretor_email)}</a>` : ''}.
          ${abaixo ? `A assiduidade está abaixo de ${(1 - LIMITE_FALTAS) * 100}%: fale com o diretor de turma.` : ''}</p>
      </section>`;
    })
    .join('');

  const conteudo = `
    ${cartoes}
    <section class="cartao">
      <h2>Avisos da escola</h2>
      ${
        avisos.length
          ? `<ul class="lista-avisos">${avisos
              .map(
                (a) => `<li>
                  <p class="aviso-data">${h(formatarData(a.publicado_em))}${a.turma ? ` · <span class="etiqueta">${h(a.turma)}</span>` : ''}</p>
                  <h3>${h(a.titulo)}</h3>
                  <p class="aviso-texto">${h(a.texto)}</p>
                </li>`
              )
              .join('')}</ul>`
          : vazio('Não há avisos publicados.')
      }
    </section>`;

  res.html(pagina(req, { titulo: 'Painel', ativo: 'inicio', subtitulo: 'Acompanhamento do seu educando' }, conteudo));
});

// ---------- Faltas do educando e envio do justificativo ----------
get('/encarregado/faltas', async (req, res) => {
  const educandos = req.encarregado ? await educandosDoEncarregado(req.encarregado.id) : [];
  if (!educandos.length) return semEducandos(req, res, 'Faltas', 'faltas');
  const educando = escolherEducando(educandos, req.query.aluno);
  const faltas = await faltasDoAluno(educando.id);
  const podeJustificar = (f) => !f.justificada && !f.pendente;
  const haPorJustificar = faltas.some(podeJustificar);

  const linhas = faltas
    .map(
      (f) => `<tr>
        <td class="centro">${podeJustificar(f) ? `<input type="checkbox" name="ids" value="${f.id}" aria-label="Selecionar falta" data-selecionar>` : ''}</td>
        <td>${h(formatarDataLonga(f.data))}</td>
        <td>${h(f.hora_inicio)}–${h(f.hora_fim)}</td>
        <td>${h(f.disciplina)}</td>
        <td>${h(TIPOS_FALTA[f.tipo])}</td>
        <td>${etiquetaFalta(f)}${f.justificada && f.justificacao ? `<small class="bloco texto-suave">${h(f.justificacao)}</small>` : ''}</td>
      </tr>`
    )
    .join('');

  const conteudo = `
    ${separadoresEducandos(educandos, educando, '/encarregado/faltas')}
    <form method="post" action="/encarregado/justificativos" class="cartao" data-formulario-justificativo>
      <input type="hidden" name="aluno_id" value="${educando.id}">
      <div class="cartao-topo"><h2>Faltas de ${h(educando.nome)}</h2><span class="contador">${faltas.length} falta(s)</span></div>
      ${
        faltas.length
          ? `<div class="tabela-scroll"><table class="tabela">
              <thead><tr>
                <th class="centro">${haPorJustificar ? '<input type="checkbox" aria-label="Selecionar todas" data-selecionar-todos>' : ''}</th>
                <th>Data</th><th>Tempo</th><th>Disciplina</th><th>Tipo</th><th>Estado</th>
              </tr></thead>
              <tbody>${linhas}</tbody>
            </table></div>`
          : vazio('Não há faltas registadas.')
      }
      ${
        haPorJustificar
          ? `<div class="barra-justificar no-imprimir">
              <datalist id="motivos">${MOTIVOS_SUGERIDOS.map((m) => `<option value="${h(m)}">`).join('')}</datalist>
              <label class="crescer">Motivo da falta
                <input name="motivo" list="motivos" maxlength="200" placeholder="Ex.: Doença" required></label>
              <label>Justificativo <small class="texto-suave">(PDF, JPG ou PNG, máx. 3 MB)</small>
                <input type="file" accept="application/pdf,image/jpeg,image/png" data-ficheiro-justificativo required></label>
              <input type="hidden" name="ficheiro_dados" data-dados-justificativo>
              <button class="botao">Enviar justificativo</button>
            </div>
            <p class="legenda">Selecione as faltas a que o documento diz respeito, indique o motivo e anexe o justificativo
              (por exemplo, uma fotografia do atestado médico). O pedido fica pendente até ser validado pelo diretor de turma ou pela secretaria.</p>`
          : faltas.length
            ? '<p class="legenda">Não há faltas por justificar neste momento.</p>'
            : ''
      }
    </form>`;

  res.html(
    pagina(req, { titulo: 'Faltas', ativo: 'faltas', subtitulo: 'Consultar faltas e enviar justificativos', acoes: botaoImprimir() }, conteudo)
  );
});

post('/encarregado/justificativos', async (req, res) => {
  const educandos = req.encarregado ? await educandosDoEncarregado(req.encarregado.id) : [];
  // Só os educandos deste encarregado: o id vem do formulário, por isso tem de ser confirmado aqui
  const educando = educandos.find((e) => String(e.id) === String(req.corpo.aluno_id));
  if (!educando) {
    req.flash('erro', 'Aluno não encontrado.');
    return res.redirecionar('/encarregado/faltas');
  }
  const voltar = `/encarregado/faltas?aluno=${educando.id}`;
  const ids = [...new Set(comoLista(req.corpo.ids).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const motivo = String(req.corpo.motivo || '').trim().slice(0, 200);

  let erro = '';
  if (!ids.length) erro = 'Selecione pelo menos uma falta.';
  else if (!motivo) erro = 'Indique o motivo da falta.';
  else if (!req.corpo.ficheiro_dados) erro = 'Anexe o justificativo (PDF ou imagem).';
  if (erro) {
    req.flash('erro', erro);
    return res.redirecionar(voltar);
  }

  // As faltas têm de ser deste educando, estar por justificar e não ter já um pedido pendente
  const validas = (await faltasDoAluno(educando.id)).filter((f) => ids.includes(f.id) && !f.justificada && !f.pendente);
  if (validas.length !== ids.length) {
    req.flash('erro', 'Algumas das faltas escolhidas já foram justificadas ou já têm um justificativo à espera de validação.');
    return res.redirecionar(voltar);
  }

  let ficheiro;
  try {
    ficheiro = guardarFicheiroJustificativo(String(req.corpo.ficheiro_dados));
  } catch (e) {
    req.flash('erro', e.message);
    return res.redirecionar(voltar);
  }

  try {
    await transacao(async (tx) => {
      const j = await tx.executar(
        'INSERT INTO justificativos (aluno_id, enviado_por, motivo, ficheiro) VALUES (?, ?, ?, ?)',
        educando.id,
        req.utilizador.id,
        motivo,
        ficheiro
      );
      for (const id of ids) {
        await tx.executar('INSERT INTO justificativo_faltas (justificativo_id, falta_id) VALUES (?, ?)', j.lastInsertRowid, id);
      }
    });
  } catch (e) {
    apagarFicheiroJustificativo(ficheiro); // a BD não mudou: o ficheiro não pode ficar sem dono
    throw e;
  }

  req.flash('sucesso', `Justificativo enviado para ${ids.length} falta(s). Fica pendente até ser validado pela escola.`);
  res.redirecionar('/encarregado/justificativos');
});

// ---------- Histórico dos justificativos enviados ----------
get('/encarregado/justificativos', async (req, res) => {
  if (!req.encarregado) return semEducandos(req, res, 'Justificativos', 'justificativos');
  const justificativos = await listarJustificativos('a.encarregado_id = ?', req.encarregado.id);
  const conteudo = `<section class="cartao">
    ${listaJustificativos(justificativos, { mostrarAluno: false }, 'Ainda não enviou nenhum justificativo.')}
  </section>`;
  res.html(
    pagina(req, { titulo: 'Justificativos', ativo: 'justificativos', subtitulo: 'Pedidos enviados e a resposta da escola' }, conteudo)
  );
});
