// Gerador de PDF muito simples, sem bibliotecas: só texto, retângulos e linhas, com as letras
// que todos os leitores de PDF já trazem (Helvetica e Courier), por isso o ficheiro é pequeno e
// não precisa de fontes embutidas. Usado para a lista de palavras-passe dos alunos.
//
// Os acentos portugueses funcionam porque o texto é escrito na codificação WinAnsi (Windows-1252),
// que tem á, ã, ç, º, etc. Um carácter fora dela (ex.: um emoji) aparece como "?".

const A4 = { largura: 595.28, altura: 841.89 };

// Unicode → Windows-1252 (os caracteres de 0x80 a 0x9F são diferentes do Latin-1)
const CP1252 = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
  'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

function textoPdf(texto) {
  let saida = '';
  for (const c of String(texto ?? '')) {
    const codigo = c.codePointAt(0);
    let byte;
    if (CP1252[c] !== undefined) byte = CP1252[c];
    else if (codigo < 0x80 || (codigo >= 0xa0 && codigo <= 0xff)) byte = codigo;
    else byte = 0x3f; // "?"
    const ch = String.fromCharCode(byte);
    saida += ch === '(' || ch === ')' || ch === '\\' ? `\\${ch}` : ch;
  }
  return `(${saida})`;
}

// Larguras aproximadas da Helvetica (em milésimos do tamanho da letra), para cortar textos
// compridos com "…" antes de saírem da coluna. Não precisa de ser exato.
function larguraTexto(texto, tamanho, negrito = false) {
  let total = 0;
  for (const c of String(texto)) {
    if ('il.,:;|!\'`'.includes(c)) total += 260;
    else if ('fjrtI()[]'.includes(c)) total += 340;
    else if ('mwMW'.includes(c)) total += 860;
    else if (c === ' ') total += 278;
    else if (c >= 'A' && c <= 'Z') total += 680;
    else total += 556;
  }
  return (total / 1000) * tamanho * (negrito ? 1.06 : 1);
}

