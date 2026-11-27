// Alunos em risco (painel da direção): junta num só sítio os sinais que, cada um sozinho, já aparecem
// noutros ecrãs — faltas por módulo, módulos não concluídos, ocorrências graves e faltas por justificar —
// e dá a cada aluno uma pontuação simples, fácil de explicar:
//
//   módulo no LIMITE de faltas ............ 3 pontos     módulo a METADE do limite ... 1 ponto
//   módulo NC ou EF ....................... 2 pontos     nota negativa (< 10) ........ 1 ponto
//   ocorrência muito grave (12 meses) ..... 3 pontos     ocorrência grave ............ 2 pontos
//   10 ou mais faltas por justificar ...... 2 pontos     5 a 9 por justificar ........ 1 ponto
//
// Risco ALTO a partir de 5 pontos, MÉDIO de 2 a 4. Com menos de 2 o aluno não aparece na lista.
const { todos } = require('../db');
const { situacaoPorModulo } = require('./avisos-faltas');

const PONTOS = {
  limite: 3,
  metade: 1,
  naoConcluido: 2,
  negativa: 1,
  muito_grave: 3,
  grave: 2,
};
const NIVEL_ALTO = 5;
const NIVEL_MEDIO = 2;

function nivelRisco(pontos) {
  if (pontos >= NIVEL_ALTO) return 'alto';
  if (pontos >= NIVEL_MEDIO) return 'medio';
  return null;
}

// Devolve os alunos em risco (do mais grave para o menos grave), cada um com os motivos.
// turmaId: só uma turma (opcional).
async function alunosEmRisco({ turmaId = null } = {}) {
  const alunos = await todos(
    `SELECT a.id, a.nome, a.numero_processo, a.fotografia, a.turma_id, t.nome AS turma, t.curso,
            p.nome AS diretor,
            (SELECT COUNT(*) FROM faltas f WHERE f.aluno_id = a.id AND f.justificada = 0) AS injustificadas
       FROM alunos a
       LEFT JOIN turmas t ON t.id = a.turma_id
       LEFT JOIN professores p ON p.id = t.diretor_id
      WHERE (? IS NULL OR a.turma_id = ?)
      ORDER BY a.nome`,
    turmaId,
    turmaId
  );
  if (!alunos.length) return [];
  const ids = alunos.map((a) => a.id);
  const porId = new Map(alunos.map((a) => [a.id, { ...a, injustificadas: Number(a.injustificadas), pontos: 0, motivos: [] }]));

  // 1. Faltas por módulo (metade / limite das horas)
  for (const s of await situacaoPorModulo(ids)) {
    const a = porId.get(s.aluno_id);
    a.pontos += PONTOS[s.nivel];
    a.motivos.push({
      tipo: 'faltas',
      grave: s.nivel === 'limite',
      texto: `${s.disciplina} M${s.numero}: ${s.faltas} h de faltas (${s.nivel === 'limite' ? 'limite' : 'metade do limite'})`,
    });
  }

  // 2. Avaliação: módulos NC/EF e notas negativas
  const notas = await todos(
    `SELECT n.aluno_id, n.estado, n.nota, m.numero, d.sigla, d.nome AS disciplina
       FROM notas n JOIN modulos m ON m.id = n.modulo_id JOIN disciplinas d ON d.id = m.disciplina_id
      WHERE n.aluno_id IN (?) AND (n.estado <> 'nota' OR n.nota < 10)
      ORDER BY d.nome, m.numero`,
    ids
  );
  for (const n of notas) {
    const a = porId.get(n.aluno_id);
    if (n.estado === 'nota') {
      a.pontos += PONTOS.negativa;
      a.motivos.push({ tipo: 'avaliacao', grave: false, texto: `${n.disciplina} M${n.numero}: nota ${n.nota}` });
    } else {
      a.pontos += PONTOS.naoConcluido;
      a.motivos.push({ tipo: 'avaliacao', grave: true, texto: `${n.disciplina} M${n.numero}: ${n.estado}` });
    }
  }

  // 3. Ocorrências disciplinares graves e muito graves dos últimos 12 meses
  const ocorrencias = await todos(
    `SELECT aluno_id, gravidade, COUNT(*) AS n FROM ocorrencias
      WHERE aluno_id IN (?) AND gravidade IN ('grave', 'muito_grave') AND data >= CURDATE() - INTERVAL 12 MONTH
      GROUP BY aluno_id, gravidade`,
    ids
  );
  for (const o of ocorrencias) {
    const a = porId.get(o.aluno_id);
    const n = Number(o.n);
    a.pontos += PONTOS[o.gravidade] * n;
    a.motivos.push({
      tipo: 'ocorrencias',
      grave: o.gravidade === 'muito_grave',
      texto: `${n} ocorrência(s) ${o.gravidade === 'muito_grave' ? 'muito grave(s)' : 'grave(s)'}`,
    });
  }

  // 4. Faltas por justificar
  for (const a of porId.values()) {
    if (a.injustificadas >= 10) a.pontos += 2;
    else if (a.injustificadas >= 5) a.pontos += 1;
    if (a.injustificadas >= 5) {
      a.motivos.push({ tipo: 'injustificadas', grave: a.injustificadas >= 10, texto: `${a.injustificadas} faltas por justificar` });
    }
  }

  return [...porId.values()]
    .map((a) => ({ ...a, nivel: nivelRisco(a.pontos) }))
    .filter((a) => a.nivel)
    .sort((x, y) => y.pontos - x.pontos || x.nome.localeCompare(y.nome));
}

