// Preparação dos testes (node --test-global-setup): apaga a base de dados de teste, arranca a Gestão
// Escolar (que cria a base de dados e os dados de demonstração) e a Conversas; no fim desliga-as e apaga
// a base de dados de teste.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { AMBIENTE, REGISTO_GESTAO } = require('./ajuda');

const raiz = path.join(__dirname, '..');
const servidores = [];

async function apagarBaseDeDados() {
  const ligacao = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });
  await ligacao.query(`DROP DATABASE IF EXISTS \`${AMBIENTE.DB_NAME}\``);
  await ligacao.end();
}

function arrancar(ficheiro, pronto, registo) {
  return new Promise((ok, erro) => {
    const filho = spawn(process.execPath, [ficheiro], { cwd: raiz, env: { ...process.env, ...AMBIENTE } });
    servidores.push(filho);
    const saida = fs.createWriteStream(registo);
    let texto = '';
    const tempo = setTimeout(() => erro(new Error(`${ficheiro} não arrancou:\n${texto}`)), 60000);
    const ler = (d) => {
      saida.write(d);
      texto += d;
      if (texto.includes(pronto)) {
        clearTimeout(tempo);
        ok();
      }
    };
    filho.stdout.on('data', ler);
    filho.stderr.on('data', ler);
    filho.on('exit', (codigo) => erro(new Error(`${ficheiro} terminou (código ${codigo}):\n${texto}`)));
  });
}

async function globalSetup() {
  fs.rmSync(AMBIENTE.PASTA_DADOS, { recursive: true, force: true });
  fs.mkdirSync(AMBIENTE.PASTA_DADOS, { recursive: true });
  await apagarBaseDeDados();
  await arrancar('src/app.js', 'Gestão Escolar a correr', REGISTO_GESTAO);
  await arrancar('teams/app.js', 'Conversas a correr', path.join(AMBIENTE.PASTA_DADOS, 'servidor-conversas.log'));
}

async function globalTeardown() {
  for (const s of servidores) {
    s.removeAllListeners('exit');
    s.kill();
  }
  await apagarBaseDeDados();
  fs.rmSync(AMBIENTE.PASTA_DADOS, { recursive: true, force: true });
}

module.exports = { globalSetup, globalTeardown };
