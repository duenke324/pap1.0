// InformaNege: só efeitos visuais (inclinação 3D ao mover o rato, revelar ao fazer scroll,
// sombra na barra do topo). Nada aqui é essencial — sem JavaScript a página fica toda visível,
// só sem estas animações extra (ver a classe "js-ativo" e a regra ".revelar" no estilo.css).

const semMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Inclinação 3D dos cartões ao mover o rato
if (!semMovimento) {
  document.querySelectorAll('[data-tilt]').forEach((el) => {
    function mover(e) {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(700px) rotateY(${x * 14}deg) rotateX(${y * -14}deg) translateZ(6px)`;
      el.style.setProperty('--mx', `${(x + 0.5) * 100}%`);
      el.style.setProperty('--my', `${(y + 0.5) * 100}%`);
    }
    el.addEventListener('mousemove', mover);
    el.addEventListener('mouseleave', () => {
      el.style.transform = '';
    });
  });
}

// Revelar secções ao entrarem no ecrã
if ('IntersectionObserver' in window) {
  const observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        entrada.target.classList.add('visivel');
        observador.unobserve(entrada.target);
      }
    },
    { threshold: 0.15 }
  );
  document.querySelectorAll('.revelar').forEach((el) => observador.observe(el));
}

// Sombra na barra do topo depois de fazer scroll
const topo = document.querySelector('.topo');
if (topo) {
  addEventListener('scroll', () => topo.classList.toggle('topo--scroll', scrollY > 8), { passive: true });
}
