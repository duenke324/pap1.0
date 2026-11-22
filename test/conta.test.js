// "A minha conta": cada utilizador muda a sua palavra-passe.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entrarGestao } = require('./ajuda');
const db = require('../src/db');
const { MAX_FALHAS } = require('../src/lib/seguranca-login');

test('o utilizador muda a sua palavra-passe e as outras sessões terminam', async () => {
  // Um funcionário que não é usado nos outros testes, com a sessão aberta em dois "computadores"
  const c = await entrarGestao('3002', 'func123');
  const outro = await entrarGestao('3002', 'func123');
  const pag = await c.get(`${c.prefixo}/conta`);
  assert.equal(pag.estado, 200);
  assert.match(pag.html, /Mudar a palavra-passe/);
  assert.match(pag.html, /href="[^"]*\/conta"[^>]*aria-current="page"/, 'aparece no menu');

  const caminho = `${c.prefixo}/conta/password`;
  assert.equal((await c.post(caminho, { atual: 'errada', nova: 'nova-pass-1', confirmar: 'nova-pass-1' })).estado, 401);
  assert.equal((await c.post(caminho, { atual: 'func123', nova: 'nova-pass-1', confirmar: 'outra-coisa' })).estado, 422);
  assert.equal((await c.post(caminho, { atual: 'func123', nova: 'curta', confirmar: 'curta' })).estado, 422);
  assert.equal((await c.post(caminho, { atual: 'func123', nova: 'func123', confirmar: 'func123' })).estado, 422);

  assert.equal((await c.post(caminho, { atual: 'func123', nova: 'nova-pass-1', confirmar: 'nova-pass-1' })).estado, 303);
  assert.equal((await c.get(`${c.prefixo}/conta`)).estado, 200, 'esta sessão continua');
  assert.equal((await outro.get(`${outro.prefixo}/funcionario`)).estado, 303, 'a outra sessão terminou');
  assert.equal((await entrarGestao('3002', 'func123')).resposta.estado, 401, 'a antiga já não serve');
  assert.equal((await entrarGestao('3002', 'nova-pass-1')).resposta.estado, 303, 'a nova serve');
});

test(`${MAX_FALHAS} palavras-passe atuais erradas bloqueiam a conta e terminam a sessão`, async () => {
  const c = await entrarGestao('3003', 'func123');
  const caminho = `${c.prefixo}/conta/password`;
  for (let i = 1; i < MAX_FALHAS; i++) assert.equal((await c.post(caminho, { atual: 'errada', nova: 'x-123456', confirmar: 'x-123456' })).estado, 401);
  const ultima = await c.post(caminho, { atual: 'errada', nova: 'x-123456', confirmar: 'x-123456' });
  assert.equal(ultima.estado, 429);
  assert.match(ultima.html, /está bloqueada/);
  assert.equal((await c.get(`${c.prefixo}/conta`)).estado, 303, 'a sessão terminou');
  assert.equal((await entrarGestao('3003', 'func123')).resposta.estado, 429, 'nem com a certa');
  await db.plataforma.executar("DELETE FROM tentativas_login WHERE chave LIKE '%:3003'");
});

test('sem sessão não se chega à página da conta', async () => {
  const { Cliente, GESTAO, codigoPrimeiraEscola } = require('./ajuda');
  const c = new Cliente(GESTAO);
  const prefixo = `/${await codigoPrimeiraEscola()}`;
  assert.equal((await c.get(`${prefixo}/conta`)).estado, 303);
  assert.equal((await c.post(`${prefixo}/conta/password`, { atual: 'x', nova: 'y-123456', confirmar: 'y-123456' })).estado, 303);
});
