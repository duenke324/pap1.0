// Notificações push: um "browser" falso (chaves ECDH próprias) subscreve, um servidor local faz de
// serviço de notificações, e o teste decifra a mensagem recebida (RFC 8291) e confirma a assinatura VAPID.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { entrarGestao, naEscola } = require('./ajuda');
const db = require('../src/db');
const { endpointValido } = require('../src/lib/push');

// Serviço de notificações falso: guarda os pedidos recebidos
const recebidos = [];
const servico = http.createServer((req, res) => {
  const partes = [];
  req.on('data', (d) => partes.push(d));
  req.on('end', () => {
    recebidos.push({ caminho: req.url, cabecalhos: req.headers, corpo: Buffer.concat(partes) });
    res.writeHead(201).end();
  });
});
const pronto = new Promise((ok) => servico.listen(0, '127.0.0.1', ok));
after(() => servico.close());

// O lado do browser: decifrar com a chave privada e o segredo "auth" da subscrição
function decifrar(corpo, browser, auth) {
  const sal = corpo.subarray(0, 16);
  const tamanhoChave = corpo[20];
  const chaveServidor = corpo.subarray(21, 21 + tamanhoChave);
  const cifrado = corpo.subarray(21 + tamanhoChave);
  const segredo = browser.computeSecret(chaveServidor);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), browser.getPublicKey(), chaveServidor]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', segredo, auth, info, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(cifrado.subarray(-16));
  const texto = Buffer.concat([d.update(cifrado.subarray(0, -16)), d.final()]);
  assert.equal(texto[texto.length - 1], 2, 'delimitador do último registo');
  return JSON.parse(texto.subarray(0, -1).toString('utf8'));
}

// Confirma a assinatura VAPID (JWT ES256) com a chave pública que o servidor dá ao browser
function verificarVapid(cabecalho, chavePublica) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(cabecalho);
  assert.ok(m, 'cabeçalho Authorization VAPID');
  assert.equal(m[2], chavePublica);
  const [c, p, a] = m[1].split('.');
  const ponto = Buffer.from(chavePublica, 'base64url');
  const chave = crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: ponto.subarray(1, 33).toString('base64url'), y: ponto.subarray(33).toString('base64url') },
    format: 'jwk',
  });
  assert.ok(crypto.verify('sha256', Buffer.from(`${c}.${p}`), { key: chave, dsaEncoding: 'ieee-p1363' }, Buffer.from(a, 'base64url')));
  return JSON.parse(Buffer.from(p, 'base64url').toString());
}

test('só se aceitam endereços dos serviços de notificações conhecidos', () => {
  assert.equal(endpointValido('https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(endpointValido('https://updates.push.services.mozilla.com/wpush/v2/abc'), true);
  assert.equal(endpointValido('https://web.push.apple.com/abc'), true);
  assert.equal(endpointValido('http://fcm.googleapis.com/x'), false, 'sem https');
  assert.equal(endpointValido('https://exemplo.pt/x'), false);
  assert.equal(endpointValido('https://fcm.googleapis.com.exemplo.pt/x'), false);
  assert.equal(endpointValido('https://192.168.1.10/x'), false);
});

test('o aluno ativa as notificações e recebe a falta marcada, encriptada e assinada', async () => {
  await pronto;
  const endpoint = `http://127.0.0.1:${servico.address().port}/push/aluno-2450`;
  const browser = crypto.createECDH('prime256v1');
  browser.generateKeys();
  const auth = crypto.randomBytes(16);

  const aluno = await entrarGestao('2450', 'aluno123');
  const { chave } = JSON.parse((await aluno.get(`${aluno.prefixo}/notificacoes/chave`)).html);
  assert.equal(Buffer.from(chave, 'base64url').length, 65);
  const r = await aluno.post(`${aluno.prefixo}/notificacoes/subscrever`, {
    endpoint,
    p256dh: browser.getPublicKey().toString('base64url'),
    auth: auth.toString('base64url'),
  });
  assert.equal(r.estado, 200);
  assert.match((await aluno.get(`${aluno.prefixo}/conta`)).html, /Ligadas em 1 aparelho/);
  // Um endereço que não é de um serviço de notificações é recusado
  assert.equal((await aluno.post(`${aluno.prefixo}/notificacoes/subscrever`, { endpoint: 'https://exemplo.pt/x', p256dh: 'x', auth: 'y' })).estado, 422);

  // O professor marca uma falta a este aluno numa aula
  const { horario, data } = await naEscola(1, async () => {
    const a = await db.um("SELECT * FROM alunos WHERE numero_processo = '2450'");
    const hr = await db.um('SELECT hr.*, u.username FROM horario hr JOIN professores p ON p.id = hr.professor_id JOIN utilizadores u ON u.id = p.utilizador_id WHERE hr.turma_id = ? AND hr.ativo = 1 ORDER BY hr.id LIMIT 1', a.turma_id);
    const l = await db.um('SELECT data FROM licoes WHERE horario_id = ? ORDER BY data DESC LIMIT 1', hr.id);
    return { horario: hr, data: l.data, aluno: a };
  });
  const prof = await entrarGestao(horario.username, 'prof123');
  const alunoId = (await naEscola(1, () => db.um("SELECT id FROM alunos WHERE numero_processo = '2450'"))).id;
  const antes = recebidos.length;
  const guardar = await prof.post(`${prof.prefixo}/professor/aula`, {
    turma: String(horario.turma_id),
    aula: String(horario.id),
    data,
    sumario: 'Aula de teste das notificações',
    falta: `${alunoId}:material`,
  });
  assert.equal(guardar.estado, 303);
  const novos = recebidos.slice(antes).filter((x) => x.caminho === '/push/aluno-2450');
  assert.ok(novos.length >= 1, 'o serviço recebeu a notificação');

  const pedido = novos[0];
  assert.equal(pedido.cabecalhos['content-encoding'], 'aes128gcm');
  const jwt = verificarVapid(pedido.cabecalhos.authorization, chave);
  assert.equal(jwt.aud, `http://127.0.0.1:${servico.address().port}`);
  const mensagem = decifrar(pedido.corpo, browser, auth);
  assert.equal(mensagem.titulo, 'Falta registada');
  assert.match(mensagem.corpo, /material/);
  assert.match(mensagem.url, /\/aluno\/faltas$/);

  // Desligar: a subscrição desaparece
  assert.equal((await aluno.post(`${aluno.prefixo}/notificacoes/cancelar`, { endpoint })).estado, 200);
  assert.match((await aluno.get(`${aluno.prefixo}/conta`)).html, /Desligadas neste aparelho/);
});
