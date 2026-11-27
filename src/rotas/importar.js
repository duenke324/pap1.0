// Importar alunos de um ficheiro CSV (Excel → "Guardar como" → CSV), para a secretaria não ter de criar
// os alunos um a um no início do ano.
//  1. Escolher o ficheiro (o browser lê-o e põe o texto na caixa) ou colar o texto → "Verificar".
//  2. A aplicação mostra cada linha: certa ou com o erro (as mesmas regras do formulário "Novo aluno").
//  3. "Importar" cria os alunos certos de uma vez (numa só transação) e mostra os emails e as palavras-passe
//     temporárias — também num PDF para imprimir. As palavras-passe não ficam guardadas em lado nenhum.
const { get, post } = require('../lib/servidor');
const { todos, transacao } = require('../db');
const { pagina } = require('../vistas/layout');
const { lerFormularioAluno, criarAlunoNaBd } = require('./admin');
const { registarLog } = require('../lib/auditoria');
const { pdfPalavrasPasse } = require('../lib/pdf');
const { ligacaoDaEscola } = require('../lib/email');
const { escolaAtual } = require('../lib/contexto');
const { h, hoje, formatarData, maiorDeIdade, gerarEmailAluno, gerarPasswordTemporaria } = require('../lib/util');

const MAXIMO_LINHAS = 1000;

// Colunas aceites (o cabeçalho pode vir com acentos, maiúsculas ou "n.º")
const COLUNAS = {
  numero_processo: ['numero_processo', 'processo', 'n_processo', 'no_processo', 'numero', 'n_o_de_processo', 'n_de_processo', 'numero_de_processo'],
  nome: ['nome', 'nome_completo', 'aluno'],
  data_nascimento: ['data_nascimento', 'data_de_nascimento', 'nascimento'],
  turma: ['turma'],
  contacto: ['contacto', 'telefone', 'telemovel'],
  encarregado_nome: ['encarregado', 'encarregado_nome', 'encarregado_de_educacao', 'nome_do_encarregado'],
  encarregado_email: ['encarregado_email', 'email_encarregado', 'email_do_encarregado'],
  encarregado_contacto: ['encarregado_contacto', 'contacto_encarregado', 'contacto_do_encarregado', 'telefone_encarregado'],
};
const MODELO = [
  ['numero_processo', 'nome', 'data_nascimento', 'turma', 'contacto', 'encarregado', 'encarregado_email', 'encarregado_contacto'],
  ['2501', 'Joana Martins Silva', '12/03/2010', '10.º TGPSI', '912345678', 'Paula Martins', 'paula.martins@exemplo.pt', '913456789'],
  ['2502', 'Rui Pedro Alves', '05/11/2006', '10.º TGPSI', '', '', '', ''],
];

const normalizar = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

// CSV com ";" (Excel em português), "," ou tabulação; aceita campos entre aspas (com ; ou quebras de linha)
function lerCsv(texto) {
  texto = String(texto || '').replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/, 1)[0] || '';
  const separador = [';', '\t', ','].sort((a, b) => primeira.split(b).length - primeira.split(a).length)[0];
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"' && campo === '') aspas = true;
    else if (c === separador) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

// "12/03/2010" ou "2010-03-12" → "2010-03-12" (outro formato fica como está e a validação recusa)
function dataIso(texto) {
  const t = String(texto || '').trim();
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : t;
}

// Lê e valida o ficheiro inteiro. Devolve { erro } ou { linhas: [{ n, dados, erros, original }] }
async function analisar(texto) {
  const tabela = lerCsv(texto);
  if (tabela.length < 2) return { erro: 'O ficheiro tem de ter uma linha de cabeçalho e pelo menos um aluno.' };
  if (tabela.length - 1 > MAXIMO_LINHAS) return { erro: `No máximo ${MAXIMO_LINHAS} alunos de cada vez.` };

  const cabecalho = tabela[0].map(normalizar);
  const indice = {};
  for (const [campo, nomes] of Object.entries(COLUNAS)) {
    const i = cabecalho.findIndex((c) => nomes.includes(c));
    if (i >= 0) indice[campo] = i;
  }
  const faltam = ['numero_processo', 'nome'].filter((c) => indice[c] === undefined);
  if (faltam.length) return { erro: `Faltam colunas obrigatórias no cabeçalho: ${faltam.join(', ')}. Descarregue o modelo para ver o formato.` };

  const turmas = await todos('SELECT id, nome FROM turmas');
  const turmaPorNome = new Map(turmas.map((t) => [normalizar(t.nome), t]));
  const vistos = new Map();
  const linhas = [];
  for (const [i, celulas] of tabela.slice(1).entries()) {
    const valor = (campo) => (indice[campo] === undefined ? '' : String(celulas[indice[campo]] ?? '').trim());
    const nomeTurma = valor('turma');
    const turma = nomeTurma ? turmaPorNome.get(normalizar(nomeTurma)) : null;
    const corpo = {
      nome: valor('nome'),
      numero_processo: valor('numero_processo'),
      data_nascimento: dataIso(valor('data_nascimento')),
      contacto: valor('contacto'),
      encarregado_nome: valor('encarregado_nome'),
      encarregado_email: valor('encarregado_email'),
      encarregado_contacto: valor('encarregado_contacto'),
      turma_id: turma ? String(turma.id) : '',
    };
    const { dados, erros } = await lerFormularioAluno(corpo);
    if (nomeTurma && !turma) erros.turma_id = `A turma "${nomeTurma}" não existe (crie-a primeiro em Turmas).`;
    const anterior = vistos.get(dados.numero_processo);
    if (dados.numero_processo && anterior) erros.numero_processo = `N.º de processo repetido (também na linha ${anterior}).`;
    else if (dados.numero_processo) vistos.set(dados.numero_processo, i + 2);
    linhas.push({ n: i + 2, dados, erros, turma: turma?.nome || '' });
  }
  return { linhas };
}

