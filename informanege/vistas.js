// InformaNege — página de vendas do software. Sem base de dados, sem sessões: só a página e
// ligações que abrem a app real (Gestão Escolar / Conversas) a correr nas suas próprias portas.
// O botão de demonstração não é um mockup — é o produto real, por isso não há nada para manter
// sincronizado: quando o painel mudar, a demonstração mostra sempre a versão atual automaticamente.
// As capturas de ecrã são do software real — ver publico/capturas/.
//
// URL_GESTAO / URL_CONVERSAS apontam para localhost por omissão (ambiente de desenvolvimento).
// Numa instalação real, definir as variáveis de ambiente GESTAO_URL / CONVERSAS_URL com o
// endereço público da escola (https://...) — não é preciso mexer no código.
const URL_GESTAO = process.env.GESTAO_URL || 'http://localhost:3000/';
const URL_CONVERSAS = process.env.CONVERSAS_URL || 'http://localhost:3100/';
const EMAIL_CONTACTO = 'henriquesimoes2345@gmail.com';
const URL_CONTACTO = `mailto:${EMAIL_CONTACTO}?subject=${encodeURIComponent('Contacto — InformaNege')}`;
// Mailto próprio do botão "Subscrever": assunto e corpo já preenchidos, para chegar separado dos
// contactos gerais e já identificado como um pedido de subscrição.
const URL_SUBSCREVER = `mailto:${EMAIL_CONTACTO}?subject=${encodeURIComponent('Subscrição — InformaNege')}&body=${encodeURIComponent(
  'Olá! Quero subscrever o InformaNege para a minha escola.\n\nNome da escola:\nNúmero aproximado de alunos:\n'
)}`;

const { chavePublicavelAtual, PRECO_CENTIMOS } = require('./pagamento');
const PRECO_EUROS = (PRECO_CENTIMOS / 100).toFixed(0);

const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/><path d="M22 10v6.5"/></svg>';
const ICONE_CADEADO = '<svg class="icone" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

