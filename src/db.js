// Ligação à base de dados MySQL/MariaDB (XAMPP)
const mysql = require('mysql2/promise');
const path = require('node:path');
const fs = require('node:fs');
const { pastaBase } = require('./lib/recursos');
const { contextoAtual } = require('./lib/contexto');

// Configuração (pode ser alterada com variáveis de ambiente)
const CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gestao_escolar',
};

// Base de dados central da plataforma: a lista de escolas e a conta de quem as gere.
// Cada escola tem depois a sua própria base de dados (a da primeira escola é CONFIG.database).
// (com DB_NAME definido — ex.: uma base de dados de testes — a central também fica à parte)
const BD_PLATAFORMA = process.env.DB_PLATAFORMA || (process.env.DB_NAME ? `${process.env.DB_NAME}_plataforma` : 'gestao_plataforma');

const PASTA_DADOS = path.join(pastaBase(), 'data');
const PASTA_FOTOS = path.join(PASTA_DADOS, 'fotos');
const FICHEIRO_ESQUEMA = path.join(pastaBase(), 'database', 'escola.sql');

// Justificativos de faltas enviados pelos encarregados de educação (PDF ou imagem)
const PASTA_JUSTIFICATIVOS = path.join(PASTA_DADOS, 'justificativos');

fs.mkdirSync(PASTA_FOTOS, { recursive: true });
fs.mkdirSync(PASTA_JUSTIFICATIVOS, { recursive: true });

// Os ficheiros de cada escola ficam numa subpasta com o nome da sua base de dados, para nunca se
// misturarem. A primeira escola (CONFIG.database) usa a pasta principal, onde os ficheiros já estavam.
function pastaDaEscola(base) {
  const bd = contextoAtual()?.bd;
  if (!bd || bd === CONFIG.database || bd === BD_PLATAFORMA) return base;
  const pasta = path.join(base, bd);
  fs.mkdirSync(pasta, { recursive: true });
  return pasta;
}
const pastaFotos = () => pastaDaEscola(PASTA_FOTOS);
const pastaJustificativos = () => pastaDaEscola(PASTA_JUSTIFICATIVOS);

// ---------- Ligações ----------
// Um conjunto de ligações ("pool") por base de dados, criado na primeira vez que é preciso
const pools = new Map();
function poolDe(bd) {
  if (!pools.has(bd)) {
    pools.set(
      bd,
      mysql.createPool({
        ...CONFIG,
        database: bd,
        charset: 'utf8mb4',
        dateStrings: true, // datas chegam como texto 'AAAA-MM-DD' (sem problemas de fuso horário)
        connectionLimit: 10,
      })
    );
  }
  return pools.get(bd);
}

// A base de dados do pedido atual (ver lib/contexto.js); fora de um pedido, a da primeira escola
function poolAtual() {
  return poolDe(contextoAtual()?.bd || CONFIG.database);
}

async function fecharLigacoes() {
  await Promise.all([...pools.values()].map((p) => p.end()));
  pools.clear();
}

function ligacaoDeAdministracao() {
  return mysql.createConnection({
    host: CONFIG.host,
    port: CONFIG.port,
    user: CONFIG.user,
    password: CONFIG.password,
    multipleStatements: true,
  });
}

// O nome de uma base de dados vai escrito diretamente no SQL (não pode ser um parâmetro "?"),
// por isso só se aceitam letras minúsculas, algarismos e "_".
function nomeBdValido(bd) {
  return /^[a-z][a-z0-9_]{2,50}$/.test(bd);
}

// Cria a base de dados de uma escola e as suas tabelas (se ainda não existirem) a partir de
// database/escola.sql, e aplica as migrações. Por omissão, a da primeira escola.
async function prepararBaseDeDados(bd = CONFIG.database) {
  if (!nomeBdValido(bd)) throw new Error(`Nome de base de dados inválido: ${bd}`);
  const ligacao = await ligacaoDeAdministracao();
  try {
    const sql = fs.readFileSync(FICHEIRO_ESQUEMA, 'utf8').replaceAll('gestao_escolar', bd);
    await ligacao.query(sql);
    await migrar(ligacao, bd);
  } finally {
    await ligacao.end();
  }
}

