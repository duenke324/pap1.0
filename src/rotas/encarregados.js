// Painel do Administrador: contas de acesso dos encarregados de educação.
// Geridas a partir da ficha do aluno (cartão "Conta do encarregado de educação"):
// criar uma conta nova, associar uma conta que já existe (irmãos), desassociar e repor a palavra-passe.
const { post } = require('../lib/servidor');
const { um, todos, executar, transacao } = require('../db');
const { registarLog } = require('../lib/auditoria');
const { h, gerarHash, gerarPasswordTemporaria } = require('../lib/util');

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function carregarAluno(id) {
  return um(
    `SELECT a.*, e.nome AS ee_nome, e.email AS ee_email, e.contacto AS ee_contacto, u.username AS ee_codigo
       FROM alunos a
       LEFT JOIN encarregados e ON e.id = a.encarregado_id
       LEFT JOIN utilizadores u ON u.id = e.utilizador_id
      WHERE a.id = ?`,
    id
  );
}

// Cartão mostrado na ficha do aluno (ver get('/admin/alunos/:id') em admin.js)
async function cartaoEncarregado(alunoId) {
  const a = await carregarAluno(alunoId);
  if (!a) return '';
  const base = `/admin/alunos/${a.id}/encarregado`;

  if (a.encarregado_id) {
    const irmaos = await todos('SELECT id, nome FROM alunos WHERE encarregado_id = ? AND id <> ? ORDER BY nome', a.encarregado_id, a.id);
    return `<section class="cartao no-imprimir">
      <h2>Conta do encarregado de educação</h2>
      <dl class="dados-pessoais">
        <dt>Nome</dt><dd>${h(a.ee_nome)}</dd>
        <dt>Código de acesso</dt><dd><strong>${h(a.ee_codigo)}</strong></dd>
        <dt>Email</dt><dd>${a.ee_email ? `<a href="mailto:${h(a.ee_email)}">${h(a.ee_email)}</a>` : '—'}</dd>
        <dt>Contacto</dt><dd>${h(a.ee_contacto || '—')}</dd>
        ${irmaos.length ? `<dt>Outros educandos</dt><dd>${irmaos.map((i) => `<a href="/admin/alunos/${i.id}">${h(i.nome)}</a>`).join(', ')}</dd>` : ''}
      </dl>
      <form method="post" action="${base}/editar" class="filtros">
        <label class="crescer">Email <small class="texto-suave">(para recuperar a palavra-passe e receber a resposta aos justificativos)</small>
          <input name="email" type="email" maxlength="120" value="${h(a.ee_email || '')}" placeholder="nome@exemplo.pt"></label>
        <label>Contacto
          <input name="contacto" maxlength="20" value="${h(a.ee_contacto || '')}"></label>
        <button class="botao botao-secundario">Guardar contactos</button>
      </form>
      <div class="barra-acoes">
        <form method="post" action="${base}/password" data-confirmar="Gerar uma palavra-passe nova para ${h(a.ee_nome)}? A atual deixa de funcionar.">
          <button class="botao botao-secundario">Repor palavra-passe</button>
        </form>
        <form method="post" action="${base}/desassociar" data-confirmar="Retirar a ${h(a.ee_nome)} o acesso às faltas de ${h(a.nome)}?">
          <button class="botao botao-perigo">Desassociar</button>
        </form>
      </div>
    </section>`;
  }

  return `<section class="cartao no-imprimir">
    <h2>Conta do encarregado de educação</h2>
    <p class="texto-suave">Com uma conta, o encarregado consulta as faltas de ${h(a.nome)} e envia os justificativos pela aplicação.</p>
    <form method="post" action="${base}/criar" class="filtros">
      <label class="crescer">Nome do encarregado
        <input name="nome" maxlength="120" value="${h(a.encarregado_nome || '')}" required></label>
      <label>Email <small class="texto-suave">(opcional)</small>
        <input name="email" type="email" maxlength="120"></label>
      <label>Contacto <small class="texto-suave">(opcional)</small>
        <input name="contacto" maxlength="20"></label>
      <button class="botao">Criar conta</button>
    </form>
    <form method="post" action="${base}/associar" class="filtros">
      <label>Já tem conta (irmãos)? Código de acesso
        <input name="codigo" maxlength="50" placeholder="Ex.: EE2450" required></label>
      <button class="botao botao-secundario">Associar conta existente</button>
    </form>
  </section>`;
}