// Faltas de presença por mês, no ano letivo indicado ("2026/2027"): de setembro a agosto
async function faltasPorMes(limites, turmaId = null) {
  const linhas = await todos(
    `SELECT DATE_FORMAT(f.data, '%Y-%m') AS mes, COUNT(*) AS faltas, SUM(f.justificada = 0) AS injustificadas
       FROM faltas f JOIN horario hr ON hr.id = f.horario_id
      WHERE f.tipo = 'presenca' AND f.data BETWEEN ? AND ? AND (? IS NULL OR hr.turma_id = ?)
      GROUP BY mes ORDER BY mes`,
    limites.inicio,
    limites.fim,
    turmaId,
    turmaId
  );
  const meses = [];
  const [ano] = limites.inicio.split('-').map(Number);
  for (let i = 0; i < 12; i++) {
    const d = new Date(ano, 8 + i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const l = linhas.find((x) => x.mes === chave);
    meses.push({
      mes: chave,
      rotulo: d.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', ''),
      faltas: Number(l?.faltas || 0),
      injustificadas: Number(l?.injustificadas || 0),
    });
  }
  return meses;
}

// Assiduidade e faltas de cada turma (faltas de presença / (alunos × lições dadas))
async function faltasPorTurma() {
  const linhas = await todos(
    `SELECT t.id, t.nome,
            (SELECT COUNT(*) FROM alunos a WHERE a.turma_id = t.id) AS alunos,
            (SELECT COUNT(*) FROM licoes l JOIN horario hr ON hr.id = l.horario_id WHERE hr.turma_id = t.id) AS licoes,
            (SELECT COUNT(*) FROM faltas f JOIN horario hr ON hr.id = f.horario_id WHERE hr.turma_id = t.id AND f.tipo = 'presenca') AS faltas
       FROM turmas t ORDER BY t.nome`
  );
  return linhas
    .map((t) => {
      const possiveis = Number(t.alunos) * Number(t.licoes);
      const faltas = Number(t.faltas);
      return {
        id: t.id,
        nome: t.nome,
        faltas,
        assiduidade: possiveis ? Math.max(0, Math.min(100, Math.round((1 - faltas / possiveis) * 1000) / 10)) : null,
      };
    })
    .filter((t) => t.assiduidade !== null);
}

module.exports = { alunosEmRisco, faltasPorMes, faltasPorTurma, nivelRisco, PONTOS, NIVEL_ALTO, NIVEL_MEDIO };
