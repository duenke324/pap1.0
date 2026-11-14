// "node src/importar-escola.js dados-escola.json": instala os dados de uma escola neste servidor.
// É o que o instalar.cmd do "servidor completo" corre (ver lib/instaladores.js), num PC com o XAMPP.
//  1. cria a base de dados gestao_escolar (se ainda não existir) e regista a escola com o mesmo id;
//  2. prepara as tabelas, as vistas e a conta do gestor da plataforma (como no arranque normal);
//  3. copia para as tabelas tb_… todas as linhas da escola que vêm no ficheiro.
// As fotografias e os justificativos já vêm na pasta data/ do pacote.
// Se esta base de dados já tiver OUTRA escola, para sem mexer em nada.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { CONFIG, TABELAS_ESCOLA, fecharLigacoes } = require('./db');
const { prepararTudo } = require('./lib/escolas');
const { pastaBase } = require('./lib/recursos');

(async () => {
  const ficheiro = process.argv[2] || 'dados-escola.json';
  let ligacao;
  try {
    const pacote = JSON.parse(fs.readFileSync(path.resolve(ficheiro), 'utf8'));
    if (pacote.formato !== 'gestao-escolar-escola') throw new Error(`"${ficheiro}" não é um ficheiro de dados de uma escola.`);
    const { escola, tabelas } = pacote;
    console.log(`A instalar "${escola.nome}" na base de dados "${CONFIG.database}" (MySQL em ${CONFIG.host}:${CONFIG.port})...`);

    ligacao = await mysql.createConnection({ ...CONFIG, database: undefined, multipleStatements: true });
    const esquema = fs.readFileSync(path.join(pastaBase(), 'database', 'plataforma.sql'), 'utf8').replaceAll('gestao_escolar', CONFIG.database);
    await ligacao.query(esquema);
    const [outras] = await ligacao.query('SELECT codigo FROM escolas WHERE codigo <> ? OR id <> ?', [escola.codigo, escola.id]);
    if (outras.length) {
      throw new Error(
        `A base de dados "${CONFIG.database}" já tem outra(s) escola(s) (${outras.map((e) => e.codigo).join(', ')}). ` +
          'Para não misturar dados, a instalação parou sem mexer em nada.'
      );
    }
    await ligacao.query(
      `INSERT INTO escolas (id, codigo, nome, dominio_email, direcao_nome) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nome = VALUES(nome), dominio_email = VALUES(dominio_email), direcao_nome = VALUES(direcao_nome)`,
      [escola.id, escola.codigo, escola.nome, escola.dominio_email, escola.direcao_nome]
    );
    await ligacao.end();
    ligacao = null;

    // Tabelas, vistas e conta do gestor (a escola acabada de registar fica como a "primeira")
    await prepararTudo();

    // Linhas da escola: apaga as que já existam (ex.: tempos criados agora, ou uma instalação anterior)
    // e copia as do ficheiro, com os mesmos números (id), para as ligações entre tabelas se manterem
    ligacao = await mysql.createConnection(CONFIG);
    await ligacao.beginTransaction();
    await ligacao.query('SET FOREIGN_KEY_CHECKS = 0');
    let total = 0;
    for (const t of TABELAS_ESCOLA) {
      await ligacao.query(`DELETE FROM \`tb_${t}\` WHERE escola_id = ?`, [escola.id]);
      const linhas = tabelas[t] || [];
      if (!linhas.length) continue;
      const colunas = Object.keys(linhas[0]);
      for (let i = 0; i < linhas.length; i += 500) {
        const bloco = linhas.slice(i, i + 500).map((l) => [escola.id, ...colunas.map((c) => l[c])]);
        await ligacao.query(`INSERT INTO \`tb_${t}\` (escola_id, ${colunas.map((c) => `\`${c}\``).join(', ')}) VALUES ?`, [bloco]);
      }
      total += linhas.length;
    }
    await ligacao.query('SET FOREIGN_KEY_CHECKS = 1');
    await ligacao.commit();

    const n = (t) => (tabelas[t] || []).length;
    console.log(`Pronto: ${total} registos importados (${n('alunos')} alunos, ${n('professores')} professores, ${n('turmas')} turmas).`);
    console.log(`Gestão Escolar: http://localhost:3000/${escola.codigo}/login   ·   Conversas: http://localhost:3100/${escola.codigo}/login`);
  } catch (erro) {
    if (ligacao) await ligacao.rollback().catch(() => {});
    console.error(`\nNão foi possível instalar: ${erro.message}`);
    if (erro.code === 'ECONNREFUSED') console.error('Confirme que o MySQL está ligado no painel do XAMPP (porta 3306).');
    process.exitCode = 1;
  } finally {
    if (ligacao) await ligacao.end().catch(() => {});
    await fecharLigacoes();
  }
})();
