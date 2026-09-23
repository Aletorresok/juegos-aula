// El impostor conceptual: todos reciben la misma palabra salvo uno (o más), que recibe
// una parecida sin saberlo. Cada uno da una pista en voz alta y después se vota.
import { h, montar, vista, selectorBanco, selector, esperando, pildoraEquipo } from './comun.js';
import { itemsDe } from '../bancos.js';
import { mezclar, toast, sonido, vibrar } from '../util.js';

const PUNTOS_VOTO = 10;      // por cada voto a un impostor, para el equipo de quien votó
const PUNTOS_ESCAPE = 30;    // para el equipo del impostor si no lo descubren

export default {
  id: 'impostor',
  nombre: 'El impostor conceptual',
  icono: '🕵️',
  resumen: 'Todos tienen la misma palabra menos uno. Pistas en voz alta y votación.',
  tipos: ['par'],

  configurar({ bancos, sala }) {
    const b = selectorBanco(bancos, 'par', 1);
    const n = sala.listaJugadores().length;
    const imp = selector('cfg-imp', 'Impostores por ronda', [[0, 'Automático (1 cada 12 alumnos)'], [1, '1'], [2, '2'], [3, '3']], 0);
    return {
      el: h('div', { class: 'pila' }, b.el, imp.el,
        h('p', { class: 'muted chico' }, 'El impostor no sabe que lo es: solo ve una palabra distinta. Si el curso descubre al impostor, cada equipo suma ',
          `${PUNTOS_VOTO} puntos por cada integrante que lo votó; si no, el equipo del impostor suma ${PUNTOS_ESCAPE}.`),
        n < 3 && h('p', { class: 'aviso' }, `Hay ${n} alumnos conectados. Hacen falta al menos 3.`)),
      leer: () => {
        const banco = b.banco();
        if (!banco) return null;
        if (sala.listaJugadores().length < 3) { toast('Hacen falta al menos 3 alumnos conectados', 'error'); return null; }
        return { banco, cantImpostores: Number(imp.valor()) };
      },
    };
  },

  async iniciar(sala, config) {
    const id = await sala.iniciarJuego({ tipo: 'impostor', fase: 'preparando', ronda: 0, titulo: config.banco.titulo });
    await nuevaRonda(sala, { ...config, juego: id, usados: [] });
  },

  host(el, sala) {
    let privado = null;
    let cargando = null;
    const recargar = () => {
      const ronda = sala.juego.ronda;
      if (cargando === ronda) return;
      cargando = ronda;
      sala.privadoDelJuego((p) => p.ronda === ronda).then((p) => { cargando = null; if (p) { privado = p; v.actualizar(); } });
    };

    async function abrirVotacion() {
      await sala.actualizarJuego({ fase: 'votacion' });
    }

    async function revelar() {
      const j = sala.juego;
      const votos = {};
      const resp = sala.respuestasJuego(j.ronda);
      resp.forEach((r) => { if (r.voto) votos[r.voto] = (votos[r.voto] || 0) + 1; });
      const max = Math.max(0, ...Object.values(votos));
      const masVotados = max ? Object.keys(votos).filter((u) => votos[u] === max) : [];
      const impostores = privado.impostores;
      const descubiertos = impostores.filter((u) => masVotados.includes(u) && masVotados.length === 1);
      const sumas = {};
      const asig = sala.data.asignaciones || {};
      resp.forEach((r, uid) => {
        if (impostores.includes(r.voto) && !impostores.includes(uid) && asig[uid]) sumas[asig[uid]] = (sumas[asig[uid]] || 0) + PUNTOS_VOTO;
      });
      impostores.filter((u) => !descubiertos.includes(u)).forEach((u) => {
        if (asig[u]) sumas[asig[u]] = (sumas[asig[u]] || 0) + PUNTOS_ESCAPE;
      });
      await sala.actualizarJuego({
        fase: 'resultado',
        resultado: { votos, masVotados, impostores, descubiertos, palabraGrupo: privado.palabraGrupo, palabraImpostor: privado.palabraImpostor, sumas },
      });
      await sala.sumar(sumas);
    }

    async function otraRonda() {
      el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      try { await nuevaRonda(sala, privado); } catch (e) { toast(e.message, 'error'); v.actualizar(); }
    }

    let contador;
    const v = vista({
      clave: () => `${sala.juego.fase}:${sala.juego.ronda}:${privado?.ronda}`,
      dibujar() {
        const j = sala.juego;
        contador = null;
        if (!privado || privado.ronda !== j.ronda || j.fase === 'preparando') {
          montar(el, esperando('Repartiendo palabras…'));
          if (j.fase !== 'preparando') recargar();
          return;
        }
        const nombre = (uid) => j.participantes.find((p) => p.uid === uid)?.nombre || '—';
        const cabecera = h('details', { class: 'tarjeta suave pila-s secreto-docente' },
          h('summary', null, `Ronda ${j.ronda} · ver palabras e impostor (no lo proyectes)`),
          h('p', null, 'Palabra del grupo: ', h('b', null, privado.palabraGrupo)),
          h('p', null, 'Palabra del impostor: ', h('b', null, privado.palabraImpostor)),
          h('p', null, privado.impostores.length > 1 ? 'Impostores: ' : 'Impostor: ', h('b', null, privado.impostores.map(nombre).join(', '))));
        if (j.fase === 'pistas') {
          montar(el, cabecera,
            h('p', null, 'Cada alumno dice una pista en voz alta, en el orden que muestra la pantalla grande. Cuando terminen, abrí la votación.'),
            h('ol', { class: 'orden' }, j.participantes.map((p) => h('li', null, p.nombre))),
            h('button', { class: 'btn grande', onclick: abrirVotacion }, 'Abrir votación'));
        } else if (j.fase === 'votacion') {
          contador = h('div', { class: 'pila-s' });
          montar(el, cabecera, contador, h('button', { class: 'btn grande', onclick: revelar }, 'Cerrar votación y revelar'));
        } else {
          const r = j.resultado;
          montar(el, cabecera,
            h('p', { class: 'grande' }, r.descubiertos.length ? '¡Descubrieron al impostor!' : 'El impostor zafó'),
            h('div', { class: 'fila' }, Object.entries(r.sumas).map(([eid, n]) => pildoraEquipo(sala.equipo(eid), ` +${n}`))),
            h('button', { class: 'btn grande', onclick: otraRonda }, 'Otra ronda'));
        }
      },
      refrescar() {
        const j = sala.juego;
        if (!contador || j.fase !== 'votacion') return;
        const resp = sala.respuestasJuego(j.ronda);
        const votos = {};
        resp.forEach((r) => { if (r.voto) votos[r.voto] = (votos[r.voto] || 0) + 1; });
        const orden = j.participantes.map((p) => [p, votos[p.uid] || 0]).sort((a, b) => b[1] - a[1]);
        montar(contador,
          h('p', null, h('b', null, `${resp.size} de ${j.participantes.length}`), ' ya votaron'),
          h('ul', { class: 'votos' }, orden.filter(([, n]) => n).map(([p, n]) =>
            h('li', null, h('span', null, p.nombre), h('b', null, n)))));
      },
    });
    return v;
  },

  alumno(el, sala) {
    let secreto = null;
    let miVoto = null;
    let ronda = null;
    let v;
    const dejar = sala.escucharDoc('secretos', sala.uid, (s) => { secreto = s; v?.actualizar('secreto'); });
    v = vista({
      destruir: () => dejar(),
      clave: () => `${sala.juego.fase}:${sala.juego.ronda}:${secreto?.ronda}:${secreto?.juego}`,
      dibujar() {
        const j = sala.juego;
        if (ronda !== j.ronda) { ronda = j.ronda; miVoto = null; }
        const participa = j.participantes?.some((p) => p.uid === sala.uid);
        const miPalabra = secreto && secreto.juego === j.id && secreto.ronda === j.ronda ? secreto.palabra : null;
        if (j.fase === 'preparando') { montar(el, esperando('Repartiendo palabras…')); return; }
        if (!participa) { montar(el, esperando('Entraste en medio de la ronda', 'Vas a jugar en la próxima.')); return; }
        const tarjeta = h('div', { class: 'palabra-secreta' },
          h('div', { class: 'etiqueta' }, 'Tu palabra es'),
          h('div', { class: 'palabra' }, miPalabra || '…'),
          h('p', { class: 'muted chico' }, 'No la digas. Da una pista que la describa sin ser obvia.'));
        if (j.fase === 'pistas') {
          if (miPalabra) vibrar(40);
          montar(el, tarjeta, h('p', { class: 'muted centro' }, 'Esperá tu turno para dar la pista. El orden está en la pantalla grande.'));
          return;
        }
        if (j.fase === 'votacion') {
          const botones = j.participantes.filter((p) => p.uid !== sala.uid).map((p) => h('button', {
            class: 'btn-voto' + (miVoto === p.uid ? ' elegido' : ''),
            onclick: async () => {
              miVoto = p.uid;
              botones.forEach((b) => b.classList.toggle('elegido', b.dataset.uid === p.uid));
              vibrar(30);
              try { await sala.responder({ ronda: j.ronda, voto: p.uid }); } catch (e) { toast(e.message, 'error'); }
            },
            'data-uid': p.uid,
          }, p.nombre));
          montar(el, h('details', { class: 'mini-palabra' }, h('summary', null, 'Ver mi palabra'), h('b', null, miPalabra || '…')),
            h('h2', null, '¿Quién es el impostor?'),
            h('p', { class: 'muted' }, 'Votá a quien creas que tiene la palabra distinta. Podés cambiar el voto hasta que se cierre.'),
            h('div', { class: 'votacion' }, botones));
          return;
        }
        const r = j.resultado;
        const soyImpostor = r.impostores.includes(sala.uid);
        const acerte = r.impostores.includes(miVoto);
        montar(el, h('div', { class: 'resultado ' + (soyImpostor ? (r.descubiertos.includes(sala.uid) ? 'mal' : 'bien') : acerte ? 'bien' : 'mal') },
          h('div', { class: 'resultado-titulo' }, soyImpostor ? '¡Eras el impostor!' : acerte ? '¡Votaste bien!' : 'No era esa persona'),
          h('p', null, 'Palabra del grupo: ', h('b', null, r.palabraGrupo)),
          h('p', null, 'Palabra del impostor: ', h('b', null, r.palabraImpostor))));
      },
    });
    return v;
  },

  tv(el, sala) {
    let contador;
    return vista({
      clave: () => `${sala.juego.fase}:${sala.juego.ronda}`,
      dibujar() {
        const j = sala.juego;
        contador = null;
        if (j.fase === 'preparando') { montar(el, h('div', { class: 'tv-centro' }, h('h1', { class: 'tv-titulo' }, 'Repartiendo palabras…'))); return; }
        if (j.fase === 'pistas') {
          montar(el, h('div', { class: 'tv-cabecera' }, h('span', { class: 'tv-etiqueta' }, `${j.titulo || 'Impostor'} · Ronda ${j.ronda}`)),
            h('h1', { class: 'tv-titulo' }, 'Miren su palabra y den una pista, en este orden'),
            h('p', { class: 'tv-sub' }, 'Una palabra o frase corta. Sin decir la palabra. Hay alguien con una palabra distinta… y no lo sabe.'),
            h('ol', { class: 'tv-orden' }, j.participantes.map((p) => h('li', { style: { '--c': sala.equipoDe(p.uid)?.color } }, p.nombre))));
          return;
        }
        if (j.fase === 'votacion') {
          contador = h('div', { class: 'tv-contador' });
          montar(el, h('div', { class: 'tv-centro' },
            h('div', { class: 'tv-icono' }, '🕵️'),
            h('h1', { class: 'tv-titulo' }, '¿Quién es el impostor?'),
            h('p', { class: 'tv-sub' }, 'Voten desde el celular.'),
            contador));
          return;
        }
        sonido('fin');
        const r = j.resultado;
        const nombre = (uid) => j.participantes.find((p) => p.uid === uid)?.nombre || '—';
        const orden = Object.entries(r.votos).sort((a, b) => b[1] - a[1]).slice(0, 8);
        montar(el, h('div', { class: 'tv-centro' },
          h('div', { class: 'tv-etiqueta' }, r.impostores.length > 1 ? 'Los impostores eran' : 'El impostor era'),
          h('h1', { class: 'tv-titulo enorme' }, r.impostores.map(nombre).join(' y ')),
          h('p', { class: 'tv-sub' }, r.descubiertos.length ? '¡Lo descubrieron!' : 'No lo descubrieron'),
          h('div', { class: 'tv-palabras' },
            h('div', null, h('span', { class: 'tv-etiqueta' }, 'Grupo'), h('b', null, r.palabraGrupo)),
            h('div', { class: 'imp' }, h('span', { class: 'tv-etiqueta' }, 'Impostor'), h('b', null, r.palabraImpostor))),
          orden.length > 0 && h('ul', { class: 'tv-votos' }, orden.map(([uid, n]) =>
            h('li', { class: r.impostores.includes(uid) ? 'es-impostor' : '' }, h('span', null, nombre(uid)), h('b', null, `${n} voto${n === 1 ? '' : 's'}`))))));
      },
      refrescar() {
        const j = sala.juego;
        if (!contador) return;
        const n = sala.respuestasJuego(j.ronda).size;
        contador.textContent = `${n} de ${j.participantes.length} votaron`;
      },
    });
  },
};

