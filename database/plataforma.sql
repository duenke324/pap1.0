-- =====================================================================
--  Sistema de Gestão Escolar — base de dados central da plataforma
--  Guarda a lista de escolas e a conta de quem as gere (o gestor).
--  Os alunos, as faltas, etc. de cada escola ficam na base de dados
--  dessa escola, criada a partir de escola.sql (ver "base_dados" abaixo).
--  Pode ser importado no phpMyAdmin (separador "Importar").
--  A aplicação também executa este ficheiro automaticamente ao arrancar.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS gestao_plataforma
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE gestao_plataforma;

-- Uma linha por escola, criada no painel da plataforma (/plataforma).
-- codigo:        aparece no endereço de entrada da escola (/escola/<codigo>)
-- nome:          aparece no lugar de "Gestão Escolar" nas páginas e nos emails da escola
-- dominio_email: o que vem depois do @ nos emails institucionais da escola
-- base_dados:    a base de dados onde vivem os alunos, faltas, etc. desta escola
-- direcao_nome:  quem administra a escola (tem a conta "direcao" na base de dados da escola)
-- ativa = 0:     ninguém dessa escola consegue entrar; os dados ficam guardados
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

-- Conta do gestor da plataforma (quem cria as escolas). Não é uma conta de nenhuma escola.
-- deve_redefinir_password: fica a 1 na conta inicial; tem de ser trocada no primeiro acesso.
CREATE TABLE IF NOT EXISTS gestores (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username                VARCHAR(50)  NOT NULL UNIQUE,
  password_hash           VARCHAR(200) NOT NULL,
  nome                    VARCHAR(120) NOT NULL,
  deve_redefinir_password TINYINT(1)   NOT NULL DEFAULT 0
) ENGINE = InnoDB;

-- Sessões de login do gestor (as de cada escola ficam na base de dados dessa escola)
CREATE TABLE IF NOT EXISTS sessoes (
  token         CHAR(64) PRIMARY KEY,
  dados         TEXT NOT NULL,
  ultimo_acesso DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessoes_acesso (ultimo_acesso)
) ENGINE = InnoDB;
