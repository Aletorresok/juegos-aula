// Escape rooms: tipos de candado, comparación de códigos y editor de un escape.
import { h, montar, normalizar, toast } from './util.js';
import { qr } from './qr.js';

export const COLORES = [
  { id: 'rojo', nombre: 'Rojo', color: '#D8434B' },
  { id: 'azul', nombre: 'Azul', color: '#2E6FE4' },
  { id: 'verde', nombre: 'Verde', color: '#2BA36B' },
  { id: 'amarillo', nombre: 'Amarillo', color: '#F2C94C' },
  { id: 'violeta', nombre: 'Violeta', color: '#8A4FD8' },
  { id: 'naranja', nombre: 'Naranja', color: '#E4822E' },
];

export const FLECHAS = [
  { id: 'arriba', nombre: 'Arriba', simbolo: '↑' },
  { id: 'derecha', nombre: 'Derecha', simbolo: '→' },
  { id: 'abajo', nombre: 'Abajo', simbolo: '↓' },
  { id: 'izquierda', nombre: 'Izquierda', simbolo: '←' },
];

export const TIPOS_CANDADO = {
  numero: { nombre: 'Numérico', ayuda: 'Un código de números, por ejemplo un año o el resultado de una cuenta.' },
  palabra: { nombre: 'Palabra', ayuda: 'Una palabra o frase corta. Separá con / si aceptás variantes.' },
  direccion: { nombre: 'Direccional', ayuda: 'Una secuencia de flechas.' },
  color: { nombre: 'Colores', ayuda: 'Una secuencia de colores.' },
};

// Secuencias de flechas y colores se guardan como texto: "arriba,abajo,derecha".
const partes = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

export function largoCandado(c) {
  if (c.tipo === 'numero') return String(c.respuesta).replace(/\D/g, '').length;
  if (c.tipo === 'palabra') return normalizar(String(c.respuesta).split('/')[0]).replace(/ /g, '').length;
  return partes(c.respuesta).length;
}

export function codigoCorrecto(tipo, intento, respuesta) {
  if (tipo === 'numero') return String(intento).replace(/\D/g, '') === String(respuesta).replace(/\D/g, '');
  if (tipo === 'palabra') {
    const i = normalizar(intento).replace(/ /g, '');
    return i.length > 0 && String(respuesta).split('/').some((r) => normalizar(r).replace(/ /g, '') === i);
  }
  return partes(intento).join(',') === partes(respuesta).join(',');
}

export function textoCodigo(tipo, valor) {
  if (tipo === 'direccion') return partes(valor).map((p) => FLECHAS.find((f) => f.id === p)?.simbolo || '?').join(' ');
  if (tipo === 'color') return partes(valor).map((p) => COLORES.find((c) => c.id === p)?.nombre || '?').join(' · ');
  return String(valor);
}

// Teclado para armar secuencias de flechas o colores. Devuelve { el, valor(), limpiar() }.
export function compositor(tipo, { max = 12, alCambiar } = {}) {
  let sec = [];
  const visor = h('div', { class: 'secuencia', 'aria-live': 'polite' });
  const opciones = tipo === 'direccion' ? FLECHAS : COLORES;
  const pintar = (avisar = true) => {
    montar(visor, sec.length
      ? sec.map((id) => {
        const o = opciones.find((x) => x.id === id);
        return tipo === 'direccion'
          ? h('span', { class: 'sec-flecha' }, o.simbolo)
          : h('span', { class: 'sec-color', style: { background: o.color }, title: o.nombre });
      })
      : h('span', { class: 'muted chico' }, tipo === 'direccion' ? 'Tocá las flechas en orden' : 'Tocá los colores en orden'));
    if (avisar) alCambiar?.(sec.join(','));
  };
  const botones = opciones.map((o) => h('button', {
    type: 'button', class: tipo === 'direccion' ? 'tecla-flecha' : 'tecla-color', 'aria-label': o.nombre, title: o.nombre,
    style: tipo === 'color' ? { background: o.color } : null,
    onclick: () => { if (sec.length < max) { sec.push(o.id); pintar(); } },
  }, tipo === 'direccion' ? o.simbolo : ''));
  const el = h('div', { class: 'pila-s compositor' }, visor,
    h('div', { class: 'teclas ' + tipo }, botones,
      h('button', { type: 'button', class: 'tecla-borrar', 'aria-label': 'Borrar la última', onclick: () => { sec.pop(); pintar(); } }, '⌫')));
  pintar(false);
  return {
    el,
    valor: () => sec.join(','),
    fijar: (v) => { sec = partes(v); pintar(false); },
    limpiar: () => { sec = []; pintar(); },
  };
}

