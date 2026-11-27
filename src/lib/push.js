// Notificações no telemóvel/computador (Web Push), sem bibliotecas: só com o módulo crypto do Node.
//
// Como funciona:
//  1. O browser (com a app instalada ou só aberta) pede autorização e cria uma "subscrição" no serviço
//     de notificações do fabricante (Google, Mozilla, Apple, Microsoft). A subscrição é um endereço
//     (endpoint) e duas chaves do browser (p256dh e auth). Guardamos isso na tabela notificacoes_push.
//  2. Para notificar alguém, o servidor encripta a mensagem com as chaves do browser (RFC 8291,
//     "aes128gcm") — o serviço do fabricante entrega-a mas não a consegue ler — e assina o pedido com a
//     chave VAPID da instalação (RFC 8292), para o serviço saber que vem sempre do mesmo servidor.
//  3. O service worker (public/sw.js) recebe a mensagem e mostra a notificação; ao tocar nela, abre a
//     página indicada.
//
// O par de chaves VAPID é criado na primeira vez e fica na tabela push_chaves (é o mesmo para as duas
// aplicações, Gestão Escolar e Conversas, e para todas as escolas da instalação).
// Nada disto impede o resto da aplicação: notificar() nunca lança erro.
const crypto = require('node:crypto');
const { todos, executar, plataforma } = require('../db');
const { ligacaoDaEscola } = require('./email');
const { escolaAtual } = require('./contexto');

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const deB64url = (texto) => Buffer.from(String(texto || ''), 'base64url');

// ---------- Chaves VAPID ----------
let chaves = null;
async function chavesVapid() {
  if (chaves) return chaves;
  let linha = await plataforma.um('SELECT publica, privada FROM push_chaves WHERE id = 1');
  if (!linha) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    const publica = b64url(Buffer.concat([Buffer.from([4]), deB64url(jwk.x), deB64url(jwk.y)]));
    const privada = JSON.stringify(privateKey.export({ format: 'jwk' }));
    // (se a outra aplicação criou as chaves ao mesmo tempo, fica a dela: INSERT IGNORE e voltar a ler)
    await plataforma.executar('INSERT IGNORE INTO push_chaves (id, publica, privada) VALUES (1, ?, ?)', publica, privada);
    linha = await plataforma.um('SELECT publica, privada FROM push_chaves WHERE id = 1');
  }
  chaves = { publica: linha.publica, privada: crypto.createPrivateKey({ key: JSON.parse(linha.privada), format: 'jwk' }) };
  return chaves;
}

