// Funções auxiliares partilhadas (segurança, datas, formatação)
const crypto = require('node:crypto');

// ---------- Palavras-passe (scrypt com sal aleatório) ----------
function gerarHash(password) {
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, sal, 64).toString('hex');
  return `${sal}:${hash}`;
}

function verificarPassword(password, guardado) {
  const [sal, hash] = String(guardado).split(':');
  if (!sal || !hash) return false;
  const calculado = crypto.scryptSync(password, sal, 64);
  const esperado = Buffer.from(hash, 'hex');
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

// ---------- HTML ----------
// Escapa texto antes de o colocar no HTML (evita XSS)
function h(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function selecionado(a, b) {
  return String(a) === String(b) ? ' selected' : '';
}

// ---------- Datas ----------
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function paraISO(data) {
  const a = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const d = String(data.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

function hoje() {
  return paraISO(new Date());
}

function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) return false;
  const [a, m, d] = texto.split('-').map(Number);
  const dt = new Date(a, m - 1, d);
  return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// 1 = segunda ... 7 = domingo
function diaDaSemana(textoISO) {
  const [a, m, d] = textoISO.split('-').map(Number);
  const dia = new Date(a, m - 1, d).getDay();
  return dia === 0 ? 7 : dia;
}

function formatarData(textoISO) {
  if (!textoISO) return '—';
  const [a, m, d] = textoISO.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function formatarDataLonga(textoISO) {
  if (!textoISO) return '—';
  return `${DIAS_CURTOS[diaDaSemana(textoISO) % 7]}, ${formatarData(textoISO)}`;
}

function idade(textoISO) {
  if (!dataValida(textoISO)) return null;
  const [a, m, d] = textoISO.split('-').map(Number);
  const agora = new Date();
  let anos = agora.getFullYear() - a;
  if (agora.getMonth() + 1 < m || (agora.getMonth() + 1 === m && agora.getDate() < d)) anos--;
  return anos;
}

function diasAte(textoISO) {
  const [a, m, d] = textoISO.split('-').map(Number);
  const alvo = new Date(a, m - 1, d);
  const [ha, hm, hd] = hoje().split('-').map(Number);
  return Math.round((alvo - new Date(ha, hm - 1, hd)) / 86400000);
}

// Ano letivo atual: a partir de setembro conta o ano seguinte (ex.: 2026/2027)
function anoLetivoAtual() {
  const d = new Date();
  const a = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${a}/${a + 1}`;
}

// Ano letivo "2026/2027": de 1 de setembro de 2026 a 31 de agosto de 2027 (null se o formato for inválido)
function limitesAnoLetivo(anoLetivo) {
  const m = /^(\d{4})\/(\d{4})$/.exec(anoLetivo || '');
  if (!m) return null;
  return { inicio: `${m[1]}-09-01`, fim: `${m[2]}-08-31` };
}

// Cursos profissionais: o aluno excede o limite de faltas a partir de 10% das horas dadas
// numa disciplina/módulo. Usado na avaliação (EF), nas estatísticas do aluno e no aviso ao diretor de turma.
const LIMITE_FALTAS = 0.1;

// Base para calcular a percentagem de faltas: as aulas realmente dadas (não as planeadas),
// nunca menor do que o nº de faltas (faltas antigas podem não ter lição registada).
function aulasDadas(aulas, faltas) {
  return Math.max(aulas, faltas);
}

// ---------- Email institucional ----------
const DOMINIO_EMAIL = 'epmontijo.edu.pt';
const REGEX_EMAIL_INSTITUCIONAL = /^[a-z0-9._-]+@epmontijo\.edu\.pt$/i;
function emailInstitucionalValido(email) {
  return REGEX_EMAIL_INSTITUCIONAL.test(String(email || '').trim());
}

function removerAcentos(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Email automático do aluno: primeironome.ultimonome.numerodeprocesso@dominio
// (o n.º de processo é sempre único, por isso o email nunca colide)
function gerarEmailAluno(nome, numeroProcesso) {
  const limpar = (s) => removerAcentos(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const partes = String(nome).trim().split(/\s+/).filter(Boolean).map(limpar).filter(Boolean);
  const primeiro = partes[0] || 'aluno';
  const ultimo = partes.length > 1 ? partes[partes.length - 1] : primeiro;
  return `${primeiro}.${ultimo}.${String(numeroProcesso).toLowerCase()}@${DOMINIO_EMAIL}`;
}

// Palavra-passe temporária legível (sem 0/O/1/l/I, para não se trocarem ao escrever à mão)
function gerarPasswordTemporaria(tamanho = 10) {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(tamanho);
  let senha = '';
  for (let i = 0; i < tamanho; i++) senha += alfabeto[bytes[i] % alfabeto.length];
  return senha;
}

// ---------- Rótulos ----------
const TIPOS_FALTA = {
  presenca: 'Presença',
  material: 'Material',
  disciplinar: 'Disciplinar',
};

const TIPOS_TESTE = {
  teste: 'Teste',
  trabalho: 'Trabalho',
  apresentacao: 'Apresentação',
  outro: 'Outro',
};

// Cargos dos "outros funcionários" (pessoal não-docente)
const CARGOS_FUNCIONARIO = {
  informatico: 'Informático',
  auxiliar_escolar: 'Auxiliar Escolar',
  rh: 'Recursos Humanos',
  biblioteca: 'Biblioteca',
  secretaria: 'Secretaria',
  centro_recursos: 'Centro de Recursos',
  cozinha: 'Cozinheira/o',
  porteiro: 'Porteiro',
};

// ---------- Classificações dos módulos ----------
// Aceita "0".."20", "NC" (módulo não concluído) ou "EF" (excluído por faltas).
// Devolve { estado, nota }, { vazio: true } se o campo estiver em branco, ou null se for inválido.
function lerClassificacao(texto) {
  const t = String(texto ?? '').trim().toUpperCase();
  if (t === '') return { vazio: true };
  if (t === 'NC' || t === 'EF') return { estado: t, nota: null };
  if (/^\d{1,2}$/.test(t) && Number(t) <= 20) return { estado: 'nota', nota: Number(t) };
  return null;
}

function textoClassificacao(c) {
  if (!c) return '';
  return c.estado === 'nota' ? String(c.nota) : c.estado;
}

// Etiqueta colorida: verde (≥ 10), laranja (< 10), vermelho (NC / EF)
function etiquetaClassificacao(c) {
  if (!c) return '<span class="texto-suave">—</span>';
  if (c.estado === 'NC') return '<span class="etiqueta etiqueta-perigo" title="Módulo não concluído">NC</span>';
  if (c.estado === 'EF') return '<span class="etiqueta etiqueta-perigo" title="Excluído por faltas">EF</span>';
  return `<span class="etiqueta ${c.nota >= 10 ? 'etiqueta-ok' : 'etiqueta-aviso'}">${c.nota}</span>`;
}

// Um campo de formulário repetido chega como array; um só chega como string
function comoLista(valor) {
  if (valor === undefined || valor === null || valor === '') return [];
  return Array.isArray(valor) ? valor : [valor];
}

function iniciais(nome) {
  const partes = String(nome || '?').trim().split(/\s+/);
  const primeira = partes[0]?.[0] || '?';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

module.exports = {
  gerarHash,
  verificarPassword,
  h,
  selecionado,
  DIAS_SEMANA,
  DIAS_CURTOS,
  paraISO,
  hoje,
  dataValida,
  diaDaSemana,
  formatarData,
  formatarDataLonga,
  idade,
  diasAte,
  limitesAnoLetivo,
  anoLetivoAtual,
  LIMITE_FALTAS,
  aulasDadas,
  DOMINIO_EMAIL,
  emailInstitucionalValido,
  gerarEmailAluno,
  gerarPasswordTemporaria,
  TIPOS_FALTA,
  TIPOS_TESTE,
  CARGOS_FUNCIONARIO,
  comoLista,
  iniciais,
  lerClassificacao,
  textoClassificacao,
  etiquetaClassificacao,
};
