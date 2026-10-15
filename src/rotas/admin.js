// Painel do Administrador: gestão de alunos e justificação de faltas
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { get, post } = require('../lib/servidor');
const { todos, um, executar, transacao, PASTA_FOTOS } = require('../db');
const { pagina, vazio, avatar, botaoImprimir } = require('../vistas/layout');
const { etiquetaFalta } = require('./aluno');
const { pautaDoAluno } = require('./avaliacao');
const { registarLog } = require('../lib/auditoria');
const {
  h,
  hoje,
  idade,
  gerarHash,
  dataValida,
  formatarData,
  formatarDataLonga,
  selecionado,
  comoLista,
  TIPOS_FALTA,
  LIMITE_FALTAS,
  emailInstitucionalValido,
  DOMINIO_EMAIL,
  gerarEmailAluno,
  gerarPasswordTemporaria,
} = require('../lib/util');

const MOTIVOS_SUGERIDOS = ['Doença', 'Consulta médica', 'Motivo familiar', 'Atividade escolar', 'Falecimento de familiar', 'Transporte'];

// ---------- Fotografias ----------
const ASSINATURAS = {
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b.subarray(0, 4).toString('hex') === '89504e47',
  webp: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
};

// Recebe a imagem em base64 (já redimensionada no browser) e grava-a em data/fotos
function guardarFotografia(alunoId, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error('Formato de imagem inválido (use JPG, PNG ou WEBP).');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > 2 * 1024 * 1024) throw new Error('A fotografia é demasiado grande (máx. 2 MB).');
  if (!ASSINATURAS[m[1]](bytes)) throw new Error('O ficheiro não é uma imagem válida.');
  const nome = `aluno-${alunoId}-${crypto.randomBytes(6).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(PASTA_FOTOS, nome), bytes);
  return nome;
}

function apagarFotografia(nome) {
  if (!nome) return;
  fs.rm(path.join(PASTA_FOTOS, path.basename(nome)), { force: true }, () => {});
}

// ---------- Validação do formulário de aluno ----------
// Ao criar (alunoId null) o email e a palavra-passe são gerados automaticamente (ver post('/admin/alunos/novo')),
// por isso não se leem nem validam aqui os campos "email"/"password" do formulário nesse caso.
async function lerFormularioAluno(corpo, alunoId = null) {
  const dados = {
    nome: String(corpo.nome || '').trim().replace(/\s+/g, ' '),
    numero_processo: String(corpo.numero_processo || '').trim(),
    data_nascimento: String(corpo.data_nascimento || '').trim(),
    contacto: String(corpo.contacto || '').trim(),
    encarregado_nome: String(corpo.encarregado_nome || '').trim().replace(/\s+/g, ' '),
    email: alunoId ? String(corpo.email || '').trim() : '',
    turma_id: corpo.turma_id ? Number(corpo.turma_id) : null,
    password: alunoId ? String(corpo.password || '') : '',
    fotografia_dados: String(corpo.fotografia_dados || ''),
    remover_fotografia: corpo.remover_fotografia === '1',
  };
  const erros = {};

  if (dados.nome.length < 3 || dados.nome.length > 120) erros.nome = 'Indique o nome completo (3 a 120 caracteres).';
  if (!/^[A-Za-z0-9-]{1,20}$/.test(dados.numero_processo)) {
    erros.numero_processo = 'Use apenas letras, números ou hífen (máx. 20).';
  } else {
    const repetido = await um(
      `SELECT 1 FROM alunos WHERE numero_processo = ? AND NOT (id <=> ?)`,
      dados.numero_processo,
      alunoId
    );
    const contaAluno = alunoId ? (await um('SELECT utilizador_id FROM alunos WHERE id = ?', alunoId))?.utilizador_id : null;
    const usernameOcupado = await um(
      'SELECT 1 FROM utilizadores WHERE username = ? AND NOT (id <=> ?)',
      dados.numero_processo,
      contaAluno ?? null
    );
    if (repetido || usernameOcupado) erros.numero_processo = 'Já existe um utilizador com este número.';
  }
  if (dados.data_nascimento && (!dataValida(dados.data_nascimento) || dados.data_nascimento >= hoje())) {
    erros.data_nascimento = 'Data de nascimento inválida.';
  }
  if (dados.contacto && !/^\+?[\d\s]{9,20}$/.test(dados.contacto)) erros.contacto = 'Contacto inválido (ex.: 912 345 678).';
  if (dados.encarregado_nome.length > 120) erros.encarregado_nome = 'Nome demasiado longo.';
  if (alunoId && dados.email && !emailInstitucionalValido(dados.email)) erros.email = `O email tem de acabar em @${DOMINIO_EMAIL}.`;
  if (dados.turma_id !== null && (!Number.isInteger(dados.turma_id) || !(await um('SELECT 1 FROM turmas WHERE id = ?', dados.turma_id)))) {
    erros.turma_id = 'Turma inválida.';
  }
  if (alunoId && dados.password && dados.password.length < 6) erros.password = 'A palavra-passe deve ter pelo menos 6 caracteres.';
  if (dados.fotografia_dados.length > 3 * 1024 * 1024) erros.fotografia = 'A fotografia é demasiado grande.';

  return { dados, erros };
}

async function formularioAluno(req, { aluno = {}, erros = {}, acao, titulo }) {
  const turmas = await todos('SELECT * FROM turmas ORDER BY nome');
  const erro = (campo) => (erros[campo] ? `<small class="erro-campo">${h(erros[campo])}</small>` : '');
  const cls = (campo) => (erros[campo] ? ' class="invalido"' : '');
  const editar = !!aluno.id;

  return `
    <p><a class="voltar" href="${editar ? `/admin/alunos/${aluno.id}` : '/admin/alunos'}">← Voltar</a></p>
    ${Object.keys(erros).length ? `<div class="alerta alerta-erro" role="alert">Corrija os campos assinalados.</div>` : ''}
    <form method="post" action="${acao}" class="cartao formulario formulario-aluno" data-formulario-foto>
      <div class="bloco-foto">
        <div class="pre-visualizacao" data-previsualizacao>
          ${aluno.fotografia && !aluno.remover_fotografia ? `<img src="/fotos/${h(aluno.fotografia)}" alt="">` : `<span>Sem fotografia</span>`}
        </div>
        <label class="botao botao-secundario">Escolher fotografia
          <input type="file" accept="image/jpeg,image/png,image/webp" data-ficheiro-foto hidden>
        </label>
        <input type="hidden" name="fotografia_dados" data-dados-foto>
        ${editar && aluno.fotografia ? `<label class="linha-check"><input type="checkbox" name="remover_fotografia" value="1" data-remover-foto> Remover fotografia</label>` : ''}
        <small class="texto-suave">JPG, PNG ou WEBP. É reduzida automaticamente.</small>
        ${erro('fotografia')}
      </div>

      <div class="grelha-form">
        <label class="coluna-toda">Nome completo *
          <input name="nome" value="${h(aluno.nome)}" required maxlength="120"${cls('nome')}>${erro('nome')}</label>
        <label>N.º de processo *
          <input name="numero_processo" value="${h(aluno.numero_processo)}" required maxlength="20"${cls('numero_processo')}>
          ${erro('numero_processo') || '<small class="texto-suave">Também é o nome de utilizador do aluno.</small>'}</label>
        <label>Turma
          <select name="turma_id"${cls('turma_id')}>
            <option value="">— Sem turma —</option>
            ${turmas.map((t) => `<option value="${t.id}"${selecionado(t.id, aluno.turma_id)}>${h(t.nome)} (${h(t.ano_letivo)})</option>`).join('')}
          </select>${erro('turma_id')}</label>
        <label>Data de nascimento
          <input type="date" name="data_nascimento" value="${h(aluno.data_nascimento)}" max="${hoje()}"${cls('data_nascimento')}>${erro('data_nascimento')}</label>
        <label>Contacto
          <input type="tel" name="contacto" value="${h(aluno.contacto)}" placeholder="912 345 678"${cls('contacto')}>${erro('contacto')}</label>
        <label class="coluna-toda">Nome da mãe / Encarregado de educação
          <input name="encarregado_nome" value="${h(aluno.encarregado_nome)}" maxlength="120"${cls('encarregado_nome')}>${erro('encarregado_nome')}</label>
        ${
          editar
            ? `<label>Email institucional
                <input type="email" name="email" value="${h(aluno.email)}" maxlength="120" placeholder="nome@${DOMINIO_EMAIL}"${cls('email')}>
                ${erro('email') || `<small class="texto-suave">Tem de acabar em @${DOMINIO_EMAIL}.</small>`}</label>
              <label class="coluna-toda">Nova palavra-passe
                <input type="password" name="password" autocomplete="new-password" minlength="6" placeholder="Deixe em branco para manter a atual"${cls('password')}>
                ${erro('password') || '<small class="texto-suave">Assim que entrar, o aluno tem de a substituir por uma escolhida por ele.</small>'}</label>`
            : `<div class="coluna-toda"><small class="texto-suave">O email institucional (@${DOMINIO_EMAIL}) e a palavra-passe de acesso
                são gerados automaticamente ao criar — vai vê-los no ecrã seguinte, para dar ao aluno.</small></div>`
        }
        <div class="coluna-toda barra-acoes"><button class="botao">${h(titulo)}</button></div>
      </div>
    </form>`;
}

// ---------- Painel ----------
// Taxa de assiduidade global e por curso, a partir das aulas já dadas ("licoes") e das faltas de presença.
// "Possíveis" = alunos da turma × lições dadas no horário dessa turma — a base de comparação das faltas.
async function estatisticasAssiduidade() {
  const porTurma = await todos(
    `SELECT t.curso,
            (SELECT COUNT(*) FROM alunos a WHERE a.turma_id = t.id) AS alunos,
            (SELECT COUNT(*) FROM licoes l JOIN horario hr ON hr.id = l.horario_id WHERE hr.turma_id = t.id) AS licoes,
            (SELECT COUNT(*) FROM faltas f JOIN horario hr ON hr.id = f.horario_id WHERE hr.turma_id = t.id AND f.tipo = 'presenca') AS faltas
       FROM turmas t`
  );
  const porCurso = new Map();
  let possiveisTotal = 0;
  let faltasTotal = 0;
  for (const t of porTurma) {
    const possiveis = t.alunos * t.licoes;
    // Turma sem alunos atuais (ex.: todos mudados de turma antes de a apagar) ou sem lições dadas:
    // sem base de comparação — contar as faltas antigas dela poluiria o total global (podia até ficar negativo)
    if (!possiveis) continue;
    possiveisTotal += possiveis;
    faltasTotal += t.faltas;
    const curso = t.curso || 'Sem curso definido';
    const atual = porCurso.get(curso) || { possiveis: 0, faltas: 0 };
    atual.possiveis += possiveis;
    atual.faltas += t.faltas;
    porCurso.set(curso, atual);
  }
  const taxa = (possiveis, faltas) =>
    possiveis ? Math.max(0, Math.min(100, Math.round((1 - faltas / possiveis) * 1000) / 10)) : null;
  const cursos = [...porCurso.entries()]
    .map(([nome, v]) => ({ nome, assiduidade: taxa(v.possiveis, v.faltas) }))
    .filter((c) => c.assiduidade !== null)
    .sort((a, b) => b.assiduidade - a.assiduidade);
  return { global: taxa(possiveisTotal, faltasTotal), cursos };
}

// Cor da barra/etiqueta conforme a mesma margem usada nos avisos ao diretor de turma
// (abaixo de 1-LIMITE: em risco; abaixo de 1-0,7×LIMITE: a aproximar-se; senão: ok)
function corAssiduidade(pct) {
  if (pct < (1 - LIMITE_FALTAS) * 100) return 'perigo';
  if (pct < (1 - LIMITE_FALTAS * 0.7) * 100) return 'aviso';
  return 'ok';
}

get('/admin', async (req, res) => {
  const n = async (sql) => (await um(sql)).n;
  const stats = {
    alunos: await n('SELECT COUNT(*) AS n FROM alunos'),
    turmas: await n('SELECT COUNT(*) AS n FROM turmas'),
    professores: await n('SELECT COUNT(*) AS n FROM professores'),
    funcionarios: await n('SELECT COUNT(*) AS n FROM funcionarios'),
    porJustificar: await n('SELECT COUNT(*) AS n FROM faltas WHERE justificada = 0'),
  };
  const porTurma = await todos(
    `SELECT t.id, t.nome, t.ano_letivo, COUNT(DISTINCT a.id) AS alunos,
            (SELECT COUNT(*) FROM faltas f JOIN alunos a2 ON a2.id = f.aluno_id WHERE a2.turma_id = t.id AND f.justificada = 0) AS injustificadas
       FROM turmas t LEFT JOIN alunos a ON a.turma_id = t.id
      GROUP BY t.id ORDER BY t.nome`
  );
  const recentes = await todos(
    `SELECT f.*, a.nome AS aluno, a.id AS aluno_id, t.nome AS turma, d.nome AS disciplina
       FROM faltas f JOIN alunos a ON a.id = f.aluno_id LEFT JOIN turmas t ON t.id = a.turma_id
       JOIN horario hr ON hr.id = f.horario_id JOIN disciplinas d ON d.id = hr.disciplina_id
      WHERE f.justificada = 0 ORDER BY f.data DESC, f.id DESC LIMIT 8`
  );
  const assiduidade = await estatisticasAssiduidade();
  // Dados para os gráficos (Chart.js, carregado localmente): nomes dos cursos escapados contra </script>
  const dadosGrafico = JSON.stringify(assiduidade).replace(/</g, '\\u003c');

  const conteudo = `
    <section class="estatisticas">
      <a class="estatistica" href="/admin/alunos"><span>Alunos</span><strong>${stats.alunos}</strong></a>
      <a class="estatistica" href="/admin/turmas"><span>Turmas</span><strong>${stats.turmas}</strong></a>
      <div class="estatistica"><span>Professores</span><strong>${stats.professores}</strong></div>
      <a class="estatistica" href="/admin/funcionarios"><span>Funcionários</span><strong>${stats.funcionarios}</strong></a>
      <a class="estatistica ${stats.porJustificar ? 'destaque-aviso' : ''}" href="/admin/faltas"><span>Faltas por justificar</span><strong>${stats.porJustificar}</strong></a>
    </section>
    <section class="cartao">
      <div class="cartao-topo"><h2>Assiduidade</h2><span class="texto-suave">Presenças nas aulas já dadas (lições registadas)</span></div>
      ${
        assiduidade.global === null
          ? vazio('Ainda não há lições dadas para calcular a assiduidade.')
          : `<div class="grelha-graficos">
              <div class="grafico-caixa">
                <canvas id="graficoAssiduidadeGlobal" height="180" role="img" aria-label="Assiduidade global: ${assiduidade.global}%"></canvas>
                <span class="grafico-numero">${assiduidade.global}%</span>
                <p class="texto-suave">Assiduidade global</p>
              </div>
              <div class="grafico-caixa">
                <canvas id="graficoAssiduidadePorCurso" height="180" role="img" aria-label="Assiduidade por curso"></canvas>
                ${
                  assiduidade.cursos.length
                    ? `<ul class="lista-assiduidade-cursos">${assiduidade.cursos
                        .map(
                          (c) => `<li><span>${h(c.nome)}</span><span class="etiqueta etiqueta-${corAssiduidade(c.assiduidade)}">${c.assiduidade}%</span></li>`
                        )
                        .join('')}</ul>`
                    : ''
                }
                <p class="texto-suave">Assiduidade por curso${assiduidade.cursos.length ? '' : ' — defina o curso das turmas para ver esta comparação'}</p>
              </div>
            </div>
            <script src="/static/vendor/chart.umd.min.js"></script>
            <script>
            (function () {
              var dados = ${dadosGrafico};
              function cor(nome) { return getComputedStyle(document.documentElement).getPropertyValue(nome).trim(); }
              function corPorTaxa(pct) {
                if (pct < ${(1 - LIMITE_FALTAS) * 100}) return cor('--perigo');
                if (pct < ${(1 - LIMITE_FALTAS * 0.7) * 100}) return cor('--aviso');
                return cor('--ok');
              }
              var graficos = [];
              function desenhar() {
                graficos.forEach(function (g) { g.destroy(); });
                graficos = [];
                var linha = cor('--linha');
                var tinta = cor('--tinta-suave');
                Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
                Chart.defaults.color = tinta;

                var elGlobal = document.getElementById('graficoAssiduidadeGlobal');
                if (elGlobal) {
                  graficos.push(new Chart(elGlobal, {
                    type: 'doughnut',
                    data: {
                      labels: ['Presenças', 'Faltas'],
                      datasets: [{ data: [dados.global, 100 - dados.global], backgroundColor: [corPorTaxa(dados.global), linha], borderWidth: 0 }],
                    },
                    options: { cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
                  }));
                }

                var elCursos = document.getElementById('graficoAssiduidadePorCurso');
                if (elCursos && dados.cursos.length) {
                  graficos.push(new Chart(elCursos, {
                    type: 'bar',
                    data: {
                      labels: dados.cursos.map(function (c) { return c.nome; }),
                      datasets: [{
                        label: 'Assiduidade (%)',
                        data: dados.cursos.map(function (c) { return c.assiduidade; }),
                        backgroundColor: dados.cursos.map(function (c) { return corPorTaxa(c.assiduidade); }),
                        borderRadius: 4,
                        maxBarThickness: 36,
                      }],
                    },
                    options: {
                      indexAxis: dados.cursos.length > 4 ? 'y' : 'x',
                      scales: {
                        x: { min: 0, max: 100, grid: { color: linha }, ticks: { color: tinta } },
                        y: { min: 0, max: 100, grid: { color: linha }, ticks: { color: tinta } },
                      },
                      plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return c.formattedValue + '% de assiduidade'; } } } },
                    },
                  }));
                }
              }
              desenhar();
              document.addEventListener('tema-alterado', desenhar);
            })();
            </script>`
      }
    </section>
    <div class="grelha-2">
      <section class="cartao">
        <div class="cartao-topo"><h2>Turmas</h2><a href="/admin/turmas">+ Nova turma</a></div>
        ${
          porTurma.length
            ? `<table class="tabela"><thead><tr><th>Turma</th><th class="direita">Alunos</th><th class="direita">Por justificar</th></tr></thead><tbody>${porTurma
                .map(
                  (t) => `<tr><td><a href="/admin/turmas/${t.id}">${h(t.nome)}</a> <small class="texto-suave">${h(t.ano_letivo)}</small></td>
                  <td class="direita">${t.alunos}</td>
                  <td class="direita">${t.injustificadas ? `<a href="/admin/faltas?turma=${t.id}">${t.injustificadas}</a>` : '0'}</td></tr>`
                )
                .join('')}</tbody></table>`
            : vazio('Sem turmas.')
        }
      </section>
      <section class="cartao">
        <div class="cartao-topo"><h2>Faltas recentes por justificar</h2><a href="/admin/faltas">Ver todas</a></div>
        ${
          recentes.length
            ? `<ul class="lista-simples">${recentes
                .map(
                  (f) => `<li><span class="hora">${h(formatarData(f.data))}</span>
                  <span><a href="/admin/faltas?aluno=${f.aluno_id}&estado=injustificadas"><strong>${h(f.aluno)}</strong></a>
                  <small>${h(f.turma || '')} · ${h(f.disciplina)} · ${h(TIPOS_FALTA[f.tipo])}</small></span></li>`
                )
                .join('')}</ul>`
            : vazio('Não há faltas por justificar.')
        }
      </section>
    </div>`;

  res.html(pagina(req, { titulo: 'Painel de administração', ativo: 'inicio' }, conteudo));
});

// ---------- Alunos ----------
get('/admin/alunos', async (req, res) => {
  const turmas = await todos('SELECT * FROM turmas ORDER BY nome');
  const turma = req.query.turma || '';
  const q = String(req.query.q || '').trim();
  const alunos = await todos(
    `SELECT a.*, t.nome AS turma,
            (SELECT COUNT(*) FROM faltas f WHERE f.aluno_id = a.id AND f.justificada = 0) AS injustificadas
       FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
      WHERE (? = '' OR a.turma_id = ? OR (? = 'sem' AND a.turma_id IS NULL))
        AND (? = '' OR a.nome LIKE ? OR a.numero_processo LIKE ? OR a.encarregado_nome LIKE ?)
      ORDER BY t.nome, a.nome`,
    turma,
    turma,
    turma,
    q,
    `%${q}%`,
    `%${q}%`,
    `%${q}%`
  );

  const conteudo = `
    <section class="cartao">
      <form class="filtros" method="get">
        <label>Turma
          <select name="turma" data-submeter>
            <option value="">Todas</option>
            ${turmas.map((t) => `<option value="${t.id}"${selecionado(t.id, turma)}>${h(t.nome)}</option>`).join('')}
            <option value="sem"${selecionado('sem', turma)}>Sem turma</option>
          </select></label>
        <label class="crescer">Pesquisar
          <input type="search" name="q" value="${h(q)}" placeholder="Nome, n.º de processo ou encarregado"></label>
        <button class="botao botao-secundario">Filtrar</button>
        <span class="contador">${alunos.length} aluno(s)</span>
      </form>
      ${
        alunos.length
          ? `<div class="tabela-scroll"><table class="tabela">
          <thead><tr><th>Aluno</th><th>Processo</th><th>Turma</th><th>Nascimento</th><th>Contacto</th><th>Encarregado</th><th class="direita">Faltas inj.</th><th></th></tr></thead>
          <tbody>${alunos
            .map(
              (a) => `<tr>
              <td><a class="aluno-linha" href="/admin/alunos/${a.id}">${avatar(a, 'pequeno')}<span>${h(a.nome)}</span></a></td>
              <td>${h(a.numero_processo)}</td>
              <td>${h(a.turma || '—')}</td>
              <td>${h(formatarData(a.data_nascimento))}</td>
              <td>${h(a.contacto || '—')}</td>
              <td>${h(a.encarregado_nome || '—')}</td>
              <td class="direita">${a.injustificadas ? `<a class="etiqueta etiqueta-aviso" href="/admin/faltas?aluno=${a.id}">${a.injustificadas}</a>` : '0'}</td>
              <td class="direita"><a class="botao-texto" href="/admin/alunos/${a.id}/editar">Editar</a></td>
            </tr>`
            )
            .join('')}</tbody></table></div>`
          : vazio('Nenhum aluno encontrado.')
      }
    </section>`;

  res.html(
    pagina(
      req,
      { titulo: 'Alunos', ativo: 'alunos', acoes: `<a class="botao" href="/admin/alunos/novo">+ Novo aluno</a>` },
      conteudo
    )
  );
});

get('/admin/alunos/novo', async (req, res) => {
  const aluno = { turma_id: req.query.turma || '' };
  res.html(pagina(req, { titulo: 'Novo aluno', ativo: 'alunos' }, await formularioAluno(req, { aluno, acao: '/admin/alunos/novo', titulo: 'Criar aluno' })));
});

post('/admin/alunos/novo', async (req, res) => {
  const { dados, erros } = await lerFormularioAluno(req.corpo);
  if (Object.keys(erros).length) {
    return res.html(
      pagina(req, { titulo: 'Novo aluno', ativo: 'alunos' }, await formularioAluno(req, { aluno: dados, erros, acao: '/admin/alunos/novo', titulo: 'Criar aluno' })),
      422
    );
  }

  const emailGerado = gerarEmailAluno(dados.nome, dados.numero_processo);
  const passwordGerada = gerarPasswordTemporaria();

  let alunoId;
  let avisoFoto = '';
  await transacao(async (tx) => {
    const u = await tx.executar(
      `INSERT INTO utilizadores (username, password_hash, papel, nome, deve_redefinir_password) VALUES (?, ?, 'aluno', ?, 1)`,
      dados.numero_processo,
      gerarHash(passwordGerada),
      dados.nome
    );
    alunoId = Number(
      (await tx.executar(
        `INSERT INTO alunos (utilizador_id, turma_id, numero_processo, nome, data_nascimento, contacto, encarregado_nome, email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        u.lastInsertRowid,
        dados.turma_id,
        dados.numero_processo,
        dados.nome,
        dados.data_nascimento || null,
        dados.contacto || null,
        dados.encarregado_nome || null,
        emailGerado
      )).lastInsertRowid
    );
  });

  if (dados.fotografia_dados) {
    let foto = null;
    try {
      foto = guardarFotografia(alunoId, dados.fotografia_dados);
    } catch (e) {
      avisoFoto = ` A fotografia não foi guardada: ${e.message}`;
    }
    if (foto) {
      try {
        await executar('UPDATE alunos SET fotografia = ? WHERE id = ?', foto, alunoId);
      } catch (e) {
        apagarFotografia(foto); // não deixar ficheiros sem dono em data/fotos
        throw e;
      }
    }
  }

  await registarLog(req, 'criar', 'aluno', alunoId, `Criou o aluno "${dados.nome}" (n.º processo ${dados.numero_processo}).`);
  req.flash(
    avisoFoto ? 'aviso' : 'sucesso',
    `Aluno ${dados.nome} criado. N.º de processo: ${dados.numero_processo} · Email: ${emailGerado} · Palavra-passe temporária: ${passwordGerada}` +
      ` (anote-a agora — não vai voltar a ser mostrada).${avisoFoto}`
  );
  res.redirecionar(`/admin/alunos/${alunoId}`);
});