// Assinatura VAPID: um JWT (ES256) com o "dono" do endpoint, a validade e um contacto
async function cabecalhoVapid(endpoint) {
  const { publica, privada } = await chavesVapid();
  const cabecalho = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const contacto = process.env.PUSH_CONTACTO || `mailto:secretaria@${escolaAtual().dominio_email || 'localhost'}`;
  const corpo = b64url(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contacto }));
  const assinatura = crypto.sign('sha256', Buffer.from(`${cabecalho}.${corpo}`), { key: privada, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${cabecalho}.${corpo}.${b64url(assinatura)}, k=${publica}`;
}

// ---------- Encriptação da mensagem (RFC 8291 / RFC 8188, aes128gcm) ----------
function encriptar(texto, p256dh, auth) {
  const chaveBrowser = deB64url(p256dh); // 65 bytes (ponto não comprimido)
  const segredoBrowser = deB64url(auth); // 16 bytes
  if (chaveBrowser.length !== 65 || segredoBrowser.length !== 16) throw new Error('Chaves da subscrição inválidas.');

  const efemera = crypto.createECDH('prime256v1');
  const chaveServidor = efemera.generateKeys(); // 65 bytes
  const segredoComum = efemera.computeSecret(chaveBrowser);

  const infoChave = Buffer.concat([Buffer.from('WebPush: info\0'), chaveBrowser, chaveServidor]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', segredoComum, segredoBrowser, infoChave, 32));
  const sal = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));

  const cifra = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02 = delimitador do último (e único) registo
  const cifrado = Buffer.concat([cifra.update(Buffer.concat([Buffer.from(texto, 'utf8'), Buffer.from([2])])), cifra.final(), cifra.getAuthTag()]);

  const tamanhoRegisto = Buffer.alloc(4);
  tamanhoRegisto.writeUInt32BE(4096);
  return Buffer.concat([sal, tamanhoRegisto, Buffer.from([chaveServidor.length]), chaveServidor, cifrado]);
}

// ---------- Endereços aceites ----------
// Só se enviam pedidos para os serviços de notificações conhecidos (e sempre em https): assim ninguém
// pode registar uma "subscrição" que faça o servidor enviar pedidos para outro sítio (ex.: a rede interna).
const SERVICOS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.apple.com'];

function endpointValido(endpoint) {
  let url;
  try {
    url = new URL(String(endpoint || ''));
  } catch {
    return false;
  }
  if (String(endpoint).length > 1000) return false;
  // (só nos testes automáticos: um servidor local faz de serviço de notificações)
  if (process.env.PUSH_PERMITIR_LOCAL === '1' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return true;
  return url.protocol === 'https:' && SERVICOS.some((s) => url.hostname === s || url.hostname.endsWith(`.${s}`));
}

// ---------- Subscrições ----------
const hashEndpoint = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex');

async function guardarSubscricao(utilizadorId, { endpoint, p256dh, auth }) {
  if (!endpointValido(endpoint)) return false;
  if (deB64url(p256dh).length !== 65 || deB64url(auth).length !== 16) return false;
  await executar(
    `INSERT INTO notificacoes_push (utilizador_id, endpoint_hash, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE utilizador_id = VALUES(utilizador_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    utilizadorId,
    hashEndpoint(endpoint),
    endpoint,
    p256dh,
    auth
  );
  return true;
}

async function apagarSubscricao(utilizadorId, endpoint) {
  const r = await executar('DELETE FROM notificacoes_push WHERE utilizador_id = ? AND endpoint_hash = ?', utilizadorId, hashEndpoint(String(endpoint || '')));
  return r.changes > 0;
}

async function contarSubscricoes(utilizadorId) {
  return Number((await todos('SELECT COUNT(*) AS n FROM notificacoes_push WHERE utilizador_id = ?', utilizadorId))[0].n);
}

// ---------- Enviar ----------
async function enviarUma(sub, mensagem) {
  const corpo = encriptar(JSON.stringify(mensagem), sub.p256dh, sub.auth);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await cabecalhoVapid(sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(24 * 3600), // o serviço guarda a mensagem até 1 dia se o aparelho estiver desligado
      Urgency: 'normal',
    },
    body: corpo,
    signal: AbortSignal.timeout(10000),
  });
  // 404/410: a subscrição já não existe (a pessoa desligou as notificações ou desinstalou a app)
  if (r.status === 404 || r.status === 410) await executar('DELETE FROM notificacoes_push WHERE id = ?', sub.id);
  return r.ok;
}

// Notifica as contas indicadas (ids de utilizadores) em todos os aparelhos que ativaram as notificações.
// url: página a abrir ao tocar ("/aluno/faltas", relativa à escola) ou um endereço completo.
// Devolve quantas notificações o serviço aceitou. Nunca lança erro.
async function notificar(utilizadorIds, { titulo, corpo, url = '/' }) {
  const ids = [...new Set([].concat(utilizadorIds).filter(Boolean).map(Number))];
  if (!ids.length) return 0;
  try {
    const subs = await todos('SELECT * FROM notificacoes_push WHERE utilizador_id IN (?)', ids);
    if (!subs.length) return 0;
    const mensagem = {
      titulo: String(titulo).slice(0, 120),
      corpo: String(corpo || '').slice(0, 300),
      url: /^https?:\/\//.test(url) ? url : ligacaoDaEscola(url),
      escola: escolaAtual().nome,
    };
    const resultados = await Promise.allSettled(subs.map((s) => enviarUma(s, mensagem)));
    for (const r of resultados) if (r.status === 'rejected') console.error('Falha numa notificação:', r.reason?.message);
    return resultados.filter((r) => r.status === 'fulfilled' && r.value).length;
  } catch (erro) {
    console.error('Falha nas notificações:', erro.message);
    return 0;
  }
}

module.exports = { chavesVapid, encriptar, endpointValido, guardarSubscricao, apagarSubscricao, contarSubscricoes, notificar };
