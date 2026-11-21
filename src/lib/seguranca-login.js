// Segurança no login.
//
// 1. Bloqueio depois de várias tentativas erradas: ao fim de MAX_FALHAS palavras-passe erradas seguidas
//    para a mesma conta, essa conta fica bloqueada durante MINUTOS_BLOQUEIO minutos (mesmo com a
//    palavra-passe certa). Guarda-se na tabela tentativas_login (database/plataforma.sql), por conta e
//    por escola: "<escola_id>:<utilizador>" (ou "plataforma:<utilizador>", "conversas:<escola_id>:<email>").
//    Conta também para utilizadores que não existem, para não se poder descobrir quais existem.
//
// 2. Código por email para a direção e para o gestor da plataforma: depois da palavra-passe certa, se a
//    conta tiver um email confirmado, é enviado um código de 6 algarismos (válido 10 minutos, no máximo
//    MAX_TENTATIVAS_CODIGO tentativas). Só depois de o escrever se entra. Na sessão guarda-se apenas o
//    SHA-256 do código.
const crypto = require('node:crypto');
const { plataforma } = require('../db');

const MAX_FALHAS = 5;
const MINUTOS_BLOQUEIO = 15;
const MINUTOS_CODIGO = 10;
const MAX_TENTATIVAS_CODIGO = 5;

const chaveLogin = (...partes) => partes.map((p) => String(p ?? '').trim().toLowerCase()).join(':').slice(0, 200);

// Minutos que faltam para a conta ser desbloqueada (0 = não está bloqueada)
async function minutosBloqueado(chave) {
  const linha = await plataforma.um(
    'SELECT CEIL(TIMESTAMPDIFF(SECOND, NOW(), bloqueado_ate) / 60) AS minutos FROM tentativas_login WHERE chave = ? AND bloqueado_ate > NOW()',
    chave
  );
  return linha ? Math.max(1, Number(linha.minutos)) : 0;
}

// Regista uma palavra-passe errada. Devolve { bloqueada, restantes }.
// Falhas com mais de MINUTOS_BLOQUEIO minutos já não contam (recomeça do zero).
async function registarFalha(chave) {
  const atual = await plataforma.um(
    `SELECT falhas, (atualizado_em < NOW() - INTERVAL ? MINUTE OR bloqueado_ate IS NOT NULL) AS antiga FROM tentativas_login WHERE chave = ?`,
    MINUTOS_BLOQUEIO,
    chave
  );
  const falhas = atual && !Number(atual.antiga) ? atual.falhas + 1 : 1;
  const bloqueada = falhas >= MAX_FALHAS;
  await plataforma.executar(
    `INSERT INTO tentativas_login (chave, falhas, bloqueado_ate, atualizado_em)
     VALUES (?, ?, IF(?, NOW() + INTERVAL ? MINUTE, NULL), NOW())
     ON DUPLICATE KEY UPDATE falhas = VALUES(falhas), bloqueado_ate = VALUES(bloqueado_ate), atualizado_em = NOW()`,
    chave,
    bloqueada ? 0 : falhas,
    bloqueada ? 1 : 0,
    MINUTOS_BLOQUEIO
  );
  return { bloqueada, restantes: bloqueada ? 0 : MAX_FALHAS - falhas };
}

async function limparFalhas(chave) {
  await plataforma.executar('DELETE FROM tentativas_login WHERE chave = ?', chave);
}

// Mensagem a mostrar depois de uma palavra-passe errada
function mensagemFalha({ bloqueada, restantes }, base = 'Utilizador ou palavra-passe incorretos.') {
  if (bloqueada) return `${base} Por segurança, esta conta ficou bloqueada durante ${MINUTOS_BLOQUEIO} minutos.`;
  if (restantes <= 2) return `${base} Mais ${restantes} tentativa(s) errada(s) e a conta fica bloqueada durante ${MINUTOS_BLOQUEIO} minutos.`;
  return base;
}

const mensagemBloqueio = (minutos) =>
  `Esta conta está bloqueada por causa de várias palavras-passe erradas. Tente outra vez daqui a ${minutos} minuto(s).`;

// ---------- Códigos por email ----------
const hashCodigo = (codigo) => crypto.createHash('sha256').update(String(codigo)).digest('hex');

// Cria um código novo. Devolve { codigo, pendente }: o código vai no email; o "pendente" fica na sessão.
function criarCodigo(dados = {}) {
  const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  return { codigo, pendente: { ...dados, hash: hashCodigo(codigo), expira: Date.now() + MINUTOS_CODIGO * 60 * 1000, tentativas: 0 } };
}

// Verifica o código escrito. Altera "pendente" (conta a tentativa). Devolve 'ok', 'errado' ou 'expirado'
// ('expirado' também quando já se esgotaram as tentativas: é preciso voltar a pedir um código).
function verificarCodigo(pendente, escrito) {
  if (!pendente || Date.now() > pendente.expira || pendente.tentativas >= MAX_TENTATIVAS_CODIGO) return 'expirado';
  pendente.tentativas++;
  const limpo = String(escrito || '').replace(/\D/g, '');
  const certo = limpo.length === 6 && crypto.timingSafeEqual(Buffer.from(hashCodigo(limpo)), Buffer.from(pendente.hash));
  if (certo) return 'ok';
  return pendente.tentativas >= MAX_TENTATIVAS_CODIGO ? 'expirado' : 'errado';
}

// "henrique@escola.pt" → "he•••••@escola.pt" (para mostrar para onde foi o código sem o revelar todo)
function mascararEmail(email) {
  const [nome, dominio] = String(email || '').split('@');
  if (!dominio) return '';
  return `${nome.slice(0, 2)}${'•'.repeat(Math.max(3, nome.length - 2))}@${dominio}`;
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '')) && String(email).length <= 120;
}

function textoEmailCodigo(codigo, { nome, para = 'entrar', escola }) {
  return [
    `Olá${nome ? `, ${nome}` : ''},`,
    ``,
    para === 'entrar' ? `O seu código para entrar em ${escola} é:` : `O código para confirmar este email em ${escola} é:`,
    ``,
    `    ${codigo}`,
    ``,
    `É válido durante ${MINUTOS_CODIGO} minutos. Não o partilhe com ninguém: a escola nunca lho pede por telefone ou mensagem.`,
    para === 'entrar' ? `Se não foi você a tentar entrar, mude já a sua palavra-passe.` : `Se não foi você a pedir, ignore este email.`,
  ].join('\n');
}

module.exports = {
  MAX_FALHAS,
  MINUTOS_BLOQUEIO,
  MINUTOS_CODIGO,
  chaveLogin,
  minutosBloqueado,
  registarFalha,
  limparFalhas,
  mensagemFalha,
  mensagemBloqueio,
  criarCodigo,
  verificarCodigo,
  mascararEmail,
  emailValido,
  textoEmailCodigo,
};