function h(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function figuraCaptura(src, legenda) {
  return `<figure>
    <img src="${src}" alt="Captura de ecrã real: ${h(legenda)}" loading="lazy">
    <figcaption>${legenda}</figcaption>
  </figure>`;
}

function pagina() {
  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>InformaNege — Sistema de Gestão Escolar</title>
  <meta name="description" content="Sistema de gestão escolar — alunos, professores, turmas, faltas e avaliações, construído por um aluno como projeto final de curso.">
  <meta name="color-scheme" content="light dark">
  <link rel="stylesheet" href="/static/estilo.css">
  <link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body>
  <div class="masthead">
    <div class="masthead-interior">
      <a href="/" class="marca">${LOGO}<strong>InformaNege</strong></a>
      <h1>Sistema de Gestão Escolar</h1>
      <p class="definicao">Alunos, professores, turmas, horários, faltas, sumários e avaliações — tudo num só sistema, em português.</p>
      <p><a class="botao-claro" href="${URL_GESTAO}" target="_blank" rel="noopener">Ver demonstração ao vivo →</a></p>
    </div>
  </div>

  <main class="pagina">
    <article>
      <blockquote class="destaque">Construí isto de raiz, sem frameworks pesados, como projeto final do curso
      de Técnico de Gestão e Programação de Sistemas Informáticos.</blockquote>

      <p>Não são capturas de ecrã nem um protótipo — a demonstração acima é o software real a correr, com
      dados fictícios, para experimentar sem compromisso.</p>

      <figure class="figura-grande">
        <img src="/static/capturas/admin.jpg" alt="Captura de ecrã real: Painel do Administrador" loading="lazy">
        <figcaption>Painel do Administrador — turmas, professores e faltas por justificar, numa só vista.</figcaption>
      </figure>

      <h2><span class="marca-seccao"></span>O que faz</h2>
      <dl class="definicoes">
        <dt>Painel do Aluno</dt>
        <dd>Faltas, sumários, pauta e horário sempre à mão — o aluno vê tudo sem precisar de perguntar a ninguém.</dd>
        <dt>Painel do Professor</dt>
        <dd>Sumários, marcação de faltas e avaliação por módulos em poucos cliques, turma a turma.</dd>
        <dt>Painel do Administrador</dt>
        <dd>Turmas, horários, professores, alunos e avisos geridos a partir de um único sítio, sem folhas de cálculo soltas.</dd>
        <dt>Comunicação</dt>
        <dd>Um canal por disciplina em cada turma, e mensagens privadas entre professores e alunos — tudo dentro do mesmo sistema.</dd>
        <dt>Dados</dt>
        <dd>Cada pessoa só vê o que lhe compete, as palavras-passe nunca ficam visíveis, e os dados não saem da escola.</dd>
      </dl>

      ${figuraCaptura('/static/capturas/professor.jpg', '"As minhas turmas", no painel do professor — faltas por aluno já contabilizadas.')}
      ${figuraCaptura('/static/capturas/aluno.jpg', 'Painel do Aluno — assiduidade e avaliação por disciplina, num relance.')}

      <hr>

      <h2><span class="marca-seccao"></span>Conversas</h2>
      <p>O professor cria um canal por disciplina e decide quem participa; o aluno só vê os canais a que foi
      adicionado. Há também mensagens privadas entre professores e alunos, para dúvidas que não precisam de
      ser públicas. É uma segunda aplicação, incluída no mesmo preço.</p>

      ${figuraCaptura('/static/capturas/conversas.jpg', 'App Conversas, com um canal de turma aberto.')}

      <p><a class="botao-secundario" href="${URL_CONVERSAS}" target="_blank" rel="noopener">Experimentar Conversas →</a></p>

      <hr>

      <h2><span class="marca-seccao"></span>Tecnologia, em poucas palavras</h2>
      <p class="texto-suave">Não precisa de perceber disto para usar o sistema — mas se pesar na decisão, aqui fica.</p>
      <ul>
        <li>Construído em Node.js puro, sem frameworks pesados — fácil de instalar e manter num computador da própria escola.</li>
        <li>Base de dados MySQL/MariaDB local: os dados ficam na escola, não num serviço de terceiros.</li>
        <li>As páginas funcionam mesmo sem JavaScript no browser.</li>
        <li>Os endereços dos painéis (ver demonstração acima) são configuráveis — numa instalação real apontam para o servidor da escola, com HTTPS.</li>
      </ul>

      <hr>

      <h2><span class="marca-seccao"></span>Experimente agora mesmo</h2>
      <p>${ICONE_CADEADO} Estas são contas de demonstração, com dados fictícios, criadas só para este ambiente de
      testes. Numa instalação real não existem — cada escola cria as suas próprias contas.</p>
      <div class="tabela-scroll">
        <table>
          <thead><tr><th>Papel</th><th>N.º de processo</th><th>Palavra-passe</th></tr></thead>
          <tbody>
            <tr><td>Administrador</td><td><code>1000</code></td><td><code>admin123</code></td></tr>
            <tr><td>Professor</td><td><code>1001</code>–<code>1005</code></td><td><code>prof123</code></td></tr>
            <tr><td>Aluno</td><td><code>2450</code>–<code>2456</code> / <code>2310</code>–<code>2315</code></td><td><code>aluno123</code></td></tr>
          </tbody>
        </table>
      </div>
      <p><a class="botao" href="${URL_GESTAO}" target="_blank" rel="noopener">Abrir a demonstração →</a></p>

      <hr>

      <h2><span class="marca-seccao"></span>Preço</h2>
      <p class="preco-grande">${PRECO_EUROS}€<span>/mês</span></p>
      <p>Uma escola, um preço único. Sem limite de alunos nem de turmas. Inclui a Gestão Escolar e o
      Conversas. Cancele quando quiser.</p>
      <p><a class="botao" href="/subscrever">Subscrever — ${PRECO_EUROS}€/mês</a></p>
      <p class="texto-suave">Escreva-me a dizer que quer subscrever — explico os próximos passos.</p>

      <hr>

      <h2><span class="marca-seccao"></span>Como trato os dados</h2>
      <p>Uma escola guarda dados sensíveis de menores. Isto não substitui o aconselhamento jurídico da escola
      sobre o RGPD — descreve como o sistema foi construído:</p>
      <ul>
        <li>Os dados ficam na base de dados da própria escola (MySQL) — não num serviço cloud de terceiros nem fora do país.</li>
        <li>Cada pessoa só acede ao que lhe compete: o aluno aos seus dados, o professor aos das suas turmas, a direção a tudo.</li>
        <li>As palavras-passe nunca são guardadas em texto simples — só o seu hash, com sal aleatório (scrypt).</li>
        <li>As cópias de segurança são as que a escola já faz ao seu servidor MySQL — o InformaNege não envia dados para fora para esse efeito.</li>
      </ul>

      <hr>

      <h2><span class="marca-seccao"></span>Contacto</h2>
      <p>Tem dúvidas ou quer saber mais sobre o InformaNege? <a href="${URL_CONTACTO}">Mande-me um email</a>.</p>
    </article>
  </main>

  <footer class="rodape">
    <span>InformaNege · Sistema de Gestão Escolar · versão beta · projeto académico (PAP)</span>
  </footer>
</body>
</html>`;
}

// Campos do cartão, só para a pré-visualização (ver mais abaixo) — nunca usados para pagar a sério,
// nem ligados a JavaScript nenhum. O formulário real é sempre desenhado pelo próprio Stripe.js.
const CAMPOS_CARTAO_PREVIA = `<div class="campo-previa">
    <span class="campo-previa-rotulo">Número do cartão</span>
    <span class="campo-previa-valor">4242 4242 4242 4242</span>
  </div>
  <div class="campo-previa-linha">
    <div class="campo-previa"><span class="campo-previa-rotulo">Validade</span><span class="campo-previa-valor">12 / 34</span></div>
    <div class="campo-previa"><span class="campo-previa-rotulo">CVC</span><span class="campo-previa-valor">123</span></div>
  </div>
  <div class="campo-previa">
    <span class="campo-previa-rotulo">Nome no cartão</span>
    <span class="campo-previa-valor">O seu nome</span>
  </div>
  <button class="botao" type="button" disabled>Subscrever — exemplo</button>`;

// Página própria de checkout: fica no nosso site, com o nosso cabeçalho e o nosso resumo do
// preço — só o formulário do cartão em si é que o Stripe.js desenha dentro de "#checkout" (num
// iframe seguro do Stripe; os números do cartão nunca passam pelo nosso servidor).
// clientSecret identifica esta sessão de pagamento em concreto; é feito para ir para o browser
// (ao contrário da chave secreta, essa nunca sai do servidor — ver pagamento.js).
//
// Sem chaves da Stripe configuradas (clientSecret === null), mostra uma PRÉ-VISUALIZAÇÃO: o resto
// da página fica igual, mas em vez do formulário real aparecem campos de exemplo, sem Stripe.js
// nenhum a ser carregado — só para se poder ver o design sem precisar de nenhuma chave.
function paginaCheckout(clientSecret) {
  const previa = clientSecret === null;

  // Nunca interpolar estes valores como HTML (só como texto dentro de JSON, dentro do <script>):
  // JSON.stringify trata as aspas, e o < impede que um "<" feche a tag <script> por engano.
  const dados = JSON.stringify({ chave: chavePublicavelAtual(), clientSecret }).replace(/</g, '\\u003c');

  const corpoCartao = previa
    ? `<p class="checkout-previa-aviso">${ICONE_CADEADO} Pré-visualização — ainda sem chaves da Stripe configuradas. Estes campos são só um exemplo; não é possível pagar aqui.</p>${CAMPOS_CARTAO_PREVIA}`
    : `<p class="texto-suave centro">A preparar o pagamento…</p>`;

  const scriptStripe = previa
    ? ''
    : `<script src="https://js.stripe.com/v3/"></script>
  <script>
  (function () {
    var dados = ${dados};
    var alvo = document.getElementById('checkout');
    if (!window.Stripe) {
      alvo.innerHTML = '<p class="texto-suave centro">Não foi possível carregar o Stripe. Verifique a ligação à internet e <a href="/checkout">tente novamente</a>.</p>';
      return;
    }
    var stripe = Stripe(dados.chave);
    stripe.initEmbeddedCheckout({ clientSecret: dados.clientSecret }).then(function (checkout) {
      alvo.innerHTML = '';
      checkout.mount('#checkout');
    }).catch(function () {
      alvo.innerHTML = '<p class="texto-suave centro">Não foi possível carregar o pagamento. <a href="/checkout">Tente novamente</a>.</p>';
    });
  })();
  </script>`;

  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Subscrever · InformaNege</title>
  <meta name="robots" content="noindex">
  <meta name="color-scheme" content="light dark">
  <link rel="stylesheet" href="/static/estilo.css">
  <link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body>
  <header class="topo">
    <a href="/" class="marca">${LOGO}<strong>InformaNege</strong></a>
    <a class="link-voltar" href="/#preco">← Voltar</a>
  </header>
  <main class="pagina pagina-estreita">
    <article>
      <h1>Subscrição mensal</h1>
      <p class="definicao">InformaNege — Sistema de Gestão Escolar</p>
      <p class="checkout-preco">${PRECO_EUROS}€<span>/mês</span></p>
      <p class="texto-suave">${ICONE_CADEADO} Pagamento processado e protegido pelo Stripe. Pode cancelar quando quiser.</p>
      <div class="checkout-caixa${previa ? ' checkout-caixa-previa' : ''}" id="checkout">
        ${corpoCartao}
      </div>
    </article>
  </main>
  ${scriptStripe}
</body>
</html>`;
}

// Mostrada ao clicar em "Subscrever agora": por enquanto não há pagamento automático (sem chaves da
// Stripe ligadas), por isso agradece o interesse e mostra logo o email de contacto, já com o mailto
// preenchido (URL_SUBSCREVER) para ser só clicar e enviar.
function paginaInteresseRegistado() {
  return paginaSimples(
    'Obrigado pelo interesse',
    `<h1>Obrigado pelo interesse.</h1>
     <p>Por agora, as subscrições são combinadas diretamente — ainda não há pagamento automático no site.</p>
     <p>Escreva para <a href="${URL_SUBSCREVER}">${EMAIL_CONTACTO}</a> a dizer que quer subscrever, com o
        nome da escola, e explico os próximos passos.</p>
     <p><a class="botao" href="${URL_SUBSCREVER}">Enviar email agora</a> <a class="botao-secundario" href="/">Voltar ao início</a></p>`
  );
}

// Página curta genérica (404, resultado de pagamento, erro) — mesma coluna estreita da página principal.
function paginaSimples(titulo, corpo) {
  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${titulo} · InformaNege</title>
  <meta name="color-scheme" content="light dark">
  <link rel="stylesheet" href="/static/estilo.css">
  <link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body>
  <header class="topo">
    <a href="/" class="marca">${LOGO}<strong>InformaNege</strong></a>
  </header>
  <main class="pagina pagina-estreita">
    <article class="centro">
      ${corpo}
    </article>
  </main>
</body>
</html>`;
}

function pagina404() {
  return paginaSimples('Página não encontrada', `<h1>404</h1><p>Esta página não existe.</p><p><a class="botao" href="/">Voltar ao início</a></p>`);
}

// Nota: o Stripe só chega aqui depois de o pagamento ser mesmo aceite — não é preciso validar
// mais nada do lado do site para mostrar esta mensagem (ver pagamento.js e app.js).
function paginaPagamentoSucesso() {
  return paginaSimples(
    'Subscrição confirmada',
    `<h1>Subscrição confirmada.</h1>
     <p>Obrigado. Entro em contacto por email em breve para configurar a sua escola no InformaNege.</p>
     <p><a class="botao" href="/">Voltar ao início</a></p>`
  );
}

function paginaPagamentoCancelado() {
  return paginaSimples(
    'Pagamento cancelado',
    `<h1>Pagamento cancelado.</h1>
     <p>Não foi cobrado nada. Pode tentar novamente quando quiser.</p>
     <p><a class="botao" href="/#preco">Voltar aos preços</a></p>`
  );
}

function paginaErroPagamento() {
  return paginaSimples(
    'Não foi possível continuar',
    `<h1>Não foi possível continuar.</h1>
     <p>Ocorreu um problema ao ligar ao Stripe. Tente novamente dentro de momentos, ou contacte-me.</p>
     <p><a class="botao" href="/#preco">Voltar aos preços</a></p>`
  );
}

module.exports = {
  pagina,
  pagina404,
  paginaCheckout,
  paginaInteresseRegistado,
  paginaPagamentoSucesso,
  paginaPagamentoCancelado,
  paginaErroPagamento,
};