function carregarAluno(id) {
  return um(`SELECT a.*, t.nome AS turma FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id WHERE a.id = ?`, id);
}

get('/admin/alunos/:id', async (req, res) => {
  const aluno = await carregarAluno(req.params.id);
  if (!aluno) return res.redirecionar('/admin/alunos');
  const faltas = await todos(
    `SELECT f.*, d.nome AS disciplina, hr.hora_inicio FROM faltas f
       JOIN horario hr ON hr.id = f.horario_id JOIN disciplinas d ON d.id = hr.disciplina_id
      WHERE f.aluno_id = ? ORDER BY f.data DESC, hr.hora_inicio DESC`,
    aluno.id
  );
  const injustificadas = faltas.filter((f) => !f.justificada).length;
  const anos = idade(aluno.data_nascimento);

  const conteudo = `
    <p><a class="voltar" href="/admin/alunos${aluno.turma_id ? `?turma=${aluno.turma_id}` : ''}">← Alunos</a></p>
    <div class="grelha-ficha">
      <section class="cartao ficha">
        ${avatar(aluno, 'grande')}
        <h2>${h(aluno.nome)}</h2>
        <dl class="dados">
          <dt>N.º de processo</dt><dd>${h(aluno.numero_processo)}</dd>
          <dt>Turma</dt><dd>${h(aluno.turma || '—')}</dd>
          <dt>Data de nascimento</dt><dd>${h(formatarData(aluno.data_nascimento))}${anos !== null ? ` (${anos} anos)` : ''}</dd>
          <dt>Contacto</dt><dd>${h(aluno.contacto || '—')}</dd>
          <dt>Mãe / Encarregado de educação</dt><dd>${h(aluno.encarregado_nome || '—')}</dd>
          <dt>Email institucional</dt><dd>${aluno.email ? `<a href="mailto:${h(aluno.email)}">${h(aluno.email)}</a>` : '—'}</dd>
          <dt>Conta de acesso</dt><dd>${aluno.utilizador_id ? 'Ativa' : 'Sem conta'}</dd>
        </dl>
        <div class="barra-acoes">
          <a class="botao" href="/admin/alunos/${aluno.id}/editar">Editar</a>
          <form method="post" action="/admin/alunos/${aluno.id}/apagar" data-confirmar="Apagar o aluno ${h(aluno.nome)}? Todas as faltas dele também serão apagadas.">
            <button class="botao botao-perigo">Apagar</button>
          </form>
        </div>
      </section>
      <section class="cartao">
        <div class="cartao-topo">
          <h2>Faltas</h2>
          ${injustificadas ? `<a class="botao botao-secundario" href="/admin/faltas?aluno=${aluno.id}&estado=injustificadas">Justificar (${injustificadas})</a>` : ''}
        </div>
        ${
          faltas.length
            ? `<div class="tabela-scroll"><table class="tabela"><thead><tr><th>Data</th><th>Hora</th><th>Disciplina</th><th>Tipo</th><th>Estado</th></tr></thead><tbody>${faltas
                .map(
                  (f) => `<tr><td>${h(formatarDataLonga(f.data))}</td><td>${h(f.hora_inicio)}</td><td>${h(f.disciplina)}</td>
                  <td>${h(TIPOS_FALTA[f.tipo])}</td><td>${etiquetaFalta(f)}${f.justificacao ? `<small class="bloco texto-suave">${h(f.justificacao)}</small>` : ''}</td></tr>`
                )
                .join('')}</tbody></table></div>`
            : vazio('Este aluno não tem faltas.')
        }
      </section>
    </div>
    <section class="cartao"><h2>Avaliação por módulos</h2>${await pautaDoAluno(aluno)}</section>`;
  res.html(pagina(req, { titulo: 'Ficha do aluno', ativo: 'alunos', acoes: botaoImprimir() }, conteudo));
});

