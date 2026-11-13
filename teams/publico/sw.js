// Service Worker do PWA da Conversas (o mesmo funcionamento do da Gestão Escolar, public/sw.js).
// As páginas desta aplicação têm sempre dados pessoais do utilizador autenticado, por isso nunca
// são guardadas em cache: os pedidos de navegação vão sempre à rede, com uma página de "sem ligação"
// como único recurso offline. Só os ficheiros estáticos (CSS, JS, ícones) ficam em cache.
// Mudar a versão sempre que o CSS/JS/ícones mudarem: o service worker novo apaga a cache antiga
// (sem isto, quem tem a app instalada continuava a ver o CSS antigo na primeira visita)
const CACHE_ESTATICOS = 'conversas-estaticos-v1';
const FICHEIRO_OFFLINE = '/offline.html';

const PRE_CACHE = [
  '/static/estilo.css',
  '/static/app.js',
  '/static/favicon.svg',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  FICHEIRO_OFFLINE,
];

self.addEventListener('install', (evento) => {
  self.skipWaiting();
  evento.waitUntil(caches.open(CACHE_ESTATICOS).then((cache) => cache.addAll(PRE_CACHE)));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((nome) => nome !== CACHE_ESTATICOS).map((nome) => caches.delete(nome))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  // Navegação (pedir uma página): sempre da rede — mostra a página offline só se a rede falhar.
  if (pedido.mode === 'navigate') {
    evento.respondWith(fetch(pedido).catch(() => caches.match(FICHEIRO_OFFLINE)));
    return;
  }

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/static/')) return;

  // Ficheiros estáticos: responde do cache de imediato e atualiza-o em segundo plano.
  evento.respondWith(
    caches.open(CACHE_ESTATICOS).then(async (cache) => {
      const emCache = await cache.match(pedido);
      const daRede = fetch(pedido)
        .then((resposta) => {
          if (resposta.ok) cache.put(pedido, resposta.clone());
          return resposta;
        })
        .catch(() => emCache);
      return emCache || daRede;
    })
  );
});
