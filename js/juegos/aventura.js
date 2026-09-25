// Elegí tu propia aventura: una historia con decisiones. En cada escena el curso vota
// desde el celular; se muestra la consecuencia de lo elegido (buen momento para debatir)
// y la historia sigue por ese camino. Al final se ve el recorrido y los finales que faltaron.
import { h, montar, vista, esperando } from './comun.js';
import { itemsDe } from '../bancos.js';
import { TIPOS_FINAL } from '../historias.js';
import { letraOpcion, toast, vibrar, idAzar, sonido } from '../util.js';

const escena = (hist, id) => hist.escenas.find((e) => e.id === id);

// Copia pública de una escena (sin revelar a dónde lleva cada opción).
const publica = (e) => ({ texto: e.texto, final: !!e.final, tipoFinal: e.tipoFinal || null, opciones: (e.opciones || []).map((o) => o.texto) });

function contarVotos(sala, j) {
  const c = j.escena.opciones.map(() => 0);
  sala.respuestasJuego(j.paso).forEach((r) => { const i = Number(r.valor); if (i >= 0 && i < c.length) c[i]++; });
  return c;
}

export default {
  id: 'aventura',
  nombre: 'Elegí tu propia aventura',
  icono: '🧭',
  resumen: 'Una historia con decisiones: el curso vota y ve las consecuencias.',
  tipos: ['historia'],
  sinMarcador: true,

  configurar({ bancos }) {
    const aptas = bancos.flatMap((b) => itemsDe(b, 'historia').map((x, i) => ({ b, x, clave: `${b.id}:${i}` })));
    if (!aptas.length) {
      return {
        el: h('p', { class: 'aviso' }, 'Necesitás una historia. Agregá una desde «Bancos listos para usar» o creala en la pestaña «Historias» de un banco.'),
        leer: () => null,
      };
    }
    const sel = h('select', { class: 'campo', id: 'cfg-historia' }, aptas.map((a) => h('option', { value: a.clave }, `${a.x.titulo} — ${a.x.escenas.length} escenas (${a.b.titulo})`)));
    return {
      el: h('div', { class: 'pila' },
        h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Historia'), sel),
        h('p', { class: 'muted chico' }, 'En cada escena el curso vota desde el celular. Vos cerrás la votación, se muestra la consecuencia y siguen. Si hay empate, elegís vos.')),
      leer: () => ({ historia: aptas.find((a) => a.clave === sel.value).x }),
    };
  },

  async iniciar(sala, { historia }) {
    const id = idAzar();
    const inicio = historia.escenas[0];
    await sala.guardarPrivado({ juego: id, historia });
    await sala.iniciarJuego({
      tipo: 'aventura', titulo: historia.titulo, intro: historia.intro || '', fase: historia.intro ? 'intro' : 'votando',
      paso: 1, escenaId: inicio.id, escena: publica(inicio), recorrido: [], finales: historia.escenas.filter((e) => e.final).length,
    }, id);
  },

  host(el, sala) {
    let privado = null;
    let zonaVotos = null;
    sala.privadoDelJuego().then((p) => { privado = p; v.actualizar(); });

    async function elegir(i) {
      const j = sala.juego;
      const e = escena(privado.historia, j.escenaId);
      const o = e.opciones[i];
      const votos = contarVotos(sala, j);
      await sala.actualizarJuego({
        fase: 'consecuencia', elegida: i, votos, consecuencia: o.consecuencia || '',
        recorrido: [...j.recorrido, { texto: e.texto.slice(0, 120), opcion: o.texto, votos: votos[i], total: votos.reduce((a, b) => a + b, 0) }],
      });
    }

    async function cerrarVotacion() {
      const votos = contarVotos(sala, sala.juego);
      const max = Math.max(...votos);
      const empatadas = votos.map((n, i) => (n === max ? i : -1)).filter((i) => i >= 0);
      if (max === 0) { toast('Todavía nadie votó. Podés elegir vos una opción.', 'error'); return; }
      if (empatadas.length > 1) { toast('Hay empate: tocá la opción que prefieras.', 'error'); return; }
      await elegir(empatadas[0]);
    }

    async function seguir() {
      const j = sala.juego;
      const e = escena(privado.historia, j.escenaId);
      const sig = escena(privado.historia, e.opciones[j.elegida].destino);
      await sala.actualizarJuego({
        fase: sig.final ? 'final' : 'votando', paso: j.paso + 1, escenaId: sig.id, escena: publica(sig),
        elegida: undefined, votos: undefined, consecuencia: undefined,
      });
    }

    async function reiniciar() {
      const inicio = privado.historia.escenas[0];
      await sala.actualizarJuego({ fase: 'votando', paso: sala.juego.paso + 1, escenaId: inicio.id, escena: publica(inicio), recorrido: [], elegida: undefined, votos: undefined, consecuencia: undefined });
    }

    const v = vista({
      clave: () => `${sala.juego.fase}:${sala.juego.paso}:${!!privado}`,
      dibujar() {
        const j = sala.juego;
        zonaVotos = null;
        if (!privado) { montar(el, esperando('Cargando la historia…')); return; }
        if (j.fase === 'intro') {
          montar(el, h('h3', null, '🧭 ', j.titulo), h('p', { class: 'historia' }, j.intro),
            h('button', { class: 'btn grande', onclick: () => sala.actualizarJuego({ fase: 'votando' }) }, '▶ Empezar la historia'));
          return;
        }
        const e = escena(privado.historia, j.escenaId);
        if (j.fase === 'final') {
          const t = TIPOS_FINAL[e.tipoFinal] || TIPOS_FINAL.neutro;
          montar(el, h('div', { class: 'etiqueta' }, `${t.icono} ${t.nombre}`), h('p', { class: 'historia' }, e.texto),
            h('p', { class: 'muted' }, `Recorrieron ${j.recorrido.length} decisiones. La historia tiene ${j.finales} finales posibles.`),
            h('button', { class: 'btn sec', onclick: reiniciar }, '↺ Volver a empezar para explorar otro camino'));
          return;
        }
        const opciones = h('ol', { class: 'opciones-host' }, e.opciones.map((o, i) => {
          const destino = escena(privado.historia, o.destino);
          return h('li', { class: j.fase === 'consecuencia' && i === j.elegida ? 'correcta' : '' },
            h('div', { class: 'pila-s' },
              h('span', null, h('b', null, letraOpcion(i)), ' ', o.texto, j.votos ? h('span', { class: 'mono muted' }, ` · ${j.votos[i]} votos`) : null),
              h('span', { class: 'muted chico' }, destino?.final ? `→ lleva a un ${(TIPOS_FINAL[destino.tipoFinal] || TIPOS_FINAL.neutro).nombre.toLowerCase()}` : '→ sigue la historia'),
              j.fase === 'votando' && h('button', { class: 'btn-link', onclick: () => elegir(i) }, 'Elegir esta')));
        }));
        if (j.fase === 'votando') {
          zonaVotos = h('p', { class: 'mono' });
          montar(el, h('div', { class: 'etiqueta' }, `Decisión ${j.recorrido.length + 1}`), h('p', { class: 'historia' }, e.texto),
            opciones, zonaVotos,
            h('button', { class: 'btn grande', onclick: cerrarVotacion }, 'Cerrar la votación'));
          return;
        }
        montar(el, h('p', { class: 'historia' }, e.texto), opciones,
          j.consecuencia && h('div', { class: 'aviso' }, h('b', null, 'Consecuencia: '), j.consecuencia),
          h('p', { class: 'muted chico' }, 'Buen momento para preguntar: ¿qué hubiera pasado con otra decisión?'),
          h('button', { class: 'btn grande', onclick: seguir }, 'Seguir la historia →'));
      },
      refrescar() {
        if (!zonaVotos) return;
        const votos = contarVotos(sala, sala.juego);
        zonaVotos.textContent = `Votos: ${votos.map((n, i) => `${letraOpcion(i)} ${n}`).join(' · ')}`;
      },
    });
    return v;
  },

  alumno(el, sala) {
    const mios = {};
    return vista({
      clave: () => `${sala.juego.fase}:${sala.juego.paso}`,
      dibujar() {
        const j = sala.juego;
        if (j.fase === 'intro') { montar(el, h('h2', null, '🧭 ', j.titulo), h('p', { class: 'historia' }, j.intro), esperando('La historia está por empezar')); return; }
        if (j.fase === 'final') {
          const t = TIPOS_FINAL[j.escena.tipoFinal] || TIPOS_FINAL.neutro;
          montar(el, h('div', { class: 'resultado ' + (j.escena.tipoFinal === 'bueno' ? 'bien' : j.escena.tipoFinal === 'malo' ? 'mal' : '') },
            h('div', { class: 'resultado-titulo' }, `${t.icono} Fin`), h('p', { class: 'historia' }, j.escena.texto)));
          return;
        }
        if (j.fase === 'consecuencia') {
          montar(el, h('div', { class: 'etiqueta' }, 'El curso eligió'),
            h('p', { class: 'pregunta-alumno' }, `${letraOpcion(j.elegida)}. ${j.escena.opciones[j.elegida]}`),
            mios[j.paso] !== undefined && h('p', { class: 'muted' }, mios[j.paso] === j.elegida ? 'Coincidiste con la mayoría.' : `Vos votaste la ${letraOpcion(mios[j.paso])}.`),
            j.consecuencia && h('div', { class: 'aviso' }, j.consecuencia));
          return;
        }
        const estado = h('p', { class: 'muted chico centro' }, mios[j.paso] !== undefined ? 'Tu voto quedó registrado. Podés cambiarlo.' : '¿Qué harían?');
        const botones = j.escena.opciones.map((o, i) => h('button', {
          class: 'btn-voto opcion-aventura' + (mios[j.paso] === i ? ' elegido' : ''),
          onclick: async (ev) => {
            mios[j.paso] = i;
            botones.forEach((b) => b.classList.toggle('elegido', b === ev.currentTarget));
            estado.textContent = 'Tu voto quedó registrado. Podés cambiarlo.';
            vibrar(30);
            try { await sala.responder({ ronda: j.paso, valor: String(i) }); } catch (err) { toast(err.message, 'error'); }
          },
        }, h('b', null, letraOpcion(i) + '. '), o));
        montar(el, h('p', { class: 'historia' }, j.escena.texto), h('div', { class: 'pila-s' }, botones), estado);
      },
    });
  },

  tv(el, sala) {
    let zonaVotos = null;
    return vista({
      clave: () => `${sala.juego.fase}:${sala.juego.paso}`,
      dibujar() {
        const j = sala.juego;
        zonaVotos = null;
        const cab = h('div', { class: 'tv-cabecera' }, h('span', { class: 'tv-etiqueta' }, `🧭 ${j.titulo}${j.fase === 'votando' || j.fase === 'consecuencia' ? ` · decisión ${j.recorrido.length + (j.fase === 'consecuencia' ? 0 : 1)}` : ''}`));
        if (j.fase === 'intro') {
          montar(el, h('div', { class: 'tv-centro' }, h('div', { class: 'tv-etiqueta' }, 'Elegí tu propia aventura'), h('h1', { class: 'tv-titulo enorme' }, j.titulo), h('p', { class: 'tv-historia' }, j.intro)));
          return;
        }
        if (j.fase === 'final') {
          sonido('fin');
          const t = TIPOS_FINAL[j.escena.tipoFinal] || TIPOS_FINAL.neutro;
          montar(el, cab, h('div', { class: 'tv-centro' },
            h('div', { class: 'tv-etiqueta' }, `${t.icono} ${t.nombre}`),
            h('p', { class: 'tv-historia' }, j.escena.texto),
            h('ol', { class: 'tv-recorrido' }, j.recorrido.map((r) => h('li', null, h('b', null, r.opcion), h('span', { class: 'tv-muted' }, ` · ${r.votos} de ${r.total} votos`)))),
            h('p', { class: 'tv-sub' }, `Esta historia tiene ${j.finales} finales. ¿Qué hubiera pasado con otras decisiones?`)));
          return;
        }
        const cerrada = j.fase === 'consecuencia';
        const total = cerrada ? Math.max(1, j.votos.reduce((a, b) => a + b, 0)) : 1;
        montar(el, cab,
          h('p', { class: 'tv-historia izq' }, j.escena.texto),
          h('div', { class: 'tv-aventura-ops' }, j.escena.opciones.map((o, i) => h('div', { class: 'tv-aventura-op' + (cerrada ? (i === j.elegida ? ' elegida' : ' apagada') : '') },
            h('span', { class: 'op-letra' }, letraOpcion(i)), h('span', { class: 'tv-op-txt' }, o),
            cerrada && h('span', { class: 'tv-op-n' }, `${Math.round((100 * j.votos[i]) / total)}%`)))),
          cerrada && j.consecuencia && h('div', { class: 'tv-consecuencia' }, j.consecuencia),
          !cerrada && (zonaVotos = h('p', { class: 'tv-sub' })));
        if (cerrada) sonido('bien');
      },
      refrescar() {
        if (!zonaVotos) return;
        const n = sala.respuestasJuego(sala.juego.paso).size;
        zonaVotos.textContent = `${n} ${n === 1 ? 'voto' : 'votos'} · votá desde tu celular`;
      },
    });
  },
};