// Elige un par, reparte las palabras y arranca una ronda.
async function nuevaRonda(sala, previo) {
  const { banco, juego } = previo;
  const pares = itemsDe(banco, 'par');
  let libres = pares.map((_, i) => i).filter((i) => !previo.usados.includes(i));
  let usados = previo.usados;
  if (!libres.length) { libres = pares.map((_, i) => i); usados = []; }
  const idx = mezclar(libres)[0];
  const par = pares[idx];
  const [palabraGrupo, palabraImpostor] = Math.random() < 0.5 ? [par.a, par.b] : [par.b, par.a];
  const jugadores = mezclar(sala.listaJugadores());
  if (jugadores.length < 3) throw new Error('Hacen falta al menos 3 alumnos conectados');
  const cant = previo.cantImpostores || Math.max(1, Math.min(3, Math.round(jugadores.length / 12)));
  const impostores = mezclar(jugadores).slice(0, Math.min(cant, jugadores.length - 2)).map((j) => j.uid);
  const ronda = (sala.juego?.ronda || 0) + 1;
  await sala.actualizarJuego({ fase: 'preparando', ronda, resultado: undefined });
  await sala.guardarPrivado({ ...previo, juego, ronda, impostores, palabraGrupo, palabraImpostor, usados: [...usados, idx] });
  await sala.repartirSecretos(Object.fromEntries(jugadores.map((j) => [j.uid,
    { juego, ronda, palabra: impostores.includes(j.uid) ? palabraImpostor : palabraGrupo }])));
  await sala.actualizarJuego({ fase: 'pistas', participantes: jugadores.map((j) => ({ uid: j.uid, nombre: j.nombre })) });
}
