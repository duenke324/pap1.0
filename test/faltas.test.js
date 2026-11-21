// Aviso de excesso de faltas por módulo: metade e limite (10% das horas do módulo).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { naEscola, entrarGestao } = require('./ajuda');
const db = require('../src/db');
const { nivelFaltas, limiteDoModulo, verificarAvisosFaltas, situacaoPorModulo } = require('../src/lib/avisos-faltas');

test('limite e níveis: 10% das horas do módulo', () => {
  assert.equal(limiteDoModulo(30), 3);
  assert.equal(limiteDoModulo(0), null);
  assert.equal(nivelFaltas(1, 30), null);
  assert.equal(nivelFaltas(2, 30), 'metade'); // metade de 3 = 1,5
  assert.equal(nivelFaltas(3, 30), 'limite');
  assert.equal(nivelFaltas(5, 30), 'limite');
  assert.equal(nivelFaltas(10, null), null); // módulo sem horas: sem avisos
});

// Cria lições de um módulo numa aula do horário da turma do aluno, com uma falta do aluno em cada uma
async function darFaltas(aluno, modulo, aula, quantas, diasDesde) {
  for (let i = 0; i < quantas; i++) {
    const data = new Date(Date.UTC(2025, 0, 6 + 7 * (diasDesde + i))).toISOString().slice(0, 10);
    await db.executar('INSERT INTO licoes (horario_id, data, modulo_id, sumario) VALUES (?, ?, ?, ?)', aula.id, data, modulo.id, 'Teste');
    await db.executar("INSERT INTO faltas (aluno_id, horario_id, data, tipo) VALUES (?, ?, ?, 'presenca')", aluno.id, aula.id, data);
  }
}

test('avisa uma vez à metade e uma vez ao limite', async () => {
  await naEscola(1, async () => {
    const aluno = await db.um('SELECT * FROM alunos WHERE turma_id IS NOT NULL ORDER BY id LIMIT 1');
    const aula = await db.um('SELECT * FROM horario WHERE turma_id = ? ORDER BY id LIMIT 1', aluno.turma_id);
    // Módulo novo, de 20 horas: limite de 2 faltas, metade = 1
    await db.executar("INSERT INTO modulos (disciplina_id, numero, nome, horas) VALUES (?, 99, 'Módulo de teste', 20)", aula.disciplina_id);
    const modulo = await db.um('SELECT * FROM modulos WHERE disciplina_id = ? AND numero = 99', aula.disciplina_id);

    await darFaltas(aluno, modulo, aula, 1, 0);
    assert.equal(await verificarAvisosFaltas([aluno.id], modulo.id), 1, 'aviso de metade');
    assert.equal(await verificarAvisosFaltas([aluno.id], modulo.id), 0, 'não repete o aviso');

    await darFaltas(aluno, modulo, aula, 1, 1);
    assert.equal(await verificarAvisosFaltas([aluno.id], modulo.id), 1, 'aviso de limite');
    assert.equal(await verificarAvisosFaltas([aluno.id], modulo.id), 0, 'não repete o aviso');

    const avisos = await db.todos('SELECT nivel FROM avisos_faltas WHERE aluno_id = ? AND modulo_id = ? ORDER BY nivel', aluno.id, modulo.id);
    assert.deepEqual(avisos.map((a) => a.nivel), ['metade', 'limite']);
    const [s] = await situacaoPorModulo([aluno.id], { moduloId: modulo.id });
    assert.equal(s.nivel, 'limite');
    assert.equal(s.faltas, 2);
  });
});

test('o aluno vê o aviso no seu painel', async () => {
  const aluno = await naEscola(1, () =>
    db.um('SELECT u.username FROM alunos a JOIN utilizadores u ON u.id = a.utilizador_id WHERE a.turma_id IS NOT NULL ORDER BY a.id LIMIT 1')
  );
  const c = await entrarGestao(aluno.username, 'aluno123');
  const r = await c.get(`${c.prefixo}/aluno`);
  assert.equal(r.estado, 200);
  assert.match(r.html, /Faltas por módulo/);
  assert.match(r.html, /Módulo 99/);
});
