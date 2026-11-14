// "npm run atualizar-bd": atualiza a base de dados sem arrancar o servidor.
// Cria o que faltar (tabelas, colunas, vistas) e, numa instalação de uma versão anterior, junta tudo
// na mesma base de dados. Não apaga dados — é o mesmo que a aplicação faz sozinha ao arrancar
// (ver prepararTudo em lib/escolas.js e prepararBaseDeDados em db.js).
const { fecharLigacoes, plataforma, CONFIG } = require('./db');
const { prepararTudo } = require('./lib/escolas');

(async () => {
  try {
    const escolas = await prepararTudo();
    console.log(`Base de dados "${CONFIG.database}" atualizada: ${escolas.length} escola(s).`);
    for (const e of escolas) {
      const n = await plataforma.um('SELECT COUNT(*) AS alunos FROM tb_alunos WHERE escola_id = ?', e.id);
      console.log(`  ${e.nome} (escola_id ${e.id}, /${e.codigo}): ${n.alunos} alunos${e.ativa ? '' : ' [inativa]'}`);
    }
  } catch (erro) {
    console.error(`Não foi possível atualizar (MySQL em ${CONFIG.host}:${CONFIG.port}): ${erro.message}`);
    console.error('Confirme que o MySQL está ligado no painel do XAMPP.');
    process.exitCode = 1;
  } finally {
    await fecharLigacoes();
  }
})();
