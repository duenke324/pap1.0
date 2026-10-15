// Pequenas melhorias de interação (a aplicação funciona sem JavaScript na maior parte)

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

// Menu lateral em ecrãs pequenos
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-alternar-menu]')) document.body.classList.toggle('menu-aberto');
  else if (document.body.classList.contains('menu-aberto') && !e.target.closest('#lateral')) document.body.classList.remove('menu-aberto');
});

// Selecionar todas as faltas (painel de administrador)
document.addEventListener('change', (e) => {
  if (!e.target.matches('[data-selecionar-todos]')) return;
  e.target.form.querySelectorAll('[data-selecionar]').forEach((c) => (c.checked = e.target.checked));
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
