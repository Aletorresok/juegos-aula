// Piezas compartidas por los juegos.
import { h, montar } from '../util.js';
import { itemsDe, TIPOS } from '../bancos.js';

// Vista que se redibuja completa solo cuando cambia su «clave» (fase, ronda…)
// y en el resto de los cambios solo refresca lo necesario (contadores, barras).
export function vista({ clave, dibujar, refrescar, destruir }) {
  let ultima = null;
  let limpiezas = [];
  const limpiar = () => { limpiezas.forEach((f) => { try { f(); } catch { /* nada */ } }); limpiezas = []; };
  const alLimpiar = (f) => limpiezas.push(f);
  return {
    actualizar(motivo) {
      const k = clave();
      if (k !== ultima) {
        ultima = k;
        limpiar();
        dibujar(alLimpiar);
      }
      refrescar?.(motivo);
    },
    destruir() { limpiar(); destruir?.(); },
  };
}

// Selector de banco para la configuración de un juego.
export function selectorBanco(bancos, tipo, minimo = 1) {
  const aptos = bancos.filter((b) => itemsDe(b, tipo).length >= minimo);
  const nombreTipo = TIPOS[tipo].nombre.toLowerCase();
  if (!aptos.length) {
    return {
      el: h('p', { class: 'aviso' }, `Necesitás un banco con al menos ${minimo} ${nombreTipo}. Crealo en «Mis bancos» (o usá el banco de ejemplo).`),
      banco: () => null,
    };
  }
  const sel = h('select', { class: 'campo', id: 'cfg-banco' },
    aptos.map((b) => h('option', { value: b.id }, `${b.titulo} — ${itemsDe(b, tipo).length} ${nombreTipo}`)));
  return {
    el: h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Banco'), sel),
    banco: () => aptos.find((b) => b.id === sel.value) || null,
  };
}

export function selector(id, etiqueta, opciones, valor) {
  const sel = h('select', { class: 'campo', id },
    opciones.map(([v, t]) => h('option', { value: String(v), selected: String(v) === String(valor) }, t)));
  return { el: h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, etiqueta), sel), valor: () => sel.value };
}

export function pildoraEquipo(eq, extra = '') {
  if (!eq) return h('span', { class: 'pildora sin-equipo' }, 'Sin equipo');
  return h('span', { class: 'pildora', style: { '--c': eq.color } }, eq.nombre, extra);
}

// Tabla de posiciones compacta.
export function marcador(sala, { destacar } = {}) {
  const eqs = sala.equipos();
  return h('div', { class: 'marcador' }, eqs.map((e) =>
    h('div', { class: 'marcador-eq' + (e.id === destacar ? ' destacado' : ''), style: { '--c': e.color } },
      h('span', { class: 'marcador-nombre' }, e.nombre),
      h('span', { class: 'marcador-pts' }, e.puntos))));
}

// Ranking final con posiciones.
export function ranking(sala) {
  const eqs = [...sala.equipos()].sort((a, b) => b.puntos - a.puntos);
  let pos = 0, ant = null;
  return h('ol', { class: 'ranking' }, eqs.map((e, i) => {
    if (e.puntos !== ant) { pos = i + 1; ant = e.puntos; }
    return h('li', { style: { '--c': e.color } },
      h('span', { class: 'rk-pos' }, pos + '°'),
      h('span', { class: 'rk-nombre' }, e.nombre),
      h('span', { class: 'rk-pts' }, e.puntos + ' pts'));
  }));
}

export function esperando(texto, sub) {
  return h('div', { class: 'esperando' },
    h('div', { class: 'pulso' }),
    h('p', { class: 'grande' }, texto),
    sub && h('p', { class: 'muted' }, sub));
}

export { h, montar };
