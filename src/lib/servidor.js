// Mini-framework HTTP: rotas, sessões, leitura de formulários e ficheiros estáticos.
// Usa apenas módulos nativos do Node, por isso não é preciso "npm install".
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const LIMITE_CORPO = 6 * 1024 * 1024; // 6 MB (a fotografia vem em base64 no formulário)
const DURACAO_SESSAO = 8 * 60 * 60 * 1000; // 8 horas sem atividade

// ---------- Rotas ----------
const rotas = [];

function rota(metodo, caminho, handler) {
  const nomes = [];
  const padrao = caminho.replace(/:(\w+)/g, (_, nome) => {
    nomes.push(nome);
    return nome === 'id' ? '(\\d+)' : '([^/]+)'; // ":id" só aceita números
  });
  rotas.push({ metodo, regex: new RegExp(`^${padrao}/?$`), nomes, handler });
}

const get = (caminho, handler) => rota('GET', caminho, handler);
const post = (caminho, handler) => rota('POST', caminho, handler);

// ---------- Sessões (guardadas na tabela "sessoes" da base de dados) ----------
const { executar, um } = require('../db');

function lerCookies(req) {
  const resultado = {};
  for (const parte of (req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i <= 0) continue;
    try {
      resultado[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
    } catch {
      // cookie mal formado: ignora-se
    }
  }
  return resultado;
}

// Lê a sessão indicada pelo cookie (por omissão "sid"; outra aplicação ligada à mesma base de
// dados pode usar outro nome, para não partilhar sessão com esta por acidente — mesmo domínio,
// portas diferentes, mas os cookies não distinguem a porta).
async function obterSessao(req, nomeCookie = 'sid') {
  const token = lerCookies(req)[nomeCookie];
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    const linha = await um(
      'SELECT dados FROM sessoes WHERE token = ? AND ultimo_acesso > NOW() - INTERVAL ? SECOND',
      token,
      DURACAO_SESSAO / 1000
    );
    if (linha) return { token, dados: JSON.parse(linha.dados) };
  }
  return { token: null, dados: {} };
}

// Guarda a sessão antes de enviar a resposta. Só cria uma sessão nova se houver algo para guardar.
async function guardarSessao(req, res, nomeCookie = 'sid') {
  const sessao = req.sessao;
  if (!sessao) return;
  const dados = JSON.stringify(sessao.dados);
  if (sessao.token) {
    await executar('UPDATE sessoes SET dados = ?, ultimo_acesso = NOW() WHERE token = ?', dados, sessao.token);
  } else if (dados !== '{}') {
    sessao.token = crypto.randomBytes(32).toString('hex');
    await executar('INSERT INTO sessoes (token, dados) VALUES (?, ?)', sessao.token, dados);
    res.setHeader('Set-Cookie', `${nomeCookie}=${sessao.token}; HttpOnly; SameSite=Lax; Path=/`);
  }
}

// Depois do login usa-se um identificador novo, para evitar "session fixation"
async function renovarSessao(req) {
  await terminarSessao(req);
  return req.sessao;
}

async function terminarSessao(req) {
  if (req.sessao?.token) await executar('DELETE FROM sessoes WHERE token = ?', req.sessao.token);
  req.sessao = { token: null, dados: {} };
}

// Apaga sessões expiradas de hora a hora
setInterval(() => {
  executar('DELETE FROM sessoes WHERE ultimo_acesso < NOW() - INTERVAL ? SECOND', DURACAO_SESSAO / 1000).catch((e) =>
    console.error('Erro ao limpar sessões:', e.message)
  );
}, 60 * 60 * 1000).unref();

