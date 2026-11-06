// Atas das reuniões de turma. O diretor de turma grava a reunião ao microfone (o browser transcreve o que é
// dito, ver public/ata.js), a aplicação monta a ata formal (src/lib/ata.js) e ele revê e guarda.
// Os outros professores da turma e o administrador só leem. O áudio nunca chega ao servidor: só texto.
const { get, post } = require('../lib/servidor');
const { um, executar } = require('../db');
const { pagina, vazio, icone, botaoImprimir } = require('../vistas/layout');
const { h, hoje, formatarData, formatarDataLonga } = require('../lib/util');
const { gerarAta } = require('../lib/ata');

const LIMITE_ATA = 20000; // caracteres
const LIMITE_TRANSCRICAO = 60000;

function carregarReuniao(id) {
  return um(
    `SELECT r.*, t.nome AS turma, t.diretor_id, t.delegado_id, t.subdelegado_id,
            p.nome AS diretor, d.nome AS delegado, s.nome AS subdelegado, u.nome AS ata_por_nome
       FROM reunioes_turma r
       JOIN turmas t ON t.id = r.turma_id
       LEFT JOIN professores p ON p.id = t.diretor_id
       LEFT JOIN alunos d ON d.id = t.delegado_id
       LEFT JOIN alunos s ON s.id = t.subdelegado_id
       LEFT JOIN utilizadores u ON u.id = r.ata_por
      WHERE r.id = ?`,
    id
  );
}

async function lecionaTurma(professorId, turmaId) {
  return !!(await um('SELECT 1 FROM horario WHERE professor_id = ? AND turma_id = ? AND ativo = 1', professorId, turmaId));
}

// A ata escreve-se a partir do dia da reunião (pode ser durante a própria reunião, a gravar)
const podeEscrever = (req, r) => !!req.professor && r.diretor_id === req.professor.id && r.data <= hoje();

// Quem esteve presente: o diretor de turma sempre; delegado e subdelegado conforme as caixas marcadas
function presentesDoFormulario(r, corpo) {
  const presentes = [{ nome: r.diretor || 'o diretor de turma', papel: 'diretor de turma' }];
  if (r.delegado && corpo.delegado === '1') presentes.push({ nome: r.delegado, papel: 'delegado de turma' });
  if (r.subdelegado && corpo.subdelegado === '1') presentes.push({ nome: r.subdelegado, papel: 'subdelegado de turma' });
  return presentes;
}

function cartaoAtaGuardada(r) {
  const quando = r.ata_em ? `${formatarData(r.ata_em)} às ${r.ata_em.slice(11, 16)}` : '';
  return `<section class="cartao">
    <div class="cartao-topo">
      <h2>Ata</h2>
      <span class="texto-suave">Escrita por ${h(r.ata_por_nome || '—')}${quando ? ` · ${h(quando)}` : ''}</span>
    </div>
    <div class="ata-texto">${h(r.ata)}</div>
  </section>`;
}

// Formulário do diretor de turma: 1. gravar (transcrição), 2. presentes, 3. ata (gerada e revista)
function formularioAta(r, { transcricao = '', ata = '', marcados = { delegado: true, subdelegado: true }, outros = '', mensagem = '' }) {
  const caixa = (campo, rotulo, nome) =>
    nome
      ? `<label class="linha-check"><input type="checkbox" name="${campo}" value="1"${marcados[campo] ? ' checked' : ''}><span>${h(nome)} <small class="texto-suave">(${rotulo})</small></span></label>`
      : '';
  return `<form method="post" action="/professor/reunioes/${r.id}/ata" class="formulario-ata" data-rascunho="ata-transcricao-${r.id}">
    <section class="cartao">
      <h2>1. Gravar a reunião</h2>
      <p class="texto-suave">Carregue em <strong>Começar a gravar</strong> no início da reunião e deixe o computador perto de quem fala.
        O que for dito vai aparecendo escrito na caixa em baixo; pode corrigir o texto à mão a qualquer momento.
        Diga «parágrafo» para mudar de parágrafo.</p>
      <div class="ditado" data-ditado>
        <button type="button" class="botao" data-ditado-botao>${icone('microfone')}<span>Começar a gravar</span></button>
        <span class="ditado-estado" data-ditado-estado aria-live="polite"></span>
      </div>
      <p class="ditado-provisorio" data-ditado-provisorio aria-hidden="true"></p>
      <label>Transcrição
        <textarea name="transcricao" rows="10" maxlength="${LIMITE_TRANSCRICAO}" data-ditado-texto
          placeholder="O texto ditado aparece aqui. Também pode escrever à mão.">${h(transcricao)}</textarea></label>
      <p class="legenda">O reconhecimento de voz é feito pelo próprio browser (no Chrome e no Edge, através dos serviços da Google e da
        Microsoft), por isso precisa de internet e de autorização para usar o microfone. A aplicação não guarda o áudio — só o texto da ata.</p>
    </section>
    <section class="cartao">
      <h2>2. Presentes</h2>
      <div class="formulario">
        <label class="linha-check"><input type="checkbox" checked disabled><span>${h(r.diretor || 'Diretor de turma')} <small class="texto-suave">(diretor de turma)</small></span></label>
        ${caixa('delegado', 'delegado de turma', r.delegado)}
        ${caixa('subdelegado', 'subdelegado de turma', r.subdelegado)}
        <label>Outros presentes
          <input name="outros" value="${h(outros)}" maxlength="200" placeholder="Ex.: a encarregada de educação Carla Santos"></label>
      </div>
      <div class="barra-acoes">
        <button class="botao botao-secundario" name="acao" value="gerar">Gerar ata a partir da transcrição</button>
      </div>
    </section>
    <section class="cartao">
      <h2>3. Ata</h2>
      ${mensagem}
      <label class="sr" for="ata-${r.id}">Texto da ata</label>
      <textarea id="ata-${r.id}" name="ata" rows="18" maxlength="${LIMITE_ATA}"
        placeholder="Carregue em «Gerar ata a partir da transcrição», ou escreva a ata à mão.">${h(ata)}</textarea>
      <div class="barra-acoes"><button class="botao" name="acao" value="guardar">Guardar ata</button></div>
    </section>
  </form>
  <script src="/static/ata.js" defer></script>`;
}

