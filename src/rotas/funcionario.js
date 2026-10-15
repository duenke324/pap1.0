// Painel do Funcionário (pessoal não-docente: informático, auxiliar escolar, RH, biblioteca,
// secretaria, centro de recursos, cozinha e portaria). Área simples de consulta — tal como o
// aluno, as alterações aos dados são feitas pela administração.
const { get } = require('../lib/servidor');
const { pagina, vazio } = require('../vistas/layout');
const { h, CARGOS_FUNCIONARIO } = require('../lib/util');

function semFicha(req, res, titulo, ativo) {
  res.html(pagina(req, { titulo, ativo }, vazio('A sua conta não está associada a uma ficha de funcionário.')));
}

get('/funcionario', async (req, res) => {
  if (!req.funcionario) return semFicha(req, res, 'Painel', 'inicio');
  const f = req.funcionario;
  const conteudo = `
    <section class="cartao">
      <h2>Bem-vindo(a), ${h(f.nome)}</h2>
      <p class="texto-suave">Cargo: <strong>${h(CARGOS_FUNCIONARIO[f.cargo] || f.cargo)}</strong> · N.º de processo ${h(f.numero_processo)}</p>
      <p class="legenda">Esta é a sua área pessoal. Para consultar ou corrigir os seus dados, veja «Dados pessoais» no menu.</p>
    </section>`;
  res.html(pagina(req, { titulo: 'Painel', ativo: 'inicio' }, conteudo));
});

get('/funcionario/dados', async (req, res) => {
  if (!req.funcionario) return semFicha(req, res, 'Dados pessoais', 'dados');
  const f = req.funcionario;
  const conteudo = `
    <section class="cartao">
      <dl class="dados-pessoais">
        <dt>Nome completo</dt><dd>${h(f.nome)}</dd>
        <dt>N.º de processo</dt><dd>${h(f.numero_processo)}</dd>
        <dt>Cargo</dt><dd>${h(CARGOS_FUNCIONARIO[f.cargo] || f.cargo)}</dd>
        <dt>Email</dt><dd>${f.email ? `<a href="mailto:${h(f.email)}">${h(f.email)}</a>` : '—'}</dd>
        <dt>Contacto</dt><dd>${f.contacto ? `<a href="tel:${h(f.contacto)}">${h(f.contacto)}</a>` : '—'}</dd>
      </dl>
      <p class="legenda">Se algum dado estiver errado, fale com a administração.</p>
    </section>`;
  res.html(pagina(req, { titulo: 'Dados pessoais', ativo: 'dados' }, conteudo));
});
