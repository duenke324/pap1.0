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
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
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
const { executar, um, plataforma } = require('../db');
const { correrNoContexto, contextoAtual } = require('./contexto');

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
// (o nome do cookie, se não for indicado, é o do contexto do pedido — ver lib/contexto.js)
async function guardarSessao(req, res, nomeCookie = contextoAtual()?.nomeCookie || 'sid') {
  const sessao = req.sessao;
  if (!sessao) return;
  const dados = JSON.stringify(sessao.dados);
  if (sessao.token) {
    await executar('UPDATE sessoes SET dados = ?, ultimo_acesso = NOW() WHERE token = ?', dados, sessao.token);
  } else if (dados !== '{}') {
    sessao.token = crypto.randomBytes(32).toString('hex');
    await executar('INSERT INTO sessoes (token, dados) VALUES (?, ?)', sessao.token, dados);
    acrescentarCookie(res, `${nomeCookie}=${sessao.token}; HttpOnly; SameSite=Lax; Path=/`);
  }
}

// Junta um cookie aos que a resposta já leva (res.setHeader sozinho substituía os anteriores)
function acrescentarCookie(res, cookie) {
  const atuais = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', atuais ? [].concat(atuais, cookie) : cookie);
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

// Apaga sessões expiradas de hora a hora, de todas as escolas e da plataforma de uma vez
// (na tabela "a sério", tb_sessoes; a vista sessoes só mostraria as de uma escola)
setInterval(async () => {
  try {
    await plataforma.executar('DELETE FROM tb_sessoes WHERE ultimo_acesso < NOW() - INTERVAL ? SECOND', DURACAO_SESSAO / 1000);
  } catch (e) {
    console.error('Erro ao limpar sessões:', e.message);
  }
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

// ---------- Endereços com o código da escola (/epmontijo/aluno, /epmontijo/admin, …) ----------
// As rotas e as páginas continuam escritas sem escola ("/aluno", href="/admin/faltas"): o resolverContexto
// tira o código da escola do início do endereço antes de procurar a rota, e aqui volta-se a pô-lo em
// tudo o que sai para o browser — nos links, formulários, imagens e atributos data-* das páginas HTML e
// nos redirecionamentos. Assim cada escola tem os seus endereços sem ser preciso mudar centenas de links.
// Ficam de fora os endereços que não são de nenhuma escola.
// (o manifest.webmanifest leva o código, para cada escola se instalar como uma app própria, com o nome dela)
const SEM_PREFIXO = ['static/', 'escolas', 'plataforma', 'sw.js', 'offline.html'];

function prefixarCaminho(caminho, prefixo) {
  if (typeof caminho !== 'string' || !caminho.startsWith('/') || caminho.startsWith('//')) return caminho;
  const resto = caminho.slice(1);
  if (resto === prefixo || resto.startsWith(`${prefixo}/`) || resto.startsWith(`${prefixo}?`)) return caminho;
  if (SEM_PREFIXO.some((s) => resto === s || resto.startsWith(s.endsWith('/') ? s : `${s}/`) || resto.startsWith(`${s}?`))) return caminho;
  return `/${prefixo}${caminho}`;
}

function prefixarHtml(html, prefixo) {
  return html.replace(/(\s(?:href|action|src|formaction|data-[\w-]+)=")(\/[^"]*)"/g, (_, antes, caminho) => `${antes}${prefixarCaminho(caminho, prefixo)}"`);
}

function acrescentarPrefixo(res, prefixo) {
  let html = false;
  const writeHead = res.writeHead.bind(res);
  res.writeHead = (estado, ...resto) => {
    const cabecalhos = resto.find((r) => r && typeof r === 'object');
    if (cabecalhos) {
      for (const nome of Object.keys(cabecalhos)) {
        if (nome.toLowerCase() === 'location') cabecalhos[nome] = prefixarCaminho(cabecalhos[nome], prefixo);
        if (nome.toLowerCase() === 'content-type') html = String(cabecalhos[nome]).includes('text/html');
      }
    }
    if (!html) html = String(res.getHeader('Content-Type') || '').includes('text/html');
    return writeHead(estado, ...resto);
  };
  const end = res.end.bind(res);
  res.end = (conteudo, ...resto) => {
    if (conteudo && typeof conteudo !== 'function' && (html || String(res.getHeader('Content-Type') || '').includes('text/html'))) {
      conteudo = prefixarHtml(Buffer.isBuffer(conteudo) ? conteudo.toString('utf8') : String(conteudo), prefixo);
    }
    return end(conteudo, ...resto);
  };
}

// ---------- Servidor ----------
function criarServidor({ pastaPublica, antesDaRota, paginaErro, nomeCookie = 'sid', resolverContexto }) {
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

      // A que escola (base de dados) pertence este pedido. Tudo o que vem a seguir corre "dentro"
      // desse contexto, por isso as consultas vão sozinhas para a base de dados certa.
      // resolverContexto devolve false quando já respondeu (ex.: mandou escolher a escola).
      const ctx = resolverContexto ? await resolverContexto(req, res) : null;
      if (ctx === false) return;
      if (ctx?.prefixo) acrescentarPrefixo(res, ctx.prefixo);
      const cookie = ctx?.nomeCookie || nomeCookie;
      const tratar = () => tratarPedido(req, res, { antesDaRota, paginaErro, cookie });
      return ctx ? await correrNoContexto(ctx, tratar) : await tratar();
    } catch (erro) {
      console.error(erro);
      if (!res.headersSent) paginaErro(req, res, erro.estado || 500);
      else res.end();
    }
  });
}

async function tratarPedido(req, res, { antesDaRota, paginaErro, cookie }) {
    try {
      req.sessao = await obterSessao(req, cookie);
      req.corpo = req.method === 'POST' ? await lerCorpo(req) : {};

      // A sessão é guardada na BD antes de a resposta sair (assim o pedido seguinte já a encontra)
      // (o cookie é o do contexto no momento de responder: o login da Conversas pelo /login geral
      // entra a meio do pedido numa escola, e a sessão tem de ficar com o cookie dessa escola)
      const responder = (estado, cabecalhos, conteudo) =>
        guardarSessao(req, res, contextoAtual()?.nomeCookie || cookie)
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
      // Página de erro a partir de uma rota (ex.: res.erro(404) quando o registo pedido não existe)
      res.erro = (estado) => paginaErro(req, res, estado);
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
}

module.exports = {
  get,
  post,
  criarServidor,
  renovarSessao,
  terminarSessao,
  enviarFicheiro,
  guardarSessao,
  lerCookies,
  acrescentarCookie,
  prefixarCaminho,
};