get('/admin/alunos/:id/editar', async (req, res) => {
  const aluno = await carregarAluno(req.params.id);
  if (!aluno) return res.redirecionar('/admin/alunos');
  res.html(
    pagina(req, { titulo: 'Editar aluno', ativo: 'alunos' }, await formularioAluno(req, { aluno, acao: `/admin/alunos/${aluno.id}/editar`, titulo: 'Guardar alterações' }))
  );
});

post('/admin/alunos/:id/editar', async (req, res) => {
  const atual = await carregarAluno(req.params.id);
  if (!atual) return res.redirecionar('/admin/alunos');
  const { dados, erros } = await lerFormularioAluno(req.corpo, atual.id);
  if (Object.keys(erros).length) {
    return res.html(
      pagina(
        req,
        { titulo: 'Editar aluno', ativo: 'alunos' },
        await formularioAluno(req, { aluno: { ...dados, id: atual.id, fotografia: atual.fotografia }, erros, acao: `/admin/alunos/${atual.id}/editar`, titulo: 'Guardar alterações' })
      ),
      422
    );
  }

  let fotografia = atual.fotografia;
  let fotoNova = null;
  let avisoFoto = '';
  if (dados.fotografia_dados) {
    try {
      fotografia = fotoNova = guardarFotografia(atual.id, dados.fotografia_dados);
    } catch (e) {
      avisoFoto = ` A fotografia não foi alterada: ${e.message}`;
    }
  } else if (dados.remover_fotografia) {
    fotografia = null;
  }

  try {
    await guardarAlteracoesAluno(atual, dados, fotografia);
  } catch (e) {
    apagarFotografia(fotoNova); // a BD não mudou: a fotografia nova não pode ficar órfã
    throw e;
  }
  if (fotografia !== atual.fotografia) apagarFotografia(atual.fotografia);

  // Mudar de turma é a alteração mais crítica na ficha de um aluno (muda quem o dirige e o curso que segue)
  let detalheLog = `Editou o aluno "${atual.nome}".`;
  if ((atual.turma_id || null) !== (dados.turma_id || null)) {
    const novaTurma = dados.turma_id ? await um('SELECT nome FROM turmas WHERE id = ?', dados.turma_id) : null;
    detalheLog = `Mudou o aluno "${atual.nome}" de turma: "${atual.turma || '—'}" → "${novaTurma?.nome || '—'}".`;
  }
  await registarLog(req, 'editar', 'aluno', atual.id, detalheLog);

  req.flash(avisoFoto ? 'aviso' : 'sucesso', `Dados de ${dados.nome} atualizados.${avisoFoto}`);
  res.redirecionar(`/admin/alunos/${atual.id}`);
});

