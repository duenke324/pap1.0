// Validação dos justificativos enviados pelos encarregados de educação:
//  - a administração vê e decide os de todos os alunos;
//  - o professor vê e decide só os das turmas de que é diretor de turma;
//  - o ficheiro só é servido a quem pode ver o pedido (ver podeVerJustificativo).
const path = require('node:path');
const { get, post, enviarFicheiro } = require('../lib/servidor');
const { um, PASTA_JUSTIFICATIVOS } = require('../db');
const { pagina } = require('../vistas/layout');
const {
  listarJustificativos,
  obterJustificativo,
  podeVerJustificativo,
  decidirJustificativo,
  listaJustificativos,
} = require('../lib/justificativos');

function separadoresEstado(base, estado, pendentes) {
  const item = (valor, texto) => `<a href="${base}?estado=${valor}" class="${estado === valor ? 'ativo' : ''}">${texto}</a>`;
  return `<nav class="separadores" aria-label="Estado">
    ${item('pendente', `Pendentes${pendentes ? ` (${pendentes})` : ''}`)}
    ${item('decididos', 'Já decididos')}
  </nav>`;
}

function filtroEstado(estado) {
  return estado === 'decididos' ? `j.estado <> 'pendente'` : `j.estado = 'pendente'`;
}

async function responderDecisao(req, res, voltar) {
  const r = await decidirJustificativo(req, req.params.id, String(req.corpo.decisao || ''), req.corpo.resposta);
  req.flash(r.ok ? 'sucesso' : 'erro', r.mensagem);
  res.redirecionar(voltar);
}

// ---------- Administração ----------
get('/admin/justificativos', async (req, res) => {
  const estado = req.query.estado === 'decididos' ? 'decididos' : 'pendente';
  const justificativos = await listarJustificativos(filtroEstado(estado));
  const pendentes = (await um(`SELECT COUNT(*) AS n FROM justificativos WHERE estado = 'pendente'`)).n;
  const conteudo = `<section class="cartao">
    ${separadoresEstado('/admin/justificativos', estado, pendentes)}
    ${listaJustificativos(
      justificativos,
      (j) => ({ acaoDecidir: `/admin/justificativos/${j.id}/decidir` }),
      estado === 'pendente' ? 'Não há justificativos à espera de validação.' : 'Ainda não foi decidido nenhum justificativo.'
    )}
  </section>`;
  res.html(
    pagina(req, { titulo: 'Justificativos', ativo: 'justificativos', subtitulo: 'Documentos enviados pelos encarregados de educação' }, conteudo)
  );
});

post('/admin/justificativos/:id/decidir', (req, res) => responderDecisao(req, res, '/admin/justificativos'));

// ---------- Diretor de turma ----------
get('/professor/justificativos', async (req, res) => {
  const estado = req.query.estado === 'decididos' ? 'decididos' : 'pendente';
  const professorId = req.professor?.id ?? 0;
  const dirige = await um('SELECT COUNT(*) AS n FROM turmas WHERE diretor_id = ?', professorId);
  const justificativos = await listarJustificativos(`t.diretor_id = ? AND ${filtroEstado(estado)}`, professorId);
  const pendentes = (
    await um(
      `SELECT COUNT(*) AS n FROM justificativos j JOIN alunos a ON a.id = j.aluno_id JOIN turmas t ON t.id = a.turma_id
        WHERE t.diretor_id = ? AND j.estado = 'pendente'`,
      professorId
    )
  ).n;
  const conteudo = `<section class="cartao">
    ${
      dirige.n
        ? `${separadoresEstado('/professor/justificativos', estado, pendentes)}
           ${listaJustificativos(
             justificativos,
             (j) => ({ acaoDecidir: `/professor/justificativos/${j.id}/decidir` }),
             estado === 'pendente' ? 'Não há justificativos à espera de validação.' : 'Ainda não decidiu nenhum justificativo.'
           )}`
        : '<div class="vazio">Só o diretor de turma valida justificativos. Não é diretor de nenhuma turma.</div>'
    }
  </section>`;
  res.html(
    pagina(req, { titulo: 'Justificativos', ativo: 'justificativos', subtitulo: 'Das turmas de que é diretor de turma' }, conteudo)
  );
});

// (decidirJustificativo confirma que este professor é o diretor de turma do aluno)
post('/professor/justificativos/:id/decidir', (req, res) => responderDecisao(req, res, '/professor/justificativos'));

// ---------- Ficheiro ----------
// Fora das áreas /admin, /professor e /encarregado porque é partilhado pelos três papéis:
// a permissão é verificada aqui, pedido a pedido.
get('/justificativos/:id/ficheiro', async (req, res) => {
  const j = await obterJustificativo(req.params.id);
  // 404 também para quem não tem permissão, para não revelar que pedidos existem
  if (!j || !podeVerJustificativo(req, j)) return res.erro(404);
  const ficheiro = path.basename(j.ficheiro);
  // "inline": o browser mostra o PDF ou a imagem em vez de descarregar
  res.setHeader('Content-Disposition', `inline; filename="justificativo-${j.id}${path.extname(ficheiro)}"`);
  if (!enviarFicheiro(res, PASTA_JUSTIFICATIVOS, ficheiro)) {
    res.removeHeader('Content-Disposition');
    res.erro(404);
  }
});
