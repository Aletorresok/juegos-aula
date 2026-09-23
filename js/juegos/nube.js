// Nube de ideas: pregunta abierta, cada alumno manda hasta 3 palabras y se arma una nube.
// El docente ve la nube primero y decide cuándo mostrarla (y qué palabras ocultar).
import { h, montar, vista, selector } from './comun.js';
import { normalizar, toast, vibrar } from '../util.js';

// Palabras que se ocultan solas (el docente las puede volver a mostrar).
const OCULTAR = new Set(['boludo', 'boluda', 'pelotudo', 'pelotuda', 'puto', 'puta', 'mierda', 'concha', 'forro', 'forra',
  'verga', 'pija', 'culo', 'choto', 'trolo', 'mogolico', 'mogolica', 'idiota', 'tarado', 'tarada', 'sorete', 'garcha',
  'orto', 'cagon', 'hdp', 'ctm', 'lpm', 'pete', 'petero']);

const COLORES = ['var(--t1)', 'var(--t2)', 'var(--t3)', 'var(--t4)', 'var(--t5)', 'var(--t6)', 'var(--tv-tinta)'];

function hash(s) {
  let x = 0;
  for (const c of s) x = (x * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(x);
}

// Agrupa las palabras de todas las respuestas.
export function contarPalabras(respuestas) {
  const grupos = new Map();
  respuestas.forEach((r) => {
    (r.palabras || []).forEach((p) => {
      const clave = normalizar(p);
      if (!clave) return;
      const g = grupos.get(clave) || { clave, n: 0, formas: new Map() };
      g.n++;
      const forma = String(p).trim().toLowerCase();
      g.formas.set(forma, (g.formas.get(forma) || 0) + 1);
      grupos.set(clave, g);
    });
  });
  return [...grupos.values()].map((g) => ({
    clave: g.clave, n: g.n,
    texto: [...g.formas.entries()].sort((a, b) => b[1] - a[1])[0][0],
  }));
}

function oculta(j, clave) {
  if ((j.mostradas || []).includes(clave)) return false;
  return (j.ocultas || []).includes(clave) || OCULTAR.has(clave) || [...OCULTAR].some((m) => clave.split(' ').includes(m));
}

function nube(palabras, { alTocar, j, tamMax = 4.6 } = {}) {
  if (!palabras.length) return h('p', { class: 'vacio' }, 'Todavía no hay respuestas.');
  const max = Math.max(...palabras.map((p) => p.n));
  const orden = [...palabras].sort((a, b) => hash(a.clave) - hash(b.clave));
  return h('div', { class: 'nube' }, orden.map((p) => {
    const tam = 1 + (tamMax - 1) * Math.sqrt(p.n / max);
    const tachada = j && oculta(j, p.clave);
    return h(alTocar ? 'button' : 'span', {
      class: 'nube-palabra' + (tachada ? ' tachada' : ''),
      style: { fontSize: tam + 'em', color: COLORES[hash(p.clave) % COLORES.length] },
      title: `${p.n} ${p.n === 1 ? 'vez' : 'veces'}`,
      onclick: alTocar ? () => alTocar(p) : null,
    }, p.texto);
  }));
}

export default {
  id: 'nube',
  nombre: 'Nube de ideas',
  icono: '☁️',
  resumen: 'Pregunta abierta: cada uno manda palabras y se arma una nube. Sin preparar nada.',
  tipos: [],

  configurar() {
    const pregunta = h('input', { class: 'campo', id: 'cfg-pregunta', maxlength: 140, placeholder: '¿Qué se te viene a la cabeza con «energía»?' });
    const max = selector('cfg-max-palabras', 'Palabras por alumno', [[1, '1'], [2, '2'], [3, '3']], 3);
    return {
      el: h('div', { class: 'pila' },
        h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Pregunta'), pregunta),
        max.el,
        h('p', { class: 'muted chico' }, 'Ideas: «Una palabra que resuma la clase de hoy», «¿Qué te quedó dando vueltas?», «¿Qué sabés sobre…?». La nube aparece en la pantalla grande recién cuando vos la mostrás.')),
      leer: () => {
        const p = pregunta.value.trim();
        if (!p) { toast('Escribí la pregunta', 'error'); pregunta.focus(); return null; }
        return { pregunta: p, max: Number(max.valor()) };
      },
    };
  },

  async iniciar(sala, { pregunta, max }) {
    await sala.iniciarJuego({ tipo: 'nube', ronda: 1, pregunta, max, fase: 'abierta', visible: false, ocultas: [], mostradas: [] });
  },

  host(el, sala) {
    let zonaNube, contador;
    async function alternar(p) {
      const j = sala.juego;
      const ocultas = new Set(j.ocultas || []);
      const mostradas = new Set(j.mostradas || []);
      if (oculta(j, p.clave)) { ocultas.delete(p.clave); mostradas.add(p.clave); }
      else { ocultas.add(p.clave); mostradas.delete(p.clave); }
      await sala.actualizarJuego({ ocultas: [...ocultas], mostradas: [...mostradas] });
    }
    async function nuevaPregunta() {
      const input = h('input', { class: 'campo', id: 'nueva-pregunta', maxlength: 140, placeholder: 'Nueva pregunta' });
      const form = h('form', { class: 'fila', onsubmit: async (e) => {
        e.preventDefault();
        const p = input.value.trim();
        if (!p) return;
        const j = sala.juego;
        await sala.actualizarJuego({ ronda: j.ronda + 1, pregunta: p, fase: 'abierta', visible: false, ocultas: [], mostradas: [] });
      } }, input, h('button', { class: 'btn', type: 'submit' }, 'Lanzar'));
      el.querySelector('.nueva-zona').replaceChildren(form);
      input.focus();
    }
    return vista({
      clave: () => `${sala.juego.ronda}:${sala.juego.fase}:${sala.juego.visible}`,
      dibujar() {
        const j = sala.juego;
        zonaNube = h('div', { class: 'nube-host' });
        contador = h('span', { class: 'mono' });
        montar(el,
          h('p', { class: 'pregunta-host' }, j.pregunta),
          h('div', { class: 'fila entre' }, h('span', null, contador, ' respondieron'),
            h('span', { class: 'muted chico' }, 'Tocá una palabra para ocultarla o mostrarla.')),
          zonaNube,
          h('div', { class: 'grilla-2' },
            h('button', { class: 'btn ' + (j.visible ? 'sec' : ''), onclick: () => sala.actualizarJuego({ visible: !j.visible }) },
              j.visible ? 'Ocultar de la pantalla' : 'Mostrar en la pantalla grande'),
            h('button', { class: 'btn sec', onclick: () => sala.actualizarJuego({ fase: j.fase === 'abierta' ? 'cerrada' : 'abierta' }) },
              j.fase === 'abierta' ? 'Cerrar respuestas' : 'Reabrir respuestas')),
          h('div', { class: 'nueva-zona' }, h('button', { class: 'btn-link', onclick: nuevaPregunta }, '+ Hacer otra pregunta')));
      },
      refrescar() {
        const j = sala.juego;
        const resp = sala.respuestasJuego(j.ronda);
        contador.textContent = resp.size;
        montar(zonaNube, nube(contarPalabras(resp), { alTocar: alternar, j, tamMax: 3 }));
      },
    });
  },

  alumno(el, sala) {
    let enviadas = [];
    let ronda = null;
    return vista({
      clave: () => `${sala.juego.ronda}:${sala.juego.fase}`,
      dibujar() {
        const j = sala.juego;
        if (ronda !== j.ronda) { ronda = j.ronda; enviadas = []; }
        const input = h('input', { class: 'campo grande', id: 'nube-palabra', maxlength: 30, autocomplete: 'off', placeholder: 'Escribí una palabra o frase corta' });
        const chips = h('div', { class: 'fila' });
        const estado = h('p', { class: 'muted chico' });
        const guardar = async () => {
          try { await sala.responder({ ronda: j.ronda, palabras: enviadas }); } catch (e) { toast(e.message, 'error'); }
        };
        const pintar = () => {
          montar(chips, enviadas.map((p, i) => h('span', { class: 'chip-palabra' }, p,
            j.fase === 'abierta' && h('button', { class: 'btn-icono chico', 'aria-label': 'Quitar ' + p, onclick: () => { enviadas.splice(i, 1); pintar(); guardar(); } }, '✕'))));
          const quedan = j.max - enviadas.length;
          estado.textContent = j.fase !== 'abierta' ? 'Las respuestas están cerradas.' : quedan > 0 ? `Podés mandar ${quedan} más.` : '¡Listo! Ya mandaste todas.';
          form.hidden = j.fase !== 'abierta' || quedan <= 0;
        };
        const form = h('form', { class: 'pila', onsubmit: (e) => {
          e.preventDefault();
          const p = input.value.trim().replace(/\s+/g, ' ');
          if (!p || enviadas.length >= j.max) return;
          if (enviadas.some((x) => normalizar(x) === normalizar(p))) { toast('Esa ya la mandaste'); return; }
          enviadas.push(p); input.value = ''; vibrar(30); pintar(); guardar(); input.focus();
        } }, input, h('button', { class: 'btn grande', type: 'submit' }, 'Enviar'));
        montar(el, h('p', { class: 'pregunta-alumno' }, j.pregunta), form, chips, estado);
        pintar();
      },
    });
  },

  tv(el, sala) {
    let zona;
    return vista({
      clave: () => `${sala.juego.ronda}:${sala.juego.visible}`,
      dibujar() {
        const j = sala.juego;
        zona = h('div', { class: 'tv-nube' });
        montar(el, h('div', { class: 'tv-cabecera' }, h('span', { class: 'tv-etiqueta' }, 'Nube de ideas')),
          h('div', { class: 'tv-pregunta' }, j.pregunta), zona);
      },
      refrescar() {
        const j = sala.juego;
        const resp = sala.respuestasJuego(j.ronda);
        if (!j.visible) {
          montar(zona, h('div', { class: 'tv-centro' },
            h('div', { class: 'tv-contador enorme' }, resp.size),
            h('p', { class: 'tv-sub' }, resp.size === 1 ? 'persona respondió' : 'personas respondieron'),
            h('p', { class: 'tv-sub muted' }, j.fase === 'abierta' ? 'Respondé desde tu celular' : 'Respuestas cerradas')));
          return;
        }
        const palabras = contarPalabras(resp).filter((p) => !oculta(j, p.clave));
        montar(zona, nube(palabras, { tamMax: 5 }));
      },
    });
  },
};