function guardarAlteracoesAluno(atual, dados, fotografia) {
  return transacao(async (tx) => {
    await tx.executar(
      `UPDATE alunos SET turma_id = ?, numero_processo = ?, nome = ?, data_nascimento = ?, contacto = ?, encarregado_nome = ?, email = ?, fotografia = ?
        WHERE id = ?`,
      dados.turma_id,
      dados.numero_processo,
      dados.nome,
      dados.data_nascimento || null,
      dados.contacto || null,
      dados.encarregado_nome || null,
      dados.email || null,
      fotografia,
      atual.id
    );
    if (atual.utilizador_id) {
      await tx.executar('UPDATE utilizadores SET username = ?, nome = ? WHERE id = ?', dados.numero_processo, dados.nome, atual.utilizador_id);
      if (dados.password) {
        await tx.executar(
          'UPDATE utilizadores SET password_hash = ?, deve_redefinir_password = 1 WHERE id = ?',
          gerarHash(dados.password),
          atual.utilizador_id
        );
      }
    } else if (dados.password) {
      const u = await tx.executar(
        `INSERT INTO utilizadores (username, password_hash, papel, nome, deve_redefinir_password) VALUES (?, ?, 'aluno', ?, 1)`,
        dados.numero_processo,
        gerarHash(dados.password),
        dados.nome
      );
      await tx.executar('UPDATE alunos SET utilizador_id = ? WHERE id = ?', u.lastInsertRowid, atual.id);
    }
  });
}

