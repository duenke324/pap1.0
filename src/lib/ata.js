// Ata da reunião de turma: monta o texto formal (abertura, presentes, assuntos tratados e encerramento)
// a partir dos dados da reunião e da transcrição ditada ao microfone. O diretor de turma revê-o antes de guardar.

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze',
  'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Números de 0 a 99 por extenso, como se escrevem nas atas. "feminino" é para as horas (uma hora, duas horas).
function porExtenso(n, feminino = false) {
  const unidade = (u) => (feminino && u === 1 ? 'uma' : feminino && u === 2 ? 'duas' : UNIDADES[u]);
  if (n < 20) return unidade(n);
  const resto = n % 10;
  return DEZENAS[Math.floor(n / 10)] + (resto ? ` e ${unidade(resto)}` : '');
}

// "Aos quinze dias do mês de novembro do ano de dois mil e vinte e seis"
function dataPorExtenso(dataISO) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const anoTexto = ano >= 2000 && ano < 2100 ? `dois mil${ano > 2000 ? ` e ${porExtenso(ano - 2000)}` : ''}` : String(ano);
  const diaTexto = dia === 1 ? 'Ao primeiro dia' : `Aos ${porExtenso(dia)} dias`;
  return `${diaTexto} do mês de ${MESES[mes - 1]} do ano de ${anoTexto}`;
}

// "pelas catorze horas e trinta minutos" / "pela uma hora"
function horaPorExtenso(hora) {
  const [h, m] = hora.split(':').map(Number);
  const horas = h === 1 ? 'pela uma hora' : `pelas ${porExtenso(h, true)} horas`;
  return horas + (m ? ` e ${porExtenso(m)} minuto${m === 1 ? '' : 's'}` : '');
}

// "A, B e C"
function lista(itens) {
  return itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : itens[0] || '';
}

// Cada linha da transcrição é um parágrafo; tira espaços a mais e começa com maiúscula
function paragrafos(texto) {
  return String(texto || '')
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('\n\n');
}

// presentes: [{ nome, papel }] (o diretor de turma primeiro); outros: texto livre (ex.: "a encarregada de educação X")
function gerarAta({ turma, reuniao, diretor, presentes, outros = '', transcricao = '' }) {
  const local = !reuniao.local
    ? ''
    : /^sala\s+/i.test(reuniao.local)
      ? `, na sala ${reuniao.local.replace(/^sala\s+/i, '')}`
      : `, no local «${reuniao.local}»`;
  const assunto = reuniao.assunto ? `, com o seguinte assunto: ${reuniao.assunto.replace(/[.\s]+$/, '')}` : '';
  const pessoas = lista([...presentes.map((p) => `${p.nome} (${p.papel})`), ...(outros.trim() ? [outros.trim()] : [])]);
  return [
    `ATA DA REUNIÃO DE TURMA — ${turma}`,
    `${dataPorExtenso(reuniao.data)}, ${horaPorExtenso(reuniao.hora)}${local}, realizou-se a reunião da turma ${turma}${assunto}.` +
      (pessoas ? ` Estiveram presentes ${pessoas}.` : ''),
    paragrafos(transcricao) || '[Escreva aqui os assuntos tratados e as decisões tomadas.]',
    'Nada mais havendo a tratar, deu-se por encerrada a reunião, da qual se lavrou a presente ata que, depois de lida ' +
      'e aprovada, vai ser assinada pelos presentes.',
    `O Diretor de Turma: ______________________________\n(${diretor})`,
  ].join('\n\n');
}

module.exports = { gerarAta, porExtenso, dataPorExtenso, horaPorExtenso };
