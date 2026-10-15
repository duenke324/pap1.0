-- =====================================================================
--  Sistema de Gestão Escolar — esquema da base de dados (MySQL/MariaDB)
--  Pode ser importado no phpMyAdmin (separador "Importar").
--  A aplicação também executa este ficheiro automaticamente ao arrancar.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS gestao_escolar
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE gestao_escolar;

-- Contas de acesso (alunos, professores e administradores)
-- deve_redefinir_password: fica a 1 sempre que o administrador cria a conta ou define uma
-- palavra-passe nova; a própria pessoa tem de a substituir no primeiro acesso seguinte.
CREATE TABLE IF NOT EXISTS utilizadores (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username                VARCHAR(50)  NOT NULL UNIQUE,
  password_hash           VARCHAR(200) NOT NULL,
  papel                   ENUM('aluno', 'professor', 'admin', 'funcionario') NOT NULL,
  nome                    VARCHAR(120) NOT NULL,
  deve_redefinir_password TINYINT(1)   NOT NULL DEFAULT 0,
  criado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB;

-- diretor_id: diretor de turma (a chave estrangeira para professores é criada em db.js, porque
-- a tabela professores só aparece mais abaixo)
CREATE TABLE IF NOT EXISTS turmas (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome       VARCHAR(50) NOT NULL UNIQUE,
  ano_letivo VARCHAR(9)  NOT NULL,
  curso      VARCHAR(120),
  diretor_id INT UNSIGNED
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS disciplinas (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome  VARCHAR(100) NOT NULL UNIQUE,
  sigla VARCHAR(10)  NOT NULL
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS professores (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilizador_id   INT UNSIGNED NOT NULL UNIQUE,
  numero_processo VARCHAR(20)  NOT NULL UNIQUE,
  nome            VARCHAR(120) NOT NULL,
  email           VARCHAR(120),
  UNIQUE KEY uq_email (email),
  CONSTRAINT fk_professor_utilizador FOREIGN KEY (utilizador_id) REFERENCES utilizadores(id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- Outros funcionários (pessoal não-docente): informático, auxiliar escolar, RH, biblioteca,
-- secretaria, centro de recursos, cozinha e portaria. Conta própria, sem ligação a turmas/disciplinas.
CREATE TABLE IF NOT EXISTS funcionarios (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilizador_id   INT UNSIGNED NOT NULL UNIQUE,
  numero_processo VARCHAR(20)  NOT NULL UNIQUE,
  nome            VARCHAR(120) NOT NULL,
  cargo           ENUM('informatico', 'auxiliar_escolar', 'rh', 'biblioteca', 'secretaria', 'centro_recursos', 'cozinha', 'porteiro') NOT NULL,
  email           VARCHAR(120),
  contacto        VARCHAR(20),
  UNIQUE KEY uq_email (email),
  CONSTRAINT fk_funcionario_utilizador FOREIGN KEY (utilizador_id) REFERENCES utilizadores(id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS alunos (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilizador_id    INT UNSIGNED UNIQUE,
  turma_id         INT UNSIGNED,
  numero_processo  VARCHAR(20)  NOT NULL UNIQUE,
  nome             VARCHAR(120) NOT NULL,
  data_nascimento  DATE,
  contacto         VARCHAR(20),
  encarregado_nome VARCHAR(120),
  fotografia       VARCHAR(100),
  email            VARCHAR(120),
  criado_em        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email (email),
  CONSTRAINT fk_aluno_utilizador FOREIGN KEY (utilizador_id) REFERENCES utilizadores(id) ON DELETE SET NULL,
  CONSTRAINT fk_aluno_turma      FOREIGN KEY (turma_id)      REFERENCES turmas(id)       ON DELETE SET NULL
) ENGINE = InnoDB;

-- Canais de conversa (um por turma, criados por um professor que a lecione).
-- Os alunos só veem os canais aos quais foram adicionados; qualquer professor que lecione a
-- turma pode ver o canal, adicionar alunos e escrever.
-- disciplina_id: o canal passou a representar uma disciplina da turma (em vez de nome livre),
-- escolhida de entre as que o professor leciona nessa turma — ver teams/rotas.js.
-- NULL só acontece em canais antigos, de antes desta mudança.
CREATE TABLE IF NOT EXISTS canais (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  turma_id      INT UNSIGNED NOT NULL,
  disciplina_id INT UNSIGNED,
  nome          VARCHAR(80) NOT NULL,
  criado_por    INT UNSIGNED,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_canal_disciplina (turma_id, disciplina_id),
  CONSTRAINT fk_canal_turma      FOREIGN KEY (turma_id)      REFERENCES turmas(id)      ON DELETE CASCADE,
  CONSTRAINT fk_canal_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplinas(id) ON DELETE SET NULL,
  CONSTRAINT fk_canal_professor  FOREIGN KEY (criado_por)    REFERENCES professores(id) ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS canal_membros (
  canal_id      INT UNSIGNED NOT NULL,
  aluno_id      INT UNSIGNED NOT NULL,
  adicionado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (canal_id, aluno_id),
  CONSTRAINT fk_membro_canal FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE CASCADE,
  CONSTRAINT fk_membro_aluno FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS canal_mensagens (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  canal_id      INT UNSIGNED NOT NULL,
  utilizador_id INT UNSIGNED,
  texto         VARCHAR(2000) NOT NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mensagens_canal (canal_id, id),
  CONSTRAINT fk_mensagem_canal      FOREIGN KEY (canal_id)      REFERENCES canais(id)      ON DELETE CASCADE,
  CONSTRAINT fk_mensagem_utilizador FOREIGN KEY (utilizador_id) REFERENCES utilizadores(id) ON DELETE SET NULL
) ENGINE = InnoDB;

-- Até onde cada utilizador já leu em cada canal (para o indicador de não lidas na barra
-- lateral). ultima_leitura_mensagem_id é o id da última mensagem vista; 0 = nunca abriu o canal.
CREATE TABLE IF NOT EXISTS canal_leituras (
  canal_id                   INT UNSIGNED NOT NULL,
  utilizador_id               INT UNSIGNED NOT NULL,
  ultima_leitura_mensagem_id  INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (canal_id, utilizador_id),
  CONSTRAINT fk_leitura_canal      FOREIGN KEY (canal_id)      REFERENCES canais(id)      ON DELETE CASCADE,
  CONSTRAINT fk_leitura_utilizador FOREIGN KEY (utilizador_id) REFERENCES utilizadores(id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- Mensagens privadas (1 para 1). utilizador_a_id é sempre o menor dos dois ids, para o par ter
-- sempre uma única linha, qualquer que seja quem iniciou a conversa — ver teams/privadas.js.
-- Quem pode falar com quem também é decidido lá: professores entre si, e professor com aluno só
-- se o professor lecionar a turma do aluno (sem conversas aluno-aluno, por omissão).
CREATE TABLE IF NOT EXISTS conversas_diretas (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilizador_a_id INT UNSIGNED NOT NULL,
  utilizador_b_id INT UNSIGNED NOT NULL,
  criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_par (utilizador_a_id, utilizador_b_id),
  CONSTRAINT fk_conversa_a FOREIGN KEY (utilizador_a_id) REFERENCES utilizadores(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversa_b FOREIGN KEY (utilizador_b_id) REFERENCES utilizadores(id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS conversa_direta_mensagens (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversa_id   INT UNSIGNED NOT NULL,
  utilizador_id INT UNSIGNED,
  texto         VARCHAR(2000) NOT NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_conversa_mensagens (conversa_id, id),
  CONSTRAINT fk_conversa_mensagem      FOREIGN KEY (conversa_id)   REFERENCES conversas_diretas(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversa_mensagem_user FOREIGN KEY (utilizador_id) REFERENCES utilizadores(id)      ON DELETE SET NULL
) ENGINE = InnoDB;

-- Disciplinas que cada professor pode lecionar (usado no editor de horários)
CREATE TABLE IF NOT EXISTS professor_disciplinas (
  professor_id  INT UNSIGNED NOT NULL,
  disciplina_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (professor_id, disciplina_id),
  CONSTRAINT fk_pd_professor  FOREIGN KEY (professor_id)  REFERENCES professores(id) ON DELETE CASCADE,
  CONSTRAINT fk_pd_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplinas(id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- Tempos letivos do dia (linhas da grelha do horário)
CREATE TABLE IF NOT EXISTS tempos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hora_inicio CHAR(5) NOT NULL UNIQUE,
  hora_fim    CHAR(5) NOT NULL
) ENGINE = InnoDB;

INSERT IGNORE INTO tempos (hora_inicio, hora_fim) VALUES
  ('08:30', '09:20'), ('09:30', '10:20'), ('10:35', '11:25'), ('11:35', '12:25'),
  ('13:30', '14:20'), ('14:30', '15:20'), ('15:30', '16:20'), ('16:30', '17:20');

-- Cada linha é uma aula semanal (tempo letivo) de uma turma. dia_semana: 1 = segunda … 5 = sexta
-- ativo = 0: aula retirada do horário, mas mantida porque tem faltas associadas (histórico)
CREATE TABLE IF NOT EXISTS horario (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  turma_id      INT UNSIGNED NOT NULL,
  disciplina_id INT UNSIGNED NOT NULL,
  professor_id  INT UNSIGNED,
  dia_semana    TINYINT UNSIGNED NOT NULL CHECK (dia_semana BETWEEN 1 AND 5),
  hora_inicio   CHAR(5) NOT NULL,
  hora_fim      CHAR(5) NOT NULL,
  sala          VARCHAR(20),
  ativo         TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_horario_turma (turma_id),
  CONSTRAINT fk_horario_turma      FOREIGN KEY (turma_id)      REFERENCES turmas(id)      ON DELETE CASCADE,
  CONSTRAINT fk_horario_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplinas(id),
  CONSTRAINT fk_horario_professor  FOREIGN KEY (professor_id)  REFERENCES professores(id) ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS faltas (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  aluno_id        INT UNSIGNED NOT NULL,
  horario_id      INT UNSIGNED NOT NULL,
  data            DATE NOT NULL,
  tipo            ENUM('presenca', 'material', 'disciplinar') NOT NULL DEFAULT 'presenca',
  justificada     TINYINT(1) NOT NULL DEFAULT 0,
  justificacao    VARCHAR(200),
  justificada_em  DATETIME,
  justificada_por INT UNSIGNED,
  registada_por   INT UNSIGNED,
  criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_falta (aluno_id, horario_id, data, tipo),
  CONSTRAINT fk_falta_aluno       FOREIGN KEY (aluno_id)        REFERENCES alunos(id)       ON DELETE CASCADE,
  CONSTRAINT fk_falta_horario     FOREIGN KEY (horario_id)      REFERENCES horario(id)      ON DELETE CASCADE,
  CONSTRAINT fk_falta_justificou  FOREIGN KEY (justificada_por) REFERENCES utilizadores(id) ON DELETE SET NULL,
  CONSTRAINT fk_falta_registou    FOREIGN KEY (registada_por)   REFERENCES utilizadores(id) ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS testes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  turma_id      INT UNSIGNED NOT NULL,
  disciplina_id INT UNSIGNED NOT NULL,
  professor_id  INT UNSIGNED,
  data          DATE NOT NULL,
  tipo          ENUM('teste', 'trabalho', 'apresentacao', 'outro') NOT NULL DEFAULT 'teste',
  descricao     VARCHAR(200),
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_testes_turma (turma_id, data),
  CONSTRAINT fk_teste_turma      FOREIGN KEY (turma_id)      REFERENCES turmas(id)      ON DELETE CASCADE,
  CONSTRAINT fk_teste_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplinas(id),
  CONSTRAINT fk_teste_professor  FOREIGN KEY (professor_id)  REFERENCES professores(id) ON DELETE SET NULL
) ENGINE = InnoDB;

-- Módulos de cada disciplina (cursos profissionais: a avaliação é feita por módulo)
CREATE TABLE IF NOT EXISTS modulos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  disciplina_id INT UNSIGNED NOT NULL,
  numero        TINYINT UNSIGNED NOT NULL,
  nome          VARCHAR(120) NOT NULL,
  horas         SMALLINT UNSIGNED,
  UNIQUE KEY uq_modulo (disciplina_id, numero),
  CONSTRAINT fk_modulo_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplinas(id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- Lições dadas ("Dar aula"): uma por aula do horário e por data, com o sumário.
-- As faltas dessa lição são as faltas com o mesmo horario_id e data.
CREATE TABLE IF NOT EXISTS licoes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  horario_id    INT UNSIGNED NOT NULL,
  data          DATE NOT NULL,
  modulo_id     INT UNSIGNED,
  sumario       TEXT NOT NULL,
  registada_por INT UNSIGNED,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_licao (horario_id, data),
  CONSTRAINT fk_licao_horario   FOREIGN KEY (horario_id)    REFERENCES horario(id)      ON DELETE CASCADE,
  CONSTRAINT fk_licao_modulo    FOREIGN KEY (modulo_id)     REFERENCES modulos(id)      ON DELETE SET NULL,
  CONSTRAINT fk_licao_registou  FOREIGN KEY (registada_por) REFERENCES utilizadores(id) ON DELETE SET NULL
) ENGINE = InnoDB;

-- Classificação de cada aluno em cada módulo: nota de 0 a 20, NC (não concluído) ou EF (excluído por faltas)
CREATE TABLE IF NOT EXISTS notas (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  aluno_id      INT UNSIGNED NOT NULL,
  modulo_id     INT UNSIGNED NOT NULL,
  estado        ENUM('nota', 'NC', 'EF') NOT NULL,
  nota          TINYINT UNSIGNED,
  lancada_por   INT UNSIGNED,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_nota (aluno_id, modulo_id),
  CONSTRAINT ck_nota CHECK ((estado = 'nota' AND nota BETWEEN 0 AND 20) OR (estado <> 'nota' AND nota IS NULL)),
  CONSTRAINT fk_nota_aluno   FOREIGN KEY (aluno_id)    REFERENCES alunos(id)       ON DELETE CASCADE,
  CONSTRAINT fk_nota_modulo  FOREIGN KEY (modulo_id)   REFERENCES modulos(id),
  CONSTRAINT fk_nota_lancou  FOREIGN KEY (lancada_por) REFERENCES utilizadores(id) ON DELETE SET NULL
) ENGINE = InnoDB;

-- Calendário escolar: períodos letivos e interrupções (Natal, Carnaval, Páscoa…) de cada ano letivo
CREATE TABLE IF NOT EXISTS calendario (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ano_letivo VARCHAR(9) NOT NULL,
  tipo       ENUM('periodo', 'interrupcao') NOT NULL,
  nome       VARCHAR(60) NOT NULL,
  inicio     DATE NOT NULL,
  fim        DATE NOT NULL,
  INDEX idx_calendario_ano (ano_letivo, inicio),
  CONSTRAINT ck_calendario_datas CHECK (fim >= inicio)
) ENGINE = InnoDB;

-- Avisos (circulares) publicados pela secretaria. turma_id NULL = para todos os alunos
CREATE TABLE IF NOT EXISTS avisos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  titulo        VARCHAR(150) NOT NULL,
  texto         TEXT NOT NULL,
  turma_id      INT UNSIGNED,
  publicado_por INT UNSIGNED,
  publicado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_avisos_data (publicado_em),
  CONSTRAINT fk_aviso_turma  FOREIGN KEY (turma_id)      REFERENCES turmas(id)       ON DELETE CASCADE,
  CONSTRAINT fk_aviso_autor  FOREIGN KEY (publicado_por) REFERENCES utilizadores(id) ON DELETE SET NULL
) ENGINE = InnoDB;

-- Sessões de login (ficam guardadas, por isso reiniciar o servidor não obriga a entrar de novo)
CREATE TABLE IF NOT EXISTS sessoes (
  token         CHAR(64) PRIMARY KEY,
  dados         TEXT NOT NULL,
  ultimo_acesso DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessoes_acesso (ultimo_acesso)
) ENGINE = InnoDB;

-- Histórico de auditoria: ações críticas da administração (criar/editar/apagar turmas, professores,
-- disciplinas e alunos; mudanças de diretor de turma e de curso) — quem fez, o quê e quando.
CREATE TABLE IF NOT EXISTS logs_auditoria (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilizador_id INT UNSIGNED,
  acao          ENUM('criar', 'editar', 'apagar') NOT NULL,
  entidade      VARCHAR(30) NOT NULL,
  entidade_id   INT UNSIGNED,
  detalhe       VARCHAR(500) NOT NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logs_data (criado_em),
  INDEX idx_logs_entidade (entidade, entidade_id),
  CONSTRAINT fk_log_utilizador FOREIGN KEY (utilizador_id) REFERENCES utilizadores(id) ON DELETE SET NULL
) ENGINE = InnoDB;
