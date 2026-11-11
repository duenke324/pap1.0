// Recuperação de palavra-passe ("Esqueceu-se da palavra-passe?" no login).
//
// A palavra-passe antiga não pode ser enviada a ninguém: a base de dados só guarda o seu hash.
// Por isso envia-se por email uma ligação pessoal, válida durante uma hora e só para uma vez,
// onde a pessoa escolhe uma palavra-passe nova. Até lá, a palavra-passe atual continua a funcionar
// (assim ninguém consegue bloquear a conta de outra pessoa só por pedir a recuperação em nome dela).
//
// Para onde vai o email:
//   aluno        → o email do aluno e, se tiver conta com email, também o do encarregado de educação
//   professor, funcionário, encarregado → o email da própria ficha
//   administrador (ou conta sem email)  → não há email: tem de falar com a secretaria
const crypto = require('node:crypto');
const { get, post } = require('../lib/servidor');
const { um, executar, transacao } = require('../db');
const { paginaEntrada, mensagensFlash } = require('../vistas/layout');
const { enviarEmail, APP_URL } = require('../lib/email');
const { h, gerarHash } = require('../lib/util');

const VALIDADE_MINUTOS = 60;
const MAX_PEDIDOS_POR_HORA = 3;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function contaComEmails(username) {
  return um(
    `SELECT u.id, u.nome, u.username, u.papel,
            COALESCE(a.email, p.email, f.email, e.email) AS email,
            ea.email AS email_encarregado, ea.nome AS nome_encarregado
       FROM utilizadores u
       LEFT JOIN alunos a        ON a.utilizador_id = u.id
       LEFT JOIN encarregados ea ON ea.id = a.encarregado_id
       LEFT JOIN professores p   ON p.utilizador_id = u.id
       LEFT JOIN funcionarios f  ON f.utilizador_id = u.id
       LEFT JOIN encarregados e  ON e.utilizador_id = u.id
      WHERE u.username = ?`,
    username
  );
}

// ---------- Pedir a recuperação ----------
function paginaPedido(req, { username = '', erro = '' } = {}) {
  return paginaEntrada('Recuperar palavra-passe', {
    tituloPainel: 'Recuperar palavra-passe',
    painel: `
      <p class="entrada-texto">Indique o seu número de processo ou código. Enviamos para o email registado na escola uma ligação para escolher uma palavra-passe nova.</p>
      ${mensagensFlash(req.lerFlash())}
      ${erro ? `<div class="alerta alerta-erro" role="alert">${h(erro)}</div>` : ''}
      <form method="post" action="/recuperar-password" class="entrada-form">
        <label>Número de processo ou código
          <input name="username" value="${h(username)}" autocomplete="username" required autofocus>
        </label>
        <button class="botao botao-bloco">Enviar ligação por email</button>
      </form>
      <hr class="entrada-linha">
      <p class="entrada-texto">No caso dos alunos, a ligação é enviada para o email do aluno e para o do encarregado de educação.
        <a class="entrada-ligacao" href="/login">Voltar à entrada</a></p>`,
  });
}

get('/recuperar-password', (req, res) => res.html(paginaPedido(req)));

post('/recuperar-password', async (req, res) => {
  const username = String(req.corpo.username || '').trim().slice(0, 50);
  if (!username) return res.html(paginaPedido(req, { erro: 'Indique o seu número de processo ou código.' }), 422);

  const conta = await contaComEmails(username);
  const destinatarios = conta ? [...new Set([conta.email, conta.email_encarregado].filter(Boolean))] : [];

  if (conta && destinatarios.length) {
    const recentes = await um(
      'SELECT COUNT(*) AS n FROM recuperacoes_password WHERE utilizador_id = ? AND criado_em > NOW() - INTERVAL 1 HOUR',
      conta.id
    );
    if (recentes.n < MAX_PEDIDOS_POR_HORA) {
      const token = crypto.randomBytes(32).toString('hex');
      await executar(
        'INSERT INTO recuperacoes_password (utilizador_id, token_hash, expira_em) VALUES (?, ?, NOW() + INTERVAL ? MINUTE)',
        conta.id,
        hashToken(token),
        VALIDADE_MINUTOS
      );
      await enviarEmail({
        para: destinatarios,
        assunto: 'Gestão Escolar — recuperar a palavra-passe',
        texto: [
          `Olá,`,
          ``,
          `Foi pedida a recuperação da palavra-passe da conta de ${conta.nome} (${conta.username}) na Gestão Escolar.`,
          ``,
          `Para escolher uma palavra-passe nova, abra esta ligação:`,
          `${APP_URL}/recuperar-password/${token}`,
          ``,
          `A ligação é válida durante ${VALIDADE_MINUTOS} minutos e só pode ser usada uma vez.`,
          `Se não fez este pedido, ignore este email: a palavra-passe atual continua a funcionar.`,
        ].join('\n'),
      });
    }
  }

  // A resposta é sempre a mesma, exista ou não a conta e tenha ou não email:
  // de outro modo esta página servia para descobrir que números de processo existem.
  req.flash(
    'sucesso',
    'Se a conta existir e tiver um email registado, enviámos uma ligação para escolher uma palavra-passe nova. Verifique o email (e a pasta de spam). Se não receber nada, contacte a secretaria.'
  );
  res.redirecionar('/login');
});

