// Notificações push: o browser pede a chave pública, cria a subscrição e envia-a para aqui
// (public/app.js, botão em "A minha conta"). Ver src/lib/push.js.
const { get, post } = require('../lib/servidor');
const { chavesVapid, guardarSubscricao, apagarSubscricao, contarSubscricoes, notificar } = require('../lib/push');
const { h } = require('../lib/util');

get('/notificacoes/chave', async (req, res) => res.json({ chave: (await chavesVapid()).publica }));

post('/notificacoes/subscrever', async (req, res) => {
  const ok = await guardarSubscricao(req.utilizador.id, {
    endpoint: String(req.corpo.endpoint || ''),
    p256dh: String(req.corpo.p256dh || ''),
    auth: String(req.corpo.auth || ''),
  });
  res.json({ ok }, ok ? 200 : 422);
});

post('/notificacoes/cancelar', async (req, res) => {
  res.json({ ok: await apagarSubscricao(req.utilizador.id, req.corpo.endpoint) });
});

post('/notificacoes/teste', async (req, res) => {
  const n = await notificar(req.utilizador.id, {
    titulo: 'As notificações estão a funcionar',
    corpo: `Olá, ${req.utilizador.nome}! Vai ser avisado(a) aqui de faltas, avisos e respostas da escola.`,
    url: '/conta',
  });
  req.flash(n ? 'sucesso' : 'aviso', n ? `Notificação de teste enviada para ${n} aparelho(s).` : 'Não há nenhum aparelho com as notificações ligadas (ou o envio falhou).');
  res.redirecionar('/conta');
});

// O que cada perfil recebe (texto do cartão em "A minha conta")
const O_QUE_RECEBE = {
  aluno: 'faltas marcadas, aviso de metade ou limite de faltas de um módulo, avisos da escola, resposta aos seus justificativos e tarefas novas ou avaliadas na Conversas',
  encarregado: 'cada falta nova do educando, aviso de metade ou limite de faltas de um módulo, avisos da escola e a resposta aos justificativos',
  professor: 'alunos das turmas que dirige que chegam a metade ou ao limite de faltas de um módulo e justificativos novos para validar',
  admin: 'justificativos novos enviados pelos encarregados',
  funcionario: 'avisos gerais da escola',
};

// Cartão para a página "A minha conta" (src/rotas/conta.js)
async function cartaoNotificacoes(req) {
  const n = await contarSubscricoes(req.utilizador.id);
  return `<section class="cartao" data-notificacoes data-chave="/notificacoes/chave" data-subscrever="/notificacoes/subscrever" data-cancelar="/notificacoes/cancelar">
    <h2>Notificações</h2>
    <p class="texto-suave">Receba no telemóvel ou no computador, mesmo com a aplicação fechada: ${h(O_QUE_RECEBE[req.utilizador.papel] || '')}.</p>
    <p data-estado-notificacoes>${n ? `Ligadas em ${n} aparelho(s).` : 'Desligadas neste aparelho.'}</p>
    <div class="barra-acoes">
      <button type="button" class="botao" data-ativar-notificacoes hidden>Ativar notificações neste aparelho</button>
      <button type="button" class="botao botao-secundario" data-desativar-notificacoes hidden>Desligar neste aparelho</button>
      ${n ? '<form method="post" action="/notificacoes/teste"><button class="botao botao-secundario">Enviar uma notificação de teste</button></form>' : ''}
    </div>
    <p class="legenda" data-aviso-notificacoes hidden></p>
    <p class="legenda">No iPhone/iPad, primeiro instale a app (Partilhar → Adicionar ao ecrã principal) e ative as notificações dentro dela.
      Só funciona em endereços <code>https://</code> ou em <code>localhost</code>.</p>
  </section>`;
}

module.exports = { cartaoNotificacoes };
