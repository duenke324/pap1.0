// Dados de demonstração.
//  - Ao arrancar a app, é chamado semearSeVazia() (só cria dados se a BD estiver vazia).
//  - "npm run seed" apaga a base de dados MySQL e volta a criá-la do zero.
const fs = require('node:fs');
const path = require('node:path');

async function semear() {
  const { transacao } = require('./db');
  const { gerarHash, paraISO, diaDaSemana, gerarEmailAluno } = require('./lib/util');

  await transacao(async ({ executar }) => {
    const inserir = async (sql, ...params) => Number((await executar(sql, ...params)).lastInsertRowid);

    // Administrador (login por número de processo, tal como professores e alunos)
    const admin = await inserir(
      `INSERT INTO utilizadores (username, password_hash, papel, nome) VALUES ('1000', ?, 'admin', 'Secretaria')`,
      gerarHash('admin123')
    );

    // Turmas
    const agora = new Date();
    const anoInicio = agora.getMonth() >= 8 ? agora.getFullYear() : agora.getFullYear() - 1;
    const anoLetivo = `${anoInicio}/${anoInicio + 1}`;
    const turmas = [];
    for (const nome of ['10.º TGPSI', '11.º TGPSI']) {
      turmas.push(await inserir('INSERT INTO turmas (nome, ano_letivo) VALUES (?, ?)', nome, anoLetivo));
    }

    // Disciplinas
    const disciplinas = {};
    for (const [nome, sigla] of [
      ['Português', 'PT'],
      ['Inglês', 'ING'],
      ['Matemática', 'MAT'],
      ['Educação Física', 'EF'],
      ['Área de Integração', 'AI'],
      ['Programação e Sistemas de Informação', 'PSI'],
      ['Redes de Comunicação', 'RC'],
      ['Sistemas Operativos', 'SO'],
      ['Arquitetura de Computadores', 'AC'],
    ]) {
      disciplinas[sigla] = await inserir('INSERT INTO disciplinas (nome, sigla) VALUES (?, ?)', nome, sigla);
    }

    // Módulos de cada disciplina: [nome, horas, sumários de exemplo]
    const planoModulos = {
      PT: [['Textos informativos', 30, ['Leitura e análise de uma notícia.', 'O relato e a reportagem. Exercícios de compreensão.']],
           ['Texto argumentativo', 26, ['Estrutura do texto argumentativo.', 'Planificação de um texto de opinião.']]],
      ING: [['Me and the others', 22, ['Personal presentations. Vocabulary: family and friends.', 'Present simple vs present continuous.']],
            ['Communication', 22, ['Reading: the impact of social media.', 'Writing an informal e-mail.']]],
      MAT: [['Funções polinomiais', 36, ['Funções afins: gráfico e zeros.', 'Funções quadráticas. Resolução de exercícios.']],
            ['Estatística', 27, ['Tabelas de frequências e gráficos.', 'Medidas de localização: média, moda e mediana.']]],
      EF: [['Jogos desportivos coletivos', 20, ['Voleibol: passe e manchete.', 'Basquetebol: drible e lançamento.']],
           ['Atletismo', 16, ['Corrida de velocidade: partida baixa.', 'Salto em comprimento.']]],
      AI: [['A pessoa e o ambiente', 20, ['O que é a sustentabilidade?', 'Debate: a reciclagem na escola.']],
           ['A sociedade e a economia', 20, ['Os setores de atividade económica.', 'O mercado de trabalho em Portugal.']]],
      PSI: [['Introdução à programação', 30, ['Algoritmos e fluxogramas.', 'Variáveis, tipos de dados e operadores.']],
            ['Estruturas de controlo', 32, ['Estruturas de decisão: if e switch.', 'Estruturas de repetição: for e while. Exercícios.']],
            ['Tabelas', 26, ['Vetores: declaração e percurso.', 'Pesquisa e ordenação em vetores.']]],
      RC: [['Comunicação de dados', 25, ['O modelo OSI e o modelo TCP/IP.', 'Meios de transmissão.']],
           ['Cablagem e redes locais', 25, ['Cravação de cabos RJ45 (atividade prática).', 'Topologias de rede.']]],
      SO: [['Sistema operativo cliente', 25, ['Instalação de um sistema operativo em máquina virtual.', 'Gestão de utilizadores e permissões.']],
           ['Sistema operativo servidor', 25, ['Serviços de rede: DHCP.', 'Partilha de ficheiros e impressoras.']]],
      AC: [['Sistemas de numeração', 22, ['Conversões entre binário, octal e hexadecimal.', 'Aritmética binária.']],
           ['Componentes do computador', 22, ['A motherboard e o processador.', 'Montagem de um computador (atividade prática).']]],
    };
    const modulos = {}; // sigla -> [{ id, sumarios }]
    for (const [sigla, lista] of Object.entries(planoModulos)) {
      modulos[sigla] = [];
      for (const [n, [nome, horas, sumarios]] of lista.entries()) {
        const id = await inserir('INSERT INTO modulos (disciplina_id, numero, nome, horas) VALUES (?, ?, ?, ?)', disciplinas[sigla], n + 1, nome, horas);
        modulos[sigla].push({ id, sumarios });
      }
    }

    // Professores (login por número de processo, palavra-passe prof123).
    // A chave do objeto (ana, rui, …) é só uma referência interna ao seed, não o número de processo.
    const professores = {};
    const contaProfessor = {}; // id do professor -> id do utilizador
    const hashProf = gerarHash('prof123');
    for (const [chave, numeroProcesso, nome, email] of [
      ['ana', '1001', 'Ana Ferreira', 'ana.ferreira@epmontijo.edu.pt'],
      ['rui', '1002', 'Rui Costa', 'rui.costa@epmontijo.edu.pt'],
      ['marta', '1003', 'Marta Lopes', 'marta.lopes@epmontijo.edu.pt'],
      ['joao', '1004', 'João Martins', 'joao.martins@epmontijo.edu.pt'],
      ['pedro', '1005', 'Pedro Alves', 'pedro.alves@epmontijo.edu.pt'],
    ]) {
      const u = await inserir(`INSERT INTO utilizadores (username, password_hash, papel, nome) VALUES (?, ?, 'professor', ?)`, numeroProcesso, hashProf, nome);
      professores[chave] = await inserir(
        'INSERT INTO professores (utilizador_id, numero_processo, nome, email) VALUES (?, ?, ?, ?)',
        u,
        numeroProcesso,
        nome,
        email
      );
      contaProfessor[professores[chave]] = u;
    }
    const quemEnsina = { PT: 'ana', ING: 'ana', MAT: 'marta', EF: 'joao', AI: 'joao', PSI: 'rui', RC: 'pedro', SO: 'marta', AC: 'pedro' };

    // Curso e diretor de turma
    const curso = 'Técnico de Gestão e Programação de Sistemas Informáticos';
    await executar('UPDATE turmas SET curso = ?, diretor_id = ? WHERE id = ?', curso, professores.rui, turmas[0]);
    await executar('UPDATE turmas SET curso = ?, diretor_id = ? WHERE id = ?', curso, professores.marta, turmas[1]);

    // Calendário escolar do ano letivo
    const a1 = anoInicio;
    const a2 = anoInicio + 1;
    for (const [tipo, nome, inicio, fim] of [
      ['periodo', '1.º período', `${a1}-09-14`, `${a1}-12-16`],
      ['periodo', '2.º período', `${a2}-01-04`, `${a2}-03-19`],
      ['periodo', '3.º período', `${a2}-04-05`, `${a2}-07-02`],
      ['interrupcao', 'Natal', `${a1}-12-17`, `${a2}-01-03`],
      ['interrupcao', 'Carnaval', `${a2}-02-15`, `${a2}-02-17`],
      ['interrupcao', 'Páscoa', `${a2}-03-22`, `${a2}-04-02`],
    ]) {
      await executar('INSERT INTO calendario (ano_letivo, tipo, nome, inicio, fim) VALUES (?, ?, ?, ?, ?)', anoLetivo, tipo, nome, inicio, fim);
    }

    // Avisos (circulares)
    for (const [titulo, texto, turma, diasAtras] of [
      ['Receção aos alunos', 'Bem-vindos ao novo ano letivo! Os horários das turmas já estão disponíveis na plataforma, no separador Horário.', null, 12],
      ['Reunião com os encarregados de educação', 'A reunião com os encarregados de educação do 10.º TGPSI realiza-se na próxima quinta-feira, às 18h30, na sala B12.', turmas[0], 5],
      ['Visita de estudo', 'A visita de estudo do 11.º TGPSI a uma empresa de desenvolvimento de software está marcada para o final de outubro. A autorização tem de ser entregue ao diretor de turma.', turmas[1], 3],
      ['Cartão de estudante', 'Os alunos que ainda não levantaram o cartão de estudante devem dirigir-se à secretaria, das 9h às 16h.', null, 1],
    ]) {
      const quando = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - diasAtras, 10, 0);
      await executar(
        'INSERT INTO avisos (titulo, texto, turma_id, publicado_por, publicado_em) VALUES (?, ?, ?, ?, ?)',
        titulo,
        texto,
        turma,
        admin,
        `${paraISO(quando)} 10:00:00`
      );
    }

    // Horário (5 dias x 6 tempos por turma)
    const tempos = [
      ['08:30', '09:20'],
      ['09:30', '10:20'],
      ['10:35', '11:25'],
      ['11:35', '12:25'],
      ['13:30', '14:20'],
      ['14:30', '15:20'],
    ];
    const planos = [
      // 10.º TGPSI
      [
        ['PSI', 'PSI', 'PT', 'MAT', 'RC', 'RC'],
        ['ING', 'MAT', 'SO', 'SO', 'EF', 'EF'],
        ['PT', 'PT', 'PSI', 'PSI', 'AI', null],
        ['MAT', 'ING', 'AC', 'AC', 'PSI', 'PSI'],
        ['RC', 'RC', 'AI', 'PT', null, null],
      ],
      // 11.º TGPSI
      [
        ['MAT', 'ING', 'PSI', 'PSI', 'SO', 'SO'],
        ['RC', 'RC', 'PT', 'PT', null, null],
        ['EF', 'EF', 'MAT', 'ING', 'PSI', 'PSI'],
        ['PT', 'AI', 'AI', null, 'RC', 'RC'],
        ['PSI', 'PSI', 'MAT', 'AC', 'AC', null],
      ],
    ];
    const salas = { PSI: 'B12', RC: 'B14', SO: 'B13', AC: 'B14', EF: 'Pav.' }; // planos verificados: sem professores nem salas em duplicado
    const aulasPorTurma = turmas.map(() => []);
    for (const [i, plano] of planos.entries()) {
      for (const [d, dia] of plano.entries()) {
        for (const [t, sigla] of dia.entries()) {
          if (!sigla) continue;
          const professorId = professores[quemEnsina[sigla]];
          const id = await inserir(
            `INSERT INTO horario (turma_id, disciplina_id, professor_id, dia_semana, hora_inicio, hora_fim, sala) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            turmas[i],
            disciplinas[sigla],
            professorId,
            d + 1,
            tempos[t][0],
            tempos[t][1],
            salas[sigla] || (i === 0 ? 'A03' : 'A05')
          );
          aulasPorTurma[i].push({ id, dia: d + 1, professorId, sigla });
        }
      }
    }

    // Disciplinas que cada professor leciona
    for (const [sigla, chave] of Object.entries(quemEnsina)) {
      await executar('INSERT IGNORE INTO professor_disciplinas (professor_id, disciplina_id) VALUES (?, ?)', professores[chave], disciplinas[sigla]);
    }

    // Alunos (utilizador = n.º de processo, palavra-passe aluno123)
    const alunos = [
      // 10.º TGPSI
      ['2450', 'Beatriz Santos Oliveira', '2010-03-14', '912 345 101', 'Carla Santos', 0],
      ['2451', 'Diogo Almeida Pereira', '2010-07-02', '913 222 102', 'Paula Almeida', 0],
      ['2452', 'Inês Rodrigues Silva', '2010-11-21', '914 876 103', 'Sónia Rodrigues', 0],
      ['2453', 'Tiago Fernandes Gomes', '2009-12-30', '915 443 104', 'Helena Fernandes', 0],
      ['2454', 'Mariana Sousa Carvalho', '2010-05-09', '916 111 105', 'Rita Sousa', 0],
      ['2455', 'Rodrigo Marques Lima', '2010-01-17', '917 900 106', 'Joana Marques', 0],
      ['2456', 'Leonor Ribeiro Costa', '2010-09-03', '918 765 107', 'Ana Ribeiro', 0],
      // 11.º TGPSI
      ['2310', 'Gonçalo Teixeira Moreira', '2009-04-22', '919 234 201', 'Fátima Teixeira', 1],
      ['2311', 'Carolina Pinto Rocha', '2009-08-11', '912 876 202', 'Luísa Pinto', 1],
      ['2312', 'Martim Correia Dias', '2008-10-05', '913 555 203', 'Cristina Correia', 1],
      ['2313', 'Sofia Mendes Nunes', '2009-02-27', '914 321 204', 'Teresa Mendes', 1],
      ['2314', 'Afonso Moura Duarte', '2009-06-16', '915 678 205', 'Patrícia Moura', 1],
      ['2315', 'Matilde Barros Vieira', '2009-12-01', '916 432 206', 'Isabel Barros', 1],
    ];
    const hashAluno = gerarHash('aluno123');
    const idsAlunos = turmas.map(() => []);
    for (const [processo, nome, nascimento, contacto, encarregado, t] of alunos) {
      const u = await inserir(`INSERT INTO utilizadores (username, password_hash, papel, nome) VALUES (?, ?, 'aluno', ?)`, processo, hashAluno, nome);
      idsAlunos[t].push(
        await inserir(
          `INSERT INTO alunos (utilizador_id, turma_id, numero_processo, nome, data_nascimento, contacto, encarregado_nome, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          u,
          turmas[t],
          processo,
          nome,
          nascimento,
          contacto,
          encarregado,
          gerarEmailAluno(nome, processo)
        )
      );
    }

    // Faltas nos últimos dias úteis (pseudo-aleatórias mas sempre iguais)
    let semente = 7;
    const aleatorio = () => (semente = (semente * 9301 + 49297) % 233280) / 233280;

    for (let recuo = 1; recuo <= 21; recuo++) {
      const data = paraISO(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - recuo));
      const dia = diaDaSemana(data);
      if (dia > 5 || data < `${anoInicio}-09-01`) continue; // só dias úteis dentro do ano letivo
      for (const [i] of turmas.entries()) {
        for (const aula of aulasPorTurma[i].filter((a) => a.dia === dia)) {
          // Lição dada (sumário): o 10.º está no módulo 1, o 11.º no módulo 2
          const modulo = modulos[aula.sigla][Math.min(i, modulos[aula.sigla].length - 1)];
          await executar(
            'INSERT INTO licoes (horario_id, data, modulo_id, sumario, registada_por) VALUES (?, ?, ?, ?, ?)',
            aula.id,
            data,
            modulo.id,
            modulo.sumarios[recuo % modulo.sumarios.length],
            contaProfessor[aula.professorId]
          );
          for (const alunoId of idsAlunos[i]) {
            const r = aleatorio();
            if (r > 0.04) continue;
            const tipo = r < 0.032 ? 'presenca' : r < 0.037 ? 'material' : 'disciplinar';
            const justificada = tipo === 'presenca' && recuo > 7 && aleatorio() < 0.6;
            await executar(
              `INSERT IGNORE INTO faltas (aluno_id, horario_id, data, tipo, registada_por, justificada, justificacao, justificada_em, justificada_por)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              alunoId,
              aula.id,
              data,
              tipo,
              contaProfessor[aula.professorId],
              justificada ? 1 : 0,
              justificada ? ['Doença', 'Consulta médica', 'Motivo familiar'][Math.floor(aleatorio() * 3)] : null,
              justificada ? data : null,
              justificada ? admin : null
            );
          }
        }
      }
    }

    // Classificações do módulo 1 no 11.º ano (feito no ano anterior): notas de 7 a 19, algumas NC e EF
    for (const [sigla, lista] of Object.entries(modulos)) {
      for (const alunoId of idsAlunos[1]) {
        const r = aleatorio();
        const estado = r < 0.05 ? 'EF' : r < 0.1 ? 'NC' : 'nota';
        await executar(
          'INSERT INTO notas (aluno_id, modulo_id, estado, nota, lancada_por) VALUES (?, ?, ?, ?, ?)',
          alunoId,
          lista[0].id,
          estado,
          estado === 'nota' ? 7 + Math.floor(aleatorio() * 13) : null,
          contaProfessor[professores[quemEnsina[sigla]]]
        );
      }
    }

    // Testes e avaliações
    const diaUtil = (desvio) => {
      const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + desvio);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      return paraISO(d);
    };
    for (const [t, sigla, desvio, tipo, descricao] of [
      [0, 'PSI', 3, 'teste', 'Módulo 2 – Estruturas de controlo'],
      [0, 'MAT', 8, 'teste', 'Funções e gráficos'],
      [0, 'RC', 12, 'trabalho', 'Entrega do trabalho sobre cablagem'],
      [0, 'PT', 18, 'teste', 'Texto argumentativo'],
      [0, 'ING', -6, 'apresentacao', 'Apresentação oral – My hobbies'],
      [1, 'PSI', 2, 'trabalho', 'Projeto – aplicação com base de dados'],
      [1, 'SO', 6, 'teste', 'Gestão de processos e memória'],
      [1, 'MAT', 14, 'teste', 'Estatística'],
      [1, 'AI', 20, 'apresentacao', 'Apresentação de grupo'],
      [1, 'RC', -4, 'teste', 'Endereçamento IP'],
    ]) {
      await executar(
        'INSERT INTO testes (turma_id, disciplina_id, professor_id, data, tipo, descricao) VALUES (?, ?, ?, ?, ?, ?)',
        turmas[t],
        disciplinas[sigla],
        professores[quemEnsina[sigla]],
        diaUtil(desvio),
        tipo,
        descricao
      );
    }
  });
}

async function semearSeVazia() {
  const { um } = require('./db');
  if ((await um('SELECT COUNT(*) AS n FROM utilizadores')).n === 0) {
    await semear();
    console.log('Base de dados preenchida com dados de demonstração.');
  }
}

module.exports = { semearSeVazia };

// Execução direta (npm run seed): apaga a base de dados e cria tudo de novo
if (require.main === module) {
  (async () => {
    const { pool, CONFIG, PASTA_FOTOS, prepararBaseDeDados } = require('./db');
    const mysql = require('mysql2/promise');
    try {
      const ligacao = await mysql.createConnection({ host: CONFIG.host, port: CONFIG.port, user: CONFIG.user, password: CONFIG.password });
      // Apaga só as fotografias desta base de dados (a pasta data/fotos pode ser partilhada por outras)
      let fotos = [];
      try {
        [fotos] = await ligacao.query(`SELECT fotografia FROM \`${CONFIG.database}\`.alunos WHERE fotografia IS NOT NULL`);
      } catch {
        // a base de dados ainda não existe
      }
      await ligacao.query(`DROP DATABASE IF EXISTS \`${CONFIG.database}\``);
      await ligacao.end();
      for (const { fotografia } of fotos) fs.rmSync(path.join(PASTA_FOTOS, path.basename(fotografia)), { force: true });
      await prepararBaseDeDados();
      await semear();
      console.log(`Base de dados "${CONFIG.database}" recriada com dados de demonstração.`);
      console.log('  1000 / admin123   ·   1001…1005 / prof123   ·   2450…2456, 2310…2315 / aluno123');
    } catch (erro) {
      console.error('Erro ao criar a base de dados:', erro.message);
      console.error('Confirme que o MySQL está ligado no painel do XAMPP.');
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  })();
}