// Código de acesso: "EE" + n.º de processo do educando (com sufixo se, por acaso, já existir)
async function gerarCodigo(numeroProcesso) {
  const base = `EE${numeroProcesso}`.slice(0, 46);
  for (let i = 0; i < 50; i++) {
    const codigo = i ? `${base}-${i + 1}` : base;
    if (!(await um('SELECT 1 FROM utilizadores WHERE username = ?', codigo))) return codigo;
  }
  throw new Error('Não foi possível gerar um código de acesso.');
}

post('/admin/alunos/:id/encarregado/criar', async (req, res) => {
  const aluno = await carregarAluno(req.params.id);
  if (!aluno) return res.redirecionar('/admin/alunos');
  const voltar = `/admin/alunos/${aluno.id}`;
  const nome = String(req.corpo.nome || '').trim().slice(0, 120);
  const email = String(req.corpo.email || '').trim().slice(0, 120);
  const contacto = String(req.corpo.contacto || '').trim().slice(0, 20);

  let erro = '';
  if (aluno.encarregado_id) erro = 'Este aluno já tem um encarregado com conta.';
  else if (!nome) erro = 'Indique o nome do encarregado de educação.';
  else if (email && !EMAIL_VALIDO.test(email)) erro = 'O email não é válido.';
  if (erro) {
    req.flash('erro', erro);
    return res.redirecionar(voltar);
  }

  const codigo = await gerarCodigo(aluno.numero_processo);
  const password = gerarPasswordTemporaria();
  await transacao(async (tx) => {
    const u = await tx.executar(
      `INSERT INTO utilizadores (username, password_hash, papel, nome, deve_redefinir_password) VALUES (?, ?, 'encarregado', ?, 1)`,
      codigo,
      gerarHash(password),
      nome
    );
    const e = await tx.executar(
      'INSERT INTO encarregados (utilizador_id, nome, email, contacto) VALUES (?, ?, ?, ?)',
      u.lastInsertRowid,
      nome,
      email || null,
      contacto || null
    );
    await tx.executar('UPDATE alunos SET encarregado_id = ?, encarregado_nome = ? WHERE id = ?', e.lastInsertRowid, nome, aluno.id);
  });

  await registarLog(req, 'criar', 'encarregado', aluno.id, `Criou a conta do encarregado "${nome}" (código ${codigo}) para o aluno "${aluno.nome}".`);
  req.flash(
    'sucesso',
    `Conta criada para ${nome}. Código de acesso: ${codigo} · Palavra-passe temporária: ${password} (anote-a agora — não vai voltar a ser mostrada).`
  );
  res.redirecionar(voltar);
});

// Email e contacto do encarregado (só a administração os altera; o encarregado não tem ecrã para isso)
post('/admin/alunos/:id/encarregado/editar', async (req, res) => {
  const aluno = await carregarAluno(req.params.id);
  if (!aluno) return res.redirecionar('/admin/alunos');
  const voltar = `/admin/alunos/${aluno.id}`;
  const email = String(req.corpo.email || '').trim().slice(0, 120);
  const contacto = String(req.corpo.contacto || '').trim().slice(0, 20);

  if (!aluno.encarregado_id) req.flash('erro', 'Este aluno não tem um encarregado com conta.');
  else if (email && !EMAIL_VALIDO.test(email)) req.flash('erro', 'O email não é válido.');
  else {
    await executar('UPDATE encarregados SET email = ?, contacto = ? WHERE id = ?', email || null, contacto || null, aluno.encarregado_id);
    const mudou = [];
    if ((aluno.ee_email || '') !== email) mudou.push(`email: ${aluno.ee_email || '—'} → ${email || '—'}`);
    if ((aluno.ee_contacto || '') !== contacto) mudou.push(`contacto: ${aluno.ee_contacto || '—'} → ${contacto || '—'}`);
    if (mudou.length) {
      await registarLog(req, 'editar', 'encarregado', aluno.id, `Alterou os contactos do encarregado "${aluno.ee_nome}" (${mudou.join('; ')}).`);
    }
    req.flash('sucesso', mudou.length ? `Contactos de ${aluno.ee_nome} guardados.` : 'Não houve alterações.');
  }
  res.redirecionar(voltar);
});

