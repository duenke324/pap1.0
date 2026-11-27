// Pequenas melhorias de interação (a aplicação funciona sem JavaScript na maior parte)

// PWA: regista o service worker (cache dos ficheiros estáticos e página de "sem ligação")
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Submeter automaticamente os filtros ao mudar um <select> ou data
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-submeter]')) e.target.form.requestSubmit();
});

// Pedir confirmação antes de ações destrutivas
document.addEventListener('submit', (e) => {
  const botao = e.submitter;
  const mensagem = botao?.dataset.confirmarBotao || (!botao?.hasAttribute('formaction') && e.target.dataset.confirmar);
  if (mensagem && !confirm(mensagem)) e.preventDefault();
});

// Tema claro / escuro. Sem escolha guardada, segue o sistema operativo.
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-alternar-tema]')) return;
  const raiz = document.documentElement;
  const escuroAgora = raiz.dataset.tema ? raiz.dataset.tema === 'escuro' : matchMedia('(prefers-color-scheme: dark)').matches;
  raiz.dataset.tema = escuroAgora ? 'claro' : 'escuro';
  try {
    localStorage.setItem('tema', raiz.dataset.tema);
  } catch {
    // browser sem armazenamento (ex.: janela privada): o tema muda só nesta página
  }
  // Avisa outros scripts da página (ex.: os gráficos do painel de administração) para se redesenharem
  document.dispatchEvent(new CustomEvent('tema-alterado'));
});

// Imprimir / exportar para PDF (o browser oferece "Guardar como PDF" no diálogo de impressão)
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-imprimir]')) window.print();
});

// Índice das páginas em ecrãs pequenos
function alternarMenuMovel(aberto) {
  document.body.classList.toggle('menu-aberto', aberto);
  document.querySelector('[data-alternar-menu]')?.setAttribute('aria-expanded', String(aberto));
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-alternar-menu]')) alternarMenuMovel(!document.body.classList.contains('menu-aberto'));
  else if (document.body.classList.contains('menu-aberto') && !e.target.closest('#lateral')) alternarMenuMovel(false);
});
// Esc fecha o índice móvel e devolve o foco ao botão que o abriu
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('menu-aberto')) {
    alternarMenuMovel(false);
    document.querySelector('[data-alternar-menu]')?.focus();
  }
});

// Selecionar todas as faltas (painel de administrador)
document.addEventListener('change', (e) => {
  if (!e.target.matches('[data-selecionar-todos]')) return;
  e.target.form.querySelectorAll('[data-selecionar]').forEach((c) => (c.checked = e.target.checked));
});

// Justificativo de faltas (encarregado de educação): o ficheiro escolhido é lido no browser e
// enviado em base64 num campo escondido, tal como a fotografia do aluno. O servidor volta a
// verificar o tipo e o tamanho — esta verificação aqui serve só para avisar mais cedo.
document.querySelectorAll('[data-formulario-justificativo]').forEach((form) => {
  const entrada = form.querySelector('[data-ficheiro-justificativo]');
  const dados = form.querySelector('[data-dados-justificativo]');
  if (!entrada || !dados) return;
  const TAMANHO_MAXIMO = 3 * 1024 * 1024;

  entrada.addEventListener('change', () => {
    dados.value = '';
    const ficheiro = entrada.files[0];
    if (!ficheiro) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(ficheiro.type)) {
      alert('Escolha um ficheiro PDF, JPG ou PNG.');
      entrada.value = '';
      return;
    }
    if (ficheiro.size > TAMANHO_MAXIMO) {
      alert('O ficheiro é demasiado grande (máx. 3 MB).');
      entrada.value = '';
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => (dados.value = leitor.result);
    leitor.onerror = () => {
      alert('Não foi possível ler o ficheiro.');
      entrada.value = '';
    };
    leitor.readAsDataURL(ficheiro);
  });

  form.addEventListener('submit', (e) => {
    if (!form.querySelector('[data-selecionar]:checked')) {
      e.preventDefault();
      alert('Selecione pelo menos uma falta.');
    } else if (!dados.value) {
      // ficheiro ainda a ser lido (ou a leitura falhou)
      e.preventDefault();
      alert('Aguarde um momento: o justificativo ainda está a ser preparado.');
    }
  });
});

