// "npm run atualizar-bd": atualiza todas as bases de dados sem arrancar o servidor.
// Cria a base de dados central (escolas e gestor) se ainda não existir, e cria as tabelas e
// colunas que faltarem na base de dados de cada escola. Não apaga nem altera dados — é o mesmo
// que a aplicação faz sozinha ao arrancar (ver prepararTudo em lib/escolas.js).
const { fecharLigacoes, plataforma, CONFIG, BD_PLATAFORMA } = require('./db');
const { prepararTudo } = require('./lib/escolas');

(async () => {
  try {
    const escolas = await prepararTudo();
    console.log(`Base de dados central "${BD_PLATAFORMA}" atualizada: ${escolas.length} escola(s).`);
    for (const e of escolas) {
      const bd = `\`${e.base_dados}\``;
      const n = await plataforma.um(
        `SELECT (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?) AS tabelas,
                (SELECT COUNT(*) FROM ${bd}.alunos) AS alunos`,
        e.base_dados
      );
      console.log(`  ${e.nome} — base de dados "${e.base_dados}" atualizada (${n.tabelas} tabelas, ${n.alunos} alunos)${e.ativa ? '' : ' [inativa]'}`);
    }
  } catch (erro) {
    console.error(`Não foi possível atualizar (MySQL em ${CONFIG.host}:${CONFIG.port}): ${erro.message}`);
    console.error('Confirme que o MySQL está ligado no painel do XAMPP.');
    process.exitCode = 1;
  } finally {
    await fecharLigacoes();
  }
})();
