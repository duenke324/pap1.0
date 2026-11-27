// Versão 1.11: alunos em risco, progresso dos módulos, importar alunos de CSV, ficha do aluno em PDF e biblioteca.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entrarGestao, naEscola } = require('./ajuda');
const db = require('../src/db');
const { lerCsv, dataIso } = require('../src/rotas/importar');
const { nivelRisco } = require('../src/lib/risco');
const { estadoModulo } = require('../src/rotas/modulos');

test('CSV: separador ";" ou ",", aspas e datas dd/mm/aaaa', () => {
  assert.deepEqual(lerCsv('a;b\r\n1;"x; y"\r\n'), [['a', 'b'], ['1', 'x; y']]);
  assert.deepEqual(lerCsv('﻿a,b\n"diz ""olá""",2\n\n'), [['a', 'b'], ['diz "olá"', '2']]);
  assert.equal(dataIso('5/3/2010'), '2010-03-05');
  assert.equal(dataIso('2010-03-05'), '2010-03-05');
});

test('risco e estado dos módulos: regras simples', () => {
  assert.equal(nivelRisco(1), null);
  assert.equal(nivelRisco(2), 'medio');
  assert.equal(nivelRisco(5), 'alto');
  assert.equal(estadoModulo({ dadas: 0, horas: 20, notas: 0 }, 5), 'por_comecar');
  assert.equal(estadoModulo({ dadas: 17, horas: 20, notas: 2 }, 5), 'fim');
  assert.equal(estadoModulo({ dadas: 22, horas: 20, notas: 0 }, 5), 'passou');
  assert.equal(estadoModulo({ dadas: 22, horas: 20, notas: 5 }, 5), 'concluido');
});

test('a direção vê os alunos em risco; o professor não', async () => {
  const c = await entrarGestao('1000', 'admin123');
  const r = await c.get(`${c.prefixo}/admin/risco`);
  assert.equal(r.estado, 200);
  assert.match(r.html, /Alunos em risco/);
  assert.match(r.html, /Risco (alto|médio)/, 'os dados de demonstração têm alunos em risco');
  assert.match((await c.get(`${c.prefixo}/admin`)).html, /Alunos em risco alto/);
  const p = await entrarGestao('1001', 'prof123');
  assert.equal((await p.get(`${p.prefixo}/admin/risco`)).estado, 403);
});

test('o professor vê o progresso dos módulos das suas turmas', async () => {
  const p = await entrarGestao('1001', 'prof123');
  const r = await p.get(`${p.prefixo}/professor/modulos`);
  assert.equal(r.estado, 200);
  assert.match(r.html, /Progresso dos módulos/);
  assert.match(r.html, /h dadas/);
});

