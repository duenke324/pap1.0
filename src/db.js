// Ligação à base de dados MySQL/MariaDB (XAMPP)
const mysql = require('mysql2/promise');
const path = require('node:path');
const fs = require('node:fs');
const { pastaBase } = require('./lib/recursos');

// Configuração (pode ser alterada com variáveis de ambiente)
const CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gestao_escolar',
};

const PASTA_DADOS = path.join(pastaBase(), 'data');
const PASTA_FOTOS = path.join(PASTA_DADOS, 'fotos');
const FICHEIRO_ESQUEMA = path.join(pastaBase(), 'database', 'escola.sql');

fs.mkdirSync(PASTA_FOTOS, { recursive: true });

const pool = mysql.createPool({
  ...CONFIG,
  charset: 'utf8mb4',
  dateStrings: true, // datas chegam como texto 'AAAA-MM-DD' (sem problemas de fuso horário)
  connectionLimit: 10,
});

// Cria a base de dados e as tabelas (se ainda não existirem) a partir de database/escola.sql
async function prepararBaseDeDados() {
  const ligacao = await mysql.createConnection({
    host: CONFIG.host,
    port: CONFIG.port,
    user: CONFIG.user,
    password: CONFIG.password,
    multipleStatements: true,
  });
  try {
    const sql = fs
      .readFileSync(FICHEIRO_ESQUEMA, 'utf8')
      .replaceAll('gestao_escolar', CONFIG.database);
    await ligacao.query(sql);
    await migrar(ligacao);
  } finally {
    await ligacao.end();
  }
}

