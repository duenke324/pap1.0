# Sistema de Gestão Escolar — versão beta (0.1)

Plataforma web para consulta e gestão de informação escolar, com painéis para o
**Aluno**, o **Professor**, o **Encarregado de educação**, o **Funcionário** e o **Administrador**.

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

### Recuperação de palavra-passe (email)

No login, **"Esqueceu-se da palavra-passe?"** leva a `/recuperar-password`: a pessoa indica o número de processo
(ou o código de encarregado) e recebe por email uma **ligação pessoal** para escolher uma palavra-passe nova.

- A palavra-passe antiga nunca é enviada (a base de dados só guarda o seu hash, não a palavra-passe). A ligação
  vale **60 minutos**, só pode ser usada **uma vez**, e até lá a palavra-passe atual continua a funcionar.
- **Para onde vai o email**: no caso de um aluno, para o email do aluno **e** para o do encarregado de educação
  (se o encarregado tiver conta com email); professores, funcionários e encarregados recebem no email da sua ficha.
- A resposta no ecrã é sempre a mesma, exista ou não a conta, para a página não servir para descobrir números de
  processo. Há um limite de 3 pedidos por hora por conta. Ao mudar a palavra-passe, as sessões abertas dessa conta terminam.
- Para os emails serem mesmo enviados é preciso um servidor SMTP, indicado por variáveis de ambiente (nunca no código):
  `SMTP_HOST`, `SMTP_PORT` (587 por omissão), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (remetente) e `APP_URL`
  (endereço público da aplicação, usado na ligação; por omissão `http://localhost:3000`).
  **Sem `SMTP_HOST`, nada é enviado**: o email é escrito na consola do servidor, com a ligação — chega para
  desenvolver e para demonstrar. Usa o pacote `nodemailer` (ver [src/lib/email.js](src/lib/email.js)).

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

### Aplicação instalável (PWA)

A Gestão Escolar é também uma **Progressive Web App**: no Chrome/Edge aparece um ícone de instalar
na barra de endereço, e no telemóvel (Android ou iOS) dá para "Adicionar ao ecrã principal" a
partir do browser — fica com ícone próprio e abre em janela própria, sem barra do browser.

- Manifesto em [public/manifest.webmanifest](public/manifest.webmanifest) e service worker em
  [public/sw.js](public/sw.js) (servido na raiz do site, `/sw.js`, para o seu âmbito cobrir a
  aplicação toda).
- Só os ficheiros estáticos (CSS, JS, ícones) ficam em cache — as páginas têm sempre dados do
  utilizador autenticado, por isso são sempre pedidas à rede. Sem ligação, mostra-se
  [public/offline.html](public/offline.html).
- Os ícones (`public/icons/`) mostram o caderno do logótipo a branco sobre fundo preto, com margem à volta
  para o Android os poder recortar em círculo ou com cantos redondos (ícones "maskable").
- Sempre que se mudar o CSS, o JavaScript ou os ícones, sobe-se a versão da cache em `public/sw.js`
  (`gestao-escolar-estaticos-v2`, `-v3`, …): o service worker novo apaga a cache antiga e quem tem a app
  instalada vê logo a versão nova.

### Contas de demonstração

| Papel         | Número de processo                                                                                               | Palavra-passe |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- |
| Administrador | `1000`                                                                                                           | `admin123`    |
| Professor     | `1001`…`1005` (Ana, Rui, Marta, João, Pedro)                                                                     | `prof123`     |
| Funcionário   | `3001`…`3008` (informático, auxiliar escolar, RH, biblioteca, secretaria, centro de recursos, cozinha, portaria) | `func123`     |
| Aluno         | `2450`…`2456` (10.º), `2310`…`2315` (11.º)                                                                       | `aluno123`    |
| Encarregado   | `EE2450` (mãe da Beatriz, 10.º) e `EE2310` (mãe do Gonçalo, 11.º)                                                | `ee123`       |

