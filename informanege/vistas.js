// InformaNege — página de vendas do software. Sem base de dados, sem sessões: só a página e
// botões que abrem a app real (Gestão Escolar / Conversas) a correr nas suas próprias portas.
// O botão de demonstração não é um mockup — é o produto real, por isso não há nada para manter
// sincronizado: quando o painel mudar, a demonstração mostra sempre a versão atual automaticamente.
// As capturas de ecrã (hero, galeria, Conversas) são do software real — ver publico/capturas/.
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

const ICONES = {
  aluno: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
  professor: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/>',
  admin: '<path d="M12 3l8 3v6c0 4.5-3.5 7.5-8 9-4.5-1.5-8-4.5-8-9V6l8-3Z"/>',
  seguranca: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  conversas: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10A1.5 1.5 0 0 1 18.5 17H9l-5 4z"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
};

function icone(nome) {
  return `<svg class="icone" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] || ''}</svg>`;
}

const FUNCIONALIDADES = [
  { icone: 'aluno', titulo: 'Painel do Aluno', texto: 'Faltas, sumários, pauta e horário sempre à mão — o aluno vê tudo sem precisar de perguntar a ninguém.' },
  { icone: 'professor', titulo: 'Painel do Professor', texto: 'Sumários, marcação de faltas e avaliação por módulos em poucos cliques, turma a turma.' },
  { icone: 'admin', titulo: 'Painel do Administrador', texto: 'Turmas, horários, professores, alunos e avisos — gerido a partir de um único sítio, sem folhas de cálculo soltas.' },
  { icone: 'conversas', titulo: 'Comunicação centralizada', texto: 'Um canal por disciplina em cada turma, e mensagens privadas entre professores e alunos — tudo dentro do mesmo sistema.' },
  { icone: 'seguranca', titulo: 'Dados protegidos', texto: 'Cada pessoa só vê o que lhe compete, as palavras-passe nunca ficam visíveis, e os dados não saem da escola.' },
];

function cartaoFuncionalidade({ icone: nomeIcone, titulo, texto }) {
  return `<article class="cartao">
    <span class="cartao-icone">${icone(nomeIcone)}</span>
    <h3>${titulo}</h3>
    <p>${texto}</p>
  </article>`;
}

const CAPTURAS = [
  { src: '/static/capturas/aluno.jpg', titulo: 'Painel do Aluno', texto: 'Assiduidade e avaliação por disciplina, num relance.' },
  { src: '/static/capturas/professor.jpg', titulo: 'Painel do Professor', texto: '"As minhas turmas", com faltas por aluno já contabilizadas.' },
  { src: '/static/capturas/admin.jpg', titulo: 'Painel do Administrador', texto: 'Visão geral da escola: turmas, professores e faltas por justificar.' },
];

function cartaoCaptura({ src, titulo, texto }) {
  return `<figure class="captura-cartao">
    <div class="captura-janela">
      <img src="${src}" alt="Captura de ecrã real: ${titulo}" loading="lazy">
    </div>
    <figcaption><strong>${titulo}</strong><span>${texto}</span></figcaption>
  </figure>`;
}

const TECNOLOGIA = [
  'Construído em Node.js puro, sem frameworks pesados — fácil de instalar e manter num computador da própria escola.',
  'Base de dados MySQL/MariaDB local: os dados ficam na escola, não num serviço de terceiros.',
  'As páginas funcionam mesmo sem JavaScript no browser — o JavaScript só torna a experiência mais fluida.',
  'Os endereços dos painéis (ver demonstração acima) são configuráveis — numa instalação real apontam para o servidor da escola, com HTTPS.',
];

const RGPD = [
  'Os dados ficam na base de dados da própria escola (MySQL) — não num serviço cloud de terceiros nem fora do país.',
  'Cada pessoa só acede ao que lhe compete: o aluno aos seus dados, o professor aos das suas turmas, a direção a tudo.',
  'As palavras-passe nunca são guardadas em texto simples — só o seu hash, com sal aleatório (scrypt).',
  'As cópias de segurança são as que a escola já faz ao seu servidor MySQL — o InformaNege não envia dados para fora para esse efeito.',
];