// Fotografia do aluno: reduz a imagem no browser (máx. 480px, JPEG) e envia-a em base64
document.querySelectorAll('[data-formulario-foto]').forEach((form) => {
  const entrada = form.querySelector('[data-ficheiro-foto]');
  const dados = form.querySelector('[data-dados-foto]');
  const previsualizacao = form.querySelector('[data-previsualizacao]');
  const remover = form.querySelector('[data-remover-foto]');

  entrada.addEventListener('change', async () => {
    const ficheiro = entrada.files[0];
    if (!ficheiro) return;
    if (!/^image\/(jpeg|png|webp)$/.test(ficheiro.type)) {
      alert('Escolha uma imagem JPG, PNG ou WEBP.');
      entrada.value = '';
      return;
    }
    try {
      const imagem = await createImageBitmap(ficheiro);
      const escala = Math.min(1, 480 / Math.max(imagem.width, imagem.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(imagem.width * escala);
      canvas.height = Math.round(imagem.height * escala);
      canvas.getContext('2d').drawImage(imagem, 0, 0, canvas.width, canvas.height);
      dados.value = canvas.toDataURL('image/jpeg', 0.85);
      previsualizacao.innerHTML = '';
      const img = document.createElement('img');
      img.src = dados.value;
      img.alt = 'Pré-visualização';
      previsualizacao.append(img);
      if (remover) remover.checked = false;
    } catch {
      alert('Não foi possível ler a imagem.');
    }
  });

  remover?.addEventListener('change', () => {
    previsualizacao.classList.toggle('a-remover', remover.checked);
    if (remover.checked) {
      dados.value = '';
      entrada.value = '';
    }
  });
});

// Foto da escola (painel da plataforma): corta a imagem em quadrado, ao centro, e prepara dois PNG
// (512 e 256 píxeis) para os campos escondidos. Vira o ícone da app da escola e dos instaladores.
document.querySelectorAll('[data-foto-escola]').forEach((campo) => {
  const entrada = campo.querySelector('[data-ficheiro-foto-escola]');
  const grande = campo.querySelector('[data-foto-grande]');
  const pequena = campo.querySelector('[data-foto-pequena]');
  const previa = campo.querySelector('[data-previa-foto]');
  const quadrado = (imagem, lado) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = lado;
    const corte = Math.min(imagem.width, imagem.height);
    canvas.getContext('2d').drawImage(imagem, (imagem.width - corte) / 2, (imagem.height - corte) / 2, corte, corte, 0, 0, lado, lado);
    return canvas.toDataURL('image/png');
  };
  entrada.addEventListener('change', async () => {
    const ficheiro = entrada.files[0];
    grande.value = pequena.value = '';
    if (!ficheiro) return;
    if (!/^image\/(jpeg|png|webp)$/.test(ficheiro.type)) {
      alert('Escolha uma imagem JPG, PNG ou WEBP.');
      entrada.value = '';
      return;
    }
    try {
      const imagem = await createImageBitmap(ficheiro);
      grande.value = quadrado(imagem, 512);
      pequena.value = quadrado(imagem, 256);
      const img = document.createElement('img');
      img.className = 'pf-foto-grande pf-escola-foto';
      img.src = pequena.value;
      img.alt = 'Pré-visualização da foto da escola';
      previa.replaceChildren(img);
    } catch {
      alert('Não foi possível ler a imagem.');
      entrada.value = '';
    }
  });
});

// Botões "Copiar" (ex.: os endereços de uma escola no painel da plataforma): copia o texto de
// data-copiar e mostra "Copiado" durante um momento. Sem acesso à área de transferência, seleciona
// o endereço ao lado para se copiar à mão.
document.addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-copiar]');
  if (!botao) return;
  const original = botao.textContent;
  try {
    await navigator.clipboard.writeText(botao.dataset.copiar);
    botao.textContent = 'Copiado';
  } catch {
    const codigo = botao.parentElement.querySelector('code');
    if (codigo) getSelection().selectAllChildren(codigo);
    botao.textContent = 'Selecionado';
  }
  setTimeout(() => (botao.textContent = original), 1600);
});

