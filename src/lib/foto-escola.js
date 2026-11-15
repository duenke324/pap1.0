// Foto (ou logótipo) de cada escola, escolhida no painel da plataforma.
// O browser corta a imagem em quadrado e envia-a já em PNG com dois tamanhos (512 e 256 píxeis), em base64.
// Fica em data/fotos/<código>/escola-xxxx.png (+ escola-xxxx-256.png) e o nome vai para escolas.foto.
// É usada no painel, como ícone da app instalada (PWA) e nos ícones do instalador "Atalho de app".
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { plataforma, PASTA_FOTOS } = require('../db');

const TAMANHO_MAXIMO = 2 * 1024 * 1024; // 2 MB por imagem
const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const pastaDaEscola = (escola) => path.join(PASTA_FOTOS, escola.codigo);
const nomeValido = (nome) => typeof nome === 'string' && /^escola-[a-f0-9]{12}$/.test(nome);

function lerPng(dataUrl, lado) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('A imagem da escola não chegou bem. Escolha-a outra vez (JPG, PNG ou WEBP).');
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length > TAMANHO_MAXIMO) throw new Error('A imagem da escola é demasiado grande (máx. 2 MB).');
  if (!bytes.subarray(0, 8).equals(ASSINATURA_PNG)) throw new Error('O ficheiro não é uma imagem válida.');
  // Largura e altura vêm no início do PNG (bloco IHDR)
  if (bytes.readUInt32BE(16) !== lado || bytes.readUInt32BE(20) !== lado) throw new Error('A imagem da escola não tem o tamanho esperado.');
  return bytes;
}

// Caminho do ficheiro da foto (512 ou 256 píxeis), ou null se a escola não tiver foto
function ficheiroFotoEscola(escola, tamanho = 512) {
  if (!escola?.codigo || !nomeValido(escola.foto)) return null;
  const f = path.join(pastaDaEscola(escola), `${escola.foto}${tamanho === 256 ? '-256' : ''}.png`);
  return fs.existsSync(f) ? f : null;
}

function apagarFicheiros(escola, nome) {
  if (!nomeValido(nome)) return;
  for (const sufixo of ['', '-256']) fs.rmSync(path.join(pastaDaEscola(escola), `${nome}${sufixo}.png`), { force: true });
}

// Guarda a foto nova (e apaga a anterior). Lança um erro com uma mensagem para mostrar se a imagem for inválida.
async function guardarFotoEscola(escola, { grande, pequena }) {
  const bytes512 = lerPng(grande, 512);
  const bytes256 = lerPng(pequena, 256);
  const nome = `escola-${crypto.randomBytes(6).toString('hex')}`;
  fs.mkdirSync(pastaDaEscola(escola), { recursive: true });
  fs.writeFileSync(path.join(pastaDaEscola(escola), `${nome}.png`), bytes512);
  fs.writeFileSync(path.join(pastaDaEscola(escola), `${nome}-256.png`), bytes256);
  await plataforma.executar('UPDATE escolas SET foto = ? WHERE id = ?', nome, escola.id);
  apagarFicheiros(escola, escola.foto);
  return nome;
}

// Endereço público da foto (o nome muda a cada foto nova, por isso pode ficar em cache)
function urlFotoEscola(escola, tamanho = 512) {
  if (!escola?.codigo || !nomeValido(escola.foto)) return null;
  return `/${escola.codigo}/foto-escola/${escola.foto}${tamanho === 256 ? '-256' : ''}.png`;
}

async function removerFotoEscola(escola) {
  await plataforma.executar('UPDATE escolas SET foto = NULL WHERE id = ?', escola.id);
  apagarFicheiros(escola, escola.foto);
}

module.exports = { ficheiroFotoEscola, urlFotoEscola, guardarFotoEscola, removerFotoEscola };
