// Aviso de excesso de faltas por módulo (cursos profissionais).
// Num curso profissional o aluno tem de assistir a pelo menos 90% das horas de cada módulo: pode faltar
// a 10% das horas (LIMITE_FALTAS). Cada falta de presença conta como um tempo letivo = uma hora do módulo.
// Uma falta pertence ao módulo da lição desse dia (licoes.modulo_id, escolhido no sumário).
//
// Quando um aluno chega a METADE das faltas permitidas num módulo e quando chega ao LIMITE, a aplicação
// avisa sozinha, por email, o aluno, o encarregado de educação e o diretor de turma. A tabela
// avisos_faltas guarda os avisos já enviados, para cada um só sair uma vez.
// Contam as faltas justificadas e as injustificadas: a regra dos 90% é sobre a assiduidade (as
// justificadas dão direito a recuperar, mas não deixam de ser horas em falta).
const { todos, um, executar } = require('../db');
const { h, LIMITE_FALTAS, TIPOS_FALTA } = require('./util');
const { enviarEmail, ligacaoDaEscola } = require('./email');
const { escolaAtual } = require('./contexto');

const NIVEIS = {
  metade: { titulo: 'metade das faltas permitidas', classe: 'etiqueta-aviso' },
  limite: { titulo: 'limite de faltas', classe: 'etiqueta-perigo' },
};

const numero = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

// Limite de faltas de um módulo (em horas/tempos). Sem horas definidas não há limite (nem avisos).
function limiteDoModulo(horas) {
  return horas > 0 ? horas * LIMITE_FALTAS : null;
}

// Nível atingido com estas faltas: 'limite', 'metade' ou null
function nivelFaltas(faltas, horas) {
  const limite = limiteDoModulo(horas);
  if (!limite || !faltas) return null;
  if (faltas >= limite) return 'limite';
  if (faltas >= limite / 2) return 'metade';
  return null;
}

// Faltas de presença por aluno e módulo, só para módulos com horas. Devolve só quem já chegou a metade.
async function situacaoPorModulo(alunoIds, { moduloId = null } = {}) {
  if (!alunoIds.length) return [];
  const linhas = await todos(
    `SELECT f.aluno_id, a.nome AS aluno, a.turma_id, t.nome AS turma,
            m.id AS modulo_id, m.numero, m.nome AS modulo, m.horas, d.nome AS disciplina,
            COUNT(*) AS faltas, SUM(f.justificada = 0) AS injustificadas
       FROM faltas f
       JOIN licoes l ON l.horario_id = f.horario_id AND l.data = f.data
       JOIN modulos m ON m.id = l.modulo_id
       JOIN disciplinas d ON d.id = m.disciplina_id
       JOIN alunos a ON a.id = f.aluno_id
       LEFT JOIN turmas t ON t.id = a.turma_id
      WHERE f.tipo = 'presenca' AND f.aluno_id IN (?) AND m.horas > 0 ${moduloId ? 'AND m.id = ?' : ''}
      GROUP BY f.aluno_id, m.id
      ORDER BY a.nome, d.nome, m.numero`,
    alunoIds,
    ...(moduloId ? [moduloId] : [])
  );
  return linhas
    .map((l) => {
      const faltas = Number(l.faltas);
      return { ...l, faltas, injustificadas: Number(l.injustificadas), limite: limiteDoModulo(l.horas), nivel: nivelFaltas(faltas, l.horas) };
    })
    .filter((l) => l.nivel)
    .sort((x, y) => (x.nivel === y.nivel ? y.faltas / y.limite - x.faltas / x.limite : x.nivel === 'limite' ? -1 : 1));
}

function textoEmail(s, nivel, saudacao, destinatario) {
  const escola = escolaAtual().nome;
  const nomeModulo = `${s.disciplina} — Módulo ${s.numero} (${s.modulo})`;
  const restantes = Math.max(0, Math.ceil(s.limite) - s.faltas);
  return [
    `Olá${saudacao ? `, ${saudacao}` : ''},`,
    ``,
    nivel === 'limite'
      ? `${destinatario} chegou ao LIMITE de faltas no módulo ${nomeModulo}.`
      : `${destinatario} já tem METADE das faltas permitidas no módulo ${nomeModulo}.`,
    ``,
    `Faltas neste módulo: ${s.faltas} hora(s)${s.injustificadas ? `, ${s.injustificadas} por justificar` : ''}.`,
    `Horas do módulo: ${s.horas} · limite de faltas (${LIMITE_FALTAS * 100}%): ${numero(s.limite)} hora(s).`,
    ``,
    nivel === 'limite'
      ? `Nos cursos profissionais é obrigatório assistir a pelo menos ${(1 - LIMITE_FALTAS) * 100}% das horas de cada módulo. ` +
        `Ultrapassado o limite, o aluno pode ter de fazer um plano de recuperação ou ficar excluído do módulo por faltas. ` +
        `Fale com o diretor de turma.`
      : `Ainda pode faltar a ${restantes} hora(s) neste módulo antes de chegar ao limite. Justifique as faltas que puder.`,
    ``,
    `${escola} — este email foi enviado automaticamente pela aplicação da escola, em ${new Date().toLocaleDateString('pt-PT')}.`,
  ].join('\n');
}