// ---------- Corpo do pedido (formulários application/x-www-form-urlencoded) ----------
function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    req.on('data', (bloco) => {
      tamanho += bloco.length;
      if (tamanho > LIMITE_CORPO) {
        reject(Object.assign(new Error('Pedido demasiado grande'), { estado: 413 }));
        req.destroy();
        return;
      }
      partes.push(bloco);
    });
    req.on('end', () => {
      const corpo = {};
      for (const [chave, valor] of new URLSearchParams(Buffer.concat(partes).toString('utf8'))) {
        if (chave in corpo) {
          corpo[chave] = [].concat(corpo[chave], valor);
        } else {
          corpo[chave] = valor;
        }
      }
      resolve(corpo);
    });
    req.on('error', reject);
  });
}

// ---------- Ficheiros ----------
function enviarFicheiro(res, pasta, relativo, cacheSegundos = 0) {
  const completo = path.resolve(pasta, '.' + path.posix.normalize('/' + relativo));
  if (!completo.startsWith(path.resolve(pasta) + path.sep)) return false; // impede "../"
  let info;
  try {
    info = fs.statSync(completo);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;
  res.writeHead(200, {
    'Content-Type': TIPOS_MIME[path.extname(completo).toLowerCase()] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': cacheSegundos ? `private, max-age=${cacheSegundos}` : 'no-cache',
  });
  fs.createReadStream(completo).pipe(res);
  return true;
}

// ---------- Servidor ----------
function criarServidor({ pastaPublica, antesDaRota, paginaErro, nomeCookie = 'sid' }) {
  return http.createServer(async (req, res) => {
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'same-origin');

      const url = new URL(req.url, 'http://localhost');
      try {
        req.caminho = decodeURIComponent(url.pathname);
      } catch {
        return paginaErro(req, res, 400); // ex.: "%E0%A4%A" no endereço
      }
      req.query = Object.fromEntries(url.searchParams);

      // Ficheiros estáticos (CSS, JS, imagens)
      if (req.method === 'GET' && req.caminho.startsWith('/static/')) {
        if (enviarFicheiro(res, pastaPublica, req.caminho.slice('/static/'.length))) return;
        return paginaErro(req, res, 404);
      }

      req.sessao = await obterSessao(req, nomeCookie);
      req.corpo = req.method === 'POST' ? await lerCorpo(req) : {};

      // A sessão é guardada na BD antes de a resposta sair (assim o pedido seguinte já a encontra)
      const responder = (estado, cabecalhos, conteudo) =>
        guardarSessao(req, res, nomeCookie)
          .then(() => {
            res.writeHead(estado, cabecalhos);
            res.end(conteudo);
          })
          .catch((erro) => {
            console.error(erro);
            if (!res.headersSent) paginaErro(req, res, 500);
          });
      res.html = (conteudo, estado = 200) =>
        responder(estado, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, conteudo);
      res.redirecionar = (destino) => responder(303, { Location: destino });
      res.json = (objeto, estado = 200) =>
        responder(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify(objeto));
      req.flash = (tipo, mensagem) => {
        (req.sessao.dados.flash ||= []).push({ tipo, mensagem });
      };
      req.lerFlash = () => {
        const mensagens = req.sessao.dados.flash || [];
        delete req.sessao.dados.flash;
        return mensagens;
      };

      // Proteção básica contra CSRF: pedidos POST têm de vir do próprio site
      if (req.method === 'POST') {
        const origem = req.headers.origin;
        if (origem && origem !== 'null' && URL.parse(origem)?.host !== req.headers.host) {
          return paginaErro(req, res, 403);
        }
      }

      if (antesDaRota && (await antesDaRota(req, res)) === false) return;

      for (const r of rotas) {
        if (r.metodo !== req.method) continue;
        const m = r.regex.exec(req.caminho);
        if (!m) continue;
        req.params = Object.fromEntries(r.nomes.map((nome, i) => [nome, m[i + 1]]));
        return await r.handler(req, res);
      }
      paginaErro(req, res, 404);
    } catch (erro) {
      console.error(erro);
      if (!res.headersSent) paginaErro(req, res, erro.estado || 500);
      else res.end();
    }
  });
}

module.exports = { get, post, criarServidor, renovarSessao, terminarSessao, enviarFicheiro, guardarSessao };
