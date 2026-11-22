// Encarregado de educação: conta criada com o aluno menor, email a cada falta nova, e o aluno maior
// de idade que justifica as suas próprias faltas.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entrarGestao, naEscola } = require('./ajuda');
const db = require('../src/db');
const { avisarFaltasNovas } = require('../src/lib/avisos-faltas');
const { maiorDeIdade } = require('../src/lib/util');

test('maior de idade: 18 anos ou mais; sem data conta como menor', () => {
  assert.equal(maiorDeIdade('2000-01-01'), true);
  assert.equal(maiorDeIdade(`${new Date().getFullYear() - 10}-01-01`), false);
  assert.equal(maiorDeIdade(''), false);
  assert.equal(maiorDeIdade(null), false);
});

test('ao criar um aluno menor, é criada a conta do encarregado', async () => {
  const c = await entrarGestao('1000', 'admin123');
  const novo = (dados) => c.post(`${c.prefixo}/admin/alunos/novo`, dados);
  const anoMenor = new Date().getFullYear() - 15;

  // Menor sem encarregado: não deixa criar
  const semEe = await novo({ nome: 'Aluno Menor Teste', numero_processo: '9901', data_nascimento: `${anoMenor}-03-10` });
  assert.equal(semEe.estado, 422);
  assert.match(semEe.html, /indique o encarregado/);

  // Menor com encarregado: conta EE9901 criada e associada
  const ok = await novo({
    nome: 'Aluno Menor Teste',
    numero_processo: '9901',
    data_nascimento: `${anoMenor}-03-10`,
    encarregado_nome: 'Mãe de Teste',
    encarregado_email: 'mae.teste@testes.example.pt',
  });
  assert.equal(ok.estado, 303);
  const a = await naEscola(1, () =>
    db.um(
      `SELECT a.encarregado_id, e.email, u.username, u.papel FROM alunos a
         JOIN encarregados e ON e.id = a.encarregado_id JOIN utilizadores u ON u.id = e.utilizador_id
        WHERE a.numero_processo = '9901'`
    )
  );
  assert.ok(a, 'o aluno tem encarregado com conta');
  assert.equal(a.username, 'EE9901');
  assert.equal(a.papel, 'encarregado');
  assert.equal(a.email, 'mae.teste@testes.example.pt');

  // Maior de idade: não precisa de encarregado e não é criada nenhuma conta
  assert.equal((await novo({ nome: 'Aluno Maior Teste', numero_processo: '9902', data_nascimento: '2000-05-20' })).estado, 303);
  const maior = await naEscola(1, () => db.um("SELECT encarregado_id FROM alunos WHERE numero_processo = '9902'"));
  assert.equal(maior.encarregado_id, null);
  assert.equal(await naEscola(1, () => db.um("SELECT 1 AS x FROM utilizadores WHERE username = 'EE9902'")), undefined);
});

test('email ao encarregado a cada falta nova, que ele pode desligar', async () => {
  const { aluno, aula, eeId } = await naEscola(1, async () => {
    const aluno = await db.um("SELECT * FROM alunos WHERE numero_processo = '2450'"); // educando de EE2450
    const aula = await db.um('SELECT * FROM horario WHERE turma_id = ? ORDER BY id LIMIT 1', aluno.turma_id);
    await db.executar("UPDATE encarregados SET email = 'ee2450@testes.example.pt', avisar_faltas = 1 WHERE id = ?", aluno.encarregado_id);
    return { aluno, aula, eeId: aluno.encarregado_id };
  });
  const novas = new Map([[aluno.id, ['presenca']]]);
  assert.equal(await naEscola(1, () => avisarFaltasNovas(novas, { horarioId: aula.id, data: '2025-03-03' })), 1);

  // O encarregado desliga os avisos no painel
  const ee = await entrarGestao('EE2450', 'ee123');
  const painel = await ee.get(`${ee.prefixo}/encarregado`);
  assert.match(painel.html, /Avisos de faltas por email/);
  assert.equal((await ee.post(`${ee.prefixo}/encarregado/avisos`, {})).estado, 303);
  assert.equal((await naEscola(1, () => db.um('SELECT avisar_faltas FROM encarregados WHERE id = ?', eeId))).avisar_faltas, 0);
  assert.equal(await naEscola(1, () => avisarFaltasNovas(novas, { horarioId: aula.id, data: '2025-03-03' })), 0);

  await ee.post(`${ee.prefixo}/encarregado/avisos`, { avisar: '1' });
  assert.equal((await naEscola(1, () => db.um('SELECT avisar_faltas FROM encarregados WHERE id = ?', eeId))).avisar_faltas, 1);
});

test('o aluno maior de idade justifica as suas faltas; o menor não', async () => {
  const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 atestado de teste').toString('base64')}`;
  const { maiorId, faltaMaior, faltaMenor } = await naEscola(1, async () => {
    const [maior, menor] = await db.todos("SELECT * FROM alunos WHERE numero_processo IN ('2315', '2314') ORDER BY numero_processo DESC");
    const aula = await db.um('SELECT * FROM horario WHERE turma_id = ? ORDER BY id LIMIT 1', maior.turma_id);
    await db.executar("UPDATE alunos SET data_nascimento = '2000-01-01' WHERE id = ?", maior.id);
    await db.executar(`UPDATE alunos SET data_nascimento = '${new Date().getFullYear() - 16}-01-01' WHERE id = ?`, menor.id);
    const falta = async (a) =>
      Number(
        (await db.executar("INSERT INTO faltas (aluno_id, horario_id, data, tipo) VALUES (?, ?, '2025-02-03', 'presenca')", a.id, aula.id))
          .lastInsertRowid
      );
    return { maiorId: maior.id, faltaMaior: await falta(maior), faltaMenor: await falta(menor) };
  });

  const maior = await entrarGestao('2315', 'aluno123');
  const pag = await maior.get(`${maior.prefixo}/aluno/faltas`);
  assert.match(pag.html, /é o próprio aluno que justifica/);
  await maior.post(`${maior.prefixo}/aluno/justificativos`, { ids: String(faltaMaior), motivo: 'Doença', ficheiro_dados: pdf });
  const j = await naEscola(1, () => db.um('SELECT * FROM justificativos WHERE aluno_id = ?', maiorId));
  assert.ok(j, 'o pedido ficou registado');
  assert.equal(j.estado, 'pendente');
  assert.match((await maior.get(`${maior.prefixo}/aluno/faltas`)).html, /Justificativos enviados/);
  assert.equal((await maior.get(`${maior.prefixo}/justificativos/${j.id}/ficheiro`)).estado, 200, 'abre o seu documento');

  const menor = await entrarGestao('2314', 'aluno123');
  assert.match((await menor.get(`${menor.prefixo}/aluno/faltas`)).html, /justificadas pelo seu encarregado/);
  await menor.post(`${menor.prefixo}/aluno/justificativos`, { ids: String(faltaMenor), motivo: 'Doença', ficheiro_dados: pdf });
  assert.equal(await naEscola(1, () => db.um('SELECT 1 AS x FROM justificativo_faltas WHERE falta_id = ?', faltaMenor)), undefined);
  assert.notEqual((await menor.get(`${menor.prefixo}/justificativos/${j.id}/ficheiro`)).estado, 200, 'não abre o de outro aluno');
});
