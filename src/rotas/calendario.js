// Painel do Administrador: calendário escolar (períodos e interrupções letivas) e avisos para os alunos
const { get, post } = require('../lib/servidor');
const { todos, um, executar } = require('../db');
const { pagina, vazio } = require('../vistas/layout');
const { h, dataValida, formatarData, selecionado, anoLetivoAtual } = require('../lib/util');

const TIPOS_CALENDARIO = { periodo: 'Período letivo', interrupcao: 'Interrupção letiva' };
const anoValido = (a) => /^(\d{4})\/(\d{4})$/.test(a || '') && Number(a.slice(5)) === Number(a.slice(0, 4)) + 1;

async function paginaCalendario(req, res, { ano, dadosCal = {}, errosCal = {}, dadosAviso = {}, errosAviso = {} } = {}, estado = 200) {
  ano = anoValido(ano) ? ano : anoLetivoAtual();
  const anos = [...new Set([anoLetivoAtual(), ...(await todos('SELECT DISTINCT ano_letivo FROM calendario UNION SELECT DISTINCT ano_letivo FROM turmas')).map((l) => l.ano_letivo)])]
    .sort()
    .reverse();
  const calendario = await todos('SELECT * FROM calendario WHERE ano_letivo = ? ORDER BY inicio', ano);
  const turmas = await todos('SELECT id, nome FROM turmas ORDER BY nome');
  const avisos = await todos(
    `SELECT av.*, t.nome AS turma, u.nome AS autor FROM avisos av
       LEFT JOIN turmas t ON t.id = av.turma_id LEFT JOIN utilizadores u ON u.id = av.publicado_por
      ORDER BY av.publicado_em DESC, av.id DESC LIMIT 100`
  );
  const erro = (erros, campo) => (erros[campo] ? `<small class="erro-campo">${h(erros[campo])}</small>` : '');
  const cls = (erros, campo) => (erros[campo] ? ' class="invalido"' : '');

  const conteudo = `
    <section class="cartao">
      <form class="filtros" method="get">
        <label>Ano letivo
          <select name="ano" data-submeter>${anos.map((a) => `<option${selecionado(a, ano)}>${h(a)}</option>`).join('')}</select></label>
        <noscript><button class="botao botao-secundario">Mostrar</button></noscript>
      </form>
      <h2>Calendário escolar ${h(ano)}</h2>
      ${
        calendario.length
          ? `<div class="tabela-scroll"><table class="tabela">
              <thead><tr><th>Tipo</th><th>Nome</th><th>Início</th><th>Fim</th><th></th></tr></thead>
              <tbody>${calendario
                .map(
                  (c) => `<tr>
                    <td>${h(TIPOS_CALENDARIO[c.tipo])}</td><td><strong>${h(c.nome)}</strong></td>
                    <td>${h(formatarData(c.inicio))}</td><td>${h(formatarData(c.fim))}</td>
                    <td class="direita"><form method="post" action="/admin/calendario/${c.id}/apagar" data-confirmar="Apagar ${h(c.nome)} do calendário?">
                      <button class="botao-texto perigo">Apagar</button></form></td>
                  </tr>`
                )
                .join('')}</tbody></table></div>`
          : vazio('Ainda não há datas para este ano letivo.')
      }
      <h3>Acrescentar ao calendário</h3>
      ${Object.keys(errosCal).length ? `<div class="alerta alerta-erro" role="alert">Corrija os campos assinalados.</div>` : ''}
      <form method="post" action="/admin/calendario" class="grelha-form">
        <input type="hidden" name="ano_letivo" value="${h(ano)}">
        <label>Tipo
          <select name="tipo"${cls(errosCal, 'tipo')}>${Object.entries(TIPOS_CALENDARIO).map(([v, r]) => `<option value="${v}"${selecionado(v, dadosCal.tipo)}>${r}</option>`).join('')}</select>${erro(errosCal, 'tipo')}</label>
        <label>Nome *
          <input name="nome" value="${h(dadosCal.nome)}" maxlength="60" required placeholder="Ex.: 1.º período, Natal"${cls(errosCal, 'nome')}>${erro(errosCal, 'nome')}</label>
        <label>Início *
          <input type="date" name="inicio" value="${h(dadosCal.inicio)}" required${cls(errosCal, 'inicio')}>${erro(errosCal, 'inicio')}</label>
        <label>Fim *
          <input type="date" name="fim" value="${h(dadosCal.fim)}" required${cls(errosCal, 'fim')}>${erro(errosCal, 'fim')}</label>
        <div class="coluna-toda barra-acoes"><button class="botao">Acrescentar</button></div>
      </form>
      <p class="legenda">Os alunos veem o calendário do ano letivo da sua turma, no separador Informações.</p>
    </section>

    <section class="cartao">
      <h2>Publicar aviso</h2>
      ${Object.keys(errosAviso).length ? `<div class="alerta alerta-erro" role="alert">Corrija os campos assinalados.</div>` : ''}
      <form method="post" action="/admin/avisos" class="grelha-form">
        <label class="coluna-dupla">Título *
          <input name="titulo" value="${h(dadosAviso.titulo)}" maxlength="150" required placeholder="Ex.: Reunião de encarregados de educação"${cls(errosAviso, 'titulo')}>${erro(errosAviso, 'titulo')}</label>
        <label>Para
          <select name="turma_id"${cls(errosAviso, 'turma_id')}>
            <option value="">Todos os alunos</option>
            ${turmas.map((t) => `<option value="${t.id}"${selecionado(t.id, dadosAviso.turma_id)}>Só a turma ${h(t.nome)}</option>`).join('')}
          </select>${erro(errosAviso, 'turma_id')}</label>
        <label class="coluna-toda">Texto *
          <textarea name="texto" rows="4" maxlength="3000" required${cls(errosAviso, 'texto')}>${h(dadosAviso.texto)}</textarea>${erro(errosAviso, 'texto')}</label>
        <div class="coluna-toda barra-acoes"><button class="botao">Publicar</button></div>
      </form>
    </section>

    <section class="cartao">
      <div class="cartao-topo"><h2>Avisos publicados</h2><span class="contador">${avisos.length} aviso(s)</span></div>
      ${
        avisos.length
          ? `<ul class="lista-avisos">${avisos
              .map(
                (a) => `<li>
                  <p class="aviso-data">${h(formatarData(a.publicado_em))} · ${a.turma ? `<span class="etiqueta">${h(a.turma)}</span>` : 'Todos os alunos'}${a.autor ? ` · ${h(a.autor)}` : ''}</p>
                  <h3>${h(a.titulo)}</h3>
                  <p class="aviso-texto">${h(a.texto)}</p>
                  <form method="post" action="/admin/avisos/${a.id}/apagar" data-confirmar="Apagar este aviso?"><button class="botao-texto perigo">Apagar</button></form>
                </li>`
              )
              .join('')}</ul>`
          : vazio('Ainda não há avisos.')
      }
    </section>`;

  res.html(pagina(req, { titulo: 'Calendário e avisos', ativo: 'calendario', subtitulo: 'O que os alunos veem no separador Informações' }, conteudo), estado);
}

