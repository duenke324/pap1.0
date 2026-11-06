// Ata da reunião: ditado ao microfone com o reconhecimento de voz do próprio browser (Web Speech API).
// Cada frase reconhecida é acrescentada à caixa "Transcrição"; depois o servidor monta a ata formal.
// O áudio não passa pelo servidor da escola — só o texto, quando o diretor de turma gera ou guarda a ata.
(() => {
  const form = document.querySelector('[data-rascunho]');
  if (!form) return;
  const caixa = form.querySelector('[data-ditado]');
  const botao = form.querySelector('[data-ditado-botao]');
  const rotulo = botao.querySelector('span');
  const estado = form.querySelector('[data-ditado-estado]');
  const provisorio = form.querySelector('[data-ditado-provisorio]');
  const texto = form.querySelector('[data-ditado-texto]');
  const ata = form.querySelector('textarea[name="ata"]');
  const chave = form.dataset.rascunho;

  // Rascunho da transcrição só neste separador (sessionStorage): sobrevive a recarregar a página sem querer,
  // mas não fica guardado no computador depois de fechar o separador (é conversa de uma reunião)
  try {
    const guardado = sessionStorage.getItem(chave);
    if (guardado && !texto.value.trim()) {
      texto.value = guardado;
      estado.textContent = 'Recuperada a transcrição que ainda não tinha sido usada.';
    }
  } catch {
    // browser sem armazenamento: só não há recuperação
  }
  const guardarRascunho = () => {
    try {
      sessionStorage.setItem(chave, texto.value);
    } catch {
      // sem armazenamento
    }
  };
  texto.addEventListener('input', guardarRascunho);

  form.addEventListener('submit', (e) => {
    const acao = e.submitter?.value;
    // Gerar de novo substitui o que está na caixa da ata (que pode já ter correções feitas à mão)
    if (acao === 'gerar' && ata.value.trim() && !confirm('Gerar de novo substitui o texto que está na caixa da ata. Continuar?')) {
      e.preventDefault();
      return;
    }
    if (aGravar) parar();
    if (acao === 'guardar') {
      try {
        sessionStorage.removeItem(chave);
      } catch {
        // sem armazenamento
      }
    }
  });

  // ---------- Ditado ----------
  const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
  let reconhecimento = null;
  let aGravar = false;
  let inicio = 0;
  let relogio = null;
  let ecraLigado = null;

  if (!Reconhecimento || !window.isSecureContext) {
    botao.disabled = true;
    estado.textContent = !Reconhecimento
      ? 'Este browser não faz ditado por voz — use o Chrome, o Edge ou o Safari. Pode escrever a transcrição à mão.'
      : 'O microfone só funciona em ligações seguras (https://) ou no próprio computador (localhost).';
    return;
  }

  const tempo = () => {
    const s = Math.floor((Date.now() - inicio) / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const mostrarTempo = () => (estado.textContent = `A gravar · ${tempo()}`);

  // Cada frase reconhecida começa com maiúscula e acaba com ponto; dizer «parágrafo» muda de parágrafo
  function acrescentar(frase) {
    frase.split(/\bpar[aá]grafo\b/i).forEach((parte, i) => {
      if (i > 0 && texto.value.trim()) texto.value = texto.value.replace(/\s+$/, '') + '\n';
      const limpa = parte.trim();
      if (!limpa) return;
      const separador = texto.value === '' || texto.value.endsWith('\n') ? '' : ' ';
      texto.value += separador + limpa[0].toUpperCase() + limpa.slice(1) + (/[.!?…:]$/.test(limpa) ? '' : '.');
    });
    texto.scrollTop = texto.scrollHeight;
    guardarRascunho();
  }

  const ERROS = {
    'not-allowed': 'O browser não deu acesso ao microfone. Autorize o microfone (no ícone ao lado do endereço) e tente outra vez.',
    'service-not-allowed': 'O browser não permite o reconhecimento de voz nesta página.',
    'audio-capture': 'Não foi encontrado nenhum microfone ligado ao computador.',
    network: 'Sem ligação ao serviço de reconhecimento de voz — o ditado precisa de internet.',
    'language-not-supported': 'O reconhecimento de voz em português não está disponível neste browser.',
  };

  function ouvir() {
    reconhecimento = new Reconhecimento();
    reconhecimento.lang = 'pt-PT';
    reconhecimento.continuous = true;
    reconhecimento.interimResults = true;
    reconhecimento.onresult = (e) => {
      let parcial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) acrescentar(e.results[i][0].transcript);
        else parcial += e.results[i][0].transcript;
      }
      provisorio.textContent = parcial;
    };
    // "no-speech" e "aborted" não são erros a sério: o browser pára sozinho depois de algum silêncio
    reconhecimento.onerror = (e) => {
      if (ERROS[e.error]) parar(ERROS[e.error]);
    };
    // O Chrome termina a escuta de vez em quando (silêncio, limite de tempo): enquanto se grava, recomeça
    reconhecimento.onend = () => {
      if (!aGravar) return;
      try {
        reconhecimento.start();
      } catch {
        parar('O ditado parou. Carregue outra vez em «Começar a gravar» para continuar.');
      }
    };
    reconhecimento.start();
  }

  async function comecar() {
    aGravar = true;
    inicio = Date.now();
    rotulo.textContent = 'Parar a gravação';
    caixa.classList.add('a-gravar');
    mostrarTempo();
    relogio = setInterval(mostrarTempo, 1000);
    try {
      ouvir();
    } catch {
      return parar('Não foi possível começar o ditado neste browser.');
    }
    // Numa reunião comprida o portátil não deve adormecer (adormecer cortava o microfone)
    try {
      ecraLigado = await navigator.wakeLock?.request('screen');
    } catch {
      // sem "wake lock": não faz mal
    }
  }

  function parar(mensagem = 'Gravação parada. Pode continuar a gravar, corrigir o texto ou gerar a ata.') {
    aGravar = false;
    clearInterval(relogio);
    rotulo.textContent = 'Começar a gravar';
    caixa.classList.remove('a-gravar');
    provisorio.textContent = '';
    estado.textContent = mensagem;
    try {
      reconhecimento?.stop();
    } catch {
      // já estava parado
    }
    ecraLigado?.release().catch(() => {});
    ecraLigado = null;
  }

  botao.addEventListener('click', () => (aGravar ? parar() : comecar()));

  // Sair da página a meio da gravação perderia o que ainda não foi reconhecido: pede confirmação
  window.addEventListener('beforeunload', (e) => {
    if (aGravar) e.preventDefault();
  });
})();