post('/admin/alunos/:id/encarregado/associar', async (req, res) => {
  const aluno = await carregarAluno(req.params.id);
  if (!aluno) return res.redirecionar('/admin/alunos');
  const voltar = `/admin/alunos/${aluno.id}`;
  const codigo = String(req.corpo.codigo || '').trim();
  const encarregado = await um(
    `SELECT e.* FROM encarregados e JOIN utilizadores u ON u.id = e.utilizador_id WHERE u.username = ? AND u.papel = 'encarregado'`,
    codigo
  );
  if (aluno.encarregado_id) req.flash('erro', 'Este aluno já tem um encarregado com conta.');
  else if (!encarregado) req.flash('erro', `Não existe nenhum encarregado com o código "${codigo}".`);
  else {
    await executar('UPDATE alunos SET encarregado_id = ?, encarregado_nome = ? WHERE id = ?', encarregado.id, encarregado.nome, aluno.id);
    await registarLog(req, 'editar', 'encarregado', aluno.id, `Associou o encarregado "${encarregado.nome}" (código ${codigo}) ao aluno "${aluno.nome}".`);
    req.flash('sucesso', `${encarregado.nome} passa a acompanhar ${aluno.nome}.`);
  }
  res.redirecionar(voltar);
});

// Desassociar não apaga a conta nem os justificativos já enviados; a conta só é apagada
// quando fica sem nenhum educando (deixava de servir para alguma coisa).
post('/admin/alunos/:id/encarregado/desassociar', async (req, res) => {
  const aluno = await carregarAluno(req.params.id);
  if (!aluno) return res.redirecionar('/admin/alunos');
  if (aluno.encarregado_id) {
    await transacao(async (tx) => {
      await tx.executar('UPDATE alunos SET encarregado_id = NULL WHERE id = ?', aluno.id);
      const resto = await tx.um('SELECT COUNT(*) AS n FROM alunos WHERE encarregado_id = ?', aluno.encarregado_id);
      if (!resto.n) {
        await tx.executar('DELETE u FROM utilizadores u JOIN encarregados e ON e.utilizador_id = u.id WHERE e.id = ?', aluno.encarregado_id);
      }
    });
    await registarLog(req, 'apagar', 'encarregado', aluno.id, `Desassociou o encarregado "${aluno.ee_nome}" (código ${aluno.ee_codigo}) do aluno "${aluno.nome}".`);
    req.flash('sucesso', `${aluno.ee_nome} deixou de ter acesso às faltas de ${aluno.nome}.`);
  }
  res.redirecionar(`/admin/alunos/${aluno.id}`);
});

post('/admin/alunos/:id/encarregado/password', async (req, res) => {
  const aluno = await carregarAluno(req.params.id);
  if (!aluno) return res.redirecionar('/admin/alunos');
  if (aluno.encarregado_id) {
    const password = gerarPasswordTemporaria();
    await executar(
      `UPDATE utilizadores u JOIN encarregados e ON e.utilizador_id = u.id
          SET u.password_hash = ?, u.deve_redefinir_password = 1 WHERE e.id = ?`,
      gerarHash(password),
      aluno.encarregado_id
    );
    await registarLog(req, 'editar', 'encarregado', aluno.id, `Repôs a palavra-passe do encarregado "${aluno.ee_nome}" (código ${aluno.ee_codigo}).`);
    req.flash('sucesso', `Palavra-passe de ${aluno.ee_nome} reposta. Código: ${aluno.ee_codigo} · Nova palavra-passe temporária: ${password} (anote-a agora — não vai voltar a ser mostrada).`);
  }
  res.redirecionar(`/admin/alunos/${aluno.id}`);
});

module.exports = { cartaoEncarregado };
