// InformaNege — site de vendas do software, servido como página estática.
// Propositadamente sem base de dados nem sessões: não tem contas nem áreas protegidas, só a
// página, botões que abrem a app real (Gestão Escolar / Conversas) noutra porta, e o checkout de
// pagamento (ver pagamento.js). Por isso não reutiliza src/lib/servidor.js (que exige a base de
// dados para guardar sessões) — aqui basta um servidor HTTP simples com módulos nativos do Node.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  pagina,
  pagina404,
  paginaCheckout,
  paginaInteresseRegistado,
  paginaPagamentoSucesso,
  paginaPagamentoCancelado,
  paginaErroPagamento,
} = require('./vistas');
const { pagamentoDisponivel, criarSessaoCheckout, estadoDaSessao } = require('./pagamento');

const PORTA = Number(process.env.SITE_PORT || process.env.PORT) || 3200;
const PASTA_PUBLICA = path.join(__dirname, 'publico');

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function enviarFicheiro(res, relativo) {
  const completo = path.resolve(PASTA_PUBLICA, '.' + path.posix.normalize('/' + relativo));
  if (!completo.startsWith(path.resolve(PASTA_PUBLICA) + path.sep)) return false; // impede "../"
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
    'Cache-Control': 'public, max-age=3600',
  });
  fs.createReadStream(completo).pipe(res);
  return true;
}

// GET /checkout: cria a sessão de checkout embutido no Stripe e mostra a nossa própria página,
// com o formulário do cartão desenhado pelo Stripe.js dentro dela (ver vistas.js → paginaCheckout).
// Nunca cobra nada diretamente — quem cobra é sempre o Stripe; aqui só se pede o "client secret"
// que a página vai usar para desenhar o formulário.
//
// Sem chaves da Stripe configuradas, não há sessão nenhuma para criar — mas em vez de dar 404,
// mostra a mesma página em modo de PRÉ-VISUALIZAÇÃO (clientSecret null, ver paginaCheckout), para
// se poder ver o design sem precisar de nenhuma chave nem contactar o Stripe. O botão "Subscrever"
// da página de preços continua escondido nesse caso (pagamentoDisponivel()) — só quem for direto a
// /checkout é que vê a pré-visualização.
async function tratarCheckout(res) {
  if (!pagamentoDisponivel()) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(paginaCheckout(null));
  }
  try {
    const sessao = await criarSessaoCheckout();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(paginaCheckout(sessao.client_secret));
  } catch (erro) {
    console.error('Erro ao criar sessão de pagamento Stripe:', erro.message);
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(paginaErroPagamento());
  }
}

// GET /pagamento/resultado: o Stripe.js traz o cliente de volta para aqui depois do pagamento
// (com ?sessao=... na URL — ver return_url em pagamento.js). Só mostramos "confirmado" depois de
// perguntar ao Stripe se a sessão está mesmo concluída — nunca confiamos só em o cliente ter voltado.
async function tratarResultado(res, sessaoId) {
  if (!sessaoId) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(paginaErroPagamento());
  }
  try {
    const pago = await estadoDaSessao(sessaoId);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pago ? paginaPagamentoSucesso() : paginaPagamentoCancelado());
  } catch (erro) {
    console.error('Erro ao confirmar sessão de pagamento Stripe:', erro.message);
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(paginaErroPagamento());
  }
}

const servidor = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');

  let caminho;
  try {
    caminho = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    return res.end('Pedido inválido.');
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Método não permitido.');
  }

  if (caminho.startsWith('/static/')) {
    if (enviarFicheiro(res, caminho.slice('/static/'.length))) return;
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(pagina404());
  }

  if (caminho === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(pagina());
  }

  // Botão "Subscrever agora" da página de preços: por enquanto não há pagamento automático, por
  // isso mostra-se logo o agradecimento e o email de contacto (ver vistas.js → paginaInteresseRegistado).
  if (caminho === '/subscrever') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(paginaInteresseRegistado());
  }

  // /checkout continua a existir para quando houver chaves da Stripe ligadas (ver pagamento.js) —
  // por agora não está ligado a nenhum botão da página principal, só é acedido diretamente.
  if (caminho === '/checkout') {
    return tratarCheckout(res);
  }

  if (caminho === '/pagamento/resultado') {
    const { searchParams } = new URL(req.url, 'http://localhost');
    return tratarResultado(res, searchParams.get('sessao'));
  }

  if (caminho === '/pagamento/sucesso') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(paginaPagamentoSucesso());
  }

  if (caminho === '/pagamento/cancelado') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(paginaPagamentoCancelado());
  }

  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(pagina404());
});

servidor.on('error', (erro) => {
  if (erro.code === 'EADDRINUSE') {
    console.error(`\nA porta ${PORTA} já está a ser usada. Defina SITE_PORT=outra-porta e tente de novo.\n`);
  } else {
    console.error(erro);
  }
  process.exit(1);
});

servidor.listen(PORTA, () => {
  console.log(`InformaNege a correr em http://localhost:${PORTA}`);
});