Todos entram com o **número de processo** na Gestão Escolar — não há nomes de utilizador à parte.
A exceção é o encarregado de educação, que não tem número de processo: entra com um **código** (`EE` + número de
processo do educando), criado pela administração na ficha do aluno.
Para entrar na app **Conversas** (que usa email, não número de processo), o email de cada conta de
demonstração é `primeironome.ultimonome@epmontijo.edu.pt` para professores (ex.: `rui.costa@epmontijo.edu.pt`)
e `primeironome.ultimonome.numerodeprocesso@epmontijo.edu.pt` para alunos (ex.: `beatriz.oliveira.2450@epmontijo.edu.pt`).

## Conversas — app separada (tipo Teams)

Uma segunda aplicação, à parte da Gestão Escolar, para conversa por turma (canais) e mensagens
privadas. Tem o seu próprio visual (faixa de navegação + acento roxo partilhado com o InformaNege,
para se distinguir da Gestão Escolar; a página de entrada tem o mesmo desenho da da Gestão Escolar, em roxo) e o seu próprio servidor, mas liga-se à **mesma base de
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
  interrupções letivas, avisos da escola, aulas de hoje, próximas avaliações e a **próxima reunião de turma**
  — para o delegado e o subdelegado aparece em destaque, com a indicação de que foram convocados
- Estatísticas: assiduidade geral e por disciplina (barras; a barra fica às riscas quando as faltas chegam
  ao limite de 10%), faltas por justificar, módulos concluídos e média
- Dados pessoais: consulta dos dados da ficha (as correções são feitas pela secretaria), incluindo se o aluno
  é delegado ou subdelegado de turma
- Faltas: lista completa, resumo por disciplina, filtro por estado (justificadas / injustificadas)
- Sumários: o que foi dado em cada aula (n.º da lição, módulo e professor), com as aulas a que faltou assinaladas
- Avaliação: classificação de cada módulo por disciplina (0 a 20, NC ou EF), módulos concluídos e média
- Testes e avaliações: próximas (com contagem de dias) e já realizadas
- Horário semanal da turma (o dia atual fica destacado)

### Painel do Professor
- As minhas turmas: separadores para filtrar a turma, pesquisa de alunos, contagem de faltas
- **Diretor de turma**: ao abrir "As minhas turmas", um cartão **"Novidades nas suas turmas"** com as ocorrências
  graves e muito graves e as novas faltas por justificar dos últimos 7 dias, e um cartão **"Faltas a acompanhar"**
  com uma linha por aluno e uma etiqueta por disciplina em que está perto (≥ 7%) ou acima (≥ 10%) do limite de faltas
- **Reuniões de turma**: o diretor de turma marca (data, hora, local, assunto) e cancela as reuniões da turma;
  os outros professores da turma veem-nas. As que já passaram ficam esbatidas e deixam de poder ser canceladas.
- **Ata da reunião (ditada ao microfone)**: a partir do dia da reunião aparece «Escrever ata». O diretor de turma
  carrega em **Começar a gravar** e o browser vai escrevendo, em português, o que é dito (dizer «parágrafo» muda de
  parágrafo); depois marca os presentes e carrega em **Gerar ata**, que monta a ata formal automaticamente — abertura
  com a data e a hora por extenso ("Aos quinze dias do mês de novembro…"), presentes, os assuntos ditados e o
  encerramento com a linha para a assinatura. Revê o texto e guarda. Os outros professores da turma e a direção leem
  a ata, que se pode imprimir ou guardar em PDF; uma reunião com ata já não pode ser cancelada.
  - Usa o reconhecimento de voz do próprio browser (Web Speech API), sem dependências novas: funciona no **Chrome,
    Edge e Safari** (não no Firefox), precisa de **internet** e de autorização para usar o microfone, e só funciona em
    `https://` ou em `localhost` (num endereço `http://192.168…` da rede o browser bloqueia o microfone).
  - No Chrome e no Edge o áudio é transcrito pelos serviços da Google e da Microsoft; a aplicação **não guarda o
    áudio** nem a transcrição em bruto — só o texto final da ata. Sem microfone, a transcrição pode ser escrita à mão.
