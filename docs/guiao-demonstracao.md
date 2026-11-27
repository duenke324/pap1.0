# Guião da demonstração para o júri

Duração prevista: **12 a 15 minutos**. Cada passo diz o que abrir, o que fazer e o que dizer.

## Antes de começar (no dia, 15 minutos antes)

- [ ] Ligar o **MySQL** no painel do XAMPP.
- [ ] Num terminal: `npm start` (Gestão Escolar, porta 3000). Noutro: `npm run conversas` (porta 3100).
- [ ] Correr `npm test` e confirmar que **todos os testes passam** (deixar o resultado no ecrã para o passo 9).
- [ ] Abrir no browser (Chrome) quatro separadores, cada um numa **janela anónima diferente** (para ter várias contas
      ao mesmo tempo):
  1. Direção — http://localhost:3000/epmontijo/login
  2. Professor — http://localhost:3000/epmontijo/login
  3. Encarregado — http://localhost:3000/epmontijo/login
  4. Conversas — http://localhost:3100/epmontijo/login
- [ ] Ter um PDF ou uma fotografia pequena à mão (para o justificativo).
- [ ] Microfone ligado (para a ata).

### Contas de demonstração

| Quem | Utilizador | Palavra-passe |
| --- | --- | --- |
| Direção | `1000` | `admin123` |
| Professor e diretor de turma do 10.º TGPSI | `1002` (Rui Costa) | `prof123` |
| Aluna do 10.º TGPSI | `2450` (Beatriz Oliveira) | `aluno123` |
| Encarregada da Beatriz | `EE2450` | `ee123` |
| Administrador geral | `plataforma` em `/plataforma` | a que foi escolhida no 1.º acesso |
| Conversas (professor) | `rui.costa@epmontijo.edu.pt` | `prof123` |
| Conversas (aluna) | `beatriz.oliveira.2450@epmontijo.edu.pt` | `aluno123` |

> Se alguma palavra-passe já tiver sido mudada, usar a nova. `npm run seed` repõe os dados de demonstração (apaga os atuais).

---

## 1. Apresentação (1 min)

"O Sistema de Gestão Escolar é uma plataforma web para escolas profissionais. Tem duas aplicações com as mesmas contas:
a **Gestão Escolar**, para faltas, sumários, avaliação e horários, e a **Conversas**, parecida com o Teams. Serve várias
escolas na mesma instalação, e cada escola só vê os seus dados."

## 2. Painel global: várias escolas (1 min)

1. Abrir http://localhost:3000/plataforma e entrar como administrador geral.
2. Mostrar a lista de escolas, uma escola com o seu logótipo, os **endereços** e os **instaladores**.
3. Em **Conta**, mostrar as **cópias de segurança diárias** (ficam as últimas 7).

Dizer: "Todas as escolas estão na mesma base de dados, separadas por vistas. Uma escola nunca vê os dados de outra, e
isso está verificado nos testes automáticos."

## 3. Direção: criar um aluno menor (2 min)

1. Separador 1: entrar com `1000`.
2. Mostrar o **Painel** (gráficos de assiduidade).
3. **Alunos → + Novo aluno**: nome "Aluno Demonstração", n.º `9999`, turma 10.º TGPSI, nascimento há 15 anos.
4. Guardar **sem** encarregado e mostrar o erro: "o aluno é menor, indique o encarregado".
5. Escrever o nome e o email do encarregado e guardar. Mostrar a mensagem com a palavra-passe do aluno e o **código
   `EE9999`** do encarregado.

Dizer: "Um aluno menor fica logo com a conta do encarregado, que é quem justifica as faltas. Um aluno maior justifica as
suas."

6. (Opcional) **Horários**: arrastar uma aula na grelha e mostrar o aviso de conflito.

## 4. Professor: dar aula e marcar faltas (2 min)

1. Separador 2: entrar com `1002` (Rui Costa).
2. **Dar aula**: turma 10.º TGPSI → data de hoje (ou a última aula) → aula.
3. Escrever um sumário, escolher o módulo e marcar falta de presença à **Beatriz**.
4. **Guardar**. Mostrar a mensagem: "falta registada, 1 encarregado avisado por email".
5. Mostrar no terminal do servidor o **email** que foi gerado para a encarregada (sem SMTP configurado, aparece na consola).
6. Em **As minhas turmas**, mostrar o cartão **"Faltas por módulo"** (alunos a metade ou no limite de 10%).

