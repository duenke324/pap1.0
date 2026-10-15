// Conversas: tema, menu lateral em ecrãs pequenos, e o canal de conversa (funciona sem
// JavaScript — o formulário normal recarrega a página; com JavaScript, fica mais fluido).

document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-alternar-tema]')) return;
  const raiz = document.documentElement;
  const escuroAgora = raiz.dataset.tema ? raiz.dataset.tema === 'escuro' : matchMedia('(prefers-color-scheme: dark)').matches;
  raiz.dataset.tema = escuroAgora ? 'claro' : 'escuro';
  try {
    localStorage.setItem('tema-conversas', raiz.dataset.tema);
  } catch {
    // sem armazenamento (ex.: janela privada): o tema muda só nesta página
  }
});

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-alternar-menu]')) document.body.classList.toggle('menu-aberto');
  else if (document.body.classList.contains('menu-aberto') && !e.target.closest('.lista-canais') && !e.target.closest('[data-alternar-menu]')) {
    document.body.classList.remove('menu-aberto');
  }
});

// ---------- Canal de conversa ----------
(() => {
  const raiz = document.querySelector('[data-canal]');
  if (!raiz) return;

  const lista = raiz.querySelector('[data-canal-mensagens]');
  const form = raiz.querySelector('[data-canal-form]');
  const api = raiz.dataset.canalApi;
  const textareaEl = form?.querySelector('textarea[name="texto"]');
  const botaoEl = form?.querySelector('.botao-enviar');
  const vistos = new Set([...lista.querySelectorAll('[data-mensagem-id]')].map((el) => el.dataset.mensagemId));
  let ultimoId = Math.max(0, ...[...vistos].map(Number));

  // Agrupamento visual: esconde avatar/nome repetidos quando o mesmo autor escreve
  // várias mensagens seguidas em poucos minutos (classe .agrupada trata o resto via CSS).
  const JANELA_AGRUPAR_MS = 5 * 60 * 1000;
  function horaMensagem(el) {
    const v = el?.dataset.criadoEm;
    return v ? new Date(v.replace(' ', 'T')).getTime() : NaN;
  }
  function talvezAgrupar(el) {
    const anterior = el?.previousElementSibling;
    if (!el || !anterior || !anterior.classList.contains('mensagem')) return;
    const mesmoAutor = anterior.dataset.autorId && anterior.dataset.autorId === el.dataset.autorId;
    const diferenca = Math.abs(horaMensagem(el) - horaMensagem(anterior));
    if (mesmoAutor && Number.isFinite(diferenca) && diferenca <= JANELA_AGRUPAR_MS) {
      el.classList.add('agrupada');
    }
  }

  // Separadores por dia ("Hoje", "Ontem", "30 de setembro"): inseridos antes da primeira
  // mensagem de cada dia. Uma mensagem a seguir a um separador nunca fica agrupada com a
  // anterior (deixa de ter um ".mensagem" como irmão anterior), o que é o que se quer.
  const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function rotuloDia(dataStr) {
    const hoje = new Date();
    const [ano, mes, dia] = dataStr.split('-').map(Number);
    const d = new Date(ano, mes - 1, dia);
    const diffDias = Math.round((new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) - d) / 86400000);
    if (diffDias === 0) return 'Hoje';
    if (diffDias === 1) return 'Ontem';
    const base = `${dia} de ${MESES_PT[mes - 1]}`;
    return ano === hoje.getFullYear() ? base : `${base} de ${ano}`;
  }
  function talvezInserirSeparador(el) {
    const dataMsg = el?.dataset.criadoEm?.split(' ')[0];
    if (!dataMsg) return;
    const anterior = el.previousElementSibling;
    const dataAnterior = anterior?.classList.contains('mensagem') ? anterior.dataset.criadoEm?.split(' ')[0] : anterior?.dataset.separador;
    if (dataMsg !== dataAnterior) {
      el.insertAdjacentHTML('beforebegin', `<div class="separador-dia" data-separador="${dataMsg}"><span>${rotuloDia(dataMsg)}</span></div>`);
    }
  }
  function processarMensagem(el) {
    talvezInserirSeparador(el);
    talvezAgrupar(el);
  }
  lista.querySelectorAll('[data-mensagem-id]').forEach(processarMensagem);

  function fundo() {
    lista.scrollTop = lista.scrollHeight;
  }
  fundo();

  // Só volta a fazer scroll para o fundo sozinho se o utilizador já lá estava — uma mensagem
  // nova não deve "puxar" para baixo quem está a ler mensagens antigas.
  function pertoDoFundo() {
    return lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
  }

  function inserir(html, id) {
    if (vistos.has(String(id))) return;
    vistos.add(String(id));
    const vazio = lista.querySelector('.vazio');
    if (vazio) vazio.remove();
    lista.insertAdjacentHTML('beforeend', html);
    processarMensagem(lista.lastElementChild);
    ultimoId = Math.max(ultimoId, Number(id));
  }

  async function verificarNovas() {
    try {
      const resposta = await fetch(`${api}/mensagens?apos=${ultimoId}`, { headers: { Accept: 'application/json' } });
      if (!(resposta.headers.get('Content-Type') || '').includes('application/json')) return;
      const r = await resposta.json();
      if (!r.ok) return;
      const estavaPertoDoFundo = pertoDoFundo();
      for (const m of r.mensagens) inserir(m.html, m.id);
      if (r.mensagens.length && estavaPertoDoFundo) fundo();
    } catch {
      // falha de rede: tenta de novo no próximo intervalo
    }
  }

  // Caixa de escrita: cresce sozinha até 6 linhas (sem o utilizador ter de arrastar o canto —
  // por isso o CSS tem resize:none), Enter envia, Shift+Enter quebra linha, e o botão de enviar
  // só fica ativo quando há texto. Sem JavaScript a caixa fica com o tamanho mínimo fixo (ainda
  // dá para escrever e enviar, só não cresce sozinha).
  function ajustarAltura() {
    if (!textareaEl) return;
    textareaEl.style.height = 'auto';
    const linha = parseFloat(getComputedStyle(textareaEl).lineHeight) || 20;
    const maxAltura = linha * 6;
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, maxAltura)}px`;
    textareaEl.style.overflowY = textareaEl.scrollHeight > maxAltura ? 'auto' : 'hidden';
  }
  function atualizarBotao() {
    if (botaoEl) botaoEl.disabled = !textareaEl?.value.trim();
  }
  textareaEl?.addEventListener('input', () => {
    ajustarAltura();
    atualizarBotao();
  });
  textareaEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  ajustarAltura();
  atualizarBotao();

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = textareaEl.value.trim();
    if (!texto) return;
    botaoEl.disabled = true;
    try {
      const resposta = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ texto }),
      });
      if (!(resposta.headers.get('Content-Type') || '').includes('application/json')) {
        throw new Error('A sessão pode ter expirado. Recarregue a página e tente de novo.');
      }
      const r = await resposta.json();
      if (!r.ok) {
        alert(r.erro || 'Não foi possível enviar a mensagem.');
      } else {
        inserir(r.html, r.id);
        textareaEl.value = '';
        ajustarAltura();
        fundo();
      }
    } catch (erro) {
      alert(erro.message || 'Erro de ligação ao servidor.');
    }
    atualizarBotao();
    textareaEl.focus();
  });

  setInterval(verificarNovas, 4000);
})();
