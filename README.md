# Sistema de Gestão Escolar — versão beta (0.1)

Plataforma web para consulta e gestão de informação escolar, com três painéis:
**Aluno**, **Professor** e **Administrador**.

## Como executar

Requisitos:
- **Node.js 22.13 ou superior** (testado com Node 26)
- **XAMPP** com o **MySQL** ligado (no painel do XAMPP, botão *Start* do MySQL)

```bash
npm install        # só na primeira vez (instala o mysql2, a ligação ao MySQL)
npm start          # inicia em http://localhost:3000
npm run dev        # reinicia sozinho quando se altera o código
npm run seed       # APAGA a base de dados e recria os dados de demonstração
```

Na primeira execução, a base de dados **`gestao_escolar`** é criada automaticamente no MySQL
e preenchida com dados de demonstração. Pode ser consultada no **phpMyAdmin**
(http://localhost/phpmyadmin).

### Configuração do MySQL

Por omissão a aplicação liga-se com as definições do XAMPP (`root`, sem palavra-passe, `localhost:3306`).
Para mudar, defina as variáveis de ambiente `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`
(ver [src/db.js](src/db.js)).

### Aplicação para Mac (`GestaoEscolar.app`)

```bash
npm run build:mac   # gera build/mac/GestaoEscolar.app
```

Empacota o Node.js e todo o código num único executável dentro de um `.app` normal — quem for correr a
aplicação não precisa de instalar Node nem fazer `npm install`. **Continua a precisar do MySQL/XAMPP
instalado e ligado à parte** (isto só embrulha a aplicação, não a base de dados).

- Se o MySQL não estiver em `localhost:3306`, crie o ficheiro
  `~/Library/Application Support/GestaoEscolar/config.env` com, por exemplo:
  ```
  DB_PORT=3120
  ```
- Registo de erros em `~/Library/Logs/GestaoEscolar.log` (útil se o browser não abrir sozinho).
- A primeira vez que este `.app` for aberto **noutro Mac** (ex.: enviado por email ou USB), o macOS
  avisa "não é possível verificar o programador" — é normal, não está assinado com um certificado da
  Apple (custa dinheiro); a pessoa só precisa de clicar com o botão direito → Abrir, uma vez.
- O script (`scripts/build-mac.sh`) descarrega uma cópia oficial do Node.js para `.build-tools/`
  na primeira vez que corre (o Node do Homebrew não tem o modo "executável único" ativado); não mexe
  no Node já instalado no sistema.

O esquema completo está em [database/escola.sql](database/escola.sql). Pode importá-lo à mão no
phpMyAdmin (separador *Importar*), mas não é necessário: a aplicação executa-o ao arrancar.

### Contas de demonstração

| Papel         | Número de processo                | Palavra-passe |
|---------------|------------------------------------|---------------|
| Administrador | `1000`                            | `admin123`    |
| Professor     | `1001`…`1005` (Ana, Rui, Marta, João, Pedro) | `prof123` |
| Funcionário   | `3001`…`3008` (informático, auxiliar escolar, RH, biblioteca, secretaria, centro de recursos, cozinha, portaria) | `func123` |
| Aluno         | `2450`…`2456` (10.º), `2310`…`2315` (11.º) | `aluno123` |

Todos entram com o **número de processo** na Gestão Escolar — não há nomes de utilizador à parte.
Para entrar na app **Conversas** (que usa email, não número de processo), o email de cada conta de
demonstração é `primeironome.ultimonome@epmontijo.edu.pt` para professores (ex.: `rui.costa@epmontijo.edu.pt`)
e `primeironome.ultimonome.numerodeprocesso@epmontijo.edu.pt` para alunos (ex.: `beatriz.oliveira.2450@epmontijo.edu.pt`).

## Conversas — app separada (tipo Teams)

Uma segunda aplicação, à parte da Gestão Escolar, para conversa por turma (canais) e mensagens
privadas. Tem o seu próprio visual (faixa de navegação + acento roxo partilhado com o InformaNege,
para se distinguir da Gestão Escolar) e o seu próprio servidor, mas liga-se à **mesma base de
dados** — usa as contas que a direção já cria (professor ou aluno; o administrador não tem acesso
a esta app, só professor e aluno).

```bash
npm run conversas        # inicia em http://localhost:3100
npm run conversas:dev    # reinicia sozinho quando se altera o código
```

Pode correr ao mesmo tempo que a Gestão Escolar (portas diferentes: 3000 e 3100) — usei o mesmo
MySQL para as duas nesta máquina, com `DB_PORT=3120 TEAMS_PORT=3100 npm run conversas` (ajuste
`TEAMS_PORT` se a 3100 estiver ocupada; as restantes variáveis `DB_*` são as mesmas do `src/db.js`).
**Arranque sempre a Gestão Escolar pelo menos uma vez antes** (é ela que cria/atualiza as tabelas;
o Conversas só as usa, para as duas aplicações nunca tentarem alterar a base de dados ao mesmo tempo).

- Entra-se com o **email institucional**, não com o número de processo (só aqui — na Gestão Escolar
  continua a ser o número de processo).
- **Equipas** (barra de navegação à esquerda): turmas → canais. Cada canal **é uma disciplina** —
  o professor escolhe, de entre as disciplinas que leciona nessa turma, qual ainda não tem canal
  (só pode haver um canal por disciplina por turma). Qualquer professor que lecione a turma vê e
  gere todos os seus canais; o aluno só vê e escreve nos canais aos quais foi adicionado.
- **Mensagens** (segunda secção da barra de navegação): conversas privadas 1 para 1. Professores
  podem falar entre si e com qualquer aluno que lecionem; um aluno só pode iniciar conversa com um
  professor que lhe dê aulas — não há mensagens entre alunos, pela mesma razão por que são sempre
  os professores a controlar quem entra num canal.
- Entra-se com o **email institucional**, não com o número de processo (só aqui — na Gestão Escolar
  continua a ser o número de processo).
- Sessão própria (cookie `sid_conversas`, diferente do `sid` da Gestão Escolar) — entrar numa não
  faz entrar automaticamente na outra, mesmo sendo a mesma conta.
- Se a conta ainda tiver a palavra-passe temporária por trocar (ver Segurança), esta app recusa o
  login e pede para ir primeiro à Gestão Escolar definir uma palavra-passe própria.
- A conversa por turma vive só aqui — a Gestão Escolar já não tem separador "Canais" (foi retirado
  para não haver duas versões da mesma coisa); as tabelas continuam partilhadas na mesma base de dados.

## InformaNege — site de vendas (`npm run informanege`, porta 3200)

Página de apresentação do software (`informanege/`), para mostrar numa demonstração/apresentação.
Propositadamente simples: sem base de dados, sem sessões, sem JavaScript no browser — só HTML e CSS
estáticos servidos por um pequeno servidor Node (não reutiliza `src/lib/servidor.js`, que exige base
de dados para guardar sessões, inútil aqui). A única exceção é a rota `POST /comprar`, que cria a
sessão de pagamento no Stripe.

O botão "Ver demonstração" **não é um mockup**: abre a Gestão Escolar real (`http://localhost:3000`)
numa nova aba, com as contas de demonstração listadas na própria página. Por construção, não há nada
para manter sincronizado entre o site e o painel — mudou o painel, a demonstração mostra sempre a
versão atual, porque é a mesma aplicação. O mesmo vale para as capturas de ecrã em `informanege/publico/capturas/`
— são do software real, tiradas com as contas de demonstração.

### Subscrever (contacto por email) e pagamento (Stripe, construído mas não ligado ainda)

Por agora, o botão **"Subscrever agora"** da secção de preços leva a `/subscrever`: agradece o interesse
e mostra o email de contacto com um `mailto:` já preenchido (assunto e corpo com nome da escola e número
de alunos) — ver `paginaInteresseRegistado()` em `informanege/vistas.js`. Sem pagamento automático por
agora; as subscrições são combinadas diretamente por email.

Já está construído, à espera das chaves reais da Stripe, um **checkout embutido** (Stripe Embedded
Checkout) em `/checkout`: o cliente não sai do site — a página é nossa, só os campos do cartão em si
ficam num iframe do Stripe (obrigatório por segurança; os números do cartão nunca passam pelo nosso
servidor) — ver `informanege/pagamento.js` e `paginaCheckout()` em `informanege/vistas.js`. Sem chaves
configuradas, `/checkout` mostra uma pré-visualização (campos de exemplo, sem contactar o Stripe).
Para ligar este checkout ao botão "Subscrever agora", troque o `href="/subscrever"` para `href="/checkout"`
na secção de preços de `informanege/vistas.js`.
- `STRIPE_SECRET_KEY` **e** `STRIPE_PUBLISHABLE_KEY`: as duas obrigatórias para o checkout funcionar.
  A secreta cria a sessão de pagamento no servidor; a publicável vai para a página (é feita para isso,
  não é segredo). **Nunca** colocar a chave secreta no código — só como variável de ambiente
  (`STRIPE_SECRET_KEY=sk_... STRIPE_PUBLISHABLE_KEY=pk_... npm run informanege`), tal como `DB_PORT` ou `GESTAO_URL`.
  Para testar sem risco, use as chaves de **modo de teste** do Stripe (`sk_test_...`/`pk_test_...`) — só
  trocar para `sk_live_...`/`pk_live_...` quando estiver mesmo pronto para cobrar a sério.
- `SITE_URL`: endereço público do site, usado no `return_url` para onde o Stripe.js traz o cliente de
  volta depois do pagamento, em `/pagamento/resultado` (por omissão, `http://localhost:3200`).
- É a única dependência npm nova do projeto (pacote `stripe`): para dinheiro a sério, a fiabilidade da
  biblioteca oficial pesa mais do que manter zero dependências. O `https://js.stripe.com/v3/` (o script
  que desenha os campos do cartão) tem de ser carregado diretamente do domínio do Stripe — não pode ser
  copiado para o projeto, é uma exigência de segurança do próprio Stripe.

## Funcionalidades

### Painel do Aluno
O aluno não tem menu lateral: no topo aparece a **ficha de identificação** (fotografia, processo, nome, situação,
ano letivo, curso, turma, diretor de turma e encarregado de educação) e por baixo uma fila de **separadores**.
- Informações: calendário do ano letivo (início e fim dos períodos, com o período atual assinalado),
  interrupções letivas, avisos da escola, aulas de hoje e próximas avaliações
- Estatísticas: assiduidade geral e por disciplina (barras), faltas por justificar, módulos concluídos e média
- Dados pessoais: consulta dos dados da ficha (as correções são feitas pela secretaria)
- Faltas: lista completa, resumo por disciplina, filtro por estado (justificadas / injustificadas)
- Sumários: o que foi dado em cada aula (n.º da lição, módulo e professor), com as aulas a que faltou assinaladas
- Avaliação: classificação de cada módulo por disciplina (0 a 20, NC ou EF), módulos concluídos e média
- Testes e avaliações: próximas (com contagem de dias) e já realizadas
- Horário semanal da turma (o dia atual fica destacado)

### Painel do Professor
- As minhas turmas: separadores para filtrar a turma, pesquisa de alunos, contagem de faltas
- **Diretor de turma**: ao abrir "As minhas turmas", um cartão **"Novidades nas suas turmas"** com as faltas
  disciplinares e as novas faltas por justificar dos últimos 7 dias (o indicador mais próximo de "ocorrência grave"
  e de "falta pendente de validação" que a base de dados tem hoje — ainda não há gravidade nem esse estado, ver Limitações)
- Ficha do aluno: dados pessoais, todas as faltas (pode anular faltas que registou e que ainda não foram justificadas) e a pauta
- **Dar aula**: escolher turma → data → aula, escrever o **sumário**, escolher o **módulo** e marcar as faltas
  (presença, material ou disciplinares) — tudo no mesmo ecrã, guardado de uma vez.
  Cada aula dada fica registada como uma lição numerada (lição n.º 1, 2, 3… por turma e disciplina).
  A aula pode ser reaberta e corrigida; faltas já justificadas ficam bloqueadas; uma lição sem faltas pode ser apagada
  (se foi registada por engano). Só se aceitam datas dentro do ano letivo da turma e nunca no futuro.
- **Avaliação**: escolher turma/disciplina e módulo e lançar a classificação de cada aluno: nota de **0 a 20**,
  **NC** (módulo não concluído) ou **EF** (excluído por faltas). Para ajudar a decidir, mostra as faltas de cada aluno
  nesse módulo e a percentagem das horas do módulo (a vermelho a partir de 10%). Inclui a pauta com todos os módulos.
- Testes e avaliações: marcar e desmarcar testes, trabalhos e apresentações (é daqui que vêm os testes que o aluno vê)
- Horário do professor

### Painel do Funcionário
Área de consulta para o pessoal não-docente (informático, auxiliar escolar, RH, biblioteca, secretaria,
centro de recursos, cozinha e portaria): um painel de boas-vindas com o cargo e os dados pessoais
(nome, n.º de processo, cargo, email e contacto). Tal como no aluno, quem corrige os dados é a
administração — não há aqui funcionalidades de negócio próprias de cada cargo (sem catálogo de
biblioteca, folha de RH, etc.), só a conta e a área pessoal.

### Painel do Administrador
- Painel com estatísticas, turmas e faltas recentes por justificar
- Turmas: criar, editar (nome, ano letivo, curso e diretor de turma) e apagar; ver os alunos, disciplinas e professores de cada turma.
  Só se pode apagar uma turma sem alunos e sem faltas, para não perder histórico.
- Professores: criar, editar e apagar (com conta de acesso), email institucional (obrigatoriamente
  `@epmontijo.edu.pt`) e escolher as disciplinas que cada um leciona; ficha do professor com o seu horário semanal
- Disciplinas: criar, editar e apagar (só se nunca foram usadas) e gerir os **módulos** de cada disciplina (n.º, nome e horas)
- Funcionários (pessoal não-docente): criar, editar e apagar contas de acesso para informático, auxiliar escolar,
  RH, biblioteca, secretaria, centro de recursos, cozinha e portaria — cada um com um **cargo**, email institucional
  opcional e contacto. Sem disciplinas, turmas ou permissões especiais: só uma conta e uma área pessoal simples.
- Calendário e avisos: períodos letivos e interrupções de cada ano letivo, e avisos para todos os alunos
  ou só para uma turma (é o que o aluno vê no separador Informações)
- **Horários (editor de arrastar e largar)**: para cada turma, arrastar aulas (disciplina + professor) da paleta
  para a grelha, mover e trocar aulas, arrastar para o lixo para remover, definir a sala.
  Também funciona com cliques (clicar numa aula e depois num tempo), útil em ecrãs táteis.
  - Os tempos em que o professor já tem aula noutra turma ficam bloqueados (às riscas vermelhas)
  - Ao guardar, o servidor volta a verificar conflitos de professor e de sala
  - Retirar, mover ou mudar o professor de uma aula que já tem faltas não apaga as faltas: a aula antiga fica inativa
    (com o dia e a hora originais) e o histórico mantém-se. O professor ainda pode reabrir e corrigir essas folhas antigas.
- Alunos: listar, filtrar por turma, pesquisar, criar, editar e apagar. Campos: fotografia, nome, n.º de processo,
  data de nascimento, contacto, nome da mãe/encarregado de educação, turma. A fotografia é reduzida no
  browser (máx. 480 px) antes de ser enviada.
  **Ao criar**, o email institucional e a palavra-passe de acesso são **gerados automaticamente**
  (não se escrevem à mão): o email fica `primeironome.ultimonome.numerodeprocesso@epmontijo.edu.pt`
  (o número de processo garante que nunca há dois iguais) e a palavra-passe é aleatória — aparecem os
  dois numa mensagem só uma vez, para copiar e dar ao aluno. Depois de criado, o email pode ser editado
  à mão na ficha, se for preciso corrigir.
- Faltas: filtros (estado, turma, datas, aluno), justificar várias de uma vez com um motivo, retirar justificação
- **Assiduidade (gráficos)**: no painel principal, um gráfico de assiduidade global e um gráfico por curso
  (biblioteca **Chart.js**, incluída localmente em `public/vendor/` — não depende de internet).
  Debaixo do gráfico por curso fica sempre uma lista com os mesmos números, para a informação não depender de JavaScript.
- **Auditoria**: histórico de quem criou, editou ou apagou turmas, professores, disciplinas e alunos — com destaque
  para mudanças de diretor de turma, de curso de uma turma e de turma de um aluno. Mostra os 200 registos mais recentes,
  com filtro por tipo.

## Estrutura do projeto

```
src/
  app.js              Arranque, login/logout, controlo de acesso por papel
  db.js               Ligação ao MySQL (pool, consultas, transações)
  seed.js             Dados de demonstração (npm run seed)
  lib/servidor.js     Mini-framework: rotas, sessões, formulários, ficheiros estáticos
  lib/util.js         Palavras-passe (scrypt), escape de HTML, datas, rótulos
  lib/recursos.js     Localização de public/database/data (diferente quando empacotado em .app)
  lib/auditoria.js    Regista no histórico de auditoria (logs_auditoria) quem fez o quê e quando
  vistas/layout.js    Estrutura das páginas, menu, avatar, grelha do horário
  rotas/aluno.js      Painel do aluno
  rotas/professor.js  Painel do professor (turmas, Dar aula, testes, horário, Novidades do DT)
  rotas/avaliacao.js  Avaliação por módulos (lançar classificações e pauta do aluno)
  rotas/admin.js      Painel do administrador (alunos, faltas, gráficos de assiduidade)
  rotas/turmas.js     Painel do administrador (turmas)
  rotas/professores.js Painel do administrador (professores e disciplinas)
  rotas/funcionario.js Painel do funcionário (pessoal não-docente)
  rotas/funcionarios.js Painel do administrador (gestão de funcionários)
  rotas/horarios.js   Editor de horários (página e gravação)
  rotas/calendario.js Calendário escolar e avisos (administrador)
  rotas/auditoria.js  Painel do administrador (histórico de auditoria)
database/escola.sql   Esquema da base de dados MySQL (todas as tabelas)
public/               CSS, JavaScript do browser (incl. editor-horario.js) e ícone
public/vendor/        Bibliotecas de terceiros incluídas localmente (Chart.js, para os gráficos de assiduidade)
data/fotos/           Fotografias dos alunos (a BD guarda o nome do ficheiro)
scripts/build-mac.sh  Gera o GestaoEscolar.app (npm run build:mac)
teams/                App separada "Conversas" (npm run conversas) — visual e servidor próprios,
                      mesma base de dados (usa src/db.js e src/lib/util.js da Gestão Escolar)
  app.js              Arranque, login/logout (só professor/aluno), sessão própria
  rotas.js            Turmas, canais, membros e mensagens
  vistas.js           HTML e componentes (sidebar, balões de mensagem)
  publico/            CSS (acento índigo), JavaScript do browser e ícone, próprios desta app
```

## Base de dados (MySQL — `gestao_escolar`)

Tudo o que é criado ou alterado na plataforma fica guardado nestas tabelas:

`utilizadores` (login e papel) · `turmas` · `disciplinas` · `professores` · `alunos` ·
`professor_disciplinas` · `tempos` (tempos letivos do dia) ·
`horario` (cada linha é um tempo letivo semanal: turma, disciplina, professor, dia, horas, sala, ativo) ·
`faltas` (aluno, aula do horário, data, tipo, justificação, quem registou e quem justificou) · `testes` ·
`modulos` (módulos de cada disciplina) · `licoes` (aulas dadas: aula do horário, data, módulo e sumário) ·
`notas` (classificação de cada aluno em cada módulo: nota 0–20, NC ou EF) ·
`calendario` (períodos e interrupções letivas) · `avisos` (para todos ou para uma turma) ·
`canais`, `canal_membros`, `canal_mensagens` (usadas pela app **Conversas**, não pela Gestão Escolar) ·
`sessoes` (logins ativos — por isso reiniciar o servidor não obriga a entrar de novo) ·
`logs_auditoria` (quem criou, editou ou apagou turmas, professores, disciplinas e alunos, e quando).

As tabelas usam InnoDB com chaves estrangeiras: por exemplo, apagar um aluno apaga as faltas dele.
As operações com vários passos (criar aluno + conta, guardar a folha de faltas) usam transações.

## Segurança

- Palavras-passe guardadas com `scrypt` e sal aleatório
- Sessões com cookie `HttpOnly` e `SameSite=Lax`; novo identificador de sessão após o login
- Cada área (`/aluno`, `/professor`, `/admin`) só é acessível pelo papel correspondente;
  o professor só vê alunos das turmas onde leciona
- Todo o texto é escapado antes de ir para o HTML (proteção contra XSS)
- Verificação da origem dos pedidos POST (proteção básica contra CSRF)
- Fotografias validadas (tipo e assinatura do ficheiro) e servidas apenas a utilizadores autenticados
- Sempre que o administrador cria uma conta (ou redefine a palavra-passe de um professor/aluno),
  a pessoa é obrigada a escolher uma palavra-passe nova em `/definir-password` antes de aceder ao resto da aplicação —
  e essa palavra-passe nova tem de ser diferente da que lhe foi atribuída (não pode "voltar atrás")
- Um professor só vê e escreve nos canais das turmas que leciona; um aluno só nos canais a que foi adicionado
- **Histórico de auditoria**: criar, editar e apagar turmas, professores, disciplinas e alunos fica registado
  (quem, o quê e quando) em `/admin/auditoria` — mudanças de diretor de turma, de curso e de turma de um aluno
  aparecem destacadas no detalhe

## Limitações conhecidas (beta)

- Os tempos letivos (08:30, 09:30, …) estão na tabela `tempos` e ainda não têm ecrã de edição
- Não há recuperação de palavra-passe (esqueci-me da palavra-passe); só o administrador a pode redefinir
- Fora do primeiro acesso forçado, não há alteração voluntária da palavra-passe pelo próprio utilizador
- Sem HTTPS — para uso real deve ficar atrás de um servidor com HTTPS (ex.: nginx, Caddy)
- O cartão "Novidades nas suas turmas" (faltas disciplinares e novas faltas por justificar) é uma aproximação:
  ainda não existe o estado "Pendente de Validação" nas faltas nem uma tabela de Ocorrências com gravidade
  (Leve/Grave/Muito Grave) — fica para uma próxima versão

## Ideias para próximas versões

Notificações ao encarregado de educação · exportação para Excel ·
alteração de palavra-passe fora do primeiro acesso.

O horário, as faltas e as pautas já têm um botão "Imprimir / Exportar PDF" (usa a função de impressão do
browser — no diálogo de impressão, escolher "Guardar como PDF" em vez de uma impressora).

O diretor de turma já vê, sempre que abre "As minhas turmas", um cartão "Faltas a acompanhar" com os alunos
da(s) turma(s) que dirige que estejam perto (≥ 7%) ou acima (≥ 10%) do limite de faltas numa disciplina —
o mesmo limite já usado na avaliação por módulos. Só aparece a quem tem `diretor_id` numa turma.