## 5. Encarregado: justificar a falta (2 min)

1. Separador 3: entrar com `EE2450`.
2. No **Painel**, mostrar o cartão da Beatriz e o cartão "Avisos de faltas por email" (dá para desligar).
3. **Faltas**: selecionar a falta, motivo "Consulta médica", anexar o PDF, **Enviar justificativo**.
4. A falta fica **"Pendente de validação"**.

## 6. Diretor de turma: decidir (1 min)

1. Separador 2 (professor): **Justificativos** → abrir o documento → **Aceitar**.
2. Voltar ao separador 3: a falta está **justificada** e a resposta foi enviada por email.

## 7. Ata da reunião ditada ao microfone (2 min)

1. Separador 2: **As minhas turmas** → reunião de turma → **Escrever ata**.
2. Marcar a caixa "os presentes foram informados", **Começar a gravar** e dizer duas frases, por exemplo:
   "Foi analisado o aproveitamento da turma. Parágrafo. Foi decidido marcar uma visita de estudo."
3. Marcar os presentes e **Gerar ata**: mostrar a ata formal, com o logótipo da escola, e **Imprimir / PDF**.

## 8. Conversas (2 min)

1. Separador 4: entrar como professor (`rui.costa@epmontijo.edu.pt`).
2. **Equipas** → 10.º TGPSI → criar um **grupo** só com dois alunos.
3. Criar uma **tarefa** no grupo (data limite, 20 pontos).
4. Noutra janela, entrar como a Beatriz, abrir **Tarefas**, escrever uma resposta e **Entregar**.
5. Voltar ao professor e **devolver com nota**.

## 8b. Novidades da versão 1.11 (3 min)

1. **Direção → Alunos em risco**: mostrar a lista (motivos de cada aluno), filtrar por turma e os gráficos de faltas
   por mês e assiduidade por turma. Abrir "Como se calcula?".
2. **Alunos → Importar de CSV**: escolher um ficheiro com uma linha errada de propósito → **Verificar** → **Importar**
   → abrir o PDF das palavras-passe.
3. **Ficha do aluno → Ficha de registo (PDF)**.
4. **Professor → Progresso dos módulos**.
5. **Notificações**: com o browser em `localhost` e internet, entrar como aluno → A minha conta → Ativar → enviar uma
   notificação de teste; depois o professor marca-lhe uma falta e a notificação aparece.
6. **Funcionário 3004 (Biblioteca)**: registar um empréstimo ao aluno 2450 e mostrar o cartão "Livros da biblioteca"
   no painel do aluno.

## 9. Segurança e qualidade (1 min)

- Mostrar o resultado do `npm test` (41 testes): permissões, escolas separadas, tarefas, faltas, login, cópias,
  contas, encarregados, notificações (a mensagem é decifrada no teste) e secretaria/biblioteca, todos a passar.
- Referir:
  - palavras-passe guardadas cifradas (scrypt);
  - bloqueio de 15 minutos depois de 5 tentativas erradas;
  - código por email para a direção;
  - registo de auditoria;
  - proteção contra XSS e CSRF.

## 10. Fecho (30 s)

"Em resumo: uma plataforma para várias escolas, com perfis para toda a comunidade escolar, avisos automáticos aos
encarregados, justificação de faltas sem papel, atas ditadas, e uma app tipo Teams. Está instalável como app e
verificada com testes automáticos."

---

## Se algo correr mal

| Problema | Solução |
| --- | --- |
| "Não foi possível ligar ao MySQL" | ligar o MySQL no XAMPP e voltar a fazer `npm start` |
| "A porta 3000 já está a ser usada" | o servidor já está aberto noutro terminal: usar esse |
| Conta bloqueada (5 tentativas) | esperar 15 minutos, ou entrar com outra conta de demonstração |
| O microfone não escreve nada | usar o Chrome, confirmar a internet e a autorização do microfone; em último caso escrever a transcrição à mão |
| Não há aulas para a data escolhida | escolher um dia da semana em que a turma tem aula (a data não pode ser no futuro) |
