// Alunos em risco e estatísticas de faltas (painel da direção). O cálculo está em src/lib/risco.js.
const { get } = require('../lib/servidor');
const { todos } = require('../db');
const { pagina, vazio, avatar, botaoImprimir } = require('../vistas/layout');
const { alunosEmRisco, faltasPorMes, faltasPorTurma, PONTOS, NIVEL_ALTO, NIVEL_MEDIO } = require('../lib/risco');
const { h, selecionado, anoLetivoAtual, limitesAnoLetivo, LIMITE_FALTAS } = require('../lib/util');

const ROTULO_NIVEL = { alto: 'Risco alto', medio: 'Risco médio' };
const CLASSE_NIVEL = { alto: 'etiqueta-perigo', medio: 'etiqueta-aviso' };

function etiquetaMotivo(m) {
  return `<span class="etiqueta ${m.grave ? 'etiqueta-perigo' : 'etiqueta-aviso'}">${h(m.texto)}</span>`;
}

// Os dados vão para o <script> dos gráficos: "<" escapado para não fechar o script por engano
const paraScript = (dados) => JSON.stringify(dados).replace(/</g, '\\u003c');

get('/admin/risco', async (req, res) => {
  const turmas = await todos('SELECT id, nome FROM turmas ORDER BY nome');
  const turmaId = turmas.some((t) => String(t.id) === req.query.turma) ? Number(req.query.turma) : null;
  const anos = (await todos('SELECT DISTINCT ano_letivo FROM turmas ORDER BY ano_letivo DESC')).map((t) => t.ano_letivo);
  if (!anos.includes(anoLetivoAtual())) anos.unshift(anoLetivoAtual());
  const ano = anos.includes(req.query.ano) ? req.query.ano : anoLetivoAtual();

  const risco = await alunosEmRisco({ turmaId });
  const meses = await faltasPorMes(limitesAnoLetivo(ano), turmaId);
  const porTurma = await faltasPorTurma();
  const altos = risco.filter((a) => a.nivel === 'alto').length;
  const totalMeses = meses.reduce((s, m) => s + m.faltas, 0);

  const filtros = `
    <form class="filtros no-imprimir" method="get">
      <label>Turma
        <select name="turma" data-submeter>
          <option value="">Todas</option>
          ${turmas.map((t) => `<option value="${t.id}"${selecionado(t.id, turmaId)}>${h(t.nome)}</option>`).join('')}
        </select></label>
      <label>Ano letivo (gráfico por mês)
        <select name="ano" data-submeter>${anos.map((a) => `<option${selecionado(a, ano)}>${h(a)}</option>`).join('')}</select></label>
      <noscript><button class="botao botao-secundario">Filtrar</button></noscript>
    </form>`;

  const tabela = risco.length
    ? `<div class="tabela-scroll"><table class="tabela tabela-risco">
        <thead><tr><th>Aluno</th><th>Turma</th><th>Nível</th><th class="direita">Pontos</th><th>Motivos</th></tr></thead>
        <tbody>${risco
          .map(
            (a) => `<tr>
          <td><a class="aluno-linha" href="/admin/alunos/${a.id}">${avatar(a, 'pequeno')}<span>${h(a.nome)}<small>Proc. ${h(a.numero_processo)}</small></span></a></td>
          <td><span class="sem-quebra">${h(a.turma || '—')}</span>${a.diretor ? `<small class="bloco texto-suave">DT: ${h(a.diretor)}</small>` : ''}</td>
          <td><span class="etiqueta ${CLASSE_NIVEL[a.nivel]}">${ROTULO_NIVEL[a.nivel]}</span></td>
          <td class="direita"><strong>${a.pontos}</strong></td>
          <td><div class="lista-etiquetas">${a.motivos.map(etiquetaMotivo).join('')}</div></td>
        </tr>`
          )
          .join('')}</tbody></table></div>`
    : vazio(turmaId ? 'Nenhum aluno desta turma está em risco.' : 'Nenhum aluno está em risco.');

  const conteudo = `
    ${filtros}
    <section class="estatisticas">
      <div class="estatistica ${altos ? 'destaque-aviso' : ''}"><span>Risco alto</span><strong>${altos}</strong></div>
      <div class="estatistica"><span>Risco médio</span><strong>${risco.length - altos}</strong></div>
      <div class="estatistica"><span>Faltas de presença em ${h(ano)}${turmaId ? ' (esta turma)' : ''}</span><strong>${totalMeses}</strong></div>
    </section>
    <section class="cartao">
      <div class="cartao-topo"><h2>Alunos em risco</h2><span class="texto-suave">${risco.length} aluno(s)</span></div>
      ${tabela}
      <details class="legenda">
        <summary>Como se calcula?</summary>
        <p>Cada sinal vale pontos: módulo no limite de faltas (${LIMITE_FALTAS * 100}% das horas) ${PONTOS.limite} · a metade do limite ${PONTOS.metade} ·
          módulo NC ou EF ${PONTOS.naoConcluido} · nota negativa ${PONTOS.negativa} · ocorrência muito grave ${PONTOS.muito_grave} ·
          grave ${PONTOS.grave} (últimos 12 meses) · 10 ou mais faltas por justificar 2 · de 5 a 9, 1.
          <strong>Risco alto</strong> a partir de ${NIVEL_ALTO} pontos, <strong>médio</strong> de ${NIVEL_MEDIO} a ${NIVEL_ALTO - 1}.</p>
      </details>
    </section>
    <div class="grelha-2">
      <section class="cartao">
        <div class="cartao-topo"><h2>Faltas por mês</h2><span class="texto-suave">${h(ano)}${turmaId ? ` · ${h(turmas.find((t) => t.id === turmaId).nome)}` : ''}</span></div>
        <div class="grafico-barras" style="height: 260px"><canvas id="graficoMeses" role="img" aria-label="Faltas de presença por mês"></canvas></div>
        <div class="tabela-scroll"><table class="tabela tabela-compacta">
          <thead><tr>${meses.map((m) => `<th class="direita">${h(m.rotulo)}</th>`).join('')}</tr></thead>
          <tbody><tr>${meses.map((m) => `<td class="direita">${m.faltas}</td>`).join('')}</tr></tbody>
        </table></div>
      </section>
      <section class="cartao">
        <div class="cartao-topo"><h2>Assiduidade por turma</h2><span class="texto-suave">Aulas já dadas</span></div>
        ${
          porTurma.length
            ? `<div class="grafico-barras" style="height: ${60 + porTurma.length * 40}px"><canvas id="graficoTurmas" role="img" aria-label="Assiduidade por turma"></canvas></div>
               <ul class="lista-assiduidade-cursos">${porTurma
                 .map((t) => `<li><span>${h(t.nome)} <small class="texto-suave">${t.faltas} falta(s)</small></span><span>${String(t.assiduidade).replace('.', ',')}%</span></li>`)
                 .join('')}</ul>`
            : vazio('Ainda não há lições dadas.')
        }
      </section>
    </div>
    <script src="/static/vendor/chart.umd.min.js"></script>
    <script>
    (function () {
      var meses = ${paraScript(meses)};
      var turmas = ${paraScript(porTurma)};
      function cor(nome) { return getComputedStyle(document.documentElement).getPropertyValue(nome).trim(); }
      var graficos = [];
      function desenhar() {
        graficos.forEach(function (g) { g.destroy(); });
        graficos = [];
        Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
        Chart.defaults.color = cor('--tinta-suave');
        Chart.defaults.locale = 'pt-PT';
        var linha = cor('--linha');
        var elMeses = document.getElementById('graficoMeses');
        if (elMeses) graficos.push(new Chart(elMeses, {
          type: 'bar',
          data: {
            labels: meses.map(function (m) { return m.rotulo; }),
            datasets: [
              { label: 'Justificadas', data: meses.map(function (m) { return m.faltas - m.injustificadas; }), backgroundColor: cor('--ok'), stack: 'f' },
              { label: 'Por justificar', data: meses.map(function (m) { return m.injustificadas; }), backgroundColor: cor('--aviso'), stack: 'f' }
            ]
          },
          options: { maintainAspectRatio: false, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: linha }, ticks: { precision: 0 } } } }
        }));
        var elTurmas = document.getElementById('graficoTurmas');
        if (elTurmas) graficos.push(new Chart(elTurmas, {
          type: 'bar',
          data: {
            labels: turmas.map(function (t) { return t.nome; }),
            datasets: [{ label: 'Assiduidade (%)', data: turmas.map(function (t) { return t.assiduidade; }),
              backgroundColor: turmas.map(function (t) { return t.assiduidade < ${(1 - LIMITE_FALTAS) * 100} ? cor('--perigo') : t.assiduidade < ${(1 - LIMITE_FALTAS * 0.7) * 100} ? cor('--aviso') : cor('--ok'); }),
              maxBarThickness: 26 }]
          },
          options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { min: 0, max: 100, grid: { color: linha }, ticks: { callback: function (v) { return v + '%'; } } }, y: { grid: { display: false } } } }
        }));
      }
      document.fonts.ready.then(desenhar);
      document.addEventListener('tema-alterado', desenhar);
    })();
    </script>`;

  res.html(
    pagina(
      req,
      { titulo: 'Alunos em risco', ativo: 'risco', subtitulo: 'Faltas, avaliação e comportamento num só ecrã', acoes: botaoImprimir() },
      conteudo
    )
  );
});
