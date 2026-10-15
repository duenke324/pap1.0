// Histórico de auditoria: regista ações críticas da administração (criar/editar/apagar
// turmas, professores, disciplinas e alunos) — quem fez, o quê e quando.
// Nunca deve impedir a ação em si: se o registo falhar, só fica um aviso na consola.
const { executar } = require('../db');

async function registarLog(req, acao, entidade, entidadeId, detalhe) {
  try {
    await executar(
      'INSERT INTO logs_auditoria (utilizador_id, acao, entidade, entidade_id, detalhe) VALUES (?, ?, ?, ?, ?)',
      req.utilizador?.id || null,
      acao,
      entidade,
      entidadeId || null,
      detalhe
    );
  } catch (erro) {
    console.error('Falha ao registar log de auditoria:', erro);
  }
}

module.exports = { registarLog };
