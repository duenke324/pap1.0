// Uma escola nunca vê nem altera os dados de outra (todas estão na mesma base de dados).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { naEscola, entrarGestao } = require('./ajuda');
const db = require('../src/db');
const { criarEscola } = require('../src/lib/escolas');

let segunda;
before(async () => {
  const r = await criarEscola({ nome: 'Escola de Testes', dominio: 'testes.example.pt', direcao: 'Direção de Testes' });
  assert.ok(!r.erro, r.erro);
  segunda = r;
});

test('a escola nova começa sem os alunos, turmas e professores da primeira', async () => {
  const primeira = await naEscola(1, () => db.um('SELECT COUNT(*) AS n FROM alunos'));
  assert.ok(primeira.n > 0, 'a primeira escola tem alunos de demonstração');
  const contagem = await naEscola(segunda.escola.id, async () => ({
    alunos: (await db.um('SELECT COUNT(*) AS n FROM alunos')).n,
    turmas: (await db.um('SELECT COUNT(*) AS n FROM turmas')).n,
    professores: (await db.um('SELECT COUNT(*) AS n FROM professores')).n,
    faltas: (await db.um('SELECT COUNT(*) AS n FROM faltas')).n,
  }));
  assert.deepEqual(contagem, { alunos: 0, turmas: 0, professores: 0, faltas: 0 });
});

test('o que se cria numa escola não aparece na outra', async () => {
  await naEscola(segunda.escola.id, () => db.executar("INSERT INTO disciplinas (nome, sigla) VALUES ('Disciplina só da escola 2', 'DS2')"));
  const naPrimeira = await naEscola(1, () => db.um("SELECT COUNT(*) AS n FROM disciplinas WHERE sigla = 'DS2'"));
  const naSegunda = await naEscola(segunda.escola.id, () => db.um("SELECT COUNT(*) AS n FROM disciplinas WHERE sigla = 'DS2'"));
  assert.equal(naPrimeira.n, 0);
  assert.equal(naSegunda.n, 1);
});

test('uma escola não consegue alterar nem apagar linhas de outra, mesmo sabendo o id', async () => {
  const aluno = await naEscola(1, () => db.um('SELECT id, nome FROM alunos ORDER BY id LIMIT 1'));
  const alterado = await naEscola(segunda.escola.id, () => db.executar("UPDATE alunos SET nome = 'Mudado' WHERE id = ?", aluno.id));
  const apagado = await naEscola(segunda.escola.id, () => db.executar('DELETE FROM alunos WHERE id = ?', aluno.id));
  assert.equal(alterado.changes, 0);
  assert.equal(apagado.changes, 0);
  const depois = await naEscola(1, () => db.um('SELECT nome FROM alunos WHERE id = ?', aluno.id));
  assert.equal(depois.nome, aluno.nome);
});

test('a conta de uma escola não entra na outra', async () => {
  // A direção da escola nova (username e palavra-passe temporária devolvidos ao criá-la) tenta entrar na primeira
  const c = await entrarGestao(segunda.username, segunda.password);
  assert.equal(c.resposta.estado, 401);
});
