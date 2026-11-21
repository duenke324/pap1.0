// Cópias de segurança automáticas da base de dados.
// Uma vez por dia (no arranque, se ainda não houver cópia de hoje, e depois de hora a hora), a Gestão
// Escolar guarda em data/copias/ um ficheiro .sql com a estrutura e os dados de todas as tabelas
// (todas as escolas e a plataforma). Ficam só as últimas COPIAS_GUARDADAS; as mais antigas são apagadas.
//
// Feito só com o mysql2 (sem precisar do mysqldump), para funcionar também no servidor completo das escolas.
// As vistas, a função escola_atual() e os gatilhos não vão na cópia: a aplicação volta a criá-los
// sozinha em cada arranque (ver criarVistas em src/db.js).
// Cada instrução fica numa linha só, para o restauro (npm run restaurar) as poder ler uma a uma; o
// ficheiro também pode ser importado no phpMyAdmin.
// As sessões e os pedidos de recuperação de palavra-passe vão sem dados (são códigos de acesso).
const fs = require('node:fs');
const path = require('node:path');
const { CONFIG, PASTA_DADOS, ligacaoDeAdministracao, criarVistas } = require('../db');

const PASTA_COPIAS = path.join(PASTA_DADOS, 'copias');
const COPIAS_GUARDADAS = Number(process.env.COPIAS_GUARDADAS) || 7;
const SEM_DADOS = new Set(['tb_sessoes', 'tb_recuperacoes_password']);
const LINHAS_POR_INSERT = 200;
const NOME_COPIA = /^copia_\d{4}-\d{2}-\d{2}_\d{4}\.sql$/;

const dois = (n) => String(n).padStart(2, '0');
const diaDe = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;

function listarCopias() {
  if (!fs.existsSync(PASTA_COPIAS)) return [];
  return fs
    .readdirSync(PASTA_COPIAS)
    .filter((f) => NOME_COPIA.test(f))
    .sort()
    .reverse()
    .map((nome) => {
      const st = fs.statSync(path.join(PASTA_COPIAS, nome));
      return { nome, tamanho: st.size, criada_em: st.mtime };
    });
}

// Caminho de uma cópia pelo nome (só nomes de cópias verdadeiras: nada de "../")
function caminhoCopia(nome) {
  return NOME_COPIA.test(String(nome)) && fs.existsSync(path.join(PASTA_COPIAS, nome)) ? path.join(PASTA_COPIAS, nome) : null;
}

async function fazerCopia() {
  fs.mkdirSync(PASTA_COPIAS, { recursive: true });
  const agora = new Date();
  const nome = `copia_${diaDe(agora)}_${dois(agora.getHours())}${dois(agora.getMinutes())}.sql`;
  const final = path.join(PASTA_COPIAS, nome);
  const temporario = `${final}.parcial`;
  const ligacao = await ligacaoDeAdministracao();
  const saida = fs.createWriteStream(temporario, 'utf8');
  const escrever = (texto) => new Promise((ok) => (saida.write(texto) ? ok() : saida.once('drain', ok)));
  try {
    const bd = CONFIG.database;
    await ligacao.query(`USE \`${bd}\``);
    const [tabelas] = await ligacao.query(
      `SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
      [bd]
    );
    await escrever(
      `-- Cópia de segurança da base de dados "${bd}" — ${agora.toLocaleString('pt-PT')}\n` +
        `-- Restaurar: npm run restaurar -- ${nome}   (ou Importar no phpMyAdmin, com a base de dados "${bd}" escolhida)\n` +
        `SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n`
    );
    for (const { t } of tabelas) {
      const [[criar]] = await ligacao.query(`SHOW CREATE TABLE \`${t}\``);
      await escrever(`DROP TABLE IF EXISTS \`${t}\`;\n${criar['Create Table'].replace(/\s*\n\s*/g, ' ')};\n`);
      if (SEM_DADOS.has(t)) continue;
      // Datas como texto, tal como estão na base de dados (sem passar por fusos horários)
      const [linhas] = await ligacao.query({
        sql: `SELECT * FROM \`${t}\``,
        rowsAsArray: true,
        typeCast: (campo, seguinte) => (['DATE', 'DATETIME', 'TIMESTAMP'].includes(campo.type) ? campo.string() : seguinte()),
      });
      for (let i = 0; i < linhas.length; i += LINHAS_POR_INSERT) {
        const bloco = linhas.slice(i, i + LINHAS_POR_INSERT).map((l) => `(${l.map((v) => ligacao.escape(v)).join(',')})`);
        await escrever(`INSERT INTO \`${t}\` VALUES ${bloco.join(',')};\n`);
      }
    }
    await escrever('SET FOREIGN_KEY_CHECKS = 1;\n');
    await new Promise((ok, erro) => saida.end((e) => (e ? erro(e) : ok())));
    fs.renameSync(temporario, final); // só fica com o nome final quando está completa
  } catch (erro) {
    saida.destroy();
    fs.rmSync(temporario, { force: true });
    throw erro;
  } finally {
    await ligacao.end();
  }
  apagarAntigas();
  return nome;
}

function apagarAntigas() {
  for (const c of listarCopias().slice(COPIAS_GUARDADAS)) fs.rmSync(path.join(PASTA_COPIAS, c.nome), { force: true });
}

// Faz a cópia do dia, se ainda não houver. Nunca lança erro (não deve parar o servidor).
async function copiaDoDia() {
  try {
    const hojeTexto = diaDe(new Date());
    if (listarCopias().some((c) => c.nome.startsWith(`copia_${hojeTexto}_`))) return null;
    const nome = await fazerCopia();
    console.log(`  Cópia de segurança feita: data/copias/${nome}`);
    return nome;
  } catch (erro) {
    console.error('Não foi possível fazer a cópia de segurança:', erro.message);
    return null;
  }
}

// No arranque e depois de hora a hora (só faz cópia uma vez por dia). COPIAS_AUTOMATICAS=0 desliga.
function agendarCopias() {
  if (process.env.COPIAS_AUTOMATICAS === '0') return;
  copiaDoDia();
  setInterval(copiaDoDia, 60 * 60 * 1000).unref();
}

// Restaura uma cópia (apaga e volta a criar as tabelas com os dados da cópia). Usado por src/restaurar-copia.js.
async function restaurarCopia(ficheiro) {
  const linhas = fs.readFileSync(ficheiro, 'utf8').split('\n');
  const ligacao = await ligacaoDeAdministracao();
  try {
    await ligacao.query(`CREATE DATABASE IF NOT EXISTS \`${CONFIG.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await ligacao.query(`USE \`${CONFIG.database}\``);
    let n = 0;
    for (const linha of linhas) {
      if (!linha.trim() || linha.startsWith('--')) continue;
      await ligacao.query(linha);
      n++;
    }
    // As vistas, a função escola_atual() e os gatilhos não vão na cópia (e os gatilhos foram apagados com
    // as tabelas): voltam a ser criados já aqui, para a aplicação funcionar logo a seguir
    await criarVistas(ligacao, CONFIG.database);
    return n;
  } finally {
    await ligacao.end();
  }
}

module.exports = { PASTA_COPIAS, COPIAS_GUARDADAS, listarCopias, caminhoCopia, fazerCopia, copiaDoDia, agendarCopias, restaurarCopia };