- Ficha do aluno: dados pessoais, todas as faltas (pode anular faltas que registou e que ainda não foram justificadas),
  as **ocorrências disciplinares** (leve, grave ou muito grave — qualquer professor da turma regista; cada um só
  apaga as que registou) e a pauta
- **Dar aula**: escolher turma → data → aula, escrever o **sumário**, escolher o **módulo** e marcar as faltas
  (presença, material ou disciplinares) — tudo no mesmo ecrã, guardado de uma vez.
  Cada aula dada fica registada como uma lição numerada (lição n.º 1, 2, 3… por turma e disciplina).
  A aula pode ser reaberta e corrigida; faltas já justificadas ficam bloqueadas; uma lição sem faltas pode ser apagada
  (se foi registada por engano). Só se aceitam datas dentro do ano letivo da turma e nunca no futuro.
- **Avaliação**: escolher turma/disciplina e módulo e lançar a classificação de cada aluno: nota de **0 a 20**,
  **NC** (módulo não concluído) ou **EF** (excluído por faltas). Para ajudar a decidir, mostra as faltas de cada aluno
  nesse módulo e a percentagem das horas do módulo (em destaque, fundo escuro, a partir de 10%). Inclui a pauta com todos os módulos.
- Testes e avaliações: marcar e desmarcar testes, trabalhos e apresentações (é daqui que vêm os testes que o aluno vê)
- Horário do professor

### Painel do Encarregado de Educação
- Painel: um cartão por educando (assiduidade, total de faltas, faltas por justificar e pedidos à espera de
  validação), o contacto do diretor de turma e os avisos da escola
- Faltas: lista das faltas do educando; seleciona as faltas, indica o motivo e **anexa o justificativo**
  (PDF, JPG ou PNG, até 3 MB — por exemplo, uma fotografia do atestado médico)
- Justificativos: histórico dos pedidos enviados, com o estado (**pendente de validação**, aceite ou recusado)
  e a resposta da escola. Um pedido recusado não fecha a falta: pode enviar outro documento
- Um encarregado com vários educandos (irmãos) tem uma só conta e escolhe o educando num separador

**Circuito da justificação**: o encarregado envia → a falta fica «Pendente de validação» (o aluno também vê) →
o **diretor de turma** (menu «Justificativos» do professor) ou a **administração** abre o documento e aceita ou
recusa. Ao aceitar, as faltas do pedido passam a justificadas com o motivo indicado; para recusar é obrigatório
escrever o motivo, que o encarregado lê. Se o encarregado tiver email na ficha, **recebe um email com a decisão**
(mesmas regras de envio da recuperação de palavra-passe: sem SMTP configurado, o email aparece só na consola).

### Painel do Funcionário
Área de consulta para o pessoal não-docente (informático, auxiliar escolar, RH, biblioteca, secretaria,
centro de recursos, cozinha e portaria): um painel de boas-vindas com o cargo e os dados pessoais
(nome, n.º de processo, cargo, email e contacto). Tal como no aluno, quem corrige os dados é a
administração — não há aqui funcionalidades de negócio próprias de cada cargo (sem catálogo de
biblioteca, folha de RH, etc.), só a conta e a área pessoal.

### Painel do Administrador
- Painel com estatísticas, turmas e faltas recentes por justificar
- Turmas: criar, editar (nome, ano letivo, curso, diretor de turma, **delegado e subdelegado**) e apagar; ver os alunos,
  disciplinas, professores e reuniões marcadas de cada turma (e ler as atas já escritas). Um aluno que muda de turma deixa de ser delegado/subdelegado da antiga.
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
  - Os tempos em que o professor já tem aula noutra turma ficam bloqueados (às riscas); as aulas com conflitos
    ficam com um contorno tracejado
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
- Faltas: filtros (estado, turma, datas, aluno), justificar várias de uma vez com um motivo, retirar justificação,
  e **Exportar para Excel**: descarrega um ficheiro CSV com as faltas dos filtros escolhidos (separador `;` e
  acentos preparados para o Excel em português; até 20 000 linhas)
- **Justificativos**: os documentos enviados pelos encarregados de educação, de todas as turmas — abrir o ficheiro,
  aceitar ou recusar (com motivo), e consultar os já decididos