function paginaImportar(req, res, { texto = '', erro = '', analise = null } = {}, estado = 200) {
  const validas = analise ? analise.linhas.filter((l) => !Object.keys(l.erros).length) : [];
  const comErro = analise ? analise.linhas.length - validas.length : 0;
  const conteudo = `
    <p><a class="voltar" href="/admin/alunos">← Alunos</a></p>
    ${erro ? `<div class="alerta alerta-erro" role="alert">${h(erro)}</div>` : ''}
    ${
      analise
        ? `<section class="cartao">
        <div class="cartao-topo"><h2>Verificação</h2>
          <span class="texto-suave">${validas.length} aluno(s) prontos a importar${comErro ? ` · ${comErro} com erros (ficam de fora)` : ''}</span></div>
        <div class="tabela-scroll"><table class="tabela">
          <thead><tr><th>Linha</th><th>Processo</th><th>Nome</th><th>Turma</th><th>Nascimento</th><th>Encarregado</th><th>Situação</th></tr></thead>
          <tbody>${analise.linhas
            .map((l) => {
              const erros = Object.values(l.erros);
              return `<tr>
              <td>${l.n}</td><td>${h(l.dados.numero_processo)}</td><td>${h(l.dados.nome)}</td><td class="sem-quebra">${h(l.turma || '—')}</td>
              <td>${h(formatarData(l.dados.data_nascimento))}</td><td>${h(l.dados.encarregado_nome || '—')}</td>
              <td>${
                erros.length
                  ? `<span class="etiqueta etiqueta-perigo">Erro</span> <small class="bloco">${erros.map(h).join('<br>')}</small>`
                  : `<span class="etiqueta etiqueta-ok">Certo</span>${maiorDeIdade(l.dados.data_nascimento) ? '' : ' <small class="texto-suave">+ conta do encarregado</small>'}`
              }</td></tr>`;
            })
            .join('')}</tbody>
        </table></div>
        ${
          validas.length
            ? `<form method="post" action="/admin/alunos/importar" class="barra-acoes">
                <input type="hidden" name="acao" value="importar">
                <input type="hidden" name="csv" value="${h(texto)}">
                <button class="botao">Importar ${validas.length} aluno(s)</button>
                <span class="texto-suave">Corrija as linhas com erro no ficheiro e importe-as depois.</span>
              </form>`
            : ''
        }
      </section>`
        : ''
    }
    <section class="cartao">
      <h2>${analise ? 'Verificar outro ficheiro' : 'Ficheiro CSV'}</h2>
      <p class="texto-suave">No Excel: <strong>Ficheiro → Guardar como → CSV (separado por pontos e vírgulas)</strong>. A primeira linha é o cabeçalho.
        Colunas obrigatórias: <code>numero_processo</code> e <code>nome</code>. Opcionais: <code>data_nascimento</code> (dd/mm/aaaa), <code>turma</code>
        (o nome, igual ao da aplicação), <code>contacto</code>, <code>encarregado</code>, <code>encarregado_email</code> e <code>encarregado_contacto</code>.</p>
      <p class="texto-suave">Tal como no formulário: o aluno menor (ou sem data de nascimento) precisa do encarregado, cuja conta é criada logo. O email
        institucional e a palavra-passe temporária de cada aluno são gerados.</p>
      <form method="post" action="/admin/alunos/importar" class="formulario" data-formulario-csv>
        <input type="hidden" name="acao" value="verificar">
        <label>Escolher o ficheiro
          <input type="file" accept=".csv,text/csv,text/plain" data-ficheiro-csv></label>
        <label>…ou colar aqui o conteúdo
          <textarea name="csv" rows="8" data-texto-csv placeholder="numero_processo;nome;data_nascimento;turma">${h(analise ? '' : texto)}</textarea></label>
        <div class="barra-acoes">
          <button class="botao">Verificar</button>
          <a class="botao botao-secundario" href="/admin/alunos/importar/modelo.csv" download>Descarregar o modelo</a>
        </div>
      </form>
    </section>`;
  res.html(pagina(req, { titulo: 'Importar alunos', ativo: 'alunos' }, conteudo), estado);
}

get('/admin/alunos/importar', (req, res) => paginaImportar(req, res));

