# Registo de alterações

Tudo o que mudou no Sistema de Gestão Escolar, da versão mais recente para a mais antiga.
Cada vez que algo é atualizado no GitHub, acrescenta-se aqui uma entrada.

## [1.10.0] — 2026-11-22

### Novo
- **Conta do encarregado criada com o aluno menor**: ao criar um aluno menor de idade (ou sem data de nascimento), o
  nome do encarregado é obrigatório e a conta dele (código `EE` + n.º de processo) é criada logo; o formulário tem também
  o email e o contacto do encarregado.
- **O aluno maior de idade justifica as suas faltas**: na página Faltas, como o encarregado (faltas, motivo e
  documento); o diretor de turma ou a secretaria decidem e a resposta vai para o email do aluno.
- **Email ao encarregado a cada falta nova**, ao guardar a aula (dia, aula, tipo e ligação para justificar). O
  encarregado pode desligar no Painel.
- **Manual do utilizador** (`docs/manual-utilizador.md`) e **guião da demonstração para o júri**
  (`docs/guiao-demonstracao.md`).
- Testes novos (`encarregados.test.js`): 32 no total.

### Alterado
- Coluna nova `encarregados.avisar_faltas` (criada sozinha no arranque).
- O envio de justificativos passou para `src/lib/justificativos.js` (usado pelo encarregado e pelo aluno maior).

## [1.9.0] — 2026-11-21

### Novo
- **A minha conta**: em todos os perfis, uma página para mudar a palavra-passe (escrevendo a atual). Depois de mudar,
  as sessões abertas noutros computadores e na Conversas terminam; a palavra-passe atual errada conta para o bloqueio
  de 5 tentativas. Fica registado na auditoria.
- Testes automáticos novos (`conta.test.js`): 28 no total.

## [1.8.0] — 2026-11-21

### Novo
- **Aviso de excesso de faltas por módulo**: quando um aluno chega a metade e ao limite de faltas de um módulo (10% das
  horas do módulo), o aluno, o encarregado de educação e o diretor de turma recebem um email automático (cada aviso só
  uma vez). Cartão "Faltas por módulo" no painel do aluno, do encarregado e do diretor de turma.
- **Cópias de segurança automáticas**: uma cópia da base de dados por dia em `data/copias/`, ficam as últimas 7. Lista,
  descarga e "Fazer uma cópia agora" no painel da plataforma (Conta); `npm run copia` e `npm run restaurar`.
- **Segurança no login**: 5 palavras-passe erradas seguidas bloqueiam a conta 15 minutos (Gestão Escolar, Conversas e
  plataforma). A direção ("Segurança da conta") e o gestor ("Conta") podem ligar um **código de entrada por email**.
- **Testes automáticos** (`npm test`): permissões, escolas separadas, tarefas da Conversas, avisos de faltas, login e
  cópias de segurança — numa base de dados de teste, sem tocar nos dados verdadeiros.

### Alterado
- Tabelas novas `avisos_faltas` e `tentativas_login`, colunas `utilizadores.email_codigo` e `gestores.email` (criadas
  sozinhas no arranque).

## [1.7.0] — 2026-11-16

### Novo
- **Logótipo da escola nas atas**: cada ata de reunião de turma tem no topo a foto/logótipo da escola (ou o logótipo da
  aplicação, se a escola não tiver foto), o nome da escola, a turma e a data — também ao imprimir ou exportar em PDF.
- **Consentimento antes de gravar a ata**: o botão do microfone só fica ativo depois de o diretor de turma confirmar
  que os presentes foram informados de que a reunião vai ser gravada e transcrita.

## [1.6.0] — 2026-11-15

### Novo
- **Conversas — canais e grupos**: os professores criam, nas turmas que lecionam, canais para a turma toda (de uma
  disciplina ou com nome livre, com todos os alunos de uma vez) e **grupos** só com os alunos que escolherem. Também
  podem adicionar todos os alunos da turma a um canal e apagar canais/grupos.
- **Conversas — tarefas** (como as do Teams): o professor cria uma tarefa num canal ou grupo (instruções, enunciado,
  data limite, pontos), vê quem entregou, descarrega os trabalhos e devolve com nota e comentário. O aluno entrega
  texto e/ou ficheiro, pode anular e voltar a entregar até ser devolvida, e vê a nota. Botão "Tarefas" na barra da
  esquerda (com o número de tarefas por entregar) e separador "Tarefas" em cada canal.

### Alterado
- Tabelas novas `tarefas` e `tarefa_entregas` e coluna `canais.tipo` (canal ou grupo), criadas sozinhas no arranque
  da Gestão Escolar também em bases de dados que já existiam. Os ficheiros ficam em `data/tarefas/<código>/` e vão no
  servidor completo da escola.

## [1.5.0] — 2026-11-15

### Novo
- **Foto da escola**: ao criar uma escola no painel da plataforma pode escolher-se uma foto ou logótipo (cortada em
  quadrado no browser). Na página de cada escola há o cartão "Foto da escola" para a mudar ou remover.
- A foto passa a ser o ícone da escola na lista de escolas, no cabeçalho da página dela, na app instalada (PWA) e nos
  ícones criados pelos instaladores (atalho de app e servidor completo).
- **Botão "Descarregar a app da escola"** em cada escola da lista do painel; ao criar uma escola, a página dela abre
  com os instaladores logo em cima.

### Alterado
- Coluna `foto` na tabela `escolas` (acrescentada sozinha no arranque); os ficheiros ficam em `data/fotos/<código>/`.

## [1.4.0] — 2026-11-13

### Novo
- **Instaladores de cada escola**: na página da escola, no painel da plataforma, ficam logo disponíveis (desde que a
  escola é criada) dois instaladores feitos só para ela:
  - **Atalho de app** (`.cmd` para Windows): cria no ambiente de trabalho e no menu Iniciar os ícones da escola e da
    Conversas, que abrem em janela própria, com um "Desinstalar".
  - **Servidor completo** (`.zip`): a aplicação, o Node e só os dados dessa escola, com `instalar.cmd` (cria a base de
    dados no XAMPP e importa os dados) e `iniciar.cmd`.
- `src/importar-escola.js`: instala os dados de uma escola noutro servidor (usado pelo `instalar.cmd`).

### Alterado
- **Todas as escolas na mesma base de dados (`gestao_escolar`)**, em vez de uma base de dados por escola mais a
  `gestao_plataforma`. As tabelas passaram a `tb_…` com a coluna `escola_id`; com os nomes antigos ficam vistas que só
  mostram a escola de quem está ligado (uma escola nunca vê nem altera os dados de outra). Utilizador, email, número
  de processo e nome da turma são únicos por escola.
- No primeiro arranque, a base de dados antiga é convertida sozinha: escolas e gestor vêm da `gestao_plataforma` e os
  dados ficam na primeira escola. As fotografias e os justificativos passaram para uma subpasta com o código da escola.
- `npm run seed` recria só os dados da primeira escola (as outras escolas, a lista de escolas e o gestor ficam).

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
