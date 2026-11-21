// Restaura uma cópia de segurança de data/copias/ (ver src/lib/copias.js).
//   npm run restaurar                 → mostra as cópias que existem
//   npm run restaurar -- <ficheiro>   → restaura essa cópia (pede confirmação)
//   npm run copia                     → faz já uma cópia de segurança
// Antes de restaurar, pare a Gestão Escolar e a Conversas. Depois de restaurar, arranque-as de novo
// (o arranque volta a criar as vistas e os gatilhos).
const readline = require('node:readline/promises');
const path = require('node:path');
const fs = require('node:fs');
const { listarCopias, caminhoCopia, restaurarCopia, fazerCopia, PASTA_COPIAS } = require('./lib/copias');
const { CONFIG } = require('./db');

async function principal() {
  const pedido = process.argv[2];
  if (pedido === '--fazer') {
    const nome = await fazerCopia();
    console.log(`Cópia de segurança feita: ${path.join(PASTA_COPIAS, nome)}`);
    return;
  }
  if (!pedido) {
    const copias = listarCopias();
    if (!copias.length) return console.log('Ainda não há cópias de segurança em data/copias/.');
    console.log('Cópias de segurança (da mais recente para a mais antiga):');
    for (const c of copias) console.log(`  ${c.nome}  (${Math.round(c.tamanho / 1024)} KB)`);
    console.log('\nPara restaurar uma:  npm run restaurar -- <nome do ficheiro>');
    return;
  }
  const ficheiro = caminhoCopia(path.basename(pedido)) || (fs.existsSync(pedido) ? pedido : null);
  if (!ficheiro) {
    console.error(`Não encontrei a cópia "${pedido}".`);
    process.exitCode = 1;
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const resposta = await rl.question(
    `Isto APAGA os dados atuais da base de dados "${CONFIG.database}" e põe os da cópia ${path.basename(ficheiro)}.\n` +
      `Pare primeiro a Gestão Escolar e a Conversas. Escreva SIM para continuar: `
  );
  rl.close();
  if (resposta.trim().toUpperCase() !== 'SIM') return console.log('Cancelado. Nada foi alterado.');
  const n = await restaurarCopia(ficheiro);
  console.log(`Cópia restaurada (${n} instruções). Arranque agora a Gestão Escolar (npm start).`);
}

principal().catch((erro) => {
  console.error('Erro:', erro.message);
  process.exitCode = 1;
});
