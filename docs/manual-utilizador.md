# Manual do utilizador — Sistema de Gestão Escolar

Este manual explica, por perfil, o que cada pessoa pode fazer na aplicação. Há duas aplicações que usam as mesmas
contas:

- **Gestão Escolar**: faltas, sumários, avaliação, horários, justificativos. Endereço: `http://<servidor>:3000/<código da escola>`
- **Conversas** (tipo Microsoft Teams): canais e grupos por turma, tarefas e conversas privadas. Endereço: `http://<servidor>:3100/<código da escola>`

As duas podem ser instaladas como app no telemóvel ou no computador ("Instalar app" / "Adicionar ao ecrã principal").

---

## 1. Entrar pela primeira vez

1. Abrir o endereço da escola e escrever o **número de processo** e a **palavra-passe temporária** entregue pela
   secretaria. O encarregado de educação entra com um **código** (`EE` + número de processo do educando, ex.: `EE2450`).
2. A aplicação pede logo uma **palavra-passe nova** (pelo menos 6 caracteres, diferente da temporária).
3. Na **Conversas** entra-se com o **email institucional** e a mesma palavra-passe.

**Esqueceu-se da palavra-passe?** Na página de entrada, "Esqueceu-se da palavra-passe?": chega por email uma ligação
para escolher uma nova (válida 1 hora). Sem email registado, fale com a secretaria.

**Mudar a palavra-passe**: menu **A minha conta** (todos os perfis). Escreve-se a atual e a nova duas vezes. As sessões
abertas noutros computadores terminam.

**Segurança**: 5 palavras-passe erradas seguidas bloqueiam a conta durante 15 minutos.

---

## 2. Aluno

| Menu | O que tem |
| --- | --- |
| Informações | calendário do ano letivo, avisos da escola, aulas de hoje, próximas avaliações, próxima reunião de turma |
| Estatísticas | assiduidade geral e por disciplina, faltas por justificar, módulos concluídos e média |
| Dados pessoais | os dados da ficha (as correções são feitas pela secretaria) |
| Avaliações | nota de cada módulo (0–20, NC ou EF) por disciplina |
| Faltas | todas as faltas, resumo por disciplina, filtro justificadas/injustificadas |
| Sumários | o que foi dado em cada aula, com as aulas em que faltou assinaladas |
| Testes | testes e trabalhos marcados (com contagem de dias) e já realizados |
| Horário | horário semanal da turma |

- **Faltas por módulo**: se chegar a metade ou ao limite de faltas de um módulo (10% das horas), aparece um cartão no
  topo e recebe um email.
- **Justificar faltas**:
  - **aluno menor de idade**: quem justifica é o encarregado de educação, na conta dele;
  - **aluno maior de idade (18 anos ou mais)**: na página **Faltas**, no cartão "Justificar faltas", seleciona as
    faltas, escreve o motivo, anexa o documento (PDF, JPG ou PNG, até 3 MB) e envia. Fica "pendente" até o diretor de
    turma ou a secretaria decidir; a resposta chega por email.
- **Conversas**: vê os canais e grupos onde foi adicionado, fala em privado com os seus professores e entrega as
  **tarefas** (texto e/ou ficheiro), até o professor as devolver com nota.

---

## 3. Encarregado de educação

| Menu | O que tem |
| --- | --- |
| Painel | um cartão por educando (assiduidade, faltas, por justificar, à espera de validação), contacto do diretor de turma, avisos da escola |
| Faltas | as faltas do educando e o envio do justificativo |
| Justificativos | os pedidos enviados e a resposta da escola |

- A conta é criada pela secretaria **ao inscrever um aluno menor de idade** (o código e a palavra-passe temporária são
  entregues ao encarregado). Irmãos ficam na mesma conta, com um separador por educando.
- **Justificar**: em **Faltas**, selecionar as faltas, escrever o motivo, anexar o documento (ex.: fotografia do
  atestado) e **Enviar justificativo**. Se for recusado, pode enviar outro.
- **Emails automáticos** (é preciso ter email na ficha — peça à secretaria):
  - **a cada falta nova** do educando (pode ser desligado no **Painel**, cartão "Avisos de faltas por email");
  - quando o educando chega a **metade** e ao **limite** de faltas de um módulo;
  - com a **resposta** a cada justificativo.

---

## 4. Professor

| Menu | O que tem |
| --- | --- |
| As minhas turmas | os alunos de cada turma, a ficha de cada aluno, reuniões de turma |
| Dar aula | sumário, módulo e faltas da aula, tudo num ecrã |
| Justificativos | (diretor de turma) os documentos enviados pelos encarregados e alunos maiores |
| Avaliação | lançar as notas de cada módulo e ver a pauta |
| Progresso dos módulos | horas dadas e notas lançadas em cada módulo; avisa os módulos a acabar sem notas |
| Testes e avaliações | marcar testes, trabalhos e apresentações |
| Horário | o horário do professor |

- **Dar aula**: escolher turma → data → aula; escrever o sumário, escolher o módulo, marcar as faltas (presença,
  material, disciplinar) e **Guardar**. Ao guardar, o encarregado recebe um email de cada falta nova e a aplicação
  avisa quem chegou a metade ou ao limite de faltas do módulo.
