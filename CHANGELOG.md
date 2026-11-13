# Registo de alterações

Tudo o que mudou no Sistema de Gestão Escolar, da versão mais recente para a mais antiga.
Cada vez que algo é atualizado no GitHub, acrescenta-se aqui uma entrada.

## [1.3.0] — 2026-11-13

### Novo
- **Tudo instalável como app (PWA)**: a Gestão Escolar, a Conversas e o painel da plataforma podem ser
  instalados no telemóvel ou no computador ("Instalar app" / "Adicionar ao ecrã principal").
- **Uma app por escola**: cada escola tem o seu manifesto (`/<código>/manifest.webmanifest`), por isso a app
  instalada tem o nome da escola e abre logo nos endereços dela. Com duas escolas, ficam duas apps.
- **Conversas como app**: ícone próprio (balão roxo), página de "sem ligação" e cache dos ficheiros estáticos.
- **Painel da plataforma como app** à parte, que abre em `/plataforma`.

### Alterado
- Ícones novos da Gestão Escolar com o capelo do logótipo (antes era um livro), incluindo versões
  "maskable" para Android.

## [1.2.0] — 2026-11-13

### Novo
- **Endereços de cada escola no painel da plataforma**: ao criar uma escola, abre logo a página dela com os
  endereços próprios — Gestão Escolar (`/<código>/login`), Conversas (`/<código>/login`) e recuperar
  palavra-passe — cada um com um botão **Copiar**. Os cartões da lista de escolas também mostram os dois principais.

### Removido
- O **site de vendas InformaNege** (pasta `informanege/`, scripts `npm run informanege` e a dependência `stripe`).
  O projeto fica com duas aplicações: a Gestão Escolar e a Conversas.

## [1.1.0] — 2026-11-13

### Novo
- **Endereços com o nome da escola**: cada escola tem os seus endereços, com o código no início —
  `localhost:3000/epmontijo/login`, `/epmontijo/aluno`, `/epmontijo/admin/faltas`… — em todos os painéis
  (direção, professores, alunos, encarregados e funcionários). Na Conversas é igual: `localhost:3100/epmontijo/`.
- **Sessão por escola**: dá para ter sessão aberta em duas escolas ao mesmo tempo (cada uma tem o seu cookie).
- **Painel da plataforma mais organizado**: separadores no topo — *Escolas*, *Nova escola* (página própria, com
  o que acontece ao criar) e *Conta* (a palavra-passe do gestor); pesquisa de escolas; escolas ativas e inativas
  em secções separadas; as ações menos usadas de cada escola (editar, repor a palavra-passe da direção,
  desativar) ficam em "Mais ações".
- **Registo de alterações** (este ficheiro).

### Alterado
- O **painel da plataforma** passou a **preto e branco** (antes azul-noite com âmbar), mantendo o desenho.
  Os estados distinguem-se pela forma: *Ativa* a cheio, *temporária* tracejado.
- Os textos da Conversas que diziam "Gestão Escolar" mostram agora o **nome da escola**
  (ex.: "Use o mesmo email e a mesma palavra-passe da Escola Profissional do Montijo").
- As ligações dos emails (recuperação de palavra-passe, resposta aos justificativos) e o endereço no PDF das
  palavras-passe usam o endereço novo da escola.
- Uma escola nova não pode ter como código uma palavra que a aplicação já usa (`admin`, `login`, …).

### Compatibilidade
- Os endereços antigos continuam a funcionar e levam para os novos: `/login` → `/epmontijo/login`,
  `/escola/epmontijo` → `/epmontijo/login`.
- Quem tinha sessão aberta tem de entrar outra vez (o cookie de sessão mudou de nome).

## [1.0.0] — 2026-11-12

### Novo
- **Conversas com o aspeto do Microsoft Teams**: barra de título com pesquisa, faixa *Chat* e *Equipas*,
  publicações em cartões nos canais e balões nas conversas privadas.
- **Palavras-passe exportadas em PDF** no painel da plataforma: uma tabela por turma, com n.º de processo,
  nome completo e palavra-passe temporária (o CSV continua disponível).
- **Alunos por turma no painel da plataforma**, com geração de palavras-passe novas por aluno, turma ou escola.
- **Novo design dos painéis das escolas**: menu lateral com ícones, cartões claros, tema escuro.
- **Várias escolas**: painel da plataforma para criar escolas (nome, domínio de email, direção), uma base de
  dados por escola, e o nome da escola no lugar de "Gestão Escolar".
- **Recuperação de palavra-passe por email** e email ao encarregado com a resposta aos justificativos.
- **Exportar as faltas para Excel** (CSV) e editar o email e o contacto do encarregado.
- **Página de entrada nova** com a ilustração da escola, e o logótipo do InformaNege.
- `npm run atualizar-bd` para atualizar todas as bases de dados sem apagar dados.

### Alterado
- Versão `1.0.0` (era `0.1.0-beta`) e README reescrito com o estado atual do projeto.

## [0.3.0] — 2026-11-09

### Novo
- **Painel do encarregado de educação**: consulta das faltas do educando e envio de justificativos
  (PDF ou imagem), que o diretor de turma ou a direção aceitam ou recusam.

## [0.2.0] — 2026-11-06 a 2026-11-08

### Novo
- **Ata da reunião de turma ditada ao microfone**, montada automaticamente em linguagem formal.
- Redesign dos painéis e das páginas de login; fontes locais e favicon.

## [0.1.0] — 2026-10-15 a 2026-10-30

### Novo
- Primeira versão: painéis do aluno, professor e administrador; faltas, sumários, avaliação por módulos,
  horários (editor de arrastar e largar), calendário e avisos, auditoria.
- Papel **Funcionário** (pessoal não-docente).
- Ocorrências disciplinares, reuniões de turma e aplicação instalável (PWA).
- Site de apresentação **InformaNege**.
