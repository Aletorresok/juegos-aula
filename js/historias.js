// Historias con decisiones («Elegí tu propia aventura»): modelo y editor.
// Una historia es una lista de escenas; cada escena tiene opciones que llevan a otra
// escena, o es un final. La primera escena es el comienzo.
import { h, montar, toast } from './util.js';

export const TIPOS_FINAL = {
  bueno: { nombre: 'Final bueno', icono: '🌟' },
  neutro: { nombre: 'Final abierto', icono: '🤔' },
  malo: { nombre: 'Final malo', icono: '⚠️' },
};

let contador = 0;
const nuevoId = (escenas) => {
  let id;
  do { id = 'e' + (++contador); } while (escenas.some((e) => e.id === id));
  return id;
};

export function historiaVacia() {
  return { tipo: 'historia', titulo: '', intro: '', escenas: [{ id: 'e1', texto: '', final: false, tipoFinal: 'neutro', opciones: [{ texto: '', destino: '', consecuencia: '' }, { texto: '', destino: '', consecuencia: '' }] }] };
}

export function validarHistoria(hist) {
  if (!hist.titulo.trim()) return 'Poné un título a la historia.';
  const ids = new Set(hist.escenas.map((e) => e.id));
  for (const [i, e] of hist.escenas.entries()) {
    if (!e.texto.trim()) return `La escena ${i + 1} no tiene texto.`;
    if (e.final) continue;
    const ops = e.opciones.filter((o) => o.texto.trim());
    if (ops.length < 2) return `La escena ${i + 1} necesita al menos 2 opciones (o marcala como final).`;
    if (ops.some((o) => !ids.has(o.destino))) return `En la escena ${i + 1} hay una opción que no lleva a ninguna escena.`;
  }
  if (!hist.escenas.some((e) => e.final)) return 'La historia necesita al menos un final.';
  return null;
}

export function limpiarHistoria(hist) {
  return {
    ...hist,
    escenas: hist.escenas.map((e) => (e.final
      ? { id: e.id, texto: e.texto.trim(), final: true, tipoFinal: e.tipoFinal || 'neutro', opciones: [] }
      : { id: e.id, texto: e.texto.trim(), final: false, opciones: e.opciones.filter((o) => o.texto.trim()).map((o) => ({ texto: o.texto.trim(), destino: o.destino, consecuencia: (o.consecuencia || '').trim() })) })),
  };
}

