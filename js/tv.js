// Pantalla grande (proyector o TV): muestra la sala y el juego en curso.
import { asegurarSesion, mensajeError } from './fb.js';
import { Sala } from './sala.js';
import { juego as buscarJuego } from './juegos/index.js';
import { marcador } from './juegos/comun.js';
import { h, montar, urlApp, sonido } from './util.js';
import { qr } from './qr.js';

export async function iniciarTv(raiz, codigoUrl) {
  const codigo = (codigoUrl || '').toUpperCase();
  document.body.classList.add('modo-tv');
  let uid;
  try { uid = (await asegurarSesion()).uid; } catch (e) { montar(raiz, error(mensajeError(e))); return; }

  const sala = new Sala(codigo, { rol: 'tv', uid });
  const escena = h('div', { class: 'tv-escena' });
  const pie = h('div', { class: 'tv-pie' });
  let vistaJuego = null;
  let idJuego;

  const botonSonido = h('button', { class: 'tv-boton', onclick: () => { sonido('tic'); botonSonido.remove(); } }, '🔈 Activar sonido');
  const botonPantalla = h('button', { class: 'tv-boton', onclick: () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  } }, '⛶ Pantalla completa');

  const controles = h('div', { class: 'tv-controles visible' }, botonSonido, botonPantalla);
  montar(raiz, h('div', { class: 'tv' }, controles, escena, pie));
  // Los botones aparecen al mover el mouse y se esconden solos.
  let ocultar = setTimeout(() => controles.classList.remove('visible'), 6000);
  document.addEventListener('pointermove', () => {
    controles.classList.add('visible');
    clearTimeout(ocultar);
    ocultar = setTimeout(() => controles.classList.remove('visible'), 2500);
  });
  pedirPantallaEncendida();

  sala.escuchar({ jugadores: true, respuestas: true }, (motivo) => {
    if (sala.data.cerrada) { sala.detener(); vistaJuego?.destruir(); montar(pie); montar(escena, error('La sala se cerró.')); return; }
    const j = sala.juego;
    if ((j?.id || null) !== idJuego) {
      idJuego = j?.id || null;
      vistaJuego?.destruir();
      vistaJuego = null;
      if (j) {
        const zona = h('div', { class: 'tv-juego' });
        montar(escena, zona);
        vistaJuego = buscarJuego(j.tipo)?.tv(zona, sala) || null;
      }
    }
    if (!j) espera(escena, sala);
    else vistaJuego?.actualizar(motivo);
    montar(pie, j ? marcador(sala) : null);
    pie.hidden = !j;
  }, () => montar(escena, error('Esta sala está cerrada.')));
}

function espera(el, sala) {
  const enlace = urlApp('?sala=' + sala.codigo);
  const base = urlApp('').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const jugadores = sala.listaJugadores();
  montar(el, h('div', { class: 'tv-espera' },
    h('div', { class: 'tv-entrar' },
      h('div', { class: 'tv-etiqueta' }, 'Entrá desde tu celular'),
      qr(enlace, 'qr qr-tv'),
      h('div', { class: 'tv-url' }, base),
      h('div', { class: 'tv-etiqueta' }, 'Código de la sala'),
      h('div', { class: 'tv-codigo' }, sala.codigo)),
    h('div', { class: 'tv-sala' },
      h('div', { class: 'tv-cabecera' },
        h('span', { class: 'tv-etiqueta' }, `${jugadores.length} ${jugadores.length === 1 ? 'alumno conectado' : 'alumnos conectados'}`)),
      h('div', { class: 'tv-grupos' }, sala.equipos().map((e) => {
        const miembros = sala.miembros(e.id);
        return h('div', { class: 'tv-grupo', style: { '--c': e.color } },
          h('div', { class: 'tv-grupo-cab' }, h('span', null, e.nombre), h('span', { class: 'mono' }, `${e.puntos} pts`)),
          h('div', { class: 'tv-nombres' }, miembros.map((m) => h('span', { class: 'tv-nombre' }, m.nombre))));
      })))));
}

function error(texto) {
  return h('div', { class: 'tv-centro' }, h('h1', { class: 'tv-titulo' }, texto),
    h('p', { class: 'tv-sub' }, 'Abrí la pantalla grande desde el panel docente.'));
}

async function pedirPantallaEncendida() {
  try {
    let lock = await navigator.wakeLock?.request('screen');
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && (!lock || lock.released)) lock = await navigator.wakeLock?.request('screen').catch(() => null);
    });
  } catch { /* no disponible */ }
}
