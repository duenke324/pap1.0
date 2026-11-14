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

// Tudo numa só base de dados (CONFIG.database, "gestao_escolar"): a lista de escolas, a conta do gestor
// da plataforma e os dados de todas as escolas.
//
// Como as escolas ficam separadas lá dentro:
//  - cada tabela "a sério" chama-se tb_<nome> (tb_alunos, tb_turmas…) e tem uma coluna escola_id;
//  - com o nome antigo (alunos, turmas…) existe uma vista que só mostra as linhas da escola de quem
//    está a usar a ligação: WHERE escola_id = escola_atual(). A função escola_atual() devolve a
//    variável @escola_id, que cada ligação recebe ao abrir (ver poolDaEscola, abaixo);
//  - ao inserir pela vista, um gatilho (trigger) preenche o escola_id sozinho, e o "WITH CHECK OPTION"
//    impede gravar ou alterar linhas de outra escola.
// Assim as consultas da aplicação continuam iguais ("SELECT * FROM alunos") e uma escola nunca vê os
// dados de outra, mesmo que uma consulta se esqueça de filtrar. A escola 0 é a plataforma (as sessões
// do gestor ficam em tb_sessoes com escola_id = 0).

// Bases de dados das versões anteriores (uma central e uma por escola): só são lidas uma vez, para
// trazer os dados para a base de dados única. Não são apagadas.
const BD_PLATAFORMA_ANTIGA = process.env.DB_PLATAFORMA || (process.env.DB_NAME ? `${process.env.DB_NAME}_plataforma` : 'gestao_plataforma');

const PASTA_DADOS = path.join(pastaBase(), 'data');
const PASTA_FOTOS = path.join(PASTA_DADOS, 'fotos');
const FICHEIRO_ESQUEMA = path.join(pastaBase(), 'database', 'escola.sql');
const FICHEIRO_ESQUEMA_PLATAFORMA = path.join(pastaBase(), 'database', 'plataforma.sql');

// As tabelas de cada escola são as de database/escola.sql (pela ordem em que lá aparecem)
const TABELAS_ESCOLA = [...fs.readFileSync(FICHEIRO_ESQUEMA, 'utf8').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);

// Justificativos de faltas enviados pelos encarregados de educação (PDF ou imagem)
const PASTA_JUSTIFICATIVOS = path.join(PASTA_DADOS, 'justificativos');

fs.mkdirSync(PASTA_FOTOS, { recursive: true });
fs.mkdirSync(PASTA_JUSTIFICATIVOS, { recursive: true });

// Os ficheiros de cada escola (fotografias, justificativos) ficam numa subpasta com o código da escola
// (data/fotos/epmontijo/…), para nunca se misturarem
function pastaDaEscola(base) {
  const codigo = contextoAtual()?.escola?.codigo;
  if (!codigo) return base;
  const pasta = path.join(base, codigo);
  fs.mkdirSync(pasta, { recursive: true });
  return pasta;
}
const pastaFotos = () => pastaDaEscola(PASTA_FOTOS);
const pastaJustificativos = () => pastaDaEscola(PASTA_JUSTIFICATIVOS);

// ---------- Ligações ----------
// Um conjunto de ligações ("pool") por escola, criado na primeira vez que é preciso. Todas as ligações
// de uma escola começam com SET @escola_id = <id da escola>, por isso as vistas só lhes mostram essa escola.
const pools = new Map();
function poolDaEscola(escolaId) {
  const id = Number(escolaId) || 0;
  if (!pools.has(id)) {
    const pool = mysql.createPool({
      ...CONFIG,
      charset: 'utf8mb4',
      dateStrings: true, // datas chegam como texto 'AAAA-MM-DD' (sem problemas de fuso horário)
      connectionLimit: 10,
    });
    // (corre antes de qualquer consulta feita nesta ligação: o mysql2 executa-as por ordem)
    pool.pool.on('connection', (ligacao) => ligacao.query(`SET @escola_id = ${id}`));
    pools.set(id, pool);
  }
  return pools.get(id);
}

