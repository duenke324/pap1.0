// Ajudas dos testes automáticos (npm test).
// Os testes usam uma base de dados só deles (gestao_escolar_teste), apagada no início e no fim, e uma
// pasta temporária para os ficheiros (data/): nunca mexem nos dados verdadeiros.
// Os dois servidores (Gestão Escolar e Conversas) são arrancados uma vez por test/preparar.js.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const AMBIENTE = {
  DB_NAME: 'gestao_escolar_teste',
  PASTA_DADOS: path.join(os.tmpdir(), 'gestao-escolar-testes'),
  PORT: '3091',
  TEAMS_PORT: '3191',
  COPIAS_AUTOMATICAS: '0',
  PUSH_PERMITIR_LOCAL: '1', // as notificações push vão para um servidor local do teste (notificacoes.test.js)
  SMTP_HOST: '', // sem SMTP: os emails são escritos na consola do servidor (que os testes leem)
  APP_URL: 'http://localhost:3091',
  CONVERSAS_URL: 'http://localhost:3191',
};
Object.assign(process.env, AMBIENTE);

const GESTAO = `http://localhost:${AMBIENTE.PORT}`;
const CONVERSAS = `http://localhost:${AMBIENTE.TEAMS_PORT}`;
const REGISTO_GESTAO = path.join(AMBIENTE.PASTA_DADOS, 'servidor-gestao.log');

// Um "browser" simples: guarda os cookies e não segue os redirecionamentos (para se ver para onde vão)
class Cliente {
  constructor(origem) {
    this.origem = origem;
    this.cookies = new Map();
  }

  async pedido(metodo, caminho, corpo = null) {
    const cabecalhos = { Origin: this.origem };
    if (this.cookies.size) cabecalhos.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (corpo) cabecalhos['Content-Type'] = 'application/x-www-form-urlencoded';
    const r = await fetch(this.origem + caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo ? new URLSearchParams(corpo).toString() : undefined,
      redirect: 'manual',
    });
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(';');
      const i = par.indexOf('=');
      const nome = par.slice(0, i);
      const valor = par.slice(i + 1);
      if (valor) this.cookies.set(nome, valor);
      else this.cookies.delete(nome);
    }
    return { estado: r.status, local: r.headers.get('location') || '', html: await r.text() };
  }

  get(caminho) {
    return this.pedido('GET', caminho);
  }

  post(caminho, corpo = {}) {
    return this.pedido('POST', caminho, corpo);
  }
}

// Código da primeira escola (a dos dados de demonstração)
async function codigoPrimeiraEscola() {
  const { plataforma } = require('../src/db');
  return (await plataforma.um('SELECT codigo FROM escolas ORDER BY id LIMIT 1')).codigo;
}

// Entra na Gestão Escolar e devolve o cliente com a sessão aberta
async function entrarGestao(username, password) {
  const codigo = await codigoPrimeiraEscola();
  const c = new Cliente(GESTAO);
  c.prefixo = `/${codigo}`;
  const r = await c.post(`${c.prefixo}/login`, { username, password });
  c.resposta = r;
  return c;
}

// Último código de 6 algarismos enviado por "email" (escrito na consola do servidor da Gestão Escolar)
function ultimoCodigoEnviado() {
  const texto = fs.existsSync(REGISTO_GESTAO) ? fs.readFileSync(REGISTO_GESTAO, 'utf8') : '';
  const todos = [...texto.matchAll(/código (?:para entrar|de confirmação): (\d{6})/g)];
  return todos.length ? todos[todos.length - 1][1] : null;
}

// Corre uma função "dentro" de uma escola (as consultas só veem os dados dessa escola)
async function naEscola(escolaId, fn) {
  const { plataforma } = require('../src/db');
  const { correrNoContexto } = require('../src/lib/contexto');
  const { contextoDaEscola } = require('../src/lib/escolas');
  const escola = await plataforma.um('SELECT * FROM escolas WHERE id = ?', escolaId);
  return correrNoContexto(contextoDaEscola(escola), fn);
}

async function esperar(ms) {
  await new Promise((ok) => setTimeout(ok, ms));
}

module.exports = { AMBIENTE, GESTAO, CONVERSAS, REGISTO_GESTAO, Cliente, codigoPrimeiraEscola, entrarGestao, ultimoCodigoEnviado, naEscola, esperar };

// No fim de cada ficheiro de testes, fecha as ligações à base de dados (senão o processo não termina)
require('node:test').after(async () => {
  if (require.cache[require.resolve('../src/db')]) await require('../src/db').fecharLigacoes();
});
