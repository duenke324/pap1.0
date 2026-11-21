// Tarefas da Conversas: só os alunos do canal entregam, e o professor devolve com nota.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { CONVERSAS, Cliente, naEscola, codigoPrimeiraEscola } = require('./ajuda');
const db = require('../src/db');

let dados;
before(async () => {
  dados = await naEscola(1, async () => {
    const [membro, intruso] = await db.todos(
      `SELECT a.id, a.email, a.turma_id FROM alunos a
        WHERE a.turma_id = (SELECT turma_id FROM alunos WHERE turma_id IS NOT NULL ORDER BY id LIMIT 1) AND a.email IS NOT NULL
        ORDER BY a.id LIMIT 2`
    );
    const prof = await db.um(
      `SELECT p.id, p.email FROM horario hr JOIN professores p ON p.id = hr.professor_id WHERE hr.turma_id = ? AND hr.ativo = 1 LIMIT 1`,
      membro.turma_id
    );
    const canal = Number((await db.executar("INSERT INTO canais (turma_id, nome, tipo, criado_por) VALUES (?, 'Grupo de teste', 'grupo', ?)", membro.turma_id, prof.id)).lastInsertRowid);
    await db.executar('INSERT INTO canal_membros (canal_id, aluno_id) VALUES (?, ?)', canal, membro.id);
    const tarefa = Number(
      (await db.executar("INSERT INTO tarefas (canal_id, professor_id, titulo, instrucoes, pontos) VALUES (?, ?, 'Tarefa de teste', 'Responder', 20)", canal, prof.id))
        .lastInsertRowid
    );
    return { membro, intruso, prof, canal, tarefa };
  });
});

async function entrarConversas(email, password) {
  const codigo = await codigoPrimeiraEscola();
  const c = new Cliente(CONVERSAS);
  c.prefixo = `/${codigo}`;
  const r = await c.post(`${c.prefixo}/login`, { email, password });
  assert.equal(r.estado, 303, `login de ${email}`);
  return c;
}

const entrega = (alunoId) => naEscola(1, () => db.um('SELECT * FROM tarefa_entregas WHERE tarefa_id = ? AND aluno_id = ?', dados.tarefa, alunoId));

test('um aluno do grupo entrega a tarefa', async () => {
  const c = await entrarConversas(dados.membro.email, 'aluno123');
  assert.equal((await c.get(`${c.prefixo}/tarefas/${dados.tarefa}`)).estado, 200);
  await c.post(`${c.prefixo}/tarefas/${dados.tarefa}/entregar`, { texto: 'A minha resposta' });
  const e = await entrega(dados.membro.id);
  assert.ok(e?.entregue_em, 'ficou entregue');
  assert.equal(e.texto, 'A minha resposta');
});

test('um aluno que não está no grupo não vê nem entrega a tarefa', async () => {
  const c = await entrarConversas(dados.intruso.email, 'aluno123');
  assert.notEqual((await c.get(`${c.prefixo}/tarefas/${dados.tarefa}`)).estado, 200);
  await c.post(`${c.prefixo}/tarefas/${dados.tarefa}/entregar`, { texto: 'Não devia entrar' });
  assert.ok(!(await entrega(dados.intruso.id)), 'não ficou nenhuma entrega');
});

test('o professor devolve com nota e o aluno já não pode mudar a entrega', async () => {
  const p = await entrarConversas(dados.prof.email, 'prof123');
  await p.post(`${p.prefixo}/tarefas/${dados.tarefa}/devolver/${dados.membro.id}`, { nota: '17,5', comentario: 'Bom trabalho' });
  const e = await entrega(dados.membro.id);
  assert.ok(e.devolvida_em, 'foi devolvida');
  assert.equal(Number(e.nota), 17.5);

  const c = await entrarConversas(dados.membro.email, 'aluno123');
  await c.post(`${c.prefixo}/tarefas/${dados.tarefa}/entregar`, { texto: 'Mudei depois de devolvida' });
  assert.equal((await entrega(dados.membro.id)).texto, 'A minha resposta');
});

test('um aluno não pode devolver tarefas', async () => {
  const c = await entrarConversas(dados.membro.email, 'aluno123');
  await c.post(`${c.prefixo}/tarefas/${dados.tarefa}/devolver/${dados.membro.id}`, { nota: '20' });
  assert.equal(Number((await entrega(dados.membro.id)).nota), 17.5);
});