// A escola do pedido atual (ver lib/contexto.js); fora de um pedido, a escola 0 (que não tem dados)
function poolAtual() {
  return poolDaEscola(contextoAtual()?.escolaId);
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

// ---------- Preparar a base de dados no arranque ----------
// 1. cria a base de dados e as tabelas da plataforma (escolas, gestores);
// 2. na primeira vez, traz as escolas e o gestor da base de dados central antiga (gestao_plataforma);
// 3. cria as tabelas das escolas (escola.sql) ou atualiza as de uma versão anterior (migrar);
// 4. converte-as para o formato de várias escolas (tb_…, escola_id) — só na primeira vez;
// 5. (re)cria a função escola_atual(), as vistas e os gatilhos.
// Devolve as escolas registadas.
async function prepararBaseDeDados() {
  const bd = CONFIG.database;
  if (!nomeBdValido(bd)) throw new Error(`Nome de base de dados inválido: ${bd}`);
  const ligacao = await ligacaoDeAdministracao();
  try {
    await ligacao.query(fs.readFileSync(FICHEIRO_ESQUEMA_PLATAFORMA, 'utf8').replaceAll('gestao_escolar', bd));
    const tipoTabela = async (base, nome) =>
      (await ligacao.query('SELECT TABLE_TYPE AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [base, nome]))[0][0]?.t ||
      null;
    const existeBd = async (nome) => (await ligacao.query('SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [nome]))[0].length > 0;

    // Escolas e gestor da versão anterior (base de dados central à parte)
    let escolasAntigas = [];
    if (BD_PLATAFORMA_ANTIGA !== bd && (await tipoTabela(BD_PLATAFORMA_ANTIGA, 'escolas'))) {
      const antiga = `\`${BD_PLATAFORMA_ANTIGA}\``;
      [escolasAntigas] = await ligacao.query(`SELECT id, codigo, base_dados FROM ${antiga}.escolas ORDER BY id`);
      const [[{ n }]] = await ligacao.query('SELECT COUNT(*) AS n FROM escolas');
      if (n === 0 && escolasAntigas.length) {
        await ligacao.query(
          `INSERT INTO escolas (id, codigo, nome, dominio_email, direcao_nome, ativa, criado_em)
           SELECT id, codigo, nome, dominio_email, direcao_nome, ativa, criado_em FROM ${antiga}.escolas`
        );
        await ligacao.query(
          `INSERT IGNORE INTO gestores (id, username, password_hash, nome, deve_redefinir_password)
           SELECT id, username, password_hash, nome, deve_redefinir_password FROM ${antiga}.gestores`
        );
        console.log(`Escolas e gestor trazidos da base de dados "${BD_PLATAFORMA_ANTIGA}" para "${bd}".`);
      }
    }

    // Tabelas das escolas ainda no formato antigo (uma escola só)?
    const jaConvertida = Boolean(await tipoTabela(bd, 'tb_utilizadores'));

    // Escolas da versão anterior que tinham a sua própria base de dados (com dados): não se juntam
    // sozinhas, porque os números (id) de cada uma começavam todos no 1 e iam chocar uns com os outros
    if (!jaConvertida) {
      for (const e of escolasAntigas) {
        if (e.base_dados === bd || !(await existeBd(e.base_dados))) continue;
        if (await tipoTabela(e.base_dados, 'utilizadores')) {
          throw new Error(
            `A escola "${e.codigo}" ainda tem os dados numa base de dados própria ("${e.base_dados}"), que não ` +
              `pode ser junta automaticamente. Exporte-a no phpMyAdmin e apague-a antes de juntar tudo em "${bd}".`
          );
        }
      }
    }

    // A primeira escola: a dona dos dados que já estavam nesta base de dados
    let [[primeira]] = await ligacao.query('SELECT id, codigo FROM escolas ORDER BY id LIMIT 1');
    const donaAntiga = escolasAntigas.find((e) => e.base_dados === bd);
    if (donaAntiga) primeira = donaAntiga;
    if (!primeira) {
      const [r] = await ligacao.query(
        `INSERT INTO escolas (codigo, nome, dominio_email, direcao_nome)
         VALUES ('epmontijo', 'Escola Profissional do Montijo', 'epmontijo.edu.pt', 'Secretaria')`
      );
      primeira = { id: r.insertId, codigo: 'epmontijo' };
    }

    // Tabelas das escolas: novas (escola.sql) ou de uma versão anterior, ainda com o nome antigo
    if (!jaConvertida) {
      if ((await tipoTabela(bd, 'utilizadores')) !== 'BASE TABLE') {
        await ligacao.query(fs.readFileSync(FICHEIRO_ESQUEMA, 'utf8').replaceAll('gestao_escolar', bd));
      }
      await migrar(ligacao, bd);
    }
    await converterParaVariasEscolas(ligacao, bd, primeira);
    await criarVistas(ligacao, bd);

    const [escolas] = await ligacao.query('SELECT * FROM escolas ORDER BY id');
    return escolas;
  } finally {
    await ligacao.end();
  }
}

// Passa as tabelas de uma escola só para o formato de várias escolas. Cada passo verifica se já foi
// feito, por isso pode correr em todos os arranques (e retomar se uma vez ficou a meio).
async function converterParaVariasEscolas(ligacao, bd, primeira) {
  const tipo = async (nome) =>
    (await ligacao.query('SELECT TABLE_TYPE AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [bd, nome]))[0][0]?.t || null;
  let convertidas = 0;

  // 1. nome antigo → tb_<nome> (as chaves estrangeiras acompanham a mudança de nome)
  const renomear = [];
  for (const t of TABELAS_ESCOLA) if ((await tipo(t)) === 'BASE TABLE' && !(await tipo(`tb_${t}`))) renomear.push(t);
  if (renomear.length) await ligacao.query(`RENAME TABLE ${renomear.map((t) => `\`${t}\` TO \`tb_${t}\``).join(', ')}`);

  for (const t of TABELAS_ESCOLA) {
    const tabela = `tb_${t}`;
    // 2. coluna escola_id: as linhas que já existiam são da primeira escola
    const [colunas] = await ligacao.query(
      `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'escola_id'`,
      [bd, tabela]
    );
    if (!colunas.length) {
      await ligacao.query(
        `ALTER TABLE \`${tabela}\` ADD COLUMN escola_id INT UNSIGNED NOT NULL DEFAULT ${Number(primeira.id)} FIRST, ADD INDEX idx_escola (escola_id)`
      );
      await ligacao.query(`ALTER TABLE \`${tabela}\` ALTER COLUMN escola_id SET DEFAULT 0`);
      convertidas++;
    }
    // 3. valores únicos "por escola": o mesmo username, email, número de processo, nome de turma… pode
    //    existir em escolas diferentes. (Os únicos que levam números *_id já são de uma só escola.)
    const [indices] = await ligacao.query(
      `SELECT INDEX_NAME AS nome, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS colunas
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
        GROUP BY INDEX_NAME`,
      [bd, tabela]
    );
    for (const { nome, colunas: lista } of indices) {
      const cols = lista.split(',');
      if (cols[0] === 'escola_id' || cols.some((c) => c === 'id' || c.endsWith('_id'))) continue;
      await ligacao.query(
        `ALTER TABLE \`${tabela}\` DROP INDEX \`${nome}\`, ADD UNIQUE KEY \`${nome}\` (escola_id, ${cols.map((c) => `\`${c}\``).join(', ')})`
      );
    }
  }

  if (convertidas) {
    // Os ficheiros da primeira escola (fotografias, justificativos) passam para a subpasta dela
    for (const base of [PASTA_FOTOS, PASTA_JUSTIFICATIVOS]) {
      const destino = path.join(base, primeira.codigo);
      fs.mkdirSync(destino, { recursive: true });
      for (const f of fs.readdirSync(base, { withFileTypes: true })) {
        if (f.isFile()) fs.renameSync(path.join(base, f.name), path.join(destino, f.name));
      }
    }
    console.log(`Base de dados "${bd}" convertida para várias escolas (${convertidas} tabelas; os dados existentes ficaram na escola "${primeira.codigo}").`);
  }
}

// Função escola_atual(), uma vista por tabela (com o nome antigo) e o gatilho que preenche o escola_id.
// Volta a ser criado em cada arranque, para as vistas acompanharem colunas novas.
async function criarVistas(ligacao, bd) {
  await ligacao.query('CREATE OR REPLACE FUNCTION escola_atual() RETURNS INT UNSIGNED DETERMINISTIC NO SQL RETURN @escola_id');
  for (const t of TABELAS_ESCOLA) {
    const tabela = `tb_${t}`;
    const [colunas] = await ligacao.query(
      `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME <> 'escola_id' ORDER BY ORDINAL_POSITION`,
      [bd, tabela]
    );
    await ligacao.query(
      `CREATE OR REPLACE ALGORITHM = MERGE SQL SECURITY INVOKER VIEW \`${t}\` AS
         SELECT ${colunas.map(({ c }) => `\`${c}\``).join(', ')} FROM \`${tabela}\`
          WHERE escola_id = escola_atual()
         WITH CASCADED CHECK OPTION`
    );
    await ligacao.query(
      `CREATE OR REPLACE TRIGGER \`${tabela}_escola\` BEFORE INSERT ON \`${tabela}\` FOR EACH ROW
         SET NEW.escola_id = COALESCE(NULLIF(NEW.escola_id, 0), escola_atual(), 0)`
    );
  }
}

// Atualiza bases de dados criadas por versões anteriores da aplicação (ainda com uma escola só,
// antes da conversão para tb_…; ver prepararBaseDeDados)
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

// Consultas aos dados da escola do pedido atual
const { todos, um, executar } = criarAtalhos(poolAtual);
// Consultas da plataforma (escolas, gestor e as sessões dele), seja qual for o pedido: escola 0
const plataforma = criarAtalhos(() => poolDaEscola(0));

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
  nomeBdValido,
  fecharLigacoes,
  CONFIG,
  TABELAS_ESCOLA,
  PASTA_DADOS,
  PASTA_FOTOS,
  PASTA_JUSTIFICATIVOS,
  pastaFotos,
  pastaJustificativos,
};
