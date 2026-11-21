// Permissões: cada papel só entra nas suas áreas, e sem sessão não se vê nada.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GESTAO, Cliente, codigoPrimeiraEscola, entrarGestao } = require('./ajuda');

test('sem sessão, as páginas internas levam para o login', async () => {
  const codigo = await codigoPrimeiraEscola();
  const c = new Cliente(GESTAO);
  for (const caminho of ['/admin', '/admin/alunos', '/professor/turmas', '/aluno', '/encarregado']) {
    const r = await c.get(`/${codigo}${caminho}`);
    assert.equal(r.estado, 303, caminho);
    assert.match(r.local, /\/login$/, caminho);
  }
});

test('palavra-passe errada não abre sessão', async () => {
  const c = await entrarGestao('1000', 'errada');
  assert.equal(c.resposta.estado, 401);
  const r = await c.get(`${c.prefixo}/admin`);
  assert.equal(r.estado, 303);
});

test('a direção entra no painel da administração', async () => {
  const c = await entrarGestao('1000', 'admin123');
  assert.equal(c.resposta.estado, 303);
  const r = await c.get(`${c.prefixo}/admin/alunos`);
  assert.equal(r.estado, 200);
});

test('um aluno não entra nas áreas da administração nem dos professores', async () => {
  const { naEscola } = require('./ajuda');
  const aluno = await naEscola(1, () => require('../src/db').um("SELECT username FROM utilizadores WHERE papel = 'aluno' ORDER BY id LIMIT 1"));
  const c = await entrarGestao(aluno.username, 'aluno123');
  assert.equal(c.resposta.estado, 303);
  assert.equal((await c.get(`${c.prefixo}/aluno`)).estado, 200);
  for (const caminho of ['/admin', '/admin/alunos', '/professor/turmas', '/encarregado']) {
    const r = await c.get(`${c.prefixo}${caminho}`);
    assert.notEqual(r.estado, 200, caminho);
  }
});

test('um professor não entra na administração', async () => {
  const c = await entrarGestao('1002', 'prof123');
  assert.equal(c.resposta.estado, 303);
  assert.equal((await c.get(`${c.prefixo}/professor/turmas`)).estado, 200);
  assert.notEqual((await c.get(`${c.prefixo}/admin/alunos`)).estado, 200);
});

test('um pedido POST vindo de outro site é recusado (CSRF)', async () => {
  const c = await entrarGestao('1000', 'admin123');
  c.origem = 'http://site-malicioso.example';
  const r = await fetch(`${GESTAO}${c.prefixo}/admin/seguranca/desligar`, {
    method: 'POST',
    headers: { Origin: 'http://site-malicioso.example', Cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
    redirect: 'manual',
  });
  assert.equal(r.status, 403);
});