// ---------- Escolher a palavra-passe nova (a partir da ligação do email) ----------
function pedidoValido(token) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return um(
    `SELECT r.id, r.utilizador_id, u.nome, u.username
       FROM recuperacoes_password r JOIN utilizadores u ON u.id = r.utilizador_id
      WHERE r.token_hash = ? AND r.usado_em IS NULL AND r.expira_em > NOW()`,
    hashToken(token)
  );
}

function paginaLigacaoInvalida() {
  return paginaEntrada('Ligação inválida', {
    tituloPainel: 'Ligação inválida',
    painel: `<p class="entrada-texto">Esta ligação já foi usada ou passou do prazo (vale ${VALIDADE_MINUTOS} minutos). Peça uma nova.</p>
      <a class="botao botao-bloco" href="/recuperar-password">Pedir nova ligação</a>`,
  });
}

function paginaNovaPassword(pedido, token, erro = '') {
  return paginaEntrada('Nova palavra-passe', {
    tituloPainel: 'Nova palavra-passe',
    painel: `
      <p class="entrada-texto">Conta de <strong>${h(pedido.nome)}</strong> (${h(pedido.username)}). Escolha uma palavra-passe nova.</p>
      ${erro ? `<div class="alerta alerta-erro" role="alert">${h(erro)}</div>` : ''}
      <form method="post" action="/recuperar-password/${h(token)}" class="entrada-form">
        <label>Nova palavra-passe
          <input name="password" type="password" minlength="6" autocomplete="new-password" required autofocus>
          <small>Pelo menos 6 caracteres.</small>
        </label>
        <label>Confirmar palavra-passe
          <input name="confirmar" type="password" minlength="6" autocomplete="new-password" required>
        </label>
        <button class="botao botao-bloco">Guardar palavra-passe</button>
      </form>`,
  });
}

get('/recuperar-password/:token', async (req, res) => {
  const pedido = await pedidoValido(req.params.token);
  if (!pedido) return res.html(paginaLigacaoInvalida(), 410);
  res.html(paginaNovaPassword(pedido, req.params.token));
});

post('/recuperar-password/:token', async (req, res) => {
  const token = req.params.token;
  const pedido = await pedidoValido(token);
  if (!pedido) return res.html(paginaLigacaoInvalida(), 410);

  const password = String(req.corpo.password || '');
  let erro = '';
  if (password.length < 6) erro = 'A palavra-passe deve ter pelo menos 6 caracteres.';
  else if (password !== String(req.corpo.confirmar || '')) erro = 'As palavras-passe não coincidem.';
  if (erro) return res.html(paginaNovaPassword(pedido, token, erro), 422);

  const feito = await transacao(async (tx) => {
    // "usado_em IS NULL" na condição: se a ligação for aberta duas vezes ao mesmo tempo, só uma passa
    const r = await tx.executar('UPDATE recuperacoes_password SET usado_em = NOW() WHERE id = ? AND usado_em IS NULL', pedido.id);
    if (!r.changes) return false;
    await tx.executar(
      'UPDATE utilizadores SET password_hash = ?, deve_redefinir_password = 0 WHERE id = ?',
      gerarHash(password),
      pedido.utilizador_id
    );
    // As outras ligações pendentes desta conta deixam de valer, e as sessões abertas são terminadas
    // (se alguém estava dentro da conta com a palavra-passe antiga, sai)
    await tx.executar('UPDATE recuperacoes_password SET usado_em = NOW() WHERE utilizador_id = ? AND usado_em IS NULL', pedido.utilizador_id);
    await tx.executar(`DELETE FROM sessoes WHERE JSON_VALUE(dados, '$.utilizadorId') = ?`, pedido.utilizador_id);
    return true;
  });
  if (!feito) return res.html(paginaLigacaoInvalida(), 410);

  // A sessão deste browser (se era desta conta) foi apagada acima: começa-se uma nova só para a mensagem
  req.sessao = { token: null, dados: {} };
  req.flash('sucesso', 'Palavra-passe alterada. Já pode entrar com a nova.');
  res.redirecionar('/login');
});
