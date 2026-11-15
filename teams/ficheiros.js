// Ficheiros das tarefas (enunciado do professor e trabalho entregue pelo aluno).
// O browser lê o ficheiro e envia-o em base64 num campo escondido, com o nome original noutro campo
// (como os justificativos da Gestão Escolar). O tipo é decidido pela extensão do nome e confirmado
// pelos primeiros bytes do conteúdo: o tipo indicado pelo browser não conta.
// No disco fica com um nome aleatório, em data/tarefas/<código da escola>/.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pastaTarefas } = require('../src/db');

const TAMANHO_MAXIMO = 4 * 1024 * 1024; // 4 MB (em base64 ocupa ~5,4 MB, abaixo do limite de 6 MB do formulário)

const zip = (b) => b.subarray(0, 4).toString('hex') === '504b0304';
const TIPOS = {
  pdf: { mime: 'application/pdf', assinatura: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  jpg: { mime: 'image/jpeg', assinatura: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: 'image/jpeg', assinatura: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mime: 'image/png', assinatura: (b) => b.subarray(0, 4).toString('hex') === '89504e47' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', assinatura: zip },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', assinatura: zip },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', assinatura: zip },
  zip: { mime: 'application/zip', assinatura: zip },
  // Texto simples: sem assinatura, mas não pode ter bytes nulos (não é um binário com outra extensão)
  txt: { mime: 'text/plain', assinatura: (b) => !b.includes(0) },
};
const EXTENSOES = Object.keys(TIPOS);
const ACEITES = EXTENSOES.map((e) => `.${e}`).join(',');

// Nome original "limpo" (para mostrar e para o descarregar), sempre com a extensão no fim
function nomeOriginalLimpo(nome) {
  return (
    String(nome || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '')
      .trim()
      .slice(-150) || 'ficheiro'
  );
}

// Devolve { ficheiro, ficheiro_nome } ou null se não vier ficheiro. Lança um erro com mensagem para mostrar.
function guardarFicheiroTarefa(dataUrl, nomeOriginal, prefixo) {
  if (!dataUrl) return null;
  const m = /^data:[^;,]*;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) throw new Error('O ficheiro não chegou bem. Escolha-o outra vez.');
  const nome = nomeOriginalLimpo(nomeOriginal);
  const extensao = path.extname(nome).slice(1).toLowerCase();
  const tipo = TIPOS[extensao];
  if (!tipo) throw new Error(`Tipo de ficheiro não aceite. Use: ${EXTENSOES.join(', ').toUpperCase()}.`);
  const bytes = Buffer.from(m[1], 'base64');
  if (!bytes.length) throw new Error('O ficheiro está vazio.');
  if (bytes.length > TAMANHO_MAXIMO) throw new Error('O ficheiro é demasiado grande (máx. 4 MB).');
  if (!tipo.assinatura(bytes)) throw new Error(`O ficheiro "${nome}" não é um ${extensao.toUpperCase()} válido.`);
  const ficheiro = `${prefixo}-${crypto.randomBytes(12).toString('hex')}.${extensao === 'jpeg' ? 'jpg' : extensao}`;
  fs.writeFileSync(path.join(pastaTarefas(), ficheiro), bytes);
  return { ficheiro, ficheiro_nome: nome };
}

function apagarFicheiroTarefa(ficheiro) {
  if (!ficheiro) return;
  fs.rm(path.join(pastaTarefas(), path.basename(ficheiro)), { force: true }, () => {});
}

// Envia o ficheiro sempre como descarga (nunca é aberto no browser como página), com o nome original
function enviarFicheiroTarefa(res, ficheiro, nomeOriginal) {
  const completo = path.join(pastaTarefas(), path.basename(String(ficheiro || '')));
  let info;
  try {
    info = fs.statSync(completo);
  } catch {
    return false;
  }
  const extensao = path.extname(completo).slice(1).toLowerCase();
  const nome = nomeOriginalLimpo(nomeOriginal);
  res.writeHead(200, {
    'Content-Type': TIPOS[extensao]?.mime || 'application/octet-stream',
    'Content-Length': info.size,
    'Content-Disposition': `attachment; filename="${nome.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  fs.createReadStream(completo).pipe(res);
  return true;
}

module.exports = { guardarFicheiroTarefa, apagarFicheiroTarefa, enviarFicheiroTarefa, ACEITES, TAMANHO_MAXIMO };