// Cria a base de dados central (lista de escolas, conta do gestor da plataforma e as sessões dele)
async function prepararPlataforma() {
  if (!nomeBdValido(BD_PLATAFORMA)) throw new Error(`Nome de base de dados inválido: ${BD_PLATAFORMA}`);
  const ligacao = await ligacaoDeAdministracao();
  try {
    await ligacao.query(`
      CREATE DATABASE IF NOT EXISTS \`${BD_PLATAFORMA}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;
      USE \`${BD_PLATAFORMA}\`;

      -- codigo: aparece no endereço de entrada da escola (/escola/<codigo>)
      -- dominio_email: o que vem depois do @ nos emails institucionais da escola
      -- base_dados: a base de dados onde vivem os alunos, faltas, etc. desta escola
      CREATE TABLE IF NOT EXISTS escolas (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        codigo        VARCHAR(40)  NOT NULL UNIQUE,
        nome          VARCHAR(120) NOT NULL,
        dominio_email VARCHAR(120) NOT NULL UNIQUE,
        base_dados    VARCHAR(64)  NOT NULL UNIQUE,
        direcao_nome  VARCHAR(120),
        ativa         TINYINT(1)   NOT NULL DEFAULT 1,
        criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE = InnoDB;

      CREATE TABLE IF NOT EXISTS gestores (
        id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username                VARCHAR(50)  NOT NULL UNIQUE,
        password_hash           VARCHAR(200) NOT NULL,
        nome                    VARCHAR(120) NOT NULL,
        deve_redefinir_password TINYINT(1)   NOT NULL DEFAULT 0
      ) ENGINE = InnoDB;

      CREATE TABLE IF NOT EXISTS sessoes (
        token         CHAR(64) PRIMARY KEY,
        dados         TEXT NOT NULL,
        ultimo_acesso DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sessoes_acesso (ultimo_acesso)
      ) ENGINE = InnoDB;
    `);
  } finally {
    await ligacao.end();
  }
}

