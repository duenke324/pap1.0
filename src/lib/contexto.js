// Contexto de cada pedido: a que escola o pedido pertence.
//
// A aplicação serve várias escolas, todas na mesma base de dados (cada linha tem o escola_id da sua
// escola; ver src/db.js). Em vez de passar a escola
// como argumento a todas as consultas, guarda-se aqui "o pedido atual é da escola X" — o Node
// mantém este valor ao longo de tudo o que o pedido faz (incluindo depois de cada "await"),
// sem se misturar com os pedidos de outras pessoas que estejam a decorrer ao mesmo tempo.
// src/db.js lê daqui de que escola são as consultas; as vistas leem o nome e o domínio da escola.
const { AsyncLocalStorage } = require('node:async_hooks');

const armazenamento = new AsyncLocalStorage();

// ctx = { escolaId: id da escola (0 = plataforma), escola: linha da tabela "escolas" ou null, nomeCookie }
function correrNoContexto(ctx, fn) {
  return armazenamento.run(ctx, fn);
}

function contextoAtual() {
  return armazenamento.getStore() || null;
}

// Fora de um pedido (ex.: "npm run seed") não há escola: usam-se estes valores
const ESCOLA_OMISSAO = { id: null, codigo: '', nome: 'Gestão Escolar', dominio_email: 'epmontijo.edu.pt' };

function escolaAtual() {
  return armazenamento.getStore()?.escola || ESCOLA_OMISSAO;
}

module.exports = { correrNoContexto, contextoAtual, escolaAtual, ESCOLA_OMISSAO };
