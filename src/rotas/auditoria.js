// Painel do Administrador: histórico de auditoria (ações críticas da administração)
const { get } = require('../lib/servidor');
const { todos, um } = require('../db');
const { pagina, vazio } = require('../vistas/layout');
const { h, formatarDataLonga } = require('../lib/util');

const NOMES_ENTIDADE = { turma: 'Turma', professor: 'Professor', aluno: 'Aluno', disciplina: 'Disciplina' };
const NOMES_ACAO = { criar: 'Criou', editar: 'Editou', apagar: 'Apagou' };
const ETIQUETA_ACAO = { criar: 'etiqueta-ok', editar: 'etiqueta-aviso', apagar: 'etiqueta-perigo' };

function formatarDataHora(texto) {
  if (!texto) return '—';
  // `texto` chega como 'AAAA-MM-DD HH:MM:SS' (dateStrings: true no mysql2)
  const [data, hora] = String(texto).split(' ');
  return `${formatarDataLonga(data)} às ${hora?.slice(0, 5) || ''}`;
}

get('/admin/auditoria', async (req, res) => {
  const entidade = String(req.query.entidade || '');
  const linhas = await todos(
    `SELECT l.*, u.nome AS utilizador
       FROM logs_auditoria l LEFT JOIN utilizadores u ON u.id = l.utilizador_id
      WHERE (? = '' OR l.entidade = ?)
      ORDER BY l.criado_em DESC, l.id DESC
      LIMIT 200`,
    entidade,
    entidade
  );
  const total = (await um('SELECT COUNT(*) AS n FROM logs_auditoria')).n;

  const conteudo = `
    <section class="cartao">
      <form class="filtros" method="get">
        <label>O que foi alterado
          <select name="entidade" data-submeter>
            <option value="">Todas</option>
            ${Object.entries(NOMES_ENTIDADE)
              .map(([v, texto]) => `<option value="${v}"${v === entidade ? ' selected' : ''}>${h(texto)}</option>`)
              .join('')}
          </select></label>
        <span class="contador">${linhas.length} de ${total} registo(s)${linhas.length === 200 ? ' · mostra só os 200 mais recentes' : ''}</span>
      </form>
      <p class="texto-suave">Regista quem criou, editou ou apagou turmas, professores, disciplinas e alunos — incluindo mudanças de diretor de turma, curso e turma de um aluno.</p>
      ${
        linhas.length
          ? `<div class="tabela-scroll"><table class="tabela">
          <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead>
          <tbody>${linhas
            .map(
              (l) => `<tr>
              <td class="texto-suave" style="white-space:nowrap">${h(formatarDataHora(l.criado_em))}</td>
              <td>${h(l.utilizador || 'Conta apagada')}</td>
              <td><span class="etiqueta ${ETIQUETA_ACAO[l.acao] || ''}">${h(NOMES_ACAO[l.acao] || l.acao)} ${h(NOMES_ENTIDADE[l.entidade] || l.entidade).toLowerCase()}</span></td>
              <td>${h(l.detalhe)}</td>
            </tr>`
            )
            .join('')}</tbody></table></div>`
          : vazio('Ainda não há ações registadas.')
      }
    </section>`;

  res.html(pagina(req, { titulo: 'Auditoria', ativo: 'auditoria', subtitulo: 'Histórico de ações críticas da administração' }, conteudo));
});
