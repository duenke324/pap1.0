// Justificativos de faltas: o encarregado de educação envia um ficheiro (PDF ou imagem) para uma ou
// mais faltas do educando; o diretor de turma ou a administração aceita ou recusa.
// Este módulo guarda os ficheiros, lê os pedidos e aplica a decisão — é usado pelas rotas do
// encarregado, do professor e do administrador.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { todos, transacao, pastaJustificativos } = require('../db');
const { avatar, vazio } = require('../vistas/layout');
const { h, formatarData, formatarDataLonga, TIPOS_FALTA } = require('./util');
const { enviarEmail, ligacaoDaEscola } = require('./email');
const { escolaAtual } = require('./contexto');
const { notificar } = require('./push');

const TAMANHO_MAXIMO = 3 * 1024 * 1024; // 3 MB (em base64 ocupa 4 MB, abaixo do limite de 6 MB do formulário)

// Tipos aceites: extensão com que fica guardado e os primeiros bytes que o ficheiro tem de ter.
// Não se confia no tipo indicado pelo browser: um ficheiro só é aceite se o conteúdo corresponder.
const TIPOS_FICHEIRO = {
  'application/pdf': { extensao: 'pdf', assinatura: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  'image/jpeg': { extensao: 'jpg', assinatura: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { extensao: 'png', assinatura: (b) => b.subarray(0, 4).toString('hex') === '89504e47' },
};

// Recebe o ficheiro em base64 (lido pelo browser) e grava-o em data/justificativos.
// O nome é aleatório: o nome original do ficheiro nunca é usado no disco.
function guardarFicheiroJustificativo(dataUrl) {
  const m = /^data:(application\/pdf|image\/jpeg|image\/png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error('Formato inválido: envie um PDF ou uma imagem JPG ou PNG.');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > TAMANHO_MAXIMO) throw new Error('O ficheiro é demasiado grande (máx. 3 MB).');
  const tipo = TIPOS_FICHEIRO[m[1]];
  if (!tipo.assinatura(bytes)) throw new Error('O ficheiro não é um PDF nem uma imagem válida.');
  const nome = `justificativo-${crypto.randomBytes(12).toString('hex')}.${tipo.extensao}`;
  fs.writeFileSync(path.join(pastaJustificativos(), nome), bytes);
  return nome;
}

function apagarFicheiroJustificativo(nome) {
  if (!nome) return;
  fs.rm(path.join(pastaJustificativos(), path.basename(nome)), { force: true }, () => {});
}

// Regista um pedido de justificação: usado pelo encarregado (aluno menor) e pelo próprio aluno maior de
// idade. "faltas" são as faltas do aluno (faltasDoAluno); "ids" as escolhidas no formulário.
// Devolve { erro } ou { quantas }.
async function registarJustificativo({ alunoId, utilizadorId, faltas, ids, motivo, ficheiroDados }) {
  ids = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  motivo = String(motivo || '').trim().slice(0, 200);
  if (!ids.length) return { erro: 'Selecione pelo menos uma falta.' };
  if (!motivo) return { erro: 'Indique o motivo da falta.' };
  if (!ficheiroDados) return { erro: 'Anexe o justificativo (PDF ou imagem).' };

  // As faltas têm de ser deste aluno, estar por justificar e não ter já um pedido pendente
  const validas = faltas.filter((f) => ids.includes(f.id) && !f.justificada && !f.pendente);
  if (validas.length !== ids.length) {
    return { erro: 'Algumas das faltas escolhidas já foram justificadas ou já têm um justificativo à espera de validação.' };
  }

  let ficheiro;
  try {
    ficheiro = guardarFicheiroJustificativo(String(ficheiroDados));
  } catch (e) {
    return { erro: e.message };
  }
  try {
    await transacao(async (tx) => {
      const j = await tx.executar(
        'INSERT INTO justificativos (aluno_id, enviado_por, motivo, ficheiro) VALUES (?, ?, ?, ?)',
        alunoId,
        utilizadorId,
        motivo,
        ficheiro
      );
      for (const id of ids) {
        await tx.executar('INSERT INTO justificativo_faltas (justificativo_id, falta_id) VALUES (?, ?)', j.lastInsertRowid, id);
      }
    });
  } catch (e) {
    apagarFicheiroJustificativo(ficheiro); // a BD não mudou: o ficheiro não pode ficar sem dono
    throw e;
  }
  // Notificação a quem valida: o diretor de turma do aluno e a direção (se ligaram as notificações)
  const quem = await todos(
    `SELECT a.nome, p.utilizador_id AS diretor_u FROM alunos a
       LEFT JOIN turmas t ON t.id = a.turma_id LEFT JOIN professores p ON p.id = t.diretor_id WHERE a.id = ?`,
    alunoId
  );
  const direcao = await todos("SELECT id FROM utilizadores WHERE papel = 'admin'");
  const mensagem = { titulo: 'Justificativo novo para validar', corpo: `${quem[0]?.nome || 'Aluno'}: ${ids.length} falta(s) — ${motivo}.` };
  await notificar(quem[0]?.diretor_u, { ...mensagem, url: '/professor/justificativos' });
  await notificar(direcao.map((d) => d.id), { ...mensagem, url: '/admin/justificativos' });
  return { quantas: ids.length };
}

// Formulário para escolher as faltas por justificar e enviar o documento (encarregado e aluno maior)
const MOTIVOS_SUGERIDOS = ['Doença', 'Consulta médica', 'Motivo familiar', 'Falecimento de familiar', 'Transporte'];

function barraJustificar() {
  return `<div class="barra-justificar no-imprimir">
      <datalist id="motivos">${MOTIVOS_SUGERIDOS.map((m) => `<option value="${h(m)}">`).join('')}</datalist>
      <label class="crescer">Motivo da falta
        <input name="motivo" list="motivos" maxlength="200" placeholder="Ex.: Doença" required></label>
      <label>Justificativo <small class="texto-suave">(PDF, JPG ou PNG, máx. 3 MB)</small>
        <input type="file" accept="application/pdf,image/jpeg,image/png" data-ficheiro-justificativo required></label>
      <input type="hidden" name="ficheiro_dados" data-dados-justificativo>
      <button class="botao">Enviar justificativo</button>
    </div>`;
}

// ---------- Consultas ----------
// "onde" é sempre texto fixo escrito nas rotas (nunca vem do utilizador); os valores vão em params.
async function listarJustificativos(onde, ...params) {
  const justificativos = await todos(
    `SELECT j.*, a.nome AS aluno, a.numero_processo, a.fotografia, a.encarregado_id,
            a.email AS aluno_email, a.utilizador_id AS aluno_utilizador_id,
            t.nome AS turma, t.diretor_id,
            e.email AS encarregado_email, e.nome AS encarregado_nome,
            ue.nome AS enviado_por_nome, ud.nome AS decidido_por_nome
       FROM justificativos j
       JOIN alunos a ON a.id = j.aluno_id
       LEFT JOIN turmas t ON t.id = a.turma_id
       LEFT JOIN encarregados e ON e.id = a.encarregado_id
       LEFT JOIN utilizadores ue ON ue.id = j.enviado_por
       LEFT JOIN utilizadores ud ON ud.id = j.decidido_por
      WHERE ${onde}
      ORDER BY (j.estado = 'pendente') DESC, j.criado_em DESC, j.id DESC
      LIMIT 200`,
    ...params
  );
  if (!justificativos.length) return [];

  const faltas = await todos(
    `SELECT jf.justificativo_id, f.id, f.data, f.tipo, f.justificada, d.nome AS disciplina, hr.hora_inicio
       FROM justificativo_faltas jf
       JOIN faltas f ON f.id = jf.falta_id
       JOIN horario hr ON hr.id = f.horario_id
       JOIN disciplinas d ON d.id = hr.disciplina_id
      WHERE jf.justificativo_id IN (?)
      ORDER BY f.data, hr.hora_inicio`,
    justificativos.map((j) => j.id)
  );
  for (const j of justificativos) j.faltas = faltas.filter((f) => f.justificativo_id === j.id);
  return justificativos;
}

async function obterJustificativo(id) {
  return (await listarJustificativos('j.id = ?', id))[0];
}

// Quem pode abrir o ficheiro e ver o pedido: a administração, o encarregado do aluno
// e o diretor de turma do aluno.
function podeVerJustificativo(req, j) {
  const papel = req.utilizador.papel;
  if (papel === 'admin') return true;
  if (papel === 'encarregado') return !!req.encarregado && j.encarregado_id === req.encarregado.id;
  if (papel === 'professor') return !!req.professor && j.diretor_id === req.professor.id;
  // O aluno maior de idade vê os pedidos que ele próprio enviou
  if (papel === 'aluno') return !!req.aluno && j.aluno_id === req.aluno.id && j.enviado_por === req.utilizador.id;
  return false;
}

// Só a administração e o diretor de turma decidem
function podeDecidirJustificativo(req, j) {
  return ['admin', 'professor'].includes(req.utilizador.papel) && podeVerJustificativo(req, j);
}

// Aceitar: as faltas do pedido passam a justificadas, com o motivo indicado pelo encarregado.
// Recusar: as faltas ficam como estavam e o encarregado vê o motivo da recusa.
// Devolve { ok, mensagem }.
async function decidirJustificativo(req, id, decisao, resposta) {
  if (!['aceitar', 'recusar'].includes(decisao)) return { ok: false, mensagem: 'Decisão inválida.' };
  resposta = String(resposta || '').trim().slice(0, 200);
  if (decisao === 'recusar' && !resposta) return { ok: false, mensagem: 'Indique o motivo da recusa, para o encarregado saber o que falta.' };

  const j = await obterJustificativo(id);
  if (!j || !podeDecidirJustificativo(req, j)) return { ok: false, mensagem: 'Justificativo não encontrado.' };

  const resultado = await transacao(async (tx) => {
    // A condição "estado = 'pendente'" impede duas decisões sobre o mesmo pedido (ex.: dois separadores abertos)
    const r = await tx.executar(
      `UPDATE justificativos SET estado = ?, resposta = ?, decidido_por = ?, decidido_em = NOW() WHERE id = ? AND estado = 'pendente'`,
      decisao === 'aceitar' ? 'aceite' : 'recusado',
      resposta || null,
      req.utilizador.id,
      id
    );
    if (!r.changes) return { ok: false, mensagem: 'Este justificativo já tinha sido decidido.' };
    if (decisao === 'recusar') return { ok: true, mensagem: `Justificativo de ${j.aluno} recusado.` };

    const f = await tx.executar(
      `UPDATE faltas f JOIN justificativo_faltas jf ON jf.falta_id = f.id
          SET f.justificada = 1, f.justificacao = ?, f.justificada_em = NOW(), f.justificada_por = ?
        WHERE jf.justificativo_id = ? AND f.justificada = 0`,
      j.motivo,
      req.utilizador.id,
      id
    );
    return { ok: true, mensagem: `Justificativo de ${j.aluno} aceite: ${f.changes} falta(s) justificada(s).` };
  });

  // Só depois de a decisão estar guardada: avisa o encarregado por email (se tiver email na ficha).
  // enviarEmail nunca lança erro, por isso uma falha no envio não desfaz nem esconde a decisão.
  // (se foi o próprio aluno, maior de idade, a enviar o pedido, a resposta vai para o email dele)
  const peloAluno = j.enviado_por && j.enviado_por === j.aluno_utilizador_id;
  if (resultado.ok) {
    await notificar(j.enviado_por, {
      titulo: `Justificativo ${decisao === 'aceitar' ? 'aceite' : 'recusado'}`,
      corpo: decisao === 'aceitar' ? `As faltas de ${j.aluno} ficaram justificadas.` : `${j.aluno}: ${resposta}`,
      url: peloAluno ? '/aluno/faltas' : '/encarregado/justificativos',
    });
  }
  const destino = peloAluno ? { email: j.aluno_email, nome: j.aluno, ver: '/aluno/faltas' } : { email: j.encarregado_email, nome: j.encarregado_nome, ver: '/encarregado/justificativos' };
  if (resultado.ok && destino.email) {
    const aceite = decisao === 'aceitar';
    const faltas = j.faltas.map((f) => `  - ${formatarData(f.data)}, ${f.hora_inicio}, ${f.disciplina}`).join('\n');
    const enviado = await enviarEmail({
      para: destino.email,
      assunto: `${escolaAtual().nome} — justificativo ${aceite ? 'aceite' : 'recusado'} (${j.aluno})`,
      texto: [
        `Olá${destino.nome ? `, ${destino.nome}` : ''},`,
        ``,
        `O justificativo que enviou em ${formatarData(j.criado_em)} para ${peloAluno ? 'as suas faltas' : `as faltas de ${j.aluno}`} foi ${aceite ? 'ACEITE' : 'RECUSADO'} por ${req.utilizador.nome}.`,
        ``,
        `Motivo indicado: ${j.motivo}`,
        `Faltas:`,
        faltas || '  (sem faltas associadas)',
        ``,
        aceite ? `Estas faltas ficaram justificadas.` : `Motivo da recusa: ${resposta}`,
        ...(aceite && resposta ? [`Observação da escola: ${resposta}`] : []),
        ...(aceite ? [] : [`As faltas continuam por justificar. Pode enviar outro documento na aplicação.`]),
        ``,
        `Ver os seus pedidos: ${ligacaoDaEscola(destino.ver)}`,
      ].join('\n'),
    });
    if (enviado) resultado.mensagem += peloAluno ? ' O aluno foi avisado por email.' : ' O encarregado foi avisado por email.';
  }
  return resultado;
}

// ---------- Componentes ----------
const ESTADOS_JUSTIFICATIVO = { pendente: 'Pendente de validação', aceite: 'Aceite', recusado: 'Recusado' };

function etiquetaEstadoJustificativo(estado) {
  const classe = { pendente: 'etiqueta-aviso', aceite: 'etiqueta-ok', recusado: 'etiqueta-perigo' }[estado] || '';
  return `<span class="etiqueta ${classe}">${h(ESTADOS_JUSTIFICATIVO[estado] || estado)}</span>`;
}

// Um pedido, com as faltas a que se refere, a ligação para o ficheiro e (para quem decide)
// os botões de aceitar e recusar. acaoDecidir: endereço do POST, ou vazio para só consulta.
function cartaoJustificativo(j, { acaoDecidir = '', mostrarAluno = true } = {}) {
  const faltas = j.faltas.length
    ? `<ul class="justificativo-faltas">${j.faltas
        .map((f) => `<li>${h(formatarDataLonga(f.data))} · ${h(f.hora_inicio)} · ${h(f.disciplina)} <small class="texto-suave">(${h(TIPOS_FALTA[f.tipo])})</small></li>`)
        .join('')}</ul>`
    : '<p class="texto-suave">As faltas deste pedido já não existem.</p>';
  const decisao =
    j.estado === 'pendente'
      ? ''
      : `<p class="texto-suave">${j.estado === 'aceite' ? 'Aceite' : 'Recusado'}${j.decidido_por_nome ? ` por ${h(j.decidido_por_nome)}` : ''}${
          j.decidido_em ? `, em ${h(formatarData(j.decidido_em))}` : ''
        }${j.resposta ? ` — ${h(j.resposta)}` : ''}</p>`;
  const formulario =
    acaoDecidir && j.estado === 'pendente'
      ? `<form method="post" action="${h(acaoDecidir)}" class="barra-justificar">
          <label class="crescer">Observação <small class="texto-suave">(obrigatória para recusar)</small>
            <input name="resposta" maxlength="200" placeholder="Ex.: O atestado não cobre o dia 12"></label>
          <button class="botao" name="decisao" value="aceitar">Aceitar</button>
          <button class="botao botao-perigo" name="decisao" value="recusar">Recusar</button>
        </form>`
      : '';

  return `<article class="justificativo">
    <header class="cartao-topo">
      ${
        mostrarAluno
          ? `<span class="aluno-linha">${avatar({ nome: j.aluno, fotografia: j.fotografia }, 'pequeno')}<span><strong>${h(j.aluno)}</strong><small>${h(j.turma || 'Sem turma')} · ${h(j.numero_processo)}</small></span></span>`
          : `<strong>${h(j.aluno)}</strong>`
      }
      ${etiquetaEstadoJustificativo(j.estado)}
    </header>
    <p><strong>Motivo:</strong> ${h(j.motivo)}</p>
    ${faltas}
    <p class="texto-suave">Enviado${j.enviado_por_nome ? ` por ${h(j.enviado_por_nome)}` : ''} em ${h(formatarData(j.criado_em))} ·
      <a href="/justificativos/${j.id}/ficheiro" target="_blank" rel="noopener">Abrir o justificativo</a></p>
    ${decisao}
    ${formulario}
  </article>`;
}

function listaJustificativos(justificativos, opcoes, textoVazio) {
  if (!justificativos.length) return vazio(textoVazio);
  return justificativos.map((j) => cartaoJustificativo(j, typeof opcoes === 'function' ? opcoes(j) : opcoes)).join('');
}

module.exports = {
  TAMANHO_MAXIMO,
  guardarFicheiroJustificativo,
  apagarFicheiroJustificativo,
  registarJustificativo,
  barraJustificar,
  MOTIVOS_SUGERIDOS,
  listarJustificativos,
  obterJustificativo,
  podeVerJustificativo,
  decidirJustificativo,
  etiquetaEstadoJustificativo,
  cartaoJustificativo,
  listaJustificativos,
};
