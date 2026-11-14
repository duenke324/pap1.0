-- =====================================================================
--  Sistema de Gestão Escolar — tabelas da plataforma
--  Ficam na mesma base de dados que os dados das escolas (gestao_escolar):
--  a lista de escolas e a conta de quem as gere (o gestor).
--  Os alunos, as faltas, etc. de todas as escolas ficam nas tabelas tb_…,
--  cada linha com o escola_id da sua escola (ver src/db.js).
--  Pode ser importado no phpMyAdmin (separador "Importar").
--  A aplicação também executa este ficheiro automaticamente ao arrancar.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS gestao_escolar
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE gestao_escolar;

-- Uma linha por escola, criada no painel da plataforma (/plataforma).
-- id:            o escola_id das linhas dessa escola em todas as tabelas tb_…
-- codigo:        aparece no início dos endereços da escola (/epmontijo/login)
-- nome:          aparece no lugar de "Gestão Escolar" nas páginas e nos emails da escola
-- dominio_email: o que vem depois do @ nos emails institucionais da escola
-- direcao_nome:  quem administra a escola (tem a conta "direcao" dessa escola)
-- ativa = 0:     ninguém dessa escola consegue entrar; os dados ficam guardados
CREATE TABLE IF NOT EXISTS escolas (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo        VARCHAR(40)  NOT NULL UNIQUE,
  nome          VARCHAR(120) NOT NULL,
  dominio_email VARCHAR(120) NOT NULL UNIQUE,
  direcao_nome  VARCHAR(120),
  ativa         TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB;

-- Conta do gestor da plataforma (quem cria as escolas). Não é uma conta de nenhuma escola.
-- deve_redefinir_password: fica a 1 na conta inicial; tem de ser trocada no primeiro acesso.
-- (as sessões do gestor ficam em tb_sessoes, com escola_id = 0)
CREATE TABLE IF NOT EXISTS gestores (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username                VARCHAR(50)  NOT NULL UNIQUE,
  password_hash           VARCHAR(200) NOT NULL,
  nome                    VARCHAR(120) NOT NULL,
  deve_redefinir_password TINYINT(1)   NOT NULL DEFAULT 0
) ENGINE = InnoDB;
