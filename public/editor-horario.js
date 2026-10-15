// Editor de horários: arrastar aulas da paleta para a grelha, mover, trocar e remover.
// Também funciona com cliques (útil em ecrãs táteis): clicar numa aula e depois num tempo.
(() => {
  const raiz = document.querySelector('[data-editor-horario]');
  if (!raiz) return;

  const dados = JSON.parse(document.getElementById('dados-horario').textContent);
  const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

  const disciplinas = new Map(dados.disciplinas.map((d) => [d.id, d]));
  const professores = new Map(dados.professores.map((p) => [p.id, p]));

  const el = {
    grelha: raiz.querySelector('[data-grelha]'),
    ofertas: raiz.querySelector('[data-lista-ofertas]'),
    filtro: raiz.querySelector('[data-filtro-paleta]'),
    lixo: raiz.querySelector('[data-lixo]'),
    painel: raiz.querySelector('[data-painel-aula]'),
    resumo: raiz.querySelector('[data-resumo]'),
    guardar: raiz.querySelector('[data-guardar]'),
    descartar: raiz.querySelector('[data-descartar]'),
    estado: raiz.querySelector('[data-estado-editor]'),
    mensagens: raiz.querySelector('[data-mensagens-editor]'),
  };

  // ---------- Estado ----------
  let proximoUid = 1;
  let aulas = dados.aulas.map((a) => ({ ...a, uid: proximoUid++ }));
  const inicial = JSON.stringify(serializar());
  let selecao = null; // { tipo: 'oferta', indice } ou { tipo: 'aula', uid }
  let arrasto = null; // o que está a ser arrastado (mesmo formato de "selecao")

  const chave = (dia, hora) => `${dia}|${hora}`;
  const aulaEm = (dia, hora) => aulas.find((a) => a.dia === dia && a.hora_inicio === hora);

  // Ocupação das outras turmas: professor/sala -> turma
  const ocupProf = new Map();
  const ocupSala = new Map();
  for (const o of dados.ocupacao) {
    if (o.professor_id) ocupProf.set(`${o.professor_id}|${chave(o.dia, o.hora_inicio)}`, o.turma);
    if (o.sala) ocupSala.set(`${o.sala.toLowerCase()}|${chave(o.dia, o.hora_inicio)}`, o.turma);
  }
  const professorOcupado = (profId, dia, hora) => (profId ? ocupProf.get(`${profId}|${chave(dia, hora)}`) : null);
  const salaOcupada = (sala, dia, hora) => (sala ? ocupSala.get(`${sala.toLowerCase()}|${chave(dia, hora)}`) : null);

  function conflitos(a) {
    const lista = [];
    const tp = professorOcupado(a.professor_id, a.dia, a.hora_inicio);
    if (tp) lista.push(`${professores.get(a.professor_id)?.nome} já tem aula com ${tp}`);
    const ts = salaOcupada(a.sala, a.dia, a.hora_inicio);
    if (ts) lista.push(`Sala ${a.sala} ocupada por ${ts}`);
    return lista;
  }

  function serializar() {
    return aulas
      .map((a) => ({ id: a.id ?? null, dia: a.dia, hora_inicio: a.hora_inicio, disciplina_id: a.disciplina_id, professor_id: a.professor_id ?? null, sala: a.sala || '' }))
      .sort((x, y) => x.dia - y.dia || x.hora_inicio.localeCompare(y.hora_inicio));
  }

  const alterado = () => JSON.stringify(serializar()) !== inicial;

  // Sala sugerida: a última usada nesta turma para a mesma disciplina
  const salaSugerida = (disciplinaId) => aulas.find((a) => a.disciplina_id === disciplinaId && a.sala)?.sala || '';

  // ---------- Operações ----------
  // Devolve um texto de erro se não for possível, ou null se correu bem
  function colocarOferta(indice, dia, hora) {
    const o = dados.ofertas[indice];
    const ocupado = professorOcupado(o.professor_id, dia, hora);
    if (ocupado) return `${professores.get(o.professor_id).nome} já tem aula com ${ocupado} nesse tempo.`;
    const existente = aulaEm(dia, hora);
    if (existente && !confirmarRemocao(existente, 'substituir')) return '';
    if (existente) aulas = aulas.filter((a) => a !== existente);
    const nova = { uid: proximoUid++, id: null, disciplina_id: o.disciplina_id, professor_id: o.professor_id, dia, hora_inicio: hora, sala: salaSugerida(o.disciplina_id), faltas: 0, licoes: 0 };
    aulas.push(nova);
    selecao = { tipo: 'aula', uid: nova.uid };
    return null;
  }

  function moverAula(uid, dia, hora) {
    const aula = aulas.find((a) => a.uid === uid);
    if (!aula || (aula.dia === dia && aula.hora_inicio === hora)) return null;
    const ocupado = professorOcupado(aula.professor_id, dia, hora);
    if (ocupado) return `${professores.get(aula.professor_id)?.nome} já tem aula com ${ocupado} nesse tempo.`;
    const outra = aulaEm(dia, hora);
    if (outra) {
      // Trocar as duas aulas de lugar
      const ocupadoOutra = professorOcupado(outra.professor_id, aula.dia, aula.hora_inicio);
      if (ocupadoOutra) return `Não é possível trocar: ${professores.get(outra.professor_id)?.nome} já tem aula com ${ocupadoOutra} no outro tempo.`;
      [outra.dia, outra.hora_inicio] = [aula.dia, aula.hora_inicio];
    }
    aula.dia = dia;
    aula.hora_inicio = hora;
    return null;
  }

  // Aulas com faltas ou sumários (lições dadas) fazem parte do histórico
  const temHistorico = (a) => a.faltas > 0 || a.licoes > 0;
  function descreverHistorico(a) {
    const partes = [];
    if (a.licoes) partes.push(`${a.licoes} sumário(s)`);
    if (a.faltas) partes.push(`${a.faltas} falta(s)`);
    return partes.join(' e ') + ' registado(s)';
  }

  function confirmarRemocao(aula, acao = 'remover') {
    if (!temHistorico(aula)) return true;
    return confirm(
      `Esta aula tem ${descreverHistorico(aula)}. Ao ${acao}, sai do horário mas continua guardada no histórico. Continuar?`
    );
  }

  function removerAula(uid) {
    const aula = aulas.find((a) => a.uid === uid);
    if (!aula || !confirmarRemocao(aula)) return;
    aulas = aulas.filter((a) => a.uid !== uid);
    if (selecao?.uid === uid) selecao = null;
  }

  function aplicarEm(origem, dia, hora) {
    const erro = origem.tipo === 'oferta' ? colocarOferta(origem.indice, dia, hora) : moverAula(origem.uid, dia, hora);
    if (erro) mostrarMensagem('erro', esc(erro));
    else if (erro === null) limparMensagens();
    desenhar();
  }

  // ---------- Desenho ----------
  function cartaoAula(a) {
    const d = disciplinas.get(a.disciplina_id);
    const p = professores.get(a.professor_id);
    const problemas = conflitos(a);
    const selecionada = selecao?.tipo === 'aula' && selecao.uid === a.uid;
    return `<div class="aula cor-${a.disciplina_id % 8} arrastavel${problemas.length ? ' conflito' : ''}${selecionada ? ' selecionada' : ''}"
        draggable="true" data-uid="${a.uid}" tabindex="0" role="button"
        title="${esc(d?.nome || '?')}${problemas.length ? ' — ' + esc(problemas.join('; ')) : ''}">
      <strong>${esc(d?.sigla || '?')}</strong>
      <span>${esc(p?.nome || 'Sem professor')}</span>
      ${a.sala ? `<small>Sala ${esc(a.sala)}</small>` : ''}
      ${temHistorico(a) ? `<small class="marca-faltas" title="Tem ${esc(descreverHistorico(a))}">●</small>` : ''}
    </div>`;
  }

  function desenharGrelha() {
    const origem = arrasto || (selecao?.tipo === 'oferta' ? selecao : null);
    const profArrastado = origem ? professorDe(origem) : null;
    let html = `<thead><tr><th></th>${[1, 2, 3, 4, 5].map((d) => `<th>${DIAS[d].slice(0, 3)}</th>`).join('')}</tr></thead><tbody>`;
    for (const t of dados.tempos) {
      html += `<tr><th class="tempo">${esc(t.hora_inicio)}<small>${esc(t.hora_fim)}</small></th>`;
      for (let dia = 1; dia <= 5; dia++) {
        const aula = aulaEm(dia, t.hora_inicio);
        const bloqueada = profArrastado && professorOcupado(profArrastado, dia, t.hora_inicio);
        const classes = ['celula', aula ? '' : 'livre', bloqueada ? 'bloqueada' : ''].join(' ').trim();
        html += `<td class="${classes}" data-dia="${dia}" data-hora="${esc(t.hora_inicio)}"${bloqueada ? ` title="Professor ocupado (${esc(bloqueada)})"` : ''}>
          ${aula ? cartaoAula(aula) : `<span class="dica-celula">${selecao?.tipo === 'oferta' ? 'Colocar aqui' : ''}</span>`}</td>`;
      }
      html += '</tr>';
    }
    el.grelha.innerHTML = html + '</tbody>';
  }

  function desenharOfertas() {
    const termo = el.filtro.value.trim().toLowerCase();
    const contagem = new Map();
    for (const a of aulas) contagem.set(`${a.disciplina_id}|${a.professor_id}`, (contagem.get(`${a.disciplina_id}|${a.professor_id}`) || 0) + 1);

    const itens = dados.ofertas
      .map((o, i) => ({ o, i, d: disciplinas.get(o.disciplina_id), p: professores.get(o.professor_id) }))
      .filter(({ d, p }) => !termo || `${d.nome} ${d.sigla} ${p.nome}`.toLowerCase().includes(termo));

    el.ofertas.innerHTML = itens.length
      ? itens
          .map(({ o, i, d, p }) => {
            const n = contagem.get(`${o.disciplina_id}|${o.professor_id}`) || 0;
            const sel = selecao?.tipo === 'oferta' && selecao.indice === i;
            return `<div class="oferta cor-${o.disciplina_id % 8}${sel ? ' selecionada' : ''}" draggable="true" data-oferta="${i}" tabindex="0" role="button" title="${esc(d.nome)}">
              <strong>${esc(d.sigla)}</strong><span>${esc(d.nome)}<small>${esc(p.nome)}</small></span>
              ${n ? `<em class="contagem">${n}</em>` : ''}
            </div>`;
          })
          .join('')
      : `<p class="texto-suave">${dados.ofertas.length ? 'Nenhuma aula corresponde ao filtro.' : 'Ainda não há professores com disciplinas associadas.'}</p>`;
  }

  function desenharPainel() {
    const aula = selecao?.tipo === 'aula' && aulas.find((a) => a.uid === selecao.uid);
    if (!aula) {
      el.painel.hidden = true;
      return;
    }
    const d = disciplinas.get(aula.disciplina_id);
    const alternativas = dados.ofertas.filter((o) => o.disciplina_id === aula.disciplina_id);
    const problemas = conflitos(aula);
    el.painel.hidden = false;
    el.painel.innerHTML = `
      <div class="painel-topo">
        <strong>${esc(d?.nome)}</strong>
        <span class="texto-suave">${DIAS[aula.dia]}, ${esc(aula.hora_inicio)}</span>
        <button type="button" class="botao-icone" data-fechar-painel aria-label="Fechar">×</button>
      </div>
      <div class="painel-campos">
        <label>Professor
          <select data-campo-professor>
            ${aula.professor_id && !alternativas.some((o) => o.professor_id === aula.professor_id) ? `<option value="${aula.professor_id}" selected>${esc(professores.get(aula.professor_id)?.nome)}</option>` : ''}
            ${alternativas.map((o) => `<option value="${o.professor_id}"${o.professor_id === aula.professor_id ? ' selected' : ''}>${esc(professores.get(o.professor_id).nome)}</option>`).join('')}
            <option value=""${aula.professor_id ? '' : ' selected'}>— Sem professor —</option>
          </select></label>
        <label>Sala
          <input data-campo-sala value="${esc(aula.sala || '')}" maxlength="20" placeholder="Ex.: B12"></label>
        <button type="button" class="botao botao-perigo" data-remover-aula>Remover aula</button>
      </div>
      ${temHistorico(aula) ? `<p class="legenda">Esta aula tem ${esc(descreverHistorico(aula))}. Mudar o professor, o dia ou a hora cria uma aula nova; a antiga fica no histórico.</p>` : ''}
      ${problemas.length ? `<div class="alerta alerta-erro">${problemas.map(esc).join('<br>')}</div>` : ''}`;
  }

  function desenharResumo() {
    const porDisciplina = new Map();
    for (const a of aulas) porDisciplina.set(a.disciplina_id, (porDisciplina.get(a.disciplina_id) || 0) + 1);
    el.resumo.innerHTML = porDisciplina.size
      ? [...porDisciplina.entries()]
          .sort((x, y) => y[1] - x[1])
          .map(([id, n]) => `<span class="resumo-chip cor-${id % 8}" title="${esc(disciplinas.get(id)?.nome)}"><strong>${esc(disciplinas.get(id)?.sigla)}</strong> ${n}</span>`)
          .join('') + `<span class="resumo-total">Total: ${aulas.length} tempos</span>`
      : '<span class="texto-suave">A grelha está vazia.</span>';
  }

  function desenharEstado() {
    const mudou = alterado();
    const comConflitos = aulas.some((a) => conflitos(a).length);
    el.guardar.disabled = !mudou;
    el.descartar.disabled = !mudou;
    el.estado.textContent = mudou ? 'Alterações por guardar.' : 'Sem alterações.';
    el.estado.classList.toggle('por-guardar', mudou);
    if (comConflitos) el.estado.textContent += ' Existem conflitos assinalados a vermelho.';
  }

  function desenhar() {
    desenharGrelha();
    desenharOfertas();
    desenharPainel();
    desenharResumo();
    desenharEstado();
  }

  // ---------- Mensagens ----------
  function mostrarMensagem(tipo, texto) {
    el.mensagens.innerHTML = `<div class="alerta alerta-${tipo}" role="alert">${texto}</div>`;
  }
  function limparMensagens() {
    el.mensagens.innerHTML = '';
  }

  // ---------- Arrastar e largar ----------
  function professorDe(origem) {
    if (origem.tipo === 'oferta') return dados.ofertas[origem.indice].professor_id;
    return aulas.find((a) => a.uid === origem.uid)?.professor_id;
  }

  function origemDoElemento(alvo) {
    const oferta = alvo.closest('[data-oferta]');
    if (oferta) return { tipo: 'oferta', indice: Number(oferta.dataset.oferta) };
    const aula = alvo.closest('[data-uid]');
    if (aula) return { tipo: 'aula', uid: Number(aula.dataset.uid) };
    return null;
  }

  raiz.addEventListener('dragstart', (e) => {
    arrasto = origemDoElemento(e.target);
    if (!arrasto) return;
    e.dataTransfer.effectAllowed = arrasto.tipo === 'oferta' ? 'copy' : 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(arrasto));
    // Marcar os tempos em que o professor está ocupado (sem redesenhar: o elemento arrastado tem de continuar na página)
    const profId = professorDe(arrasto);
    setTimeout(() => {
      if (!arrasto) return; // o arrasto já terminou
      raiz.classList.add('a-arrastar');
      el.grelha.querySelectorAll('td[data-dia]').forEach((td) => {
        const turma = professorOcupado(profId, Number(td.dataset.dia), td.dataset.hora);
        td.classList.toggle('bloqueada', !!turma);
        if (turma) td.title = `Professor ocupado (${turma})`;
      });
    }, 0);
  });

  raiz.addEventListener('dragend', () => {
    arrasto = null;
    raiz.classList.remove('a-arrastar');
    raiz.querySelectorAll('.sobre').forEach((c) => c.classList.remove('sobre'));
    desenharGrelha();
  });


  raiz.addEventListener('dragover', (e) => {
    if (!arrasto) return;
    const celula = e.target.closest('td[data-dia]');
    const lixo = e.target.closest('[data-lixo]');
    if ((celula && !celula.classList.contains('bloqueada')) || (lixo && arrasto.tipo === 'aula')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = lixo ? 'move' : arrasto.tipo === 'oferta' ? 'copy' : 'move';
      raiz.querySelectorAll('.sobre').forEach((c) => c !== (celula || lixo) && c.classList.remove('sobre'));
      (celula || lixo).classList.add('sobre');
    }
  });

  raiz.addEventListener('dragleave', (e) => {
    const zona = e.target.closest('td[data-dia], [data-lixo]');
    if (zona && !zona.contains(e.relatedTarget)) zona.classList.remove('sobre');
  });

  raiz.addEventListener('drop', (e) => {
    if (!arrasto) return;
    e.preventDefault();
    const origem = arrasto;
    arrasto = null;
    raiz.classList.remove('a-arrastar');
    raiz.querySelectorAll('.sobre').forEach((c) => c.classList.remove('sobre'));
    if (e.target.closest('[data-lixo]')) {
      if (origem.tipo === 'aula') removerAula(origem.uid);
      desenhar();
      return;
    }
    const celula = e.target.closest('td[data-dia]');
    if (celula) aplicarEm(origem, Number(celula.dataset.dia), celula.dataset.hora);
  });

  // ---------- Cliques (alternativa ao arrastar) ----------
  raiz.addEventListener('click', (e) => {
    if (e.target.closest('[data-fechar-painel]')) {
      selecao = null;
      return desenhar();
    }
    if (e.target.closest('[data-remover-aula]')) {
      removerAula(selecao.uid);
      return desenhar();
    }
    if (e.target.closest('[data-painel-aula]')) return;

    const origem = origemDoElemento(e.target);
    const celula = e.target.closest('td[data-dia]');

    // Com uma aula da paleta escolhida, clicar num tempo coloca-a lá
    if (celula && selecao?.tipo === 'oferta') {
      return aplicarEm(selecao, Number(celula.dataset.dia), celula.dataset.hora);
    }
    // Com uma aula da grelha escolhida, clicar num tempo livre move-a
    if (celula && !origem && selecao?.tipo === 'aula') {
      return aplicarEm(selecao, Number(celula.dataset.dia), celula.dataset.hora);
    }
    if (origem) {
      const igual = selecao && selecao.tipo === origem.tipo && selecao.indice === origem.indice && selecao.uid === origem.uid;
      selecao = igual ? null : origem;
      return desenhar();
    }
  });

  raiz.addEventListener('keydown', (e) => {
    const origem = origemDoElemento(e.target);
    if (origem && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.target.click();
    }
    if (origem?.tipo === 'aula' && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      removerAula(origem.uid);
      desenhar();
    }
    if (e.key === 'Escape' && selecao) {
      selecao = null;
      desenhar();
    }
  });

  // Campos do painel da aula selecionada
  raiz.addEventListener('change', (e) => {
    const aula = selecao?.tipo === 'aula' && aulas.find((a) => a.uid === selecao.uid);
    if (!aula) return;
    if (e.target.matches('[data-campo-professor]')) {
      const novo = e.target.value ? Number(e.target.value) : null;
      const ocupado = professorOcupado(novo, aula.dia, aula.hora_inicio);
      if (ocupado) {
        mostrarMensagem('erro', `${esc(professores.get(novo).nome)} já tem aula com ${esc(ocupado)} nesse tempo.`);
        return desenharPainel();
      }
      aula.professor_id = novo;
      desenhar();
    }
  });
  raiz.addEventListener('input', (e) => {
    const aula = selecao?.tipo === 'aula' && aulas.find((a) => a.uid === selecao.uid);
    if (aula && e.target.matches('[data-campo-sala]')) {
      aula.sala = e.target.value.trim();
      desenharGrelha();
      desenharEstado();
    }
  });
  raiz.addEventListener('focusout', (e) => {
    if (e.target.matches('[data-campo-sala]')) desenharPainel();
  });

  el.filtro.addEventListener('input', desenharOfertas);

  // ---------- Guardar / descartar ----------
  el.descartar.addEventListener('click', () => {
    if (confirm('Descartar todas as alterações feitas a este horário?')) {
      window.removeEventListener('beforeunload', avisarSaida);
      location.reload();
    }
  });

  el.guardar.addEventListener('click', async () => {
    el.guardar.disabled = true;
    el.guardar.textContent = 'A guardar…';
    try {
      const resposta = await fetch(location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ aulas: JSON.stringify(serializar()) }),
      });
      // Se a sessão expirou, o servidor responde com a página de login (HTML) em vez de JSON
      if (!(resposta.headers.get('Content-Type') || '').includes('application/json')) {
        throw new Error('A sessão pode ter expirado. Abra a plataforma noutro separador, entre de novo e volte a guardar.');
      }
      const r = await resposta.json();
      if (r.ok) {
        window.removeEventListener('beforeunload', avisarSaida);
        location.reload();
        return;
      }
      mostrarMensagem('erro', `<strong>Não foi possível guardar:</strong><br>${r.erros.map(esc).join('<br>')}`);
    } catch (erro) {
      mostrarMensagem('erro', esc(erro instanceof TypeError ? 'Erro de ligação ao servidor. Tente novamente.' : erro.message));
    }
    el.guardar.textContent = 'Guardar horário';
    desenharEstado();
  });

  function avisarSaida(e) {
    if (alterado()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
  window.addEventListener('beforeunload', avisarSaida);

  function esc(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  desenhar();
})();