// Captura de ecrã real do software (não é um desenho) — mostrada ao lado do texto no topo da página.
const JANELA_PRINCIPAL = `<div class="mock-janela">
  <img class="mock-imagem" src="/static/capturas/admin.jpg" alt="Captura de ecrã real do Painel do Administrador">
</div>`;

function pagina() {
  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>InformaNege — Sistema de Gestão Escolar</title>
  <meta name="description" content="Sistema de gestão escolar completo — alunos, professores, turmas, faltas e avaliações, tudo num só sistema, pronto a instalar na sua escola.">
  <meta name="color-scheme" content="light dark">
  <link rel="stylesheet" href="/static/estilo.css">
  <link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body>
  <header class="topo">
    <div class="caixa topo-interior">
      <a href="#" class="marca">${LOGO}<strong>InformaNege</strong></a>
      <nav class="nav-principal" aria-label="Navegação principal">
        <a href="#funcionalidades">Funcionalidades</a>
        <a href="#conversas">Conversas</a>
        <a href="#demo">Demonstração</a>
        <a href="#precos">Preços</a>
        <a href="#contacto">Contactos</a>
      </nav>
      <a class="botao" href="${URL_GESTAO}" target="_blank" rel="noopener">Ver demonstração</a>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="caixa hero-interior">
        <div class="hero-texto-bloco">
          <h1>Sistema de Gestão Escolar</h1>
          <p class="hero-texto">
            Alunos, professores, turmas, horários, faltas, sumários e avaliações, tudo num só sistema,
            em português. Construído de raiz, sem frameworks pesados, como projeto final de curso.
          </p>
          <div class="hero-botoes">
            <a class="botao botao-grande" href="${URL_GESTAO}" target="_blank" rel="noopener">Ver demonstração ao vivo</a>
            <a class="botao botao-secundario botao-grande" href="#funcionalidades">Ver funcionalidades</a>
          </div>
        </div>
        <div class="hero-visual" aria-hidden="true">
          ${JANELA_PRINCIPAL}
        </div>
      </div>
    </section>

    <section id="funcionalidades" class="secao">
      <div class="caixa">
        <h2>O que o sistema faz</h2>
        <p class="secao-intro">Três painéis — aluno, professor e administrador — mais comunicação integrada.</p>
        <div class="grelha-funcionalidades">
          ${FUNCIONALIDADES.map(cartaoFuncionalidade).join('')}
        </div>
      </div>
    </section>

    <section id="capturas" class="secao secao-destaque">
      <div class="caixa">
        <h2>O software, tal como é</h2>
        <p class="secao-intro">Sem capturas fingidas — é o que o aluno, o professor e o administrador veem a cada dia.</p>
        <div class="grelha-capturas">
          ${CAPTURAS.map(cartaoCaptura).join('')}
        </div>
      </div>
    </section>

    <section id="conversas" class="secao">
      <div class="caixa secao-conversas">
        <div class="secao-conversas-texto">
          <h2>Uma conversa por disciplina, em cada turma</h2>
          <p>O professor cria um canal por disciplina e decide quem participa; o aluno só vê os canais a que foi
            adicionado. Também há mensagens privadas entre professores e alunos, para dúvidas que não precisam
            de ser públicas. Tema claro/escuro automático, e tudo a funcionar mesmo sem JavaScript.</p>
          <a class="botao" href="${URL_CONVERSAS}" target="_blank" rel="noopener">Experimentar Conversas</a>
        </div>
        <figure class="secao-conversas-visual">
          <div class="mock-janela mock-conversas-preview">
            <img class="mock-imagem" src="/static/capturas/conversas.jpg" alt="Captura de ecrã real da app Conversas, com um canal de turma aberto">
          </div>
        </figure>
      </div>
    </section>

    <section id="tecnologia" class="secao secao-destaque">
      <div class="caixa">
        <h2 class="centro">Tecnologia, em poucas palavras</h2>
        <p class="secao-intro">Não precisa de perceber disto para usar o sistema — mas se pesar na decisão, aqui fica.</p>
        <ul class="lista-pontos">
          ${TECNOLOGIA.map((t) => `<li>${t}</li>`).join('')}
        </ul>
      </div>
    </section>

    <section id="demo" class="secao">
      <div class="caixa">
        <div class="demo-cartao">
          <h2>Experimente agora mesmo</h2>
          <p class="secao-intro">Não são capturas de ecrã — é o software real a correr.</p>
          <p class="aviso-demo">${icone('seguranca')} Estas são contas de demonstração, com dados fictícios, criadas só para este ambiente de testes. Numa instalação real não existem — cada escola cria as suas próprias contas.</p>
          <div class="tabela-demo-wrap">
            <table class="tabela-demo">
              <thead><tr><th>Papel</th><th>N.º de processo</th><th>Palavra-passe</th></tr></thead>
              <tbody>
                <tr><td>Administrador</td><td><code>1000</code></td><td><code>admin123</code></td></tr>
                <tr><td>Professor</td><td><code>1001</code>–<code>1005</code></td><td><code>prof123</code></td></tr>
                <tr><td>Aluno</td><td><code>2450</code>–<code>2456</code> / <code>2310</code>–<code>2315</code></td><td><code>aluno123</code></td></tr>
              </tbody>
            </table>
          </div>
          <a class="botao botao-grande" href="${URL_GESTAO}" target="_blank" rel="noopener">Abrir a demonstração</a>
        </div>
      </div>
    </section>

    <section id="precos" class="secao">
      <div class="caixa">
        <h2 class="centro">Preço</h2>
        <p class="secao-intro">Uma escola, um preço. Cancele quando quiser.</p>
        <div class="cartao-preco">
          <div class="preco-valor"><span class="preco-numero">${PRECO_EUROS}€</span><span class="preco-periodo">/mês</span></div>
          <p class="preco-descricao">Sistema de Gestão Escolar completo — alunos, professores, turmas, faltas, avaliações e Conversas. Sem limite de alunos nem de turmas.</p>
          <a class="botao botao-grande" href="/subscrever">Subscrever agora — ${PRECO_EUROS} €/mês</a>
          <p class="preco-nota">Escreva-me a dizer que quer subscrever — explico os próximos passos.</p>
        </div>
      </div>
    </section>

    <section id="privacidade" class="secao secao-destaque">
      <div class="caixa">
        <h2 class="centro">Como trato os dados</h2>
        <p class="secao-intro">Uma escola guarda dados sensíveis de menores. Isto não substitui o aconselhamento jurídico da escola sobre o RGPD — descreve como o sistema foi construído:</p>
        <ul class="lista-pontos">
          ${RGPD.map((t) => `<li>${t}</li>`).join('')}
        </ul>
      </div>
    </section>

    <section id="contacto" class="secao">
      <div class="caixa contacto-interior">
        <h2>Fale comigo</h2>
        <p class="secao-intro">Tem dúvidas ou quer saber mais sobre o InformaNege? Mande-me um email.</p>
        <a class="botao botao-grande" href="${URL_CONTACTO}">${icone('email')} Contactar por email</a>
      </div>
    </section>
  </main>

  <footer class="rodape">
    <div class="caixa rodape-interior">
      <span class="marca marca-rodape">${LOGO}<strong>InformaNege</strong></span>
      <nav class="rodape-links" aria-label="Links do rodapé">
        <a href="#privacidade">Política de privacidade</a>
        <a href="${URL_CONTACTO}">Contacto</a>
      </nav>
      <span class="texto-suave">Sistema de Gestão Escolar · versão beta · projeto académico (PAP)</span>
    </div>
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
  <button class="botao botao-grande" type="button" disabled>Subscrever — exemplo</button>`;

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
    ? `<p class="checkout-previa-aviso">${icone('seguranca')} Pré-visualização — ainda sem chaves da Stripe configuradas. Estes campos são só um exemplo; não é possível pagar aqui.</p>${CAMPOS_CARTAO_PREVIA}`
    : `<p class="checkout-a-carregar">A preparar o pagamento…</p>`;

  const scriptStripe = previa
    ? ''
    : `<script src="https://js.stripe.com/v3/"></script>
  <script>
  (function () {
    var dados = ${dados};
    var alvo = document.getElementById('checkout');
    if (!window.Stripe) {
      alvo.innerHTML = '<p class="checkout-erro">Não foi possível carregar o Stripe. Verifique a ligação à internet e <a href="/checkout">tente novamente</a>.</p>';
      return;
    }
    var stripe = Stripe(dados.chave);
    stripe.initEmbeddedCheckout({ clientSecret: dados.clientSecret }).then(function (checkout) {
      alvo.innerHTML = '';
      checkout.mount('#checkout');
    }).catch(function () {
      alvo.innerHTML = '<p class="checkout-erro">Não foi possível carregar o pagamento. <a href="/checkout">Tente novamente</a>.</p>';
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
    <div class="caixa topo-interior checkout-topo-interior">
      <a href="/" class="marca">${LOGO}<strong>InformaNege</strong></a>
      <a class="link-voltar" href="/#precos">← Voltar</a>
    </div>
  </header>
  <main class="checkout-pagina">
    <div class="caixa checkout-caixa">
      <div class="checkout-resumo">
        <h1>Subscrição mensal<br>InformaNege</h1>
        <div class="preco-valor"><span class="preco-numero">${PRECO_EUROS}€</span><span class="preco-periodo">/mês</span></div>
        <p class="checkout-nota">${icone('seguranca')} Pagamento processado e protegido pelo Stripe. Pode cancelar quando quiser.</p>
      </div>
      <div class="checkout-cartao${previa ? ' checkout-cartao-previa' : ''}" id="checkout">
        ${corpoCartao}
      </div>
    </div>
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
     <p>Escreva para <a href="${URL_SUBSCREVER}"><strong>${EMAIL_CONTACTO}</strong></a> a dizer que quer subscrever,
        com o nome da escola, e explico os próximos passos.</p>
     <a class="botao" href="${URL_SUBSCREVER}">${icone('email')} Enviar email agora</a>
     <a class="botao botao-secundario" href="/">Voltar ao início</a>`
  );
}

// Página curta genérica (404, resultado de pagamento, erro) — mesmo "cartão" centrado.
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
  <div class="ecra-mensagem">
    ${corpo}
  </div>
</body>
</html>`;
}

function pagina404() {
  return paginaSimples('Página não encontrada', `<h1>404</h1><p>Esta página não existe.</p><a class="botao" href="/">Voltar ao início</a>`);
}

// Nota: o Stripe só chega aqui depois de o pagamento ser mesmo aceite — não é preciso validar
// mais nada do lado do site para mostrar esta mensagem (ver pagamento.js e app.js).
function paginaPagamentoSucesso() {
  return paginaSimples(
    'Subscrição confirmada',
    `<h1>Subscrição confirmada.</h1>
     <p>Obrigado. Entro em contacto por email em breve para configurar a sua escola no InformaNege.</p>
     <a class="botao" href="/">Voltar ao início</a>`
  );
}

function paginaPagamentoCancelado() {
  return paginaSimples(
    'Pagamento cancelado',
    `<h1>Pagamento cancelado</h1>
     <p>Não foi cobrado nada. Pode tentar novamente quando quiser.</p>
     <a class="botao" href="/#precos">Voltar aos preços</a>`
  );
}

function paginaErroPagamento() {
  return paginaSimples(
    'Não foi possível continuar',
    `<h1>Não foi possível continuar</h1>
     <p>Ocorreu um problema ao ligar ao Stripe. Tente novamente dentro de momentos, ou contacte-me.</p>
     <a class="botao" href="/#precos">Voltar aos preços</a>`
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
