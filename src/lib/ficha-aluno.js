// Ficha de registo do aluno em PDF (módulos, classificações e assiduidade). Descarregada pela direção
// (ficha do aluno), pela secretaria (painel do funcionário) e pelo próprio aluno (Avaliações).
// O desenho do PDF está em lib/pdf.js (pdfFichaAluno).
const { todos, um } = require('../db');
const { pdfFichaAluno } = require('./pdf');
const { escolaAtual } = require('./contexto');
const { formatarData, hoje, textoClassificacao } = require('./util');

const media = (notas) => (notas.length ? (notas.reduce((s, n) => s + n, 0) / notas.length).toFixed(1).replace('.', ',') : null);

async function dadosFicha(alunoId) {
  const a = await um(
    `SELECT a.*, t.nome AS turma, t.curso, t.ano_letivo, p.nome AS diretor
       FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id LEFT JOIN professores p ON p.id = t.diretor_id
      WHERE a.id = ?`,
    alunoId
  );
  if (!a) return null;
  // Os mesmos módulos da pauta do aluno: os que já têm nota e os das disciplinas da turma atual
  const linhas = await todos(
    `SELECT d.id AS disciplina_id, d.nome AS disciplina, m.numero, m.nome, m.horas, n.estado, n.nota
       FROM modulos m JOIN disciplinas d ON d.id = m.disciplina_id
       LEFT JOIN notas n ON n.modulo_id = m.id AND n.aluno_id = ?
      WHERE n.id IS NOT NULL OR m.disciplina_id IN (SELECT disciplina_id FROM horario WHERE turma_id = ? AND ativo = 1)
      ORDER BY d.nome, m.numero`,
    a.id,
    a.turma_id ?? 0
  );
  const disciplinas = [];
  for (const l of linhas) {
    let d = disciplinas.find((x) => x.id === l.disciplina_id);
    if (!d) disciplinas.push((d = { id: l.disciplina_id, nome: l.disciplina, modulos: [] }));
    d.modulos.push({ numero: l.numero, nome: l.nome, horas: l.horas, nota: l.estado === 'nota' ? l.nota : null, classificacao: l.estado ? textoClassificacao(l) : '' });
  }
  const todasNotas = [];
  let horasConcluidas = 0;
  for (const d of disciplinas) {
    const concluidos = d.modulos.filter((m) => m.nota !== null && m.nota >= 10);
    d.concluidos = concluidos.length;
    d.media = media(concluidos.map((m) => m.nota));
    todasNotas.push(...concluidos.map((m) => m.nota));
    horasConcluidas += concluidos.reduce((s, m) => s + (m.horas || 0), 0);
  }
  const faltas = await um(
    `SELECT COUNT(*) AS faltas, COALESCE(SUM(justificada = 1), 0) AS justificadas FROM faltas WHERE aluno_id = ? AND tipo = 'presenca'`,
    a.id
  );
  return {
    escola: escolaAtual().nome,
    geradoEm: formatarData(hoje()),
    aluno: {
      nome: a.nome,
      numero_processo: a.numero_processo,
      data_nascimento: a.data_nascimento ? formatarData(a.data_nascimento) : '',
      turma: a.turma,
      curso: a.curso,
      ano_letivo: a.ano_letivo,
      diretor: a.diretor,
      encarregado: a.encarregado_nome,
    },
    assiduidade: { faltas: Number(faltas.faltas), justificadas: Number(faltas.justificadas), injustificadas: Number(faltas.faltas) - Number(faltas.justificadas) },
    disciplinas,
    resumo: {
      concluidos: todasNotas.length,
      total: disciplinas.reduce((s, d) => s + d.modulos.length, 0),
      horasConcluidas,
      media: media(todasNotas),
    },
  };
}

// Responde com o PDF (ou 404 se o aluno não existir)
async function enviarFichaPdf(res, alunoId) {
  const dados = await dadosFicha(alunoId);
  if (!dados) return res.erro(404);
  const pdf = pdfFichaAluno(dados);
  const nome = `ficha-${dados.aluno.numero_processo}-${hoje()}.pdf`.replace(/[^\w.-]/g, '-');
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${nome}"`,
    'Content-Length': pdf.length,
    'Cache-Control': 'no-store',
  });
  res.end(pdf);
}

module.exports = { dadosFicha, enviarFichaPdf };