- **Ficha do aluno**: faltas (pode anular as que registou e ainda não foram justificadas), **ocorrências
  disciplinares** e pauta.
- **Diretor de turma**:
  - em "As minhas turmas" vê as novidades da turma, as faltas a acompanhar e as **faltas por módulo**;
  - decide os **justificativos** (aceitar, ou recusar com motivo);
  - marca **reuniões de turma** e escreve a **ata ditada ao microfone**: confirma que os presentes foram informados,
    carrega em **Começar a gravar**, fala (dizer "parágrafo" muda de parágrafo), marca os presentes e carrega em
    **Gerar ata**. Funciona no Chrome, Edge e Safari, com internet.
- **Conversas**: cria canais (turma toda) e grupos (só alguns alunos) nas suas turmas, publica mensagens, cria
  **tarefas** e devolve-as com nota e comentário.

---

## 5. Funcionário (pessoal não-docente)

Painel com o cargo e os dados pessoais. As correções são feitas pela direção.

- **Biblioteca** (cargo Biblioteca):
  - **Catálogo**: acrescentar livros (título, autor, ISBN, cota, exemplares), editar e apagar (um livro que já foi
    emprestado não se apaga).
  - **Empréstimos**: escrever o n.º de processo do aluno ou professor, escolher o livro e o prazo (15 dias por
    omissão) → **Registar empréstimo**. Quando o livro volta, **Devolvido**. Os atrasados aparecem a vermelho.
- **Secretaria** (cargo Secretaria): **Fichas dos alunos** → procurar o aluno → **Ficha em PDF**.

---

## 6. Direção da escola (administrador)

| Menu | O que faz |
| --- | --- |
| Painel | estatísticas e gráficos de assiduidade, faltas recentes por justificar, alunos em risco alto |
| Alunos em risco | os alunos com vários sinais de alerta (faltas, notas, ocorrências), o motivo e gráficos por mês e por turma |
| Turmas | criar e editar turmas (curso, diretor de turma, delegado e subdelegado) |
| Alunos | criar, editar e apagar alunos; ficha com a conta do encarregado |
| Professores | contas dos professores e disciplinas que lecionam |
| Disciplinas | disciplinas e os seus módulos (n.º, nome, horas) |
| Horários | editor de arrastar e largar, com aviso de conflitos de professor e de sala |
| Calendário e avisos | períodos letivos, interrupções e avisos para todos ou para uma turma |
| Faltas | filtros, justificar várias de uma vez, **exportar para Excel** |
| Justificativos | decidir os pedidos de todas as turmas |
| Funcionários | contas do pessoal não-docente |
| Auditoria | quem criou, alterou ou apagou o quê, e quando |
| Segurança da conta | ligar o **código por email** em cada entrada |

**Criar um aluno** (Alunos → **+ Novo aluno**):
1. Preencher nome, número de processo, turma e **data de nascimento**.
2. Se o aluno for **menor de idade** (ou não tiver data de nascimento), é obrigatório o **nome do encarregado de
   educação**; o email e o contacto do encarregado são opcionais, mas o email é preciso para os avisos.
3. Ao guardar aparecem **uma só vez**: o email e a palavra-passe temporária do aluno e, se for menor, o **código e a
   palavra-passe temporária do encarregado**. Anotar e entregar.
4. Um aluno **maior de idade** não precisa de encarregado: justifica as suas faltas.

**Importar vários alunos** (Alunos → **Importar de CSV**):
1. No Excel, uma linha por aluno com as colunas do modelo (descarregar em "Descarregar o modelo") e **Guardar como →
   CSV (separado por pontos e vírgulas)**.
2. Escolher o ficheiro e carregar em **Verificar**: cada linha aparece como **Certo** ou com o erro.
3. Carregar em **Importar**: as linhas certas são criadas; descarregar o **PDF** com as palavras-passe e entregar.
   As linhas com erro corrigem-se no ficheiro e importam-se depois.

**Ficha de registo em PDF**: na ficha do aluno, **Ficha de registo (PDF)** — módulos, classificações e assiduidade,
pronta a imprimir e assinar.

---

## Notificações no telemóvel (todos os perfis)

Em **A minha conta → Ativar notificações neste aparelho** (o browser pede autorização). Depois, as faltas, os avisos,
as respostas aos justificativos e as tarefas chegam como notificação, mesmo com a aplicação fechada. Para experimentar:
**Enviar uma notificação de teste**. No iPhone/iPad, instale primeiro a app no ecrã principal. Para desligar:
**Desligar neste aparelho**.

---

## 7. Administrador geral (painel da plataforma)

Endereço: `http://<servidor>:3000/plataforma` (conta `plataforma`, que não pertence a nenhuma escola).

- **Escolas**: lista, pesquisa, ativar/desativar; em cada escola: endereços (com botão Copiar), foto/logótipo,
  instaladores (atalho de app e servidor completo), alunos por turma e **palavras-passe em PDF**.
- **Nova escola**: nome, domínio de email e nome da direção. Aparece uma só vez a palavra-passe temporária da conta
  `direcao` da escola.
- **Conta**: mudar a palavra-passe, ligar o código por email e as **cópias de segurança** (uma por dia, ficam as
  últimas 7; "Descarregar" e "Fazer uma cópia agora").