// Editor de una historia completa.
export function editorHistoria(inicial, { alGuardar, alCancelar }) {
  const hist = structuredClone(inicial || historiaVacia());
  const raiz = h('div', { class: 'pila tarjeta suave' });
  const campo = (obj, k, etiqueta, { area = false, ph = '', filas = 3, max = 600 } = {}) => {
    const i = h(area ? 'textarea' : 'input', { class: 'campo', placeholder: ph, maxlength: max, rows: area ? filas : null });
    i.value = obj[k] ?? '';
    i.addEventListener('input', () => { obj[k] = i.value; });
    return etiqueta ? h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, etiqueta), i) : i;
  };
  const nombreEscena = (e) => {
    const i = hist.escenas.indexOf(e);
    const txt = e.texto.trim().slice(0, 40) || 'sin texto';
    return `Escena ${i + 1}${e.final ? ' (final)' : ''}: ${txt}${e.texto.length > 40 ? '…' : ''}`;
  };

  function selectorDestino(o, escena) {
    const sel = h('select', { class: 'campo' },
      h('option', { value: '' }, '¿A qué escena lleva?'),
      hist.escenas.filter((e) => e !== escena).map((e) => h('option', { value: e.id, selected: e.id === o.destino }, nombreEscena(e))),
      h('option', { value: '__nueva' }, '+ Crear una escena nueva'));
    sel.addEventListener('change', () => {
      if (sel.value === '__nueva') {
        const nueva = { id: nuevoId(hist.escenas), texto: '', final: false, tipoFinal: 'neutro', opciones: [{ texto: '', destino: '', consecuencia: '' }, { texto: '', destino: '', consecuencia: '' }] };
        hist.escenas.push(nueva);
        o.destino = nueva.id;
        dibujar();
        return;
      }
      o.destino = sel.value;
    });
    return sel;
  }

  function tarjetaEscena(e, i) {
    const final = h('input', { type: 'checkbox', checked: e.final });
    final.addEventListener('change', () => { e.final = final.checked; dibujar(); });
    const tipoFinal = h('select', { class: 'campo' }, Object.entries(TIPOS_FINAL).map(([k, t]) => h('option', { value: k, selected: k === (e.tipoFinal || 'neutro') }, `${t.icono} ${t.nombre}`)));
    tipoFinal.addEventListener('change', () => { e.tipoFinal = tipoFinal.value; });
    return h('fieldset', { class: 'candado-editor pila', id: 'escena-' + e.id },
      h('div', { class: 'fila entre' },
        h('legend', { class: 'etiqueta' }, i === 0 ? '▶ Escena 1 · comienzo' : `Escena ${i + 1}`),
        i > 0 && h('button', { type: 'button', class: 'btn-icono', 'aria-label': 'Borrar escena', onclick: () => {
          hist.escenas.splice(i, 1);
          hist.escenas.forEach((x) => x.opciones.forEach((o) => { if (o.destino === e.id) o.destino = ''; }));
          dibujar();
        } }, '🗑')),
      campo(e, 'texto', null, { area: true, ph: i === 0 ? 'Sos delegado de 2° B y la dirección anuncia que…' : 'Qué pasa en esta escena…', filas: 4, max: 1500 }),
      h('label', { class: 'check' }, final, 'Es un final'),
      e.final
        ? tipoFinal
        : h('div', { class: 'pila' },
          e.opciones.map((o, k) => h('div', { class: 'opcion-editor pila-s' },
            h('div', { class: 'fila nowrap' }, h('b', null, 'ABCD'[k]),
              campo(o, 'texto', null, { ph: 'Qué decide el curso', max: 160 }),
              e.opciones.length > 2 && h('button', { type: 'button', class: 'btn-icono', 'aria-label': 'Quitar opción', onclick: () => { e.opciones.splice(k, 1); dibujar(); } }, '✕')),
            selectorDestino(o, e),
            campo(o, 'consecuencia', null, { ph: 'Consecuencia que se muestra al elegirla (opcional, ideal para debatir)', max: 500 }))),
          e.opciones.length < 4 && h('button', { type: 'button', class: 'btn-link', onclick: () => { e.opciones.push({ texto: '', destino: '', consecuencia: '' }); dibujar(); } }, '+ Agregar opción')));
  }

  function dibujar() {
    montar(raiz,
      h('div', { class: 'etiqueta' }, inicial ? 'Editar historia' : 'Nueva historia'),
      campo(hist, 'titulo', 'Título', { ph: 'Mi primer trabajo', max: 80 }),
      campo(hist, 'intro', 'Presentación (opcional)', { area: true, ph: 'De qué trata la historia', filas: 2, max: 600 }),
      hist.escenas.map(tarjetaEscena),
      h('button', { type: 'button', class: 'btn sec', onclick: () => {
        hist.escenas.push({ id: nuevoId(hist.escenas), texto: '', final: false, tipoFinal: 'neutro', opciones: [{ texto: '', destino: '', consecuencia: '' }, { texto: '', destino: '', consecuencia: '' }] });
        dibujar();
      } }, '+ Agregar escena'),
      h('div', { class: 'fila' },
        h('button', { type: 'button', class: 'btn', onclick: () => {
          const error = validarHistoria(hist);
          if (error) { toast(error, 'error'); return; }
          alGuardar(limpiarHistoria(hist));
        } }, 'Guardar historia'),
        h('button', { type: 'button', class: 'btn sec', onclick: alCancelar }, 'Cancelar')));
  }
  dibujar();
  return raiz;
}
