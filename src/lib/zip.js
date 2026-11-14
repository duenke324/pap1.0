// Gerador de ficheiros .zip simples (sem bibliotecas externas), usado pelos instaladores das escolas.
// Cada ficheiro é comprimido com "deflate" (o mesmo método que o Windows usa); a compressão corre fora
// do processo principal (zlib assíncrono), para o servidor continuar a responder enquanto o .zip é feito.
const zlib = require('node:zlib');
const { promisify } = require('node:util');

const comprimir = promisify(zlib.deflateRaw);

// Data e hora no formato do MS-DOS, que é o que o formato zip usa
function dataDos(d = new Date()) {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    data: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// ficheiros: [{ nome: 'pasta/ficheiro.txt', dados: Buffer | string }]
async function criarZip(ficheiros) {
  const partes = [];
  const central = [];
  let posicao = 0;
  const { hora, data } = dataDos();

  for (const f of ficheiros) {
    const nome = Buffer.from(f.nome.replace(/\\/g, '/'), 'utf8');
    const dados = Buffer.isBuffer(f.dados) ? f.dados : Buffer.from(f.dados, 'utf8');
    const comprimido = await comprimir(dados, { level: 6 });
    const crc = zlib.crc32(dados);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // assinatura
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    partes.push(local, nome, comprimido);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(hora, 12);
    c.writeUInt16LE(data, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comprimido.length, 20);
    c.writeUInt32LE(dados.length, 24);
    c.writeUInt16LE(nome.length, 28);
    c.writeUInt32LE(posicao, 42); // onde começa o ficheiro
    central.push(c, nome);

    posicao += local.length + nome.length + comprimido.length;
  }

  const tamanhoCentral = central.reduce((n, b) => n + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(ficheiros.length, 8);
  fim.writeUInt16LE(ficheiros.length, 10);
  fim.writeUInt32LE(tamanhoCentral, 12);
  fim.writeUInt32LE(posicao, 16);
  return Buffer.concat([...partes, ...central, fim]);
}

module.exports = { criarZip };