function cortar(texto, largura, tamanho, negrito) {
  let t = String(texto ?? '');
  if (larguraTexto(t, tamanho, negrito) <= largura) return t;
  while (t.length > 1 && larguraTexto(`${t}…`, tamanho, negrito) > largura) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// Parte um texto em duas linhas pelo espaço mais à direita que ainda deixe a primeira caber
function partirEmDuas(texto, largura, tamanho) {
  const palavras = String(texto).split(/\s+/);
  let primeira = '';
  let i = 0;
  while (i < palavras.length) {
    const tentativa = primeira ? `${primeira} ${palavras[i]}` : palavras[i];
    if (primeira && larguraTexto(tentativa, tamanho) > largura) break;
    primeira = tentativa;
    i++;
  }
  return [primeira, palavras.slice(i).join(' ')];
}

// Uma página: vai juntando os comandos de desenho
class Pagina {
  constructor() {
    this.cmds = [];
  }
  cor(r, g, b) {
    this.cmds.push(`${r} ${g} ${b} rg`);
    return this;
  }
  texto(x, y, texto, { fonte = 'F1', tamanho = 10, cor = [0.13, 0.13, 0.13] } = {}) {
    this.cmds.push(`BT ${cor.join(' ')} rg /${fonte} ${tamanho} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${textoPdf(texto)} Tj ET`);
    return this;
  }
  retangulo(x, y, l, a, cor) {
    this.cmds.push(`${cor.join(' ')} rg ${x.toFixed(2)} ${y.toFixed(2)} ${l.toFixed(2)} ${a.toFixed(2)} re f`);
    return this;
  }
  linha(x1, y1, x2, y2, cor = [0.8, 0.8, 0.8], espessura = 0.6) {
    this.cmds.push(`${cor.join(' ')} RG ${espessura} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    return this;
  }
  conteudo() {
    return this.cmds.join('\n');
  }
}

// Monta o ficheiro PDF a partir das páginas (objetos, tabela de referências e trailer)
function montarPdf(paginas, titulo) {
  const objetos = [];
  const novo = (corpo) => objetos.push(corpo) && objetos.length;
  const catalogo = novo(null);
  const raiz = novo(null);
  const fontes = {
    F1: novo('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    F2: novo('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    F3: novo('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>'),
  };
  const recursos = `<< /Font << ${Object.entries(fontes).map(([n, id]) => `/${n} ${id} 0 R`).join(' ')} >> >>`;
  const idsPaginas = paginas.map((p) => {
    const dados = Buffer.from(p.conteudo(), 'latin1');
    const fluxo = novo({ cabecalho: `<< /Length ${dados.length} >>`, dados });
    return novo(`<< /Type /Page /Parent ${raiz} 0 R /MediaBox [0 0 ${A4.largura} ${A4.altura}] /Resources ${recursos} /Contents ${fluxo} 0 R >>`);
  });
  objetos[raiz - 1] = `<< /Type /Pages /Kids [${idsPaginas.map((id) => `${id} 0 R`).join(' ')}] /Count ${idsPaginas.length} >>`;
  objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${raiz} 0 R >>`;
  const info = novo(`<< /Title ${textoPdf(titulo)} /Producer (Gestao Escolar) >>`);

  const partes = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let posicao = partes[0].length;
  const posicoes = [];
  objetos.forEach((obj, i) => {
    posicoes.push(posicao);
    const pedaco =
      typeof obj === 'string'
        ? Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`, 'latin1')
        : Buffer.concat([
            Buffer.from(`${i + 1} 0 obj\n${obj.cabecalho}\nstream\n`, 'latin1'),
            obj.dados,
            Buffer.from('\nendstream\nendobj\n', 'latin1'),
          ]);
    partes.push(pedaco);
    posicao += pedaco.length;
  });
  const tabela = [`xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`, ...posicoes.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`)].join('');
  partes.push(Buffer.from(`${tabela}trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${posicao}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(partes);
}

// ---------- Lista de palavras-passe ----------
// grupos: [{ titulo: 'Turma 10.º TGPSI', linhas: [{ numero, nome, password }] }]
// Cada grupo (turma) começa numa página nova; uma tabela com n.º de processo, nome e palavra-passe.
function pdfPalavrasPasse({ escola, enderecoEntrada, grupos, geradoEm }) {
  const M = 50; // margem
  const LARG = A4.largura - 2 * M;
  const ALTURA_LINHA = 26;
  const TOPO_TABELA = A4.altura - 175;
  const FUNDO = 70;
  const porPagina = Math.floor((TOPO_TABELA - ALTURA_LINHA - FUNDO) / ALTURA_LINHA);
  const colunas = { numero: M + 12, nome: M + 105, password: M + LARG - 150 };
  const larguraNome = colunas.password - colunas.nome - 15;
  const cinza = [0.42, 0.42, 0.42];

  // Dividir cada grupo em páginas
  const folhas = [];
  for (const g of grupos) {
    for (let i = 0; i < Math.max(g.linhas.length, 1); i += porPagina) {
      folhas.push({ grupo: g, linhas: g.linhas.slice(i, i + porPagina), continuacao: i > 0 });
    }
  }

  const paginas = folhas.map((f, indice) => {
    const p = new Pagina();
    // Cabeçalho: faixa de cor fina, escola, turma
    p.retangulo(0, A4.altura - 8, A4.largura, 8, [0.36, 0.37, 0.78]);
    p.texto(M, A4.altura - 60, cortar(escola, LARG, 18, true), { fonte: 'F2', tamanho: 18 });
    p.texto(M, A4.altura - 84, `${f.grupo.titulo}${f.continuacao ? ' (continuação)' : ''}`, { fonte: 'F2', tamanho: 12, cor: [0.36, 0.37, 0.78] });
    p.texto(M, A4.altura - 104, `${f.grupo.linhas.length} aluno(s) · gerado em ${geradoEm}`, { tamanho: 9, cor: cinza });
    p.texto(M, A4.altura - 128, 'Palavras-passe temporárias: no primeiro acesso, cada aluno tem de escolher uma palavra-passe sua.', { tamanho: 9, cor: cinza });
    p.texto(M, A4.altura - 141, `Entrar com o n.º de processo em ${enderecoEntrada}`, { tamanho: 9, cor: cinza });

    // Cabeçalho da tabela
    p.retangulo(M, TOPO_TABELA, LARG, ALTURA_LINHA, [0.93, 0.93, 0.96]);
    const yCab = TOPO_TABELA + 9;
    p.texto(colunas.numero, yCab, 'N.º DE PROCESSO', { fonte: 'F2', tamanho: 8, cor: cinza });
    p.texto(colunas.nome, yCab, 'NOME COMPLETO', { fonte: 'F2', tamanho: 8, cor: cinza });
    p.texto(colunas.password, yCab, 'PALAVRA-PASSE', { fonte: 'F2', tamanho: 8, cor: cinza });

    // Linhas (às riscas, para o olho não saltar de linha)
    f.linhas.forEach((l, i) => {
      const y = TOPO_TABELA - (i + 1) * ALTURA_LINHA;
      if (i % 2 === 1) p.retangulo(M, y, LARG, ALTURA_LINHA, [0.975, 0.975, 0.975]);
      p.linha(M, y, M + LARG, y, [0.88, 0.88, 0.88]);
      const yt = y + 9;
      p.texto(colunas.numero, yt, l.numero, { fonte: 'F2', tamanho: 10 });
      // O nome aparece sempre completo: se não couber, a letra diminui um pouco; se mesmo assim
      // não couber, passa para duas linhas dentro da mesma linha da tabela
      let tam = 10.5;
      while (tam > 8.5 && larguraTexto(l.nome, tam) > larguraNome) tam -= 0.5;
      if (larguraTexto(l.nome, tam) <= larguraNome) {
        p.texto(colunas.nome, yt, l.nome, { tamanho: tam });
      } else {
        const [l1, l2] = partirEmDuas(l.nome, larguraNome, 8.5);
        p.texto(colunas.nome, y + 14, l1, { tamanho: 8.5 });
        p.texto(colunas.nome, y + 4.5, cortar(l2, larguraNome, 8.5), { tamanho: 8.5 });
      }
      p.texto(colunas.password, yt - 0.5, l.password, { fonte: 'F3', tamanho: 12 });
    });
    if (!f.linhas.length) p.texto(colunas.nome, TOPO_TABELA - 18, 'Sem alunos com conta de acesso.', { tamanho: 10, cor: cinza });

    // Rodapé
    p.linha(M, 45, M + LARG, 45, [0.85, 0.85, 0.85]);
    p.texto(M, 32, 'Documento confidencial — entregar a cada aluno apenas a sua linha.', { tamanho: 8, cor: cinza });
    const pag = `Página ${indice + 1} de ${folhas.length}`;
    p.texto(M + LARG - larguraTexto(pag, 8), 32, pag, { tamanho: 8, cor: cinza });
    return p;
  });

  return montarPdf(paginas, `Palavras-passe — ${escola}`);
}

// ---------- Ficha de registo do aluno (certificado de módulos) ----------
// d = { escola, geradoEm, aluno: {nome, numero_processo, data_nascimento, turma, curso, ano_letivo, diretor, encarregado},
//       assiduidade: {faltas, justificadas, injustificadas},
//       disciplinas: [{ nome, modulos: [{ numero, nome, horas, classificacao }], concluidos, media }],
//       resumo: { concluidos, total, horasConcluidas, media } }
function pdfFichaAluno(d) {
  const M = 50;
  const LARG = A4.largura - 2 * M;
  const FUNDO = 80;
  const cinza = [0.42, 0.42, 0.42];
  const acento = [0.05, 0.36, 0.33];
  const paginas = [];
  let p;
  let y;

  const novaPagina = () => {
    p = new Pagina();
    paginas.push(p);
    p.retangulo(0, A4.altura - 8, A4.largura, 8, acento);
    p.texto(M, A4.altura - 40, cortar(d.escola, LARG, 10, true), { fonte: 'F2', tamanho: 10, cor: cinza });
    y = A4.altura - 60;
  };
  // Garante espaço para "altura" pontos; senão passa para a página seguinte
  const espaco = (altura) => {
    if (y - altura < FUNDO) novaPagina();
  };

  novaPagina();
  p.texto(M, y - 14, 'Ficha de registo do aluno', { fonte: 'F2', tamanho: 20 });
  p.texto(M, y - 32, 'Percurso por módulos, classificações e assiduidade', { tamanho: 10, cor: cinza });
  y -= 56;

  // Identificação: duas colunas de pares rótulo/valor
  const a = d.aluno;
  const campos = [
    ['Nome', a.nome],
    ['N.º de processo', a.numero_processo],
    ['Data de nascimento', a.data_nascimento],
    ['Turma', a.turma],
    ['Curso', a.curso],
    ['Ano letivo', a.ano_letivo],
    ['Diretor de turma', a.diretor],
    ['Encarregado de educação', a.encarregado],
  ];
  p.retangulo(M, y - 4 * 30 - 10, LARG, 4 * 30 + 10, [0.96, 0.97, 0.97]);
  campos.forEach(([rotulo, valor], i) => {
    const x = M + 12 + (i % 2) * (LARG / 2);
    const yy = y - 18 - Math.floor(i / 2) * 30;
    p.texto(x, yy, rotulo.toUpperCase(), { fonte: 'F2', tamanho: 7, cor: cinza });
    p.texto(x, yy - 12, cortar(valor || '—', LARG / 2 - 24, 10), { tamanho: 10 });
  });
  y -= 4 * 30 + 30;

  // Resumo
  const r = d.resumo;
  const caixas = [
    ['Módulos concluídos', `${r.concluidos} de ${r.total}`],
    ['Horas concluídas', `${r.horasConcluidas} h`],
    ['Média dos módulos', r.media || '—'],
    ['Faltas de presença', `${d.assiduidade.faltas} (${d.assiduidade.injustificadas} injust.)`],
  ];
  const largCaixa = (LARG - 3 * 10) / 4;
  caixas.forEach(([rotulo, valor], i) => {
    const x = M + i * (largCaixa + 10);
    p.retangulo(x, y - 44, largCaixa, 44, [0.93, 0.95, 0.95]);
    p.texto(x + 8, y - 15, rotulo.toUpperCase(), { fonte: 'F2', tamanho: 6.5, cor: cinza });
    p.texto(x + 8, y - 34, cortar(valor, largCaixa - 16, 13, true), { fonte: 'F2', tamanho: 13, cor: acento });
  });
  y -= 70;

  // Uma tabela por disciplina
  const col = { num: M + 8, nome: M + 48, horas: M + LARG - 150, classif: M + LARG - 70 };
  for (const disc of d.disciplinas) {
    espaco(40 + Math.min(disc.modulos.length, 3) * 18);
    p.texto(M, y - 12, cortar(disc.nome, LARG - 180, 12, true), { fonte: 'F2', tamanho: 12 });
    const resumoDisc = `${disc.concluidos}/${disc.modulos.length} concluído(s)${disc.media ? ` · média ${disc.media}` : ''}`;
    p.texto(M + LARG - larguraTexto(resumoDisc, 9), y - 12, resumoDisc, { tamanho: 9, cor: cinza });
    y -= 22;
    p.retangulo(M, y - 16, LARG, 16, [0.93, 0.93, 0.93]);
    p.texto(col.num, y - 11, 'MÓD.', { fonte: 'F2', tamanho: 7, cor: cinza });
    p.texto(col.nome, y - 11, 'NOME DO MÓDULO', { fonte: 'F2', tamanho: 7, cor: cinza });
    p.texto(col.horas, y - 11, 'HORAS', { fonte: 'F2', tamanho: 7, cor: cinza });
    p.texto(col.classif, y - 11, 'CLASSIFICAÇÃO', { fonte: 'F2', tamanho: 7, cor: cinza });
    y -= 16;
    for (const m of disc.modulos) {
      espaco(18);
      p.linha(M, y - 18, M + LARG, y - 18, [0.88, 0.88, 0.88]);
      p.texto(col.num, y - 12, `M${m.numero}`, { fonte: 'F2', tamanho: 9 });
      p.texto(col.nome, y - 12, cortar(m.nome, col.horas - col.nome - 10, 9), { tamanho: 9 });
      p.texto(col.horas, y - 12, m.horas ? `${m.horas} h` : '—', { tamanho: 9 });
      const c = m.classificacao || '—';
      const negativa = c === 'NC' || c === 'EF' || (Number(c) < 10 && c !== '—');
      p.texto(col.classif, y - 12, c, { fonte: 'F2', tamanho: 9, cor: negativa ? [0.7, 0.15, 0.15] : [0.13, 0.13, 0.13] });
      y -= 18;
    }
    y -= 16;
  }
  if (!d.disciplinas.length) {
    p.texto(M, y - 12, 'Ainda não há módulos definidos para as disciplinas deste aluno.', { tamanho: 10, cor: cinza });
    y -= 30;
  }

  // Legenda e assinatura
  espaco(110);
  p.texto(M, y - 10, 'Módulo concluído com classificação igual ou superior a 10 valores. NC = não concluído · EF = excluído por faltas.', { tamanho: 8, cor: cinza });
  p.texto(M, y - 22, 'A média conta apenas os módulos concluídos.', { tamanho: 8, cor: cinza });
  p.texto(M, y - 60, `Emitido em ${d.geradoEm}.`, { tamanho: 9 });
  p.linha(M + LARG - 200, y - 80, M + LARG, y - 80, [0.4, 0.4, 0.4]);
  p.texto(M + LARG - 200, y - 92, 'A Direção / Os Serviços Administrativos', { tamanho: 8, cor: cinza });

  paginas.forEach((pg, i) => {
    pg.linha(M, 45, M + LARG, 45, [0.85, 0.85, 0.85]);
    pg.texto(M, 32, cortar(`${a.nome} · processo ${a.numero_processo}`, LARG - 100, 8), { tamanho: 8, cor: cinza });
    const pag = `Página ${i + 1} de ${paginas.length}`;
    pg.texto(M + LARG - larguraTexto(pag, 8), 32, pag, { tamanho: 8, cor: cinza });
  });
  return montarPdf(paginas, `Ficha de registo — ${a.nome}`);
}

module.exports = { pdfPalavrasPasse, pdfFichaAluno };