// opcoes: { voltar, edicao: {...} } — edicao só existe quando quem vê pode escrever a ata
function paginaAta(req, res, r, { voltar, edicao = null, estado = 200 }) {
  let corpo;
  if (edicao) {
    // Já com ata guardada, o formulário fica fechado por baixo dela (a não ser que se esteja a meio de uma edição)
    corpo = r.ata
      ? `${cartaoAtaGuardada(r)}
         <details class="cartao no-imprimir"${edicao.aberto ? ' open' : ''}>
           <summary>Editar a ata ou voltar a gravar</summary>
           ${formularioAta(r, edicao)}
         </details>`
      : formularioAta(r, edicao);
  } else if (r.ata) {
    corpo = cartaoAtaGuardada(r);
  } else {
    const ehDiretor = req.professor && r.diretor_id === req.professor.id;
    corpo = vazio(
      ehDiretor && r.data > hoje()
        ? 'A ata pode ser escrita a partir do dia da reunião (e gravada durante a própria reunião).'
        : 'A ata desta reunião ainda não foi escrita pelo diretor de turma.'
    );
  }
  const subtitulo = `${h(r.turma)} · ${h(formatarDataLonga(r.data))} às ${h(r.hora)}${r.local ? ` · ${h(r.local)}` : ''}${
    r.assunto ? ` · ${h(r.assunto)}` : ''
  }`;
  res.html(
    pagina(
      req,
      { titulo: 'Ata da reunião', ativo: 'turmas', subtitulo, acoes: r.ata ? botaoImprimir() : '' },
      `<p class="no-imprimir"><a href="${voltar}" class="voltar">← ${h(r.turma)}</a></p>${corpo}`
    ),
    estado
  );
}

// ---------- Professor ----------
get('/professor/reunioes/:id/ata', async (req, res) => {
  const r = await carregarReuniao(req.params.id);
  const ehDiretor = r && req.professor && r.diretor_id === req.professor.id;
  if (!r || !req.professor || !(ehDiretor || (await lecionaTurma(req.professor.id, r.turma_id)))) {
    req.flash('erro', 'Só pode ver as atas das reuniões das suas turmas.');
    return res.redirecionar('/professor/turmas');
  }
  paginaAta(req, res, r, {
    voltar: `/professor/turmas?turma=${r.turma_id}`,
    edicao: podeEscrever(req, r) ? { ata: r.ata || '' } : null,
  });
});

post('/professor/reunioes/:id/ata', async (req, res) => {
  const r = await carregarReuniao(req.params.id);
  if (!r || !podeEscrever(req, r)) {
    req.flash('erro', 'Só o diretor de turma escreve a ata, a partir do dia da reunião.');
    return res.redirecionar(r ? `/professor/reunioes/${r.id}/ata` : '/professor/turmas');
  }
  const voltar = `/professor/turmas?turma=${r.turma_id}`;
  const transcricao = String(req.corpo.transcricao || '').slice(0, LIMITE_TRANSCRICAO);
  const outros = String(req.corpo.outros || '').trim().slice(0, 200);
  const marcados = { delegado: req.corpo.delegado === '1', subdelegado: req.corpo.subdelegado === '1' };
  const ata = String(req.corpo.ata || '').replace(/\r\n/g, '\n').trim();
  const edicao = (mensagem, textoAta) => ({ transcricao, outros, marcados, mensagem, ata: textoAta, aberto: true });

  if (req.corpo.acao === 'gerar') {
    const gerada = gerarAta({
      turma: r.turma,
      reuniao: r,
      diretor: r.diretor || '',
      presentes: presentesDoFormulario(r, req.corpo),
      outros,
      transcricao,
    });
    const aviso = `<div class="alerta alerta-sucesso" role="status">Ata gerada a partir da transcrição. Reveja o texto (nomes, decisões) e carregue em «Guardar ata».</div>`;
    return paginaAta(req, res, r, { voltar, edicao: edicao(aviso, gerada) });
  }

  if (!ata || ata.length > LIMITE_ATA) {
    const erro = `<div class="alerta alerta-erro" role="alert">${ata ? `A ata é demasiado longa (máx. ${LIMITE_ATA} caracteres).` : 'A ata está vazia: gere-a a partir da transcrição ou escreva-a antes de guardar.'}</div>`;
    return paginaAta(req, res, r, { voltar, edicao: edicao(erro, ata), estado: 422 });
  }
  await executar('UPDATE reunioes_turma SET ata = ?, ata_por = ?, ata_em = NOW() WHERE id = ?', ata, req.utilizador.id, r.id);
  req.flash('sucesso', 'Ata guardada. Os professores da turma e a direção já a podem ler.');
  res.redirecionar(`/professor/reunioes/${r.id}/ata`);
});

// ---------- Administrador (só leitura) ----------
get('/admin/reunioes/:id/ata', async (req, res) => {
  const r = await carregarReuniao(req.params.id);
  if (!r) return res.redirecionar('/admin/turmas');
  paginaAta(req, res, r, { voltar: `/admin/turmas/${r.turma_id}` });
});