// Chamado depois de registar faltas numa lição: vê, para os alunos indicados e o módulo da lição, se
// alguém chegou a um nível novo e envia os emails. Nunca lança erro (não deve estragar o registo da aula).
// Devolve o número de alunos avisados.
async function verificarAvisosFaltas(alunoIds, moduloId) {
  if (!moduloId || !alunoIds.length) return 0;
  try {
    let avisados = 0;
    for (const s of await situacaoPorModulo(alunoIds, { moduloId })) {
      // Quem salta logo para o limite não recebe também o aviso de metade, mas fica marcado como enviado
      const niveis = s.nivel === 'limite' ? ['metade', 'limite'] : ['metade'];
      let novo = null;
      for (const nivel of niveis) {
        const r = await executar(
          'INSERT IGNORE INTO avisos_faltas (aluno_id, modulo_id, nivel, faltas) VALUES (?, ?, ?, ?)',
          s.aluno_id,
          s.modulo_id,
          nivel,
          s.faltas
        );
        if (r.changes) novo = nivel;
      }
      if (!novo) continue;
      await enviarAviso(s, novo);
      avisados++;
    }
    return avisados;
  } catch (erro) {
    console.error('Falha nos avisos de faltas:', erro.message);
    return 0;
  }
}

async function enviarAviso(s, nivel) {
  const pessoas = await um(
    `SELECT a.nome, a.email, e.nome AS encarregado, e.email AS encarregado_email,
            p.nome AS diretor, p.email AS diretor_email
       FROM alunos a
       LEFT JOIN encarregados e ON e.id = a.encarregado_id
       LEFT JOIN turmas t ON t.id = a.turma_id
       LEFT JOIN professores p ON p.id = t.diretor_id
      WHERE a.id = ?`,
    s.aluno_id
  );
  if (!pessoas) return;
  const assunto = `${escolaAtual().nome} — ${nivel === 'limite' ? 'limite de faltas atingido' : 'aviso de faltas'}: ${s.disciplina}, módulo ${s.numero} (${pessoas.nome})`;
  const envios = [];
  if (pessoas.email) {
    envios.push({
      para: pessoas.email,
      texto: textoEmail(s, nivel, pessoas.nome, 'Você') + `\n\nVer as suas faltas: ${ligacaoDaEscola('/aluno/faltas')}`,
    });
  }
  if (pessoas.encarregado_email) {
    envios.push({
      para: pessoas.encarregado_email,
      texto: textoEmail(s, nivel, pessoas.encarregado, pessoas.nome) + `\n\nVer as faltas e enviar justificativos: ${ligacaoDaEscola('/encarregado/faltas')}`,
    });
  }
  if (pessoas.diretor_email) {
    envios.push({
      para: pessoas.diretor_email,
      texto: textoEmail(s, nivel, pessoas.diretor, `${pessoas.nome} (${s.turma || 'sem turma'})`) + `\n\nVer o aluno: ${ligacaoDaEscola(`/professor/alunos/${s.aluno_id}`)}`,
    });
  }
  // Um email para cada pessoa (cada um vê só o seu endereço)
  for (const e of envios) await enviarEmail({ para: e.para, assunto, texto: e.texto });
}