test('importar alunos de um CSV: verifica, recusa as linhas erradas e cria as certas', async () => {
  const c = await entrarGestao('1000', 'admin123');
  const turma = await naEscola(1, () => db.um('SELECT nome FROM turmas ORDER BY id LIMIT 1'));
  const menor = `${new Date().getFullYear() - 15}`;
  const csv = [
    'N.º de processo;Nome;Data de nascimento;Turma;Encarregado;Email do encarregado',
    `8801;Inês Importada Costa;10/02/${menor};${turma.nome};Rita Costa;rita.costa@testes.example.pt`,
    `8802;Bruno Maior Lopes;01/01/2000;${turma.nome};;`,
    `8803;Sem Encarregado;01/01/${menor};;;`,
    `8801;Repetido;01/01/2000;;;`,
    `8804;Turma Que Não Existe;01/01/2000;99.º ZZZ;;`,
  ].join('\r\n');

  const ver = await c.post(`${c.prefixo}/admin/alunos/importar`, { acao: 'verificar', csv });
  assert.equal(ver.estado, 200);
  assert.match(ver.html, /2 aluno\(s\) prontos a importar · 3 com erros/);
  assert.match(ver.html, /N\.º de processo repetido/);
  assert.match(ver.html, /não existe/);
  assert.equal(await naEscola(1, () => db.um("SELECT 1 AS x FROM alunos WHERE numero_processo = '8801'")), undefined, 'verificar não cria nada');

  const imp = await c.post(`${c.prefixo}/admin/alunos/importar`, { acao: 'importar', csv });
  assert.equal(imp.estado, 200);
  assert.match(imp.html, /2 aluno\(s\) importado\(s\) e 1 conta\(s\) de encarregado/);
  assert.match(imp.html, /href="data:application\/pdf;base64,/);
  const criados = await naEscola(1, () =>
    db.todos(
      `SELECT a.numero_processo, a.email, u.deve_redefinir_password, e.email AS ee_email
         FROM alunos a JOIN utilizadores u ON u.id = a.utilizador_id LEFT JOIN encarregados e ON e.id = a.encarregado_id
        WHERE a.numero_processo IN ('8801', '8802', '8803', '8804') ORDER BY a.numero_processo`
    )
  );
  assert.deepEqual(criados.map((a) => a.numero_processo), ['8801', '8802']);
  assert.equal(criados[0].ee_email, 'rita.costa@testes.example.pt');
  assert.equal(criados[1].ee_email, null, 'maior de idade: sem encarregado');
  assert.ok(criados.every((a) => a.deve_redefinir_password === 1));

  // Importar outra vez o mesmo ficheiro: já existem, nenhuma linha certa
  assert.equal((await c.post(`${c.prefixo}/admin/alunos/importar`, { acao: 'importar', csv })).estado, 422);
});

test('ficha do aluno em PDF: a direção, a secretaria e o próprio aluno', async () => {
  const id = (await naEscola(1, () => db.um("SELECT id FROM alunos WHERE numero_processo = '2310'"))).id;
  const ehPdf = (r) => r.estado === 200 && r.html.startsWith('%PDF-1.4') && r.html.includes('%%EOF');

  const admin = await entrarGestao('1000', 'admin123');
  assert.ok(ehPdf(await admin.get(`${admin.prefixo}/admin/alunos/${id}/ficha.pdf`)));
  const secretaria = await entrarGestao('3005', 'func123');
  assert.ok(ehPdf(await secretaria.get(`${secretaria.prefixo}/funcionario/alunos/${id}/ficha.pdf`)));
  const aluno = await entrarGestao('2310', 'aluno123');
  assert.ok(ehPdf(await aluno.get(`${aluno.prefixo}/aluno/ficha.pdf`)));

  // Outro cargo (biblioteca) não tira fichas
  const biblioteca = await entrarGestao('3004', 'func123');
  assert.equal((await biblioteca.get(`${biblioteca.prefixo}/funcionario/alunos/${id}/ficha.pdf`)).estado, 403);
});

test('biblioteca: empréstimo, sem exemplares a mais, devolução; o aluno vê os seus livros', async () => {
  const b = await entrarGestao('3004', 'func123');
  assert.match((await b.get(`${b.prefixo}/funcionario/biblioteca`)).html, /Novo empréstimo/);
  await b.post(`${b.prefixo}/funcionario/livros`, { titulo: 'Livro de Teste Único', autor: 'Autor Teste', exemplares: '1' });
  const livro = await naEscola(1, () => db.um("SELECT id FROM livros WHERE titulo = 'Livro de Teste Único'"));
  assert.ok(livro);
  const prazo = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

  assert.equal((await b.post(`${b.prefixo}/funcionario/biblioteca`, { leitor: '2452', livro: String(livro.id), prazo })).estado, 303);
  const emprestimo = await naEscola(1, () => db.um('SELECT * FROM emprestimos WHERE livro_id = ? AND devolvido_em IS NULL', livro.id));
  assert.ok(emprestimo, 'o empréstimo ficou registado');
  // Só havia um exemplar
  await b.post(`${b.prefixo}/funcionario/biblioteca`, { leitor: '2453', livro: String(livro.id), prazo });
  assert.equal((await naEscola(1, () => db.um('SELECT COUNT(*) AS n FROM emprestimos WHERE livro_id = ?', livro.id))).n, 1);
  // Leitor que não existe
  await b.post(`${b.prefixo}/funcionario/biblioteca`, { leitor: 'NAOEXISTE', livro: String(livro.id), prazo });

  const aluno = await entrarGestao('2452', 'aluno123');
  assert.match((await aluno.get(`${aluno.prefixo}/aluno`)).html, /Livro de Teste Único/);

  await b.post(`${b.prefixo}/funcionario/biblioteca/${emprestimo.id}/devolver`);
  assert.ok((await naEscola(1, () => db.um('SELECT devolvido_em FROM emprestimos WHERE id = ?', emprestimo.id))).devolvido_em);
  assert.doesNotMatch((await aluno.get(`${aluno.prefixo}/aluno`)).html, /Livro de Teste Único/);

  // Um livro já emprestado não se apaga (histórico)
  await b.post(`${b.prefixo}/funcionario/livros/${livro.id}/apagar`);
  assert.ok(await naEscola(1, () => db.um('SELECT 1 AS x FROM livros WHERE id = ?', livro.id)));

  // Só o cargo "biblioteca" entra; o aluno também não
  const secretaria = await entrarGestao('3005', 'func123');
  assert.equal((await secretaria.get(`${secretaria.prefixo}/funcionario/biblioteca`)).estado, 403);
  assert.equal((await aluno.get(`${aluno.prefixo}/funcionario/biblioteca`)).estado, 403);
});
