// Manifestos do PWA (Gestão Escolar, Conversas e painel da plataforma).
// Cada escola tem o seu: instala-se como uma app própria, com o nome da escola, que abre logo nos
// endereços dela (/epmontijo/). Assim, quem tiver duas escolas no mesmo telemóvel fica com duas apps.

// Nome curto (o que aparece por baixo do ícone): o nome completo, se couber; senão o código da escola
function nomeCurto(nome, codigo) {
  if (nome.length <= 14) return nome;
  return codigo ? codigo.toUpperCase() : nome.slice(0, 14);
}

function manifesto({ nome, nomeCurto: curto, descricao, inicio, ambito = inicio, icones, corTema = '#000000', corFundo = '#ffffff' }) {
  return {
    name: nome,
    short_name: curto,
    description: descricao,
    id: inicio,
    start_url: inicio,
    scope: ambito,
    display: 'standalone',
    orientation: 'any',
    background_color: corFundo,
    theme_color: corTema,
    lang: 'pt-PT',
    dir: 'ltr',
    categories: ['education'],
    icons: [
      { src: `${icones}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${icones}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${icones}/maskable-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: `${icones}/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

// O manifesto muda pouco, mas o nome da escola pode ser editado: cache curta
function enviarManifesto(res, dados) {
  res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
  res.end(JSON.stringify(dados, null, 2));
}

module.exports = { manifesto, nomeCurto, enviarManifesto };
