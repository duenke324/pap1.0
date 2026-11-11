// Contexto de cada pedido: a que escola (e a que base de dados) o pedido pertence.
//
// A aplicação serve várias escolas, cada uma com a sua base de dados. Em vez de passar a escola
// como argumento a todas as consultas, guarda-se aqui "o pedido atual é da escola X" — o Node
// mantém este valor ao longo de tudo o que o pedido faz (incluindo depois de cada "await"),
// sem se misturar com os pedidos de outras pessoas que estejam a decorrer ao mesmo tempo.
// src/db.js lê daqui que base de dados usar; as vistas leem o nome e o domínio da escola.
const { AsyncLocalStorage } = require('node:async_hooks');

const armazenamento = new AsyncLocalStorage();

// ctx = { bd: nome da base de dados, escola: linha da tabela "escolas" ou null, nomeCookie }
function correrNoContexto(ctx, fn) {
  return armazenamento.run(ctx, fn);
}

function contextoAtual() {
  return armazenamento.getStore() || null;
}

// Fora de um pedido (ex.: "npm run seed") não há escola: usam-se estes valores
const ESCOLA_OMISSAO = { id: null, codigo: '', nome: 'Gestão Escolar', dominio_email: 'epmontijo.edu.pt', base_dados: null };

function escolaAtual() {
  return armazenamento.getStore()?.escola || ESCOLA_OMISSAO;
}

module.exports = { correrNoContexto, contextoAtual, escolaAtual, ESCOLA_OMISSAO };