// Notificações push ("A minha conta"): pede autorização, cria a subscrição no serviço de notificações
// do browser e envia-a ao servidor. Os endereços vêm dos atributos data-* (já com o código da escola).
document.querySelectorAll('[data-notificacoes]').forEach(async (cartao) => {
  const ativar = cartao.querySelector('[data-ativar-notificacoes]');
  const desativar = cartao.querySelector('[data-desativar-notificacoes]');
  const estado = cartao.querySelector('[data-estado-notificacoes]');
  const aviso = cartao.querySelector('[data-aviso-notificacoes]');
  const mostrarAviso = (texto) => {
    aviso.textContent = texto;
    aviso.hidden = false;
  };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !window.isSecureContext) {
    mostrarAviso('Este browser (ou este endereço) não permite notificações. Use o Chrome, Edge, Firefox ou Safari em https:// ou localhost.');
    return;
  }
  const registo = await navigator.serviceWorker.ready;
  const enviar = (url, dados) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(dados) });
  const atualizar = async () => {
    const sub = await registo.pushManager.getSubscription();
    ativar.hidden = !!sub;
    desativar.hidden = !sub;
    if (sub) estado.textContent = 'Ligadas neste aparelho.';
  };
  // A chave pública do servidor vem em base64url; o browser quer bytes
  const bytes = (b64) => {
    const texto = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(texto, (c) => c.charCodeAt(0));
  };

  ativar.addEventListener('click', async () => {
    ativar.disabled = true;
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        mostrarAviso('As notificações foram bloqueadas. Para as ligar, autorize-as nas definições do site no browser.');
        return;
      }
      const { chave } = await (await fetch(cartao.dataset.chave)).json();
      const sub = await registo.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(chave) });
      const { keys } = sub.toJSON();
      const r = await enviar(cartao.dataset.subscrever, { endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth });
      if (!r.ok) throw new Error();
      location.reload(); // mostra o botão "Enviar uma notificação de teste"
    } catch {
      mostrarAviso('Não foi possível ativar as notificações neste aparelho.');
    } finally {
      ativar.disabled = false;
    }
  });

  desativar.addEventListener('click', async () => {
    const sub = await registo.pushManager.getSubscription();
    if (sub) {
      await enviar(cartao.dataset.cancelar, { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
    location.reload();
  });
  atualizar();
});

// Importar alunos (CSV): o ficheiro escolhido é lido no browser e o texto vai para a caixa.
// O Excel em português grava o CSV em Windows-1252 (não UTF-8): se não for UTF-8 válido, lê-se assim.
document.querySelectorAll('[data-formulario-csv]').forEach((form) => {
  const entrada = form.querySelector('[data-ficheiro-csv]');
  const caixa = form.querySelector('[data-texto-csv]');
  entrada.addEventListener('change', async () => {
    const ficheiro = entrada.files[0];
    if (!ficheiro) return;
    if (ficheiro.size > 4 * 1024 * 1024) {
      alert('O ficheiro é demasiado grande (máx. 4 MB).');
      entrada.value = '';
      return;
    }
    const bytes = await ficheiro.arrayBuffer();
    try {
      caixa.value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      caixa.value = new TextDecoder('windows-1252').decode(bytes);
    }
  });
});