get('/admin/alunos/importar/modelo.csv', (req, res) => {
  const csv = '﻿' + MODELO.map((l) => l.join(';')).join('\r\n') + '\r\n';
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="modelo-importar-alunos.csv"',
    'Cache-Control': 'no-store',
  });
  res.end(csv);
});

post('/admin/alunos/importar', async (req, res) => {
  const texto = String(req.corpo.csv || '');
  if (!texto.trim()) return paginaImportar(req, res, { erro: 'Escolha um ficheiro ou cole o conteúdo do CSV.' }, 422);
  const analise = await analisar(texto);
  if (analise.erro) return paginaImportar(req, res, { texto, erro: analise.erro }, 422);
  if (req.corpo.acao !== 'importar') return paginaImportar(req, res, { texto, analise });

  // Importar: volta a validar tudo (o ficheiro pode ter mudado entre a verificação e agora)
  const validas = analise.linhas.filter((l) => !Object.keys(l.erros).length);
  if (!validas.length) return paginaImportar(req, res, { texto, analise, erro: 'Não há nenhuma linha certa para importar.' }, 422);
  const criados = await transacao(async (tx) => {
    const lista = [];
    for (const l of validas) {
      const email = gerarEmailAluno(l.dados.nome, l.dados.numero_processo);
      const password = gerarPasswordTemporaria();
      const { alunoId, contaEncarregado } = await criarAlunoNaBd(tx, l.dados, { email, password });
      lista.push({ ...l, alunoId, email, password, contaEncarregado });
    }
    return lista;
  });
  await registarLog(
    req,
    'criar',
    'aluno',
    null,
    `Importou ${criados.length} aluno(s) de um ficheiro CSV (n.º de processo ${criados[0].dados.numero_processo}${criados.length > 1 ? ` a ${criados[criados.length - 1].dados.numero_processo}` : ''}).`
  );

  // PDF com as palavras-passe (alunos por turma e, à parte, os encarregados), gerado agora e enviado
  // dentro da própria página: não fica guardado no servidor
  const grupos = [];
  for (const c of criados) {
    const titulo = c.turma ? `Turma ${c.turma}` : 'Sem turma';
    let g = grupos.find((x) => x.titulo === titulo);
    if (!g) grupos.push((g = { titulo, linhas: [] }));
    g.linhas.push({ numero: c.dados.numero_processo, nome: c.dados.nome, password: c.password });
  }
  const encarregados = criados.filter((c) => c.contaEncarregado);
  if (encarregados.length) {
    grupos.push({
      titulo: 'Encarregados de educação',
      linhas: encarregados.map((c) => ({ numero: c.contaEncarregado.codigo, nome: `${c.dados.encarregado_nome} (${c.dados.nome})`, password: c.contaEncarregado.password })),
    });
  }
  const pdf = pdfPalavrasPasse({ escola: escolaAtual().nome, enderecoEntrada: ligacaoDaEscola('/login'), grupos, geradoEm: formatarData(hoje()) });

  const conteudo = `
    <div class="alerta alerta-sucesso" role="status">${criados.length} aluno(s) importado(s)${encarregados.length ? ` e ${encarregados.length} conta(s) de encarregado criada(s)` : ''}.
      Anote ou descarregue as palavras-passe agora: não voltam a ser mostradas.</div>
    <section class="cartao">
      <div class="cartao-topo"><h2>Contas criadas</h2>
        <a class="botao" download="palavras-passe-importacao-${hoje()}.pdf" href="data:application/pdf;base64,${pdf.toString('base64')}">Descarregar PDF para imprimir</a></div>
      <div class="tabela-scroll"><table class="tabela">
        <thead><tr><th>Processo</th><th>Nome</th><th>Turma</th><th>Email</th><th>Palavra-passe</th><th>Encarregado (código · palavra-passe)</th></tr></thead>
        <tbody>${criados
          .map(
            (c) => `<tr><td>${h(c.dados.numero_processo)}</td><td><a href="/admin/alunos/${c.alunoId}">${h(c.dados.nome)}</a></td><td class="sem-quebra">${h(c.turma || '—')}</td>
            <td>${h(c.email)}</td><td><code>${h(c.password)}</code></td>
            <td>${c.contaEncarregado ? `${h(c.contaEncarregado.codigo)} · <code>${h(c.contaEncarregado.password)}</code>` : '<span class="texto-suave">maior de idade</span>'}</td></tr>`
          )
          .join('')}</tbody>
      </table></div>
      ${analise.linhas.length > criados.length ? `<p class="texto-suave">${analise.linhas.length - criados.length} linha(s) com erro ficaram de fora.</p>` : ''}
      <p class="barra-acoes"><a class="botao botao-secundario" href="/admin/alunos">Ver os alunos</a> <a class="botao botao-secundario" href="/admin/alunos/importar">Importar outro ficheiro</a></p>
    </section>`;
  res.html(pagina(req, { titulo: 'Importar alunos', ativo: 'alunos' }, conteudo));
});

module.exports = { lerCsv, dataIso, analisar };
