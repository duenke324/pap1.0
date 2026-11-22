// "A minha conta": cada utilizador (aluno, professor, encarregado, funcionário e direção) muda a sua
// própria palavra-passe, escrevendo primeiro a atual.
//
// - A palavra-passe atual errada conta como uma tentativa de login errada (ver lib/seguranca-login.js):
//   ao fim de 5 seguidas a conta fica bloqueada e a sessão termina. Assim, quem encontrar um computador
//   com a sessão aberta não consegue experimentar palavras-passe à vontade.
// - Depois de mudar, as outras sessões abertas desta conta (outros computadores e a Conversas) terminam;
//   esta continua.
// - A mesma palavra-passe serve na Gestão Escolar e na Conversas (é a mesma conta).
const { get, post, terminarSessao } = require('../lib/servidor');
const { um, executar } = require('../db');
const { pagina, paginaEntrada } = require('../vistas/layout');
const { h, verificarPassword, gerarHash } = require('../lib/util');
const { escolaAtual, contextoAtual } = require('../lib/contexto');
const { registarLog } = require('../lib/auditoria');
const { chaveLogin, registarFalha, limparFalhas, mensagemFalha, mensagemBloqueio, MINUTOS_BLOQUEIO } = require('../lib/seguranca-login');

const MINIMO = 6;

function paginaConta(req, res, { erro = '' } = {}, estado = 200) {
  const u = req.utilizador;
  const conteudo = `
    <section class="cartao">
      <h2>Mudar a palavra-passe</h2>
      <p class="texto-suave">A palavra-passe serve para entrar aqui e na Conversas. Depois de a mudar, as sessões abertas
        noutros computadores terminam.</p>
      ${erro ? `<div class="alerta alerta-erro" role="alert">${h(erro)}</div>` : ''}
      <form method="post" action="/conta/password" class="formulario">
        <input type="text" name="username" value="${h(u.username)}" autocomplete="username" hidden>
        <label>Palavra-passe atual
          <input name="atual" type="password" autocomplete="current-password" required autofocus></label>
        <label>Nova palavra-passe
          <input name="nova" type="password" minlength="${MINIMO}" autocomplete="new-password" required>
          <small>Pelo menos ${MINIMO} caracteres, diferente da atual.</small></label>
        <label>Confirmar a nova palavra-passe
          <input name="confirmar" type="password" minlength="${MINIMO}" autocomplete="new-password" required></label>
        <div class="acoes"><button class="botao">Mudar palavra-passe</button></div>
      </form>
    </section>
    <section class="cartao">
      <h2>A conta</h2>
      <dl class="dados-pessoais">
        <dt>Nome</dt><dd>${h(u.nome)}</dd>
        <dt>Utilizador</dt><dd>${h(u.username)}</dd>
      </dl>
      ${
        u.papel === 'admin'
          ? '<p class="texto-suave">Para pedir também um código por email em cada entrada, veja <a href="/admin/seguranca">Segurança da conta</a>.</p>'
          : ''
      }
    </section>`;
  res.html(pagina(req, { titulo: 'A minha conta', ativo: 'conta' }, conteudo), estado);
}

get('/conta', (req, res) => paginaConta(req, res));

post('/conta/password', async (req, res) => {
  const atual = String(req.corpo.atual || '');
  const nova = String(req.corpo.nova || '');
  const conta = await um('SELECT password_hash FROM utilizadores WHERE id = ?', req.utilizador.id);
  const chave = chaveLogin(escolaAtual().id, req.utilizador.username);

  if (!verificarPassword(atual, conta.password_hash)) {
    const falha = await registarFalha(chave);
    if (falha.bloqueada) {
      // Demasiadas tentativas: a conta fica bloqueada e esta sessão termina
      await terminarSessao(req);
      res.setHeader('Set-Cookie', `${contextoAtual()?.nomeCookie || 'sid'}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
      return res.html(
        paginaEntrada('Conta bloqueada', {
          tituloPainel: 'Conta bloqueada',
          painel: `<div class="alerta alerta-erro" role="alert">${h(mensagemBloqueio(MINUTOS_BLOQUEIO))}</div>
            <p class="entrada-texto">A sessão foi terminada.</p><a class="botao botao-bloco" href="/login">Voltar ao login</a>`,
        }),
        429
      );
    }
    return paginaConta(req, res, { erro: mensagemFalha(falha, 'A palavra-passe atual não está certa.') }, 401);
  }
  await limparFalhas(chave);

  let erro = '';
  if (nova.length < MINIMO) erro = `A palavra-passe nova deve ter pelo menos ${MINIMO} caracteres.`;
  else if (nova !== String(req.corpo.confirmar || '')) erro = 'As palavras-passe novas não coincidem.';
  else if (nova === atual) erro = 'Escolha uma palavra-passe diferente da atual.';
  if (erro) return paginaConta(req, res, { erro }, 422);

  await executar('UPDATE utilizadores SET password_hash = ?, deve_redefinir_password = 0 WHERE id = ?', gerarHash(nova), req.utilizador.id);
  // Termina as outras sessões desta conta (esta continua aberta)
  await executar(
    `DELETE FROM sessoes WHERE JSON_VALUE(dados, '$.utilizadorId') = ? AND token <> ?`,
    req.utilizador.id,
    req.sessao.token || ''
  );
  await registarLog(req, 'editar', 'utilizador', req.utilizador.id, 'Mudou a sua palavra-passe');
  req.flash('sucesso', 'Palavra-passe mudada. As sessões abertas noutros computadores terminaram.');
  res.redirecionar('/conta');
});