- **Conta do encarregado de educação** (na ficha do aluno): criar a conta (o código e a palavra-passe temporária
  aparecem uma só vez), associar uma conta que já existe a outro aluno (irmãos), **alterar o email e o contacto**,
  repor a palavra-passe e desassociar. Só a administração altera estes dados
- **Assiduidade (gráficos)**: no painel principal, um gráfico de assiduidade global e um gráfico por curso
  (biblioteca **Chart.js**, incluída localmente em `public/vendor/` — não depende de internet).
  Debaixo do gráfico por curso fica sempre uma lista com os mesmos números, para a informação não depender de JavaScript.
- **Auditoria**: histórico de quem criou, editou ou apagou turmas, professores, funcionários, disciplinas e alunos —
  com destaque para mudanças de diretor de turma, de delegado/subdelegado, de curso de uma turma e de turma de um aluno.
  Mostra os 200 registos mais recentes, com filtro por tipo.

### Aspeto (preto e branco)
A interface usa só tons de cinzento, sem cores. Para a informação não depender da cor:
- os estados têm três formas diferentes — ok = só contorno, aviso = fundo cinzento, perigo = invertido (fundo escuro,
  texto claro) — e as mensagens têm um símbolo à esquerda (✓, ! ou ×);
- os links no meio do texto e das tabelas são sublinhados;
- o que está acima do limite de faltas ou bloqueado aparece às riscas.

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
  lib/ata.js          Monta o texto formal da ata da reunião (datas e horas por extenso)
  vistas/layout.js    Estrutura das páginas, menu, avatar, grelha do horário
  rotas/aluno.js      Painel do aluno
  rotas/professor.js  Painel do professor (turmas, Dar aula, testes, horário, Novidades do DT)
  rotas/atas.js       Atas das reuniões de turma (diretor de turma escreve; professores e direção leem)
  rotas/avaliacao.js  Avaliação por módulos (lançar classificações e pauta do aluno)
  rotas/admin.js      Painel do administrador (alunos, faltas, gráficos de assiduidade)
  rotas/turmas.js     Painel do administrador (turmas)
  rotas/professores.js Painel do administrador (professores e disciplinas)
  rotas/funcionario.js Painel do funcionário (pessoal não-docente)
  rotas/funcionarios.js Painel do administrador (gestão de funcionários)
  rotas/horarios.js   Editor de horários (página e gravação)
  rotas/calendario.js Calendário escolar e avisos (administrador)
  rotas/auditoria.js  Painel do administrador (histórico de auditoria)
  rotas/encarregado.js  Painel do encarregado de educação (faltas do educando, envio de justificativos)
  rotas/encarregados.js Painel do administrador (contas dos encarregados, na ficha do aluno)
  rotas/justificativos.js Validação dos justificativos (administração e diretor de turma) e acesso ao ficheiro
  lib/justificativos.js Guarda os ficheiros, lê os pedidos e aplica a decisão de aceitar/recusar
  rotas/recuperacao.js  Recuperação de palavra-passe (pedido e ligação enviada por email)
  lib/email.js          Envio de email por SMTP (ou para a consola, se o SMTP não estiver configurado)
