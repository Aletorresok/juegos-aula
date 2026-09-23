// Ruleta: sortea a quién le toca (un alumno o un equipo) sin repetir.
import { h, montar, vista, selector, pildoraEquipo, esperando } from './comun.js';
import { mezclar, sonido, vibrar } from '../util.js';

const DURACION_GIRO = 3200;

export default {
  id: 'ruleta',
  nombre: '¿A quién le toca?',
  icono: '🎯',
  resumen: 'Sortea un alumno o un equipo para pasar al frente, sin repetir.',
  tipos: [],
  sinCelulares: true,

  configurar() {
    const modo = selector('cfg-modo', 'Sortear', [['alumno', 'Un alumno'], ['equipo', 'Un equipo']], 'alumno');
    const rep = selector('cfg-rep', 'Repetir', [['no', 'No repetir hasta que pasen todos'], ['si', 'Puede tocarle a cualquiera']], 'no');
    const lista = h('textarea', { class: 'campo', id: 'cfg-lista', rows: 4, placeholder: 'Opcional: pegá la lista del curso (un nombre por línea) si los chicos no están conectados.' });
    return {
      el: h('div', { class: 'pila' }, h('div', { class: 'grilla-2' }, modo.el, rep.el),
        h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Lista del curso (opcional)'), lista),
        h('p', { class: 'muted chico' }, 'Si no pegás una lista, se sortea entre los alumnos conectados a la sala.')),
      leer: () => ({
        modo: modo.valor(),
        sinRepetir: rep.valor() === 'no',
        lista: lista.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 200),
      }),
    };
  },

  async iniciar(sala, { modo, sinRepetir, lista }) {
    await sala.iniciarJuego({ tipo: 'ruleta', modo, sinRepetir, lista, ya: [], giro: 0, elegido: null, muestra: [], hasta: 0 });
  },

  host(el, sala) {
    function candidatos() {
      const j = sala.juego;
      if (j.modo === 'equipo') return sala.equipos().map((e) => ({ id: e.id, nombre: e.nombre, equipo: e.id }));
      if (j.lista?.length) return j.lista.map((n, i) => ({ id: 'l' + i, nombre: n, equipo: null }));
      return sala.listaJugadores().map((p) => ({ id: p.uid, nombre: p.nombre, equipo: p.equipo }));
    }
    async function girar() {
      const j = sala.juego;
      const todos = candidatos();
      if (!todos.length) return;
      let ya = j.sinRepetir ? j.ya.filter((id) => todos.some((c) => c.id === id)) : [];
      let libres = todos.filter((c) => !ya.includes(c.id));
      if (!libres.length) { ya = []; libres = todos; }
      const elegido = mezclar(libres)[0];
      const muestra = mezclar(todos).slice(0, 14).map((c) => c.nombre);
      await sala.actualizarJuego({
        giro: j.giro + 1, elegido, ya: j.sinRepetir ? [...ya, elegido.id] : [], muestra, hasta: Date.now() + DURACION_GIRO,
      });
    }
    return vista({
      clave: () => `${sala.juego.giro}`,
      dibujar() {
        const j = sala.juego;
        const todos = candidatos();
        const pasaron = todos.filter((c) => j.ya.includes(c.id));
        montar(el,
          j.elegido
            ? h('div', { class: 'tarjeta suave centro' }, h('div', { class: 'etiqueta' }, 'Le tocó a'),
              h('p', { class: 'grande' }, j.elegido.nombre), j.elegido.equipo && pildoraEquipo(sala.equipo(j.elegido.equipo)))
            : h('p', { class: 'muted' }, `Hay ${todos.length} ${j.modo === 'equipo' ? 'equipos' : 'nombres'} para sortear.`),
          h('button', { class: 'btn grande', onclick: girar, disabled: !todos.length }, '🎯 Girar'),
          j.sinRepetir && h('div', { class: 'pila-s' },
            h('div', { class: 'etiqueta' }, `Ya pasaron ${pasaron.length} de ${todos.length}`),
            pasaron.length > 0 && h('p', { class: 'muted chico' }, pasaron.map((c) => c.nombre).join(', ')),
            pasaron.length > 0 && h('button', { class: 'btn-link', onclick: () => sala.actualizarJuego({ ya: [] }) }, 'Empezar de nuevo la lista')));
      },
    });
  },

  alumno(el, sala) {
    return vista({
      clave: () => `${sala.juego.giro}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        if (!j.giro) { montar(el, esperando('La ruleta está por girar…', 'Mirá la pantalla grande.')); return; }
        const mostrar = () => {
          const yo = j.elegido.id === sala.uid || (j.modo === 'equipo' && j.elegido.id === sala.data.asignaciones?.[sala.uid]);
          if (yo) vibrar([100, 50, 100]);
          montar(el, h('div', { class: 'resultado ' + (yo ? 'bien' : '') },
            h('div', { class: 'resultado-titulo' }, yo ? (j.modo === 'equipo' ? '¡Le tocó a tu equipo!' : '¡Te tocó!') : `Le tocó a ${j.elegido.nombre}`)));
        };
        const falta = j.hasta - Date.now();
        if (falta > 0) {
          montar(el, esperando('Girando…'));
          const t = setTimeout(mostrar, falta);
          alLimpiar(() => clearTimeout(t));
        } else mostrar();
      },
    });
  },

  tv(el, sala) {
    return vista({
      clave: () => `${sala.juego.giro}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        const nombre = h('div', { class: 'tv-ruleta-nombre' });
        const detalle = h('div', { class: 'tv-sub' });
        montar(el, h('div', { class: 'tv-centro' }, h('div', { class: 'tv-etiqueta' }, '¿A quién le toca?'), nombre, detalle));
        if (!j.giro) { nombre.textContent = '🎯'; detalle.textContent = 'El docente gira la ruleta desde su celular.'; return; }
        const final = () => {
          nombre.textContent = j.elegido.nombre;
          nombre.classList.add('elegido');
          const eq = j.elegido.equipo && sala.equipo(j.elegido.equipo);
          if (eq) { nombre.style.color = eq.color; montar(detalle, pildoraEquipo(eq)); }
          sonido('fin');
        };
        const falta = j.hasta - Date.now();
        if (falta <= 0 || !j.muestra.length) { final(); return; }
        // Pasa nombres cada vez más lento hasta frenar en el elegido.
        let k = 0;
        let espera = 60;
        let t;
        const paso = () => {
          if (Date.now() >= j.hasta) { final(); return; }
          nombre.textContent = j.muestra[k++ % j.muestra.length];
          sonido('tic');
          espera = Math.min(420, espera * 1.12);
          t = setTimeout(paso, espera);
        };
        paso();
        alLimpiar(() => clearTimeout(t));
      },
    });
  },
};