get('/admin/calendario', (req, res) => paginaCalendario(req, res, { ano: req.query.ano }));

post('/admin/calendario', async (req, res) => {
  const dados = {
    ano_letivo: String(req.corpo.ano_letivo || ''),
    tipo: String(req.corpo.tipo || ''),
    nome: String(req.corpo.nome || '').trim().replace(/\s+/g, ' '),
    inicio: String(req.corpo.inicio || ''),
    fim: String(req.corpo.fim || ''),
  };
  const erros = {};
  if (!anoValido(dados.ano_letivo)) erros.ano_letivo = 'Ano letivo inválido.';
  if (!(dados.tipo in TIPOS_CALENDARIO)) erros.tipo = 'Tipo inválido.';
  if (dados.nome.length < 2 || dados.nome.length > 60) erros.nome = 'Nome de 2 a 60 caracteres.';
  if (!dataValida(dados.inicio)) erros.inicio = 'Data inválida.';
  if (!dataValida(dados.fim)) erros.fim = 'Data inválida.';
  else if (dataValida(dados.inicio) && dados.fim < dados.inicio) erros.fim = 'O fim não pode ser antes do início.';
  if (Object.keys(erros).length) return paginaCalendario(req, res, { ano: dados.ano_letivo, dadosCal: dados, errosCal: erros }, 422);

  await executar(
    'INSERT INTO calendario (ano_letivo, tipo, nome, inicio, fim) VALUES (?, ?, ?, ?, ?)',
    dados.ano_letivo,
    dados.tipo,
    dados.nome,
    dados.inicio,
    dados.fim
  );
  req.flash('sucesso', `${dados.nome} acrescentado ao calendário.`);
  res.redirecionar(`/admin/calendario?ano=${encodeURIComponent(dados.ano_letivo)}`);
});

post('/admin/calendario/:id/apagar', async (req, res) => {
  const c = await um('SELECT * FROM calendario WHERE id = ?', req.params.id);
  if (c) {
    await executar('DELETE FROM calendario WHERE id = ?', c.id);
    req.flash('sucesso', `${c.nome} apagado do calendário.`);
  }
  res.redirecionar(`/admin/calendario${c ? `?ano=${encodeURIComponent(c.ano_letivo)}` : ''}`);
});

post('/admin/avisos', async (req, res) => {
  const dados = {
    titulo: String(req.corpo.titulo || '').trim().replace(/\s+/g, ' '),
    texto: String(req.corpo.texto || '').trim().replace(/\r\n/g, '\n'),
    turma_id: req.corpo.turma_id ? Number(req.corpo.turma_id) : null,
  };
  const erros = {};
  if (dados.titulo.length < 3 || dados.titulo.length > 150) erros.titulo = 'Título de 3 a 150 caracteres.';
  if (!dados.texto || dados.texto.length > 3000) erros.texto = 'Escreva o texto do aviso (até 3000 caracteres).';
  if (dados.turma_id !== null && (!Number.isInteger(dados.turma_id) || !(await um('SELECT 1 FROM turmas WHERE id = ?', dados.turma_id)))) {
    erros.turma_id = 'Turma inválida.';
  }
  if (Object.keys(erros).length) return paginaCalendario(req, res, { dadosAviso: dados, errosAviso: erros }, 422);

  await executar('INSERT INTO avisos (titulo, texto, turma_id, publicado_por) VALUES (?, ?, ?, ?)', dados.titulo, dados.texto, dados.turma_id, req.utilizador.id);
  req.flash('sucesso', 'Aviso publicado.');
  res.redirecionar('/admin/calendario');
});

post('/admin/avisos/:id/apagar', async (req, res) => {
  const r = await executar('DELETE FROM avisos WHERE id = ?', req.params.id);
  req.flash(r.changes ? 'sucesso' : 'erro', r.changes ? 'Aviso apagado.' : 'Aviso não encontrado.');
  res.redirecionar('/admin/calendario');
});