// Achica una imagen para que entre en la base de datos (≈100 KB como máximo).
export function achicarImagen(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer la imagen'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida'));
      img.onload = () => {
        let lado = 900, calidad = 0.72, url = '';
        for (let i = 0; i < 6; i++) {
          const escala = Math.min(1, lado / Math.max(img.width, img.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * escala);
          cv.height = Math.round(img.height * escala);
          const ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, cv.width, cv.height);
          ctx.drawImage(img, 0, 0, cv.width, cv.height);
          url = cv.toDataURL('image/jpeg', calidad);
          if (url.length < 140000) break;
          lado *= 0.8; calidad = Math.max(0.45, calidad - 0.08);
        }
        resolve(url);
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

function editorImagen(c) {
  const vista = h('div', { class: 'imagen-vista' });
  const url = h('input', { class: 'campo', type: 'url', placeholder: 'o pegá el link de una imagen (https://…)' });
  const pintar = () => {
    montar(vista, c.imagen
      ? [h('img', { src: c.imagen, alt: 'Imagen del desafío' }), h('button', { type: 'button', class: 'btn-link peligro', onclick: () => { delete c.imagen; url.value = ''; pintar(); } }, 'Quitar imagen')]
      : h('span', { class: 'muted chico' }, 'Sin imagen'));
  };
  const archivo = h('input', { type: 'file', accept: 'image/*', class: 'campo' });
  archivo.addEventListener('change', async () => {
    const f = archivo.files?.[0];
    if (!f) return;
    try { c.imagen = await achicarImagen(f); url.value = ''; pintar(); } catch (e) { toast(e.message, 'error'); }
    archivo.value = '';
  });
  if (c.imagen && !c.imagen.startsWith('data:')) url.value = c.imagen;
  url.addEventListener('change', () => {
    const v = url.value.trim();
    if (!v) { delete c.imagen; pintar(); return; }
    if (!/^https:\/\//.test(v)) { toast('El link tiene que empezar con https://', 'error'); return; }
    c.imagen = v; pintar();
  });
  pintar();
  return h('div', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Imagen del desafío (opcional)'), archivo, url, vista);
}

// Tarjetas para imprimir con las pistas físicas (cada una con un QR que contiene el texto).
export function imprimirTarjetas(escape) {
  const tarjetas = escape.candados.map((c, i) => [c, i]).filter(([c]) => c.fisica?.trim());
  if (!tarjetas.length) { toast('Este escape no tiene pistas físicas', 'error'); return; }
  const hoja = h('div', { id: 'impresion' },
    h('div', { class: 'imp-cabecera' }, h('b', null, escape.titulo), ' · pistas físicas para esconder en el aula'),
    h('div', { class: 'imp-grilla' }, tarjetas.map(([c, i]) => h('div', { class: 'imp-tarjeta' },
      h('div', { class: 'imp-titulo' }, `🔒 Candado ${i + 1}${c.titulo ? ' · ' + c.titulo : ''}`),
      qr(c.fisica.trim(), 'qr imp-qr'),
      h('div', { class: 'imp-pie' }, 'Escaneá con la cámara del celular')))));
  document.body.append(hoja);
  document.body.classList.add('imprimiendo');
  const limpiar = () => { hoja.remove(); document.body.classList.remove('imprimiendo'); };
  window.addEventListener('afterprint', limpiar, { once: true });
  setTimeout(() => { window.print(); setTimeout(limpiar, 1000); }, 100);
}

export function escapeVacio() {
  return { tipo: 'escape', titulo: '', intro: '', final: '', minutos: 30, candados: [candadoVacio()] };
}

function candadoVacio() {
  return { titulo: '', desafio: '', tipo: 'numero', respuesta: '', pistas: ['', ''] };
}

export function validarEscape(e) {
  if (!e.titulo.trim()) return 'Poné un título al escape.';
  if (!e.candados.length) return 'Agregá al menos un candado.';
  for (const [i, c] of e.candados.entries()) {
    if (!c.desafio.trim()) return `Al candado ${i + 1} le falta el desafío.`;
    if (!largoCandado(c)) return `Al candado ${i + 1} le falta la respuesta.`;
  }
  return null;
}

// Editor de un escape completo: historia, candados y final.
export function editorEscape(inicial, { alGuardar, alCancelar }) {
  const e = structuredClone(inicial || escapeVacio());
  e.candados.forEach((c) => { c.pistas = [c.pistas?.[0] || '', c.pistas?.[1] || '']; });
  const raiz = h('div', { class: 'pila tarjeta suave' });

  const campo = (obj, k, etiqueta, { area = false, ph = '', filas = 3, max = 600 } = {}) => {
    const i = h(area ? 'textarea' : 'input', { class: 'campo', placeholder: ph, maxlength: max, rows: area ? filas : null });
    i.value = obj[k] ?? '';
    i.addEventListener('input', () => { obj[k] = i.value; });
    return h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, etiqueta), i);
  };

  function tarjetaCandado(c, i) {
    const zonaResp = h('div');
    const pintarResp = () => {
      if (c.tipo === 'direccion' || c.tipo === 'color') {
        const comp = compositor(c.tipo, { alCambiar: (v) => { c.respuesta = v; } });
        comp.fijar(c.respuesta);
        montar(zonaResp, h('div', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Código correcto'), comp.el));
      } else {
        montar(zonaResp, campo(c, 'respuesta', 'Código correcto', { ph: c.tipo === 'numero' ? '1912' : 'representantes', max: 60 }));
      }
    };
    const tipoSel = h('select', { class: 'campo' }, Object.entries(TIPOS_CANDADO).map(([id, t]) => h('option', { value: id, selected: id === c.tipo }, t.nombre)));
    tipoSel.addEventListener('change', () => { c.tipo = tipoSel.value; c.respuesta = ''; pintarResp(); });
    pintarResp();
    const mover = (d) => { const j = i + d; if (j < 0 || j >= e.candados.length) return; [e.candados[i], e.candados[j]] = [e.candados[j], e.candados[i]]; dibujar(); };
    return h('fieldset', { class: 'candado-editor pila' },
      h('div', { class: 'fila entre' }, h('legend', { class: 'etiqueta' }, `🔒 Candado ${i + 1}`),
        h('div', { class: 'fila nowrap' },
          h('button', { type: 'button', class: 'btn-icono', 'aria-label': 'Subir', disabled: i === 0, onclick: () => mover(-1) }, '↑'),
          h('button', { type: 'button', class: 'btn-icono', 'aria-label': 'Bajar', disabled: i === e.candados.length - 1, onclick: () => mover(1) }, '↓'),
          h('button', { type: 'button', class: 'btn-icono', 'aria-label': 'Borrar candado', disabled: e.candados.length === 1, onclick: () => { e.candados.splice(i, 1); dibujar(); } }, '🗑'))),
      campo(c, 'titulo', 'Nombre del lugar u objeto (opcional)', { ph: 'La caja fuerte de la dirección', max: 60 }),
      campo(c, 'desafio', 'Desafío', { area: true, ph: 'El código es el año de la ley que estableció el voto secreto y obligatorio.', filas: 4, max: 1200 }),
      h('div', { class: 'grilla-2' },
        h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Tipo de candado'), tipoSel),
        zonaResp),
      h('div', { class: 'grilla-2' },
        campo(c.pistas, 0, 'Pista 1 (opcional)', { ph: 'Lleva el nombre de un presidente.', max: 300 }),
        campo(c.pistas, 1, 'Pista 2 (opcional)', { ph: 'Fue en 1912.', max: 300 })),
      opcionesAvanzadas(c));
  }

  function opcionesAvanzadas(c) {
    const partes = h('textarea', { class: 'campo', rows: 3, maxlength: 1200, placeholder: 'Una parte por línea. Ej.:\nEl primer número es la cantidad de poderes.\nEl segundo es el artículo de la iniciativa popular.' });
    partes.value = (c.partes || []).join('\n');
    partes.addEventListener('input', () => { c.partes = partes.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean); });
    const abierto = !!(c.recompensa || c.partes?.length || c.fisica || c.imagen);
    return h('details', { class: 'mas-opciones', open: abierto },
      h('summary', null, 'Más opciones: recompensa, información dividida, imagen, pista física'),
      h('div', { class: 'pila' },
        campo(c, 'recompensa', 'Recompensa al abrirlo (opcional)', { ph: 'El primer dígito del código final es 4.', max: 300 }),
        h('p', { class: 'muted chico' }, 'Se muestra cuando el equipo abre el candado. Sirve para armar un candado final con lo que encontraron (en el modo cooperativo, lo ve todo el curso).'),
        h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Información dividida (opcional)'), partes),
        h('p', { class: 'muted chico' }, 'Cada integrante del equipo ve solo una de estas partes en su celular: tienen que hablar entre ellos para resolver el candado.'),
        editorImagen(c),
        campo(c, 'fisica', 'Pista física (opcional)', { area: true, ph: 'El código está debajo del escritorio del docente.', filas: 2, max: 500 }),
        h('p', { class: 'muted chico' }, 'Se imprime como tarjeta con un código QR para esconder en el aula. Al escanearlo con la cámara del celular aparece este texto.')));
  }

  function dibujar() {
    montar(raiz,
      h('div', { class: 'etiqueta' }, inicial ? 'Editar escape' : 'Nuevo escape'),
      campo(e, 'titulo', 'Título', { ph: 'El voto robado', max: 80 }),
      campo(e, 'intro', 'Historia inicial (se lee en la pantalla grande)', { area: true, ph: 'Alguien se llevó la urna…', filas: 4, max: 1200 }),
      h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Tiempo (minutos)'),
        (() => { const i = h('input', { class: 'campo', type: 'number', min: 5, max: 120 }); i.value = e.minutos; i.addEventListener('input', () => { e.minutos = Number(i.value) || 30; }); return i; })()),
      e.candados.map(tarjetaCandado),
      h('button', { type: 'button', class: 'btn sec', onclick: () => { e.candados.push(candadoVacio()); dibujar(); } }, '+ Agregar candado'),
      campo(e, 'final', 'Mensaje final (cuando escapan)', { area: true, ph: '¡Encontraron la urna!', filas: 3, max: 800 }),
      h('div', { class: 'fila' },
        h('button', { type: 'button', class: 'btn', onclick: () => {
          const error = validarEscape(e);
          if (error) { toast(error, 'error'); return; }
          e.candados.forEach((c) => { c.pistas = c.pistas.map((p) => p.trim()).filter(Boolean); });
          alGuardar(e);
        } }, 'Guardar escape'),
        h('button', { type: 'button', class: 'btn sec', onclick: alCancelar }, 'Cancelar')));
  }
  dibujar();
  return raiz;
}