post('/admin/alunos/:id/apagar', async (req, res) => {
  const aluno = await carregarAluno(req.params.id);
  if (aluno) {
    await transacao(async (tx) => {
      await tx.executar('DELETE FROM alunos WHERE id = ?', aluno.id);
      if (aluno.utilizador_id) await tx.executar('DELETE FROM utilizadores WHERE id = ?', aluno.utilizador_id);
    });
    apagarFotografia(aluno.fotografia);
    await registarLog(req, 'apagar', 'aluno', aluno.id, `Apagou o aluno "${aluno.nome}" (n.º processo ${aluno.numero_processo}).`);
    req.flash('sucesso', `Aluno ${aluno.nome} apagado.`);
  }
  res.redirecionar('/admin/alunos');
});

// ---------- Faltas ----------
get('/admin/faltas', async (req, res) => {
  const turmas = await todos('SELECT * FROM turmas ORDER BY nome');
  const f = {
    turma: req.query.turma || '',
    estado: req.query.estado || 'injustificadas',
    aluno: req.query.aluno || '',
    q: String(req.query.q || '').trim(),
    de: dataValida(req.query.de) ? req.query.de : '',
    ate: dataValida(req.query.ate) ? req.query.ate : '',
  };
  const alunoFiltro = f.aluno ? await um('SELECT id, nome FROM alunos WHERE id = ?', f.aluno) : null;

  const faltas = await todos(
    `SELECT fa.*, a.nome AS aluno, a.numero_processo, a.fotografia, a.id AS aluno_id, t.nome AS turma,
            d.nome AS disciplina, hr.hora_inicio, u.nome AS justificada_por_nome
       FROM faltas fa
       JOIN alunos a ON a.id = fa.aluno_id
       LEFT JOIN turmas t ON t.id = a.turma_id
       JOIN horario hr ON hr.id = fa.horario_id
       JOIN disciplinas d ON d.id = hr.disciplina_id
       LEFT JOIN utilizadores u ON u.id = fa.justificada_por
      WHERE (? = '' OR a.turma_id = ?)
        AND (? = 'todas' OR (? = 'justificadas' AND fa.justificada = 1) OR (? = 'injustificadas' AND fa.justificada = 0))
        AND (? = '' OR a.id = ?)
        AND (? = '' OR a.nome LIKE ? OR a.numero_processo LIKE ?)
        AND (? = '' OR fa.data >= ?)
        AND (? = '' OR fa.data <= ?)
      ORDER BY fa.data DESC, a.nome, hr.hora_inicio
      LIMIT 500`,
    f.turma, f.turma,
    f.estado, f.estado, f.estado,
    f.aluno, f.aluno,
    f.q, `%${f.q}%`, `%${f.q}%`,
    f.de, f.de,
    f.ate, f.ate
  );

  const pesquisaAtual = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const temInjustificadas = faltas.some((x) => !x.justificada);

  const linhas = faltas
    .map(
      (x) => `<tr>
      <td class="centro">${x.justificada ? '' : `<input type="checkbox" name="ids" value="${x.id}" aria-label="Selecionar falta" data-selecionar>`}</td>
      <td>${h(formatarDataLonga(x.data))}<small class="bloco texto-suave">${h(x.hora_inicio)}</small></td>
      <td><a class="aluno-linha" href="/admin/alunos/${x.aluno_id}">${avatar({ nome: x.aluno, fotografia: x.fotografia }, 'pequeno')}<span>${h(x.aluno)}<small>${h(x.turma || '')} · ${h(x.numero_processo)}</small></span></a></td>
      <td>${h(x.disciplina)}</td>
      <td>${h(TIPOS_FALTA[x.tipo])}</td>
      <td>${etiquetaFalta(x)}${
        x.justificada
          ? `<small class="bloco texto-suave">${h(x.justificacao)}${x.justificada_por_nome ? ` — ${h(x.justificada_por_nome)}` : ''}${x.justificada_em ? `, ${h(formatarData(x.justificada_em))}` : ''}</small>`
          : ''
      }</td>
      <td class="direita">${
        x.justificada
          ? `<button class="botao-texto" formaction="/admin/faltas/${x.id}/injustificar" formnovalidate data-confirmar-botao="Retirar a justificação desta falta?">Retirar justificação</button>`
          : ''
      }</td>
    </tr>`
    )
    .join('');

  const conteudo = `
    <section class="cartao">
      <form class="filtros" method="get">
        ${alunoFiltro ? `<input type="hidden" name="aluno" value="${alunoFiltro.id}">` : ''}
        <label>Estado
          <select name="estado" data-submeter>
            <option value="injustificadas"${selecionado('injustificadas', f.estado)}>Por justificar</option>
            <option value="justificadas"${selecionado('justificadas', f.estado)}>Justificadas</option>
            <option value="todas"${selecionado('todas', f.estado)}>Todas</option>
          </select></label>
        <label>Turma
          <select name="turma" data-submeter>
            <option value="">Todas</option>
            ${turmas.map((t) => `<option value="${t.id}"${selecionado(t.id, f.turma)}>${h(t.nome)}</option>`).join('')}
          </select></label>
        <label>De <input type="date" name="de" value="${f.de}"></label>
        <label>Até <input type="date" name="ate" value="${f.ate}"></label>
        <label class="crescer">Aluno <input type="search" name="q" value="${h(f.q)}" placeholder="Nome ou n.º de processo"></label>
        <button class="botao botao-secundario">Filtrar</button>
      </form>
      ${alunoFiltro ? `<p class="filtro-ativo">A mostrar apenas: <strong>${h(alunoFiltro.nome)}</strong> <a href="?estado=${h(f.estado)}">× limpar</a></p>` : ''}
    </section>

    <form method="post" action="/admin/faltas/justificar" class="cartao">
      <input type="hidden" name="voltar" value="/admin/faltas?${h(pesquisaAtual)}">
      ${
        temInjustificadas
          ? `<div class="barra-justificar">
              <label class="linha-check"><input type="checkbox" data-selecionar-todos> Selecionar todas</label>
              <label class="crescer">Motivo da justificação
                <input name="justificacao" list="motivos" maxlength="200" placeholder="Ex.: Doença (atestado médico entregue)" required></label>
              <datalist id="motivos">${MOTIVOS_SUGERIDOS.map((m) => `<option value="${h(m)}">`).join('')}</datalist>
              <button class="botao">Justificar selecionadas</button>
            </div>`
          : ''
      }
      <p class="contador">${faltas.length}${faltas.length === 500 ? '+' : ''} falta(s)</p>
      ${
        faltas.length
          ? `<div class="tabela-scroll"><table class="tabela">
          <thead><tr><th></th><th>Data</th><th>Aluno</th><th>Disciplina</th><th>Tipo</th><th>Estado</th><th></th></tr></thead>
          <tbody>${linhas}</tbody></table></div>`
          : vazio('Não há faltas com estes filtros.')
      }
    </form>`;

  res.html(pagina(req, { titulo: 'Faltas', ativo: 'faltas', subtitulo: 'Consultar e justificar faltas dos alunos' }, conteudo));
});