// Atualiza bases de dados criadas por versões anteriores da aplicação
async function migrar(ligacao) {
  const existeColuna = async (tabela, coluna) =>
    (
      await ligacao.query(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [CONFIG.database, tabela, coluna]
      )
    )[0].length > 0;

  if (!(await existeColuna('horario', 'ativo'))) {
    await ligacao.query('ALTER TABLE horario ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 1 AFTER sala');
  }
  if (!(await existeColuna('utilizadores', 'deve_redefinir_password'))) {
    await ligacao.query('ALTER TABLE utilizadores ADD COLUMN deve_redefinir_password TINYINT(1) NOT NULL DEFAULT 0 AFTER nome');
  }

  // Papel "funcionario" (outros funcionários): bases de dados criadas antes deste papel existir
  // têm o ENUM mais curto, por isso o CREATE TABLE IF NOT EXISTS do escola.sql não chega a alterá-lo.
  const [[{ COLUMN_TYPE: tipoPapel }]] = await ligacao.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'utilizadores' AND COLUMN_NAME = 'papel'`,
    [CONFIG.database]
  );
  if (!tipoPapel.includes('funcionario')) {
    await ligacao.query(`ALTER TABLE utilizadores MODIFY COLUMN papel ENUM('aluno', 'professor', 'admin', 'funcionario') NOT NULL`);
  }
  if (!(await existeColuna('alunos', 'email'))) {
    await ligacao.query('ALTER TABLE alunos ADD COLUMN email VARCHAR(120) AFTER fotografia');
  }

  // Email passou a servir de login na app Conversas: tem de ser único (NULL não conta como duplicado).
  // Só adiciona o índice se ainda não houver duplicados a sério (não deve haver, mas mais vale confirmar).
  const existeIndice = async (tabela, nome) =>
    (
      await ligacao.query(
        'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?',
        [CONFIG.database, tabela, nome]
      )
    )[0].length > 0;
  for (const tabela of ['alunos', 'professores']) {
    if (await existeIndice(tabela, 'uq_email')) continue;
    const [duplicados] = await ligacao.query(
      `SELECT email FROM ${tabela} WHERE email IS NOT NULL GROUP BY email HAVING COUNT(*) > 1`
    );
    if (duplicados.length) {
      console.warn(`Aviso: ${tabela}.email tem valores duplicados, por isso não ficou único: ${duplicados.map((d) => d.email).join(', ')}`);
      continue;
    }
    try {
      await ligacao.query(`ALTER TABLE ${tabela} ADD UNIQUE KEY uq_email (email)`);
    } catch (erro) {
      if (erro.code !== 'ER_DUP_KEYNAME') throw erro; // outro processo (ex.: Conversas) acabou de o adicionar
    }
  }
  if (!(await existeColuna('turmas', 'curso'))) {
    await ligacao.query('ALTER TABLE turmas ADD COLUMN curso VARCHAR(120) AFTER ano_letivo');
  }
  if (!(await existeColuna('turmas', 'diretor_id'))) {
    await ligacao.query('ALTER TABLE turmas ADD COLUMN diretor_id INT UNSIGNED AFTER curso');
  }
  const [fkDiretor] = await ligacao.query(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'turmas' AND CONSTRAINT_NAME = 'fk_turma_diretor'`,
    [CONFIG.database]
  );
  if (!fkDiretor.length) {
    await ligacao.query(
      'ALTER TABLE turmas ADD CONSTRAINT fk_turma_diretor FOREIGN KEY (diretor_id) REFERENCES professores(id) ON DELETE SET NULL'
    );
  }

  // Login dos professores por número de processo (antes era um nome de utilizador livre):
  // a coluna nasce vazia, é preenchida com o username atual e só depois fica obrigatória e única
  if (!(await existeColuna('professores', 'numero_processo'))) {
    await ligacao.query('ALTER TABLE professores ADD COLUMN numero_processo VARCHAR(20) NULL AFTER utilizador_id');
    await ligacao.query(
      `UPDATE professores p JOIN utilizadores u ON u.id = p.utilizador_id
          SET p.numero_processo = u.username WHERE p.numero_processo IS NULL`
    );
    await ligacao.query('ALTER TABLE professores MODIFY COLUMN numero_processo VARCHAR(20) NOT NULL');
    await ligacao.query('ALTER TABLE professores ADD UNIQUE KEY uq_professor_numero (numero_processo)');
  }

  // Canais passaram a representar uma disciplina da turma, em vez de nome livre
  if (!(await existeColuna('canais', 'disciplina_id'))) {
    await ligacao.query('ALTER TABLE canais ADD COLUMN disciplina_id INT UNSIGNED NULL AFTER turma_id');
    await ligacao.query(
      'ALTER TABLE canais ADD CONSTRAINT fk_canal_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplinas(id) ON DELETE SET NULL'
    );
    await ligacao.query('ALTER TABLE canais ADD UNIQUE KEY uq_canal_disciplina (turma_id, disciplina_id)');
  }

  // Na primeira vez, deduz as disciplinas de cada professor a partir do horário existente
  const [[{ n }]] = await ligacao.query('SELECT COUNT(*) AS n FROM professor_disciplinas');
  if (n === 0) {
    await ligacao.query(
      `INSERT IGNORE INTO professor_disciplinas (professor_id, disciplina_id)
       SELECT DISTINCT professor_id, disciplina_id FROM horario WHERE professor_id IS NOT NULL`
    );
  }
}

// Atalhos de consulta. Recebem uma "ligação" opcional para funcionar dentro de transações.
function criarAtalhos(ligacao) {
  return {
    async todos(sql, ...params) {
      const [linhas] = await ligacao.query(sql, params);
      return linhas;
    },
    async um(sql, ...params) {
      const [linhas] = await ligacao.query(sql, params);
      return linhas[0];
    },
    async executar(sql, ...params) {
      const [r] = await ligacao.query(sql, params);
      return { lastInsertRowid: r.insertId, changes: r.affectedRows };
    },
  };
}

const { todos, um, executar } = criarAtalhos(pool);

// Executa várias operações de forma atómica: ou todas ficam guardadas, ou nenhuma
async function transacao(fn) {
  const ligacao = await pool.getConnection();
  try {
    await ligacao.beginTransaction();
    const resultado = await fn(criarAtalhos(ligacao));
    await ligacao.commit();
    return resultado;
  } catch (erro) {
    await ligacao.rollback();
    throw erro;
  } finally {
    ligacao.release();
  }
}

module.exports = { pool, todos, um, executar, transacao, prepararBaseDeDados, CONFIG, PASTA_DADOS, PASTA_FOTOS };
