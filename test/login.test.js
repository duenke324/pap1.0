// Segurança no login: bloqueio depois de 5 palavras-passe erradas e código por email para a direção.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entrarGestao, naEscola, ultimoCodigoEnviado, esperar } = require('./ajuda');
const db = require('../src/db');
const { verificarCodigo, criarCodigo, mascararEmail, MAX_FALHAS } = require('../src/lib/seguranca-login');

test('códigos: certo, errado e esgotado', () => {
  const { codigo, pendente } = criarCodigo({});
  assert.match(codigo, /^\d{6}$/);
  const errado = codigo === '000000' ? '111111' : '000000';
  assert.equal(verificarCodigo(pendente, errado), 'errado');
  assert.equal(verificarCodigo(pendente, codigo), 'ok');
  const outro = criarCodigo({}).pendente;
  for (let i = 0; i < 4; i++) assert.equal(verificarCodigo(outro, errado), 'errado');
  assert.equal(verificarCodigo(outro, errado), 'expirado'); // 5.ª tentativa errada
  const velho = { ...criarCodigo({}).pendente, expira: Date.now() - 1 };
  assert.equal(verificarCodigo(velho, '123456'), 'expirado');
  assert.equal(mascararEmail('direcao@escola.pt'), 'di•••••@escola.pt');
});

test(`depois de ${MAX_FALHAS} palavras-passe erradas a conta fica bloqueada (até com a certa)`, async () => {
  // Um professor que não é usado nos outros testes
  for (let i = 1; i < MAX_FALHAS; i++) assert.equal((await entrarGestao('1004', 'errada')).resposta.estado, 401);
  const quinta = await entrarGestao('1004', 'errada');
  assert.match(quinta.resposta.html, /ficou bloqueada/);
  const certa = await entrarGestao('1004', 'prof123');
  assert.equal(certa.resposta.estado, 429);
  assert.match(certa.resposta.html, /está bloqueada/);
  // Desbloqueia (para não afetar os outros testes)
  await db.plataforma.executar("DELETE FROM tentativas_login WHERE chave LIKE '%:1004'");
  assert.equal((await entrarGestao('1004', 'prof123')).resposta.estado, 303);
});

test('a direção com email confirmado só entra com o código enviado por email', async () => {
  await naEscola(1, () => db.executar("UPDATE utilizadores SET email_codigo = 'direcao@testes.example.pt' WHERE username = '1000'"));
  try {
    const c = await entrarGestao('1000', 'admin123');
    assert.equal(c.resposta.estado, 303);
    assert.match(c.resposta.local, /\/login\/codigo$/);
    // Ainda sem sessão: o painel leva para o login
    assert.equal((await c.get(`${c.prefixo}/admin`)).estado, 303);

    await esperar(300); // o "email" é escrito na consola do servidor
    const codigo = ultimoCodigoEnviado();
    assert.ok(codigo, 'o código foi enviado');
    const errado = await c.post(`${c.prefixo}/login/codigo`, { codigo: codigo === '000000' ? '111111' : '000000' });
    assert.equal(errado.estado, 401);
    const certo = await c.post(`${c.prefixo}/login/codigo`, { codigo });
    assert.equal(certo.estado, 303);
    assert.equal((await c.get(`${c.prefixo}/admin/alunos`)).estado, 200);
  } finally {
    await naEscola(1, () => db.executar("UPDATE utilizadores SET email_codigo = NULL WHERE username = '1000'"));
  }
});

test('gestor da plataforma: página Conta, confirmar o email e entrar com código', async () => {
  const { Cliente, GESTAO } = require('./ajuda');
  const c = new Cliente(GESTAO);
  assert.equal((await c.post('/plataforma/login', { username: 'plataforma', password: 'plataforma123' })).estado, 303);
  // Primeira entrada: tem de trocar a palavra-passe inicial
  await c.post('/plataforma/password', { atual: 'plataforma123', nova: 'gestor-testes-1', confirmar: 'gestor-testes-1' });
  const conta = await c.get('/plataforma/conta');
  assert.equal(conta.estado, 200);
  assert.match(conta.html, /Cópias de segurança/);
  assert.match(conta.html, /Código de entrada por email/);

  // Confirmar o email: só fica guardado depois de escrever o código enviado para lá
  await c.post('/plataforma/conta/email', { email: 'gestor@testes.example.pt' });
  assert.equal((await db.plataforma.um('SELECT email FROM gestores')).email, null);
  await esperar(300);
  await c.post('/plataforma/conta/email/confirmar', { codigo: ultimoCodigoEnviado() });
  assert.equal((await db.plataforma.um('SELECT email FROM gestores')).email, 'gestor@testes.example.pt');

  // A partir de agora, entrar pede o código
  const novo = new Cliente(GESTAO);
  await novo.post('/plataforma/login', { username: 'plataforma', password: 'gestor-testes-1' });
  assert.notEqual((await novo.get('/plataforma/conta')).estado, 200);
  await esperar(300);
  assert.equal((await novo.post('/plataforma/login/codigo', { codigo: ultimoCodigoEnviado() })).estado, 303);
  assert.equal((await novo.get('/plataforma/conta')).estado, 200);
  // Descarregar uma cópia de segurança
  await novo.post('/plataforma/copias');
  const nome = /href="\/plataforma\/copias\/(copia_[^"]+)"/.exec((await novo.get('/plataforma/conta')).html)?.[1];
  assert.ok(nome, 'a cópia aparece na lista');
  const r = await novo.get(`/plataforma/copias/${nome}`);
  assert.equal(r.estado, 200);
  assert.match(r.html, /CREATE TABLE/);
});