function destinoSeguro(voltar) {
  const v = String(voltar || '');
  return v.startsWith('/admin/faltas') ? v : '/admin/faltas';
}

post('/admin/faltas/justificar', async (req, res) => {
  const ids = comoLista(req.corpo.ids).map(Number).filter(Number.isInteger);
  const justificacao = String(req.corpo.justificacao || '').trim().slice(0, 200);
  if (!ids.length) {
    req.flash('erro', 'Selecione pelo menos uma falta.');
  } else if (!justificacao) {
    req.flash('erro', 'Indique o motivo da justificação.');
  } else {
    let alteradas = 0;
    await transacao(async (tx) => {
      for (const id of ids) {
        alteradas += Number(
          (await tx.executar(
            `UPDATE faltas SET justificada = 1, justificacao = ?, justificada_em = NOW(), justificada_por = ?
              WHERE id = ? AND justificada = 0`,
            justificacao,
            req.utilizador.id,
            id
          )).changes
        );
      }
    });
    req.flash('sucesso', `${alteradas} falta(s) justificada(s).`);
  }
  res.redirecionar(destinoSeguro(req.corpo.voltar));
});

post('/admin/faltas/:id/injustificar', async (req, res) => {
  const r = await executar(
    `UPDATE faltas SET justificada = 0, justificacao = NULL, justificada_em = NULL, justificada_por = NULL WHERE id = ?`,
    req.params.id
  );
  req.flash(r.changes ? 'sucesso' : 'erro', r.changes ? 'Justificação retirada.' : 'Falta não encontrada.');
  res.redirecionar(destinoSeguro(req.corpo.voltar));
});
