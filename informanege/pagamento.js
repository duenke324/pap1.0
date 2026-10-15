// Pagamento (Stripe) — subscrição mensal do InformaNege, com checkout embutido na própria página
// (Stripe Embedded Checkout): ao contrário do checkout alojado, o cliente nunca sai do site — só os
// campos do cartão em si é que ficam dentro de um iframe do Stripe (obrigatório por segurança/PCI;
// os números do cartão nunca passam pelo nosso servidor nem pelo nosso código).
//
// As chaves vêm SEMPRE de variáveis de ambiente, nunca do código nem de um ficheiro dentro do
// projeto: STRIPE_SECRET_KEY=sk_... STRIPE_PUBLISHABLE_KEY=pk_... npm run informanege (tal como
// DB_PORT ou GESTAO_URL já funcionam neste projeto). Sem as duas, pagamentoDisponivel() devolve
// false e a página mostra "contacte-nos" em vez de um botão de subscrição — nunca tenta cobrar sem
// chaves válidas. A chave secreta nunca é enviada ao browser; só a chave publicável (pk_...) é que
// vai para a página — é feita para isso, não é um segredo.
//
// Usa o pacote oficial "stripe" em vez de chamar a API HTTP à mão: é a única dependência nova
// deste projeto, e é uma exceção deliberada — para dinheiro a sério, a fiabilidade da biblioteca
// oficial pesa mais do que manter zero dependências.
const Stripe = require('stripe');

const PRECO_CENTIMOS = 15000; // 150,00 €
const MOEDA = 'eur';
const URL_SITE = (process.env.SITE_URL || `http://localhost:${process.env.SITE_PORT || process.env.PORT || 3200}`).replace(/\/$/, '');

const chaveSecreta = process.env.STRIPE_SECRET_KEY || '';
const chavePublicavel = process.env.STRIPE_PUBLISHABLE_KEY || '';
const stripe = chaveSecreta ? new Stripe(chaveSecreta) : null;

// Só mostra o botão de subscrever se houver as duas chaves: a secreta (para criar a sessão no
// servidor) e a publicável (para o Stripe.js, no browser, desenhar os campos do cartão).
function pagamentoDisponivel() {
  return Boolean(stripe && chavePublicavel);
}

function chavePublicavelAtual() {
  return chavePublicavel;
}

// Cria a sessão de checkout embutido e devolve o "client secret" que a página usa para a desenhar
// (ver vistas.js → paginaCheckout). O preço é definido aqui (price_data inline) — não é preciso
// criar nada antes no painel do Stripe, por isso há sempre uma única fonte de verdade para o valor
// cobrado. return_url é para onde o Stripe.js redireciona depois do pagamento (ver app.js → /pagamento/resultado).
async function criarSessaoCheckout() {
  if (!stripe) throw new Error('STRIPE_SECRET_KEY não está definida — pagamento indisponível.');
  return stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    mode: 'subscription',
    line_items: [
      {
        price_data: {
          currency: MOEDA,
          unit_amount: PRECO_CENTIMOS,
          recurring: { interval: 'month' },
          product_data: {
            name: 'InformaNege — Sistema de Gestão Escolar',
            description: 'Subscrição mensal, para uma escola. Sem limite de alunos ou de turmas.',
          },
        },
        quantity: 1,
      },
    ],
    return_url: `${URL_SITE}/pagamento/resultado?sessao={CHECKOUT_SESSION_ID}`,
  });
}

// Chamado depois de o Stripe.js devolver o cliente ao site (ver /pagamento/resultado em app.js).
// O checkout embutido só tem um return_url (não há success_url/cancel_url separados como no checkout
// alojado), por isso é aqui que se descobre se o pagamento foi mesmo concluído.
async function estadoDaSessao(sessaoId) {
  if (!stripe) throw new Error('STRIPE_SECRET_KEY não está definida — pagamento indisponível.');
  const sessao = await stripe.checkout.sessions.retrieve(sessaoId);
  return sessao.status === 'complete';
}

module.exports = { pagamentoDisponivel, chavePublicavelAtual, criarSessaoCheckout, estadoDaSessao, PRECO_CENTIMOS, MOEDA };