// ---------- Aviso ao encarregado a cada falta nova ----------
// Chamado depois de o professor guardar uma aula. "novas": Map alunoId → [tipos de falta novos nesta aula].
// Envia um email ao encarregado de cada aluno (se tiver conta, email e não tiver desligado os avisos).
// Nunca lança erro. Devolve o número de encarregados avisados.
async function avisarFaltasNovas(novas, { horarioId, data }) {
  if (!novas.size) return 0;
  try {
    const aula = await um(
      `SELECT hr.hora_inicio, hr.hora_fim, d.nome AS disciplina, t.nome AS turma, p.nome AS diretor
         FROM horario hr JOIN disciplinas d ON d.id = hr.disciplina_id JOIN turmas t ON t.id = hr.turma_id
         LEFT JOIN professores p ON p.id = t.diretor_id
        WHERE hr.id = ?`,
      horarioId
    );
    const destinatarios = await todos(
      `SELECT a.id, a.nome, e.nome AS encarregado, e.email
         FROM alunos a JOIN encarregados e ON e.id = a.encarregado_id
        WHERE a.id IN (?) AND e.email IS NOT NULL AND e.email <> '' AND e.avisar_faltas = 1`,
      [...novas.keys()]
    );
    const dia = new Date(`${data}T12:00:00`).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    let avisados = 0;
    for (const d of destinatarios) {
      const tipos = novas.get(d.id).map((t) => TIPOS_FALTA[t] || t);
      // (sem SMTP configurado o email aparece só na consola; conta-se na mesma, como nos outros avisos)
      await enviarEmail({
        para: d.email,
        assunto: `${escolaAtual().nome} — falta registada: ${d.nome} (${aula.disciplina}, ${dia})`,
        texto: [
          `Olá${d.encarregado ? `, ${d.encarregado}` : ''},`,
          ``,
          `Foi registada uma falta a ${d.nome}:`,
          ``,
          `  Dia: ${dia}`,
          `  Aula: ${aula.disciplina}, ${aula.hora_inicio}–${aula.hora_fim} (${aula.turma})`,
          `  Tipo: ${tipos.join(' e ')}`,
          ``,
          `Se a falta tiver justificação, pode enviar o justificativo (PDF ou fotografia) na aplicação:`,
          ligacaoDaEscola('/encarregado/faltas'),
          ``,
          `Dúvidas: fale com o diretor de turma${aula.diretor ? ` (${aula.diretor})` : ''}.`,
          `Para deixar de receber um email a cada falta, desligue os avisos no Painel da aplicação.`,
          ``,
          `${escolaAtual().nome} — email enviado automaticamente pela aplicação da escola.`,
        ].join('\n'),
      });
      avisados++;
    }
    return avisados;
  } catch (erro) {
    console.error('Falha nos avisos de faltas novas:', erro.message);
    return 0;
  }
}

// ---------- Componentes para os painéis ----------
function etiquetaModulo(s) {
  return `<span class="etiqueta ${NIVEIS[s.nivel].classe}" title="${s.nivel === 'limite' ? 'Limite atingido' : 'Metade do limite'}">${h(s.disciplina)} · M${s.numero} · ${s.faltas}/${numero(s.limite)} h</span>`;
}

// Cartão para o aluno ou para o encarregado (situação de um aluno)
function cartaoFaltasModulos(situacao, { paraEncarregado = false, nome = '' } = {}) {
  if (!situacao.length) return '';
  const limite = situacao.filter((s) => s.nivel === 'limite');
  const quem = paraEncarregado ? `${h(nome)} chegou` : 'Chegou';
  return `<section class="cartao cartao-faltas-modulos${limite.length ? ' com-limite' : ''}">
    <div class="cartao-topo"><h2>Faltas por módulo</h2>
      <span class="texto-suave">${limite.length ? `${limite.length} módulo(s) no limite` : 'A metade do limite'}</span></div>
    <p class="texto-suave">${quem} a metade ou ao limite de faltas (${LIMITE_FALTAS * 100}% das horas) nestes módulos.
      ${limite.length ? 'No limite, fale com o diretor de turma: pode ser preciso um plano de recuperação.' : 'Atenção às próximas faltas.'}</p>
    <ul class="lista-simples">${situacao
      .map(
        (s) => `<li><span><strong>${h(s.disciplina)} — Módulo ${s.numero}</strong><small>${h(s.modulo)} · ${s.horas} h</small></span>
          <span class="etiqueta ${NIVEIS[s.nivel].classe}">${s.faltas} de ${numero(s.limite)} h${s.nivel === 'limite' ? ' · limite' : ' · metade'}</span></li>`
      )
      .join('')}</ul>
  </section>`;
}

module.exports = {
  limiteDoModulo,
  nivelFaltas,
  situacaoPorModulo,
  verificarAvisosFaltas,
  avisarFaltasNovas,
  cartaoFaltasModulos,
  etiquetaModulo,
  NIVEIS,
};