// Atualiza bases de dados criadas por versões anteriores da aplicação
async function migrar(ligacao, bd) {
  const existeColuna = async (tabela, coluna) =>
    (
      await ligacao.query(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [bd, tabela, coluna]
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
    [bd]
  );
  // (o mesmo para o papel "encarregado", que veio depois)
  if (!tipoPapel.includes('funcionario') || !tipoPapel.includes('encarregado')) {
    await ligacao.query(
      `ALTER TABLE utilizadores MODIFY COLUMN papel ENUM('aluno', 'professor', 'admin', 'funcionario', 'encarregado') NOT NULL`
    );
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
        [bd, tabela, nome]
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
    [bd]
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

  // Delegado e subdelegado de turma (alunos representantes), para as reuniões de turma
  if (!(await existeColuna('turmas', 'delegado_id'))) {
    await ligacao.query('ALTER TABLE turmas ADD COLUMN delegado_id INT UNSIGNED AFTER diretor_id');
  }
  if (!(await existeColuna('turmas', 'subdelegado_id'))) {
    await ligacao.query('ALTER TABLE turmas ADD COLUMN subdelegado_id INT UNSIGNED AFTER delegado_id');
  }
  const existeConstraint = async (tabela, nome) =>
    (
      await ligacao.query(
        'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
        [bd, tabela, nome]
      )
    )[0].length > 0;
  if (!(await existeConstraint('turmas', 'fk_turma_delegado'))) {
    await ligacao.query('ALTER TABLE turmas ADD CONSTRAINT fk_turma_delegado FOREIGN KEY (delegado_id) REFERENCES alunos(id) ON DELETE SET NULL');
  }
  if (!(await existeConstraint('turmas', 'fk_turma_subdelegado'))) {
    await ligacao.query('ALTER TABLE turmas ADD CONSTRAINT fk_turma_subdelegado FOREIGN KEY (subdelegado_id) REFERENCES alunos(id) ON DELETE SET NULL');
  }

  // Ata das reuniões de turma (escrita pelo diretor de turma; pode ser ditada ao microfone)
  if (!(await existeColuna('reunioes_turma', 'ata'))) {
    await ligacao.query(
      'ALTER TABLE reunioes_turma ADD COLUMN ata TEXT AFTER assunto, ADD COLUMN ata_por INT UNSIGNED AFTER ata, ADD COLUMN ata_em DATETIME AFTER ata_por'
    );
  }
  if (!(await existeConstraint('reunioes_turma', 'fk_reuniao_ata'))) {
    await ligacao.query('ALTER TABLE reunioes_turma ADD CONSTRAINT fk_reuniao_ata FOREIGN KEY (ata_por) REFERENCES utilizadores(id) ON DELETE SET NULL');
  }

  // Conta de acesso do encarregado de educação, ligada ao(s) educando(s)
  if (!(await existeColuna('alunos', 'encarregado_id'))) {
    await ligacao.query('ALTER TABLE alunos ADD COLUMN encarregado_id INT UNSIGNED AFTER encarregado_nome');
  }
  if (!(await existeConstraint('alunos', 'fk_aluno_encarregado'))) {
    await ligacao.query(
      'ALTER TABLE alunos ADD CONSTRAINT fk_aluno_encarregado FOREIGN KEY (encarregado_id) REFERENCES encarregados(id) ON DELETE SET NULL'
    );
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

// Atalhos de consulta. "obterLigacao" devolve onde executar: uma ligação fixa (dentro de uma
// transação) ou o pool da base de dados do pedido atual, escolhido de novo em cada consulta.
function criarAtalhos(obterLigacao) {
  return {
    async todos(sql, ...params) {
      const [linhas] = await obterLigacao().query(sql, params);
      return linhas;
    },
    async um(sql, ...params) {
      const [linhas] = await obterLigacao().query(sql, params);
      return linhas[0];
    },
    async executar(sql, ...params) {
      const [r] = await obterLigacao().query(sql, params);
      return { lastInsertRowid: r.insertId, changes: r.affectedRows };
    },
  };
}

// Consultas à base de dados da escola do pedido atual
const { todos, um, executar } = criarAtalhos(poolAtual);
// Consultas à base de dados central (escolas e gestor), seja qual for o pedido
const plataforma = criarAtalhos(() => poolDe(BD_PLATAFORMA));

// ---------- Escolas ----------
function escolasAtivas() {
  return plataforma.todos('SELECT * FROM escolas WHERE ativa = 1 ORDER BY nome');
}
function escolaPorCodigo(codigo) {
  return plataforma.um('SELECT * FROM escolas WHERE codigo = ? AND ativa = 1', String(codigo || ''));
}
function escolaPorDominio(dominio) {
  return plataforma.um('SELECT * FROM escolas WHERE dominio_email = ? AND ativa = 1', String(dominio || '').toLowerCase());
}

// Executa várias operações de forma atómica: ou todas ficam guardadas, ou nenhuma
async function transacao(fn) {
  const ligacao = await poolAtual().getConnection();
  try {
    await ligacao.beginTransaction();
    const resultado = await fn(criarAtalhos(() => ligacao));
    await ligacao.commit();
    return resultado;
  } catch (erro) {
    await ligacao.rollback();
    throw erro;
  } finally {
    ligacao.release();
  }
}

module.exports = {
  todos,
  um,
  executar,
  transacao,
  plataforma,
  escolasAtivas,
  escolaPorCodigo,
  escolaPorDominio,
  prepararBaseDeDados,
  prepararPlataforma,
  nomeBdValido,
  fecharLigacoes,
  CONFIG,
  BD_PLATAFORMA,
  PASTA_DADOS,
  PASTA_FOTOS,
  PASTA_JUSTIFICATIVOS,
  pastaFotos,
  pastaJustificativos,
};