database/escola.sql   Esquema da base de dados MySQL (todas as tabelas)
public/               CSS, JavaScript do browser (incl. editor-horario.js e ata.js, o ditado ao microfone) e ícone
public/vendor/        Bibliotecas de terceiros incluídas localmente (Chart.js, para os gráficos de assiduidade)
data/fotos/           Fotografias dos alunos (a BD guarda o nome do ficheiro)
data/justificativos/  Justificativos enviados pelos encarregados (a BD guarda o nome do ficheiro)
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
`encarregados` (encarregados de educação com conta; a ligação ao educando está em `alunos.encarregado_id`) ·
`justificativos` (motivo, ficheiro, estado, quem enviou e quem decidiu) e `justificativo_faltas` (as faltas de cada pedido) ·
`modulos` (módulos de cada disciplina) · `licoes` (aulas dadas: aula do horário, data, módulo e sumário) ·
`notas` (classificação de cada aluno em cada módulo: nota 0–20, NC ou EF) ·
`calendario` (períodos e interrupções letivas) · `avisos` (para todos ou para uma turma) ·
`ocorrencias` (ocorrências disciplinares: aluno, gravidade, descrição, data, quem registou) ·
`reunioes_turma` (data, hora, local, assunto e a **ata**, com quem a escreveu e quando; o delegado e o subdelegado estão
em `turmas.delegado_id`/`subdelegado_id`) ·
`canais`, `canal_membros`, `canal_mensagens` (usadas pela app **Conversas**, não pela Gestão Escolar) ·
`recuperacoes_password` (pedidos de recuperação: só o hash do código da ligação, validade e se já foi usado) ·
`sessoes` (logins ativos — por isso reiniciar o servidor não obriga a entrar de novo) ·
`logs_auditoria` (quem criou, editou ou apagou turmas, professores, funcionários, disciplinas e alunos, e quando).

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
- Justificativos: só PDF, JPG e PNG até 3 MB, confirmados pelos primeiros bytes do ficheiro (não pelo nome nem pelo
  tipo que o browser indica) e guardados com um nome aleatório. O ficheiro só é servido à administração, ao
  encarregado do aluno e ao diretor de turma do aluno; o encarregado só vê as faltas e as fotografias dos seus educandos
- Sempre que o administrador cria uma conta (ou redefine a palavra-passe de um professor/aluno),
  a pessoa é obrigada a escolher uma palavra-passe nova em `/definir-password` antes de aceder ao resto da aplicação —
  e essa palavra-passe nova tem de ser diferente da que lhe foi atribuída (não pode "voltar atrás")
- Um professor só vê e escreve nos canais das turmas que leciona; um aluno só nos canais a que foi adicionado
- **Histórico de auditoria**: criar, editar e apagar turmas, professores, funcionários, disciplinas e alunos fica registado
  (quem, o quê e quando) em `/admin/auditoria` — mudanças de diretor de turma, de delegado/subdelegado, de curso e de
  turma de um aluno aparecem destacadas no detalhe

## Limitações conhecidas (beta)

- Os tempos letivos (08:30, 09:30, …) estão na tabela `tempos` e ainda não têm ecrã de edição
- A recuperação de palavra-passe só envia emails a sério com um servidor SMTP configurado (ver "Recuperação de
  palavra-passe"); sem ele, a ligação aparece só na consola do servidor. O administrador não tem email na ficha,
  por isso não pode usar a recuperação
- Fora do primeiro acesso forçado, não há alteração voluntária da palavra-passe pelo próprio utilizador
- Sem HTTPS — para uso real deve ficar atrás de um servidor com HTTPS (ex.: nginx, Caddy)
- O encarregado de educação só é avisado por email da resposta aos justificativos (e só se tiver email na ficha);
  não há aviso quando é marcada uma falta nova
- Apagar um aluno não apaga a conta do encarregado; essa conta fica sem educandos até ser associada a outro aluno
- Uma base de dados criada antes do papel Encarregado não tem as contas de demonstração `EE2450`/`EE2310`: crie a
  conta na ficha do aluno, ou use `npm run seed`
- Uma base de dados criada antes do papel Funcionário não tem as contas de demonstração 3001…3008: o arranque só
  preenche dados numa base vazia. `npm run seed` recria tudo com os dados de demonstração (e apaga os atuais)

## Ideias para próximas versões

Notificações ao encarregado de educação · exportação para Excel ·
alteração de palavra-passe fora do primeiro acesso.

O horário, as faltas e as pautas já têm um botão "Imprimir / Exportar PDF" (usa a função de impressão do
browser — no diálogo de impressão, escolher "Guardar como PDF" em vez de uma impressora).

O diretor de turma já vê, sempre que abre "As minhas turmas", um cartão "Faltas a acompanhar" com os alunos
da(s) turma(s) que dirige que estejam perto (≥ 7%) ou acima (≥ 10%) do limite de faltas numa disciplina —
o mesmo limite já usado na avaliação por módulos. Só aparece a quem tem `diretor_id` numa turma.
# PAPPre
