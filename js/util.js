// Utilidades de interfaz y de texto compartidas por toda la app.

export const $ = (sel, raiz = document) => raiz.querySelector(sel);

// Construye elementos: h('button', { class: 'btn', onclick: fn }, 'Texto')
export function h(tag, attrs, ...hijos) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [p, val] of Object.entries(v)) {
          if (val == null) continue;
          if (p.startsWith('--')) el.style.setProperty(p, val); else el.style[p] = val;
        }
      }
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  agregar(el, hijos);
  return el;
}

function agregar(el, hijos) {
  for (const c of hijos) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) agregar(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function montar(el, ...hijos) {
  el.replaceChildren();
  agregar(el, hijos);
  return el;
}

// ── Avisos ──
let zonaToast;
export function toast(texto, tipo = '') {
  if (!zonaToast) {
    zonaToast = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(zonaToast);
  }
  const t = h('div', { class: 'toast ' + tipo }, texto);
  zonaToast.append(t);
  setTimeout(() => t.classList.add('fuera'), 3200);
  setTimeout(() => t.remove(), 3700);
}

// Confirmación propia (sin confirm() del navegador).
export function confirmar({ titulo, texto = '', ok = 'Aceptar', cancelar = 'Cancelar', peligro = false }) {
  return new Promise((resolve) => {
    const cerrar = (v) => { fondo.remove(); resolve(v); };
    const fondo = h('div', { class: 'modal-fondo', onclick: (e) => { if (e.target === fondo) cerrar(false); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        h('h3', null, titulo),
        texto && h('p', { class: 'muted' }, texto),
        h('div', { class: 'fila fin' },
          h('button', { class: 'btn sec', onclick: () => cerrar(false) }, cancelar),
          h('button', { class: 'btn ' + (peligro ? 'peligro' : ''), onclick: () => cerrar(true) }, ok))));
    document.body.append(fondo);
    fondo.querySelector('.btn:last-child').focus();
  });
}

// Hoja inferior / modal con contenido libre. Devuelve la función para cerrarla.
export function hoja(titulo, contenido, alCerrar) {
  const cerrar = () => { fondo.remove(); alCerrar?.(); };
  const fondo = h('div', { class: 'modal-fondo', onclick: (e) => { if (e.target === fondo) cerrar(); } },
    h('div', { class: 'modal ancho', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'fila entre' }, h('h3', null, titulo),
        h('button', { class: 'btn-icono', 'aria-label': 'Cerrar', onclick: cerrar }, '✕')),
      contenido));
  document.body.append(fondo);
  return cerrar;
}

// ── Texto ──
// Minúsculas, sin tildes (pero respetando la ñ), sin signos y sin espacios de más.
export function normalizar(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0001/g, 'ñ')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function distancia(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const ARTICULOS = /^(el|la|los|las|un|una|unos|unas|lo) /;

// ¿La respuesta escrita coincide con alguna de las aceptadas ("a / b")?
// Tolera tildes, mayúsculas, artículos y un error de tipeo en palabras largas.
export function respuestaCorrecta(escrita, aceptadas) {
  const r = normalizar(escrita).replace(ARTICULOS, '');
  if (!r) return false;
  return String(aceptadas).split('/').some((op) => {
    const o = normalizar(op).replace(ARTICULOS, '');
    if (!o) return false;
    if (r === o) return true;
    const tolerancia = o.length >= 10 ? 2 : o.length >= 5 ? 1 : 0;
    return distancia(r, o) <= tolerancia;
  });
}

export function mezclar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function idAzar(n = 8) {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

// Código de sala: 4 letras sin las que se confunden (I, L, O).
export function codigoSala() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

// ── Tiempo ──
export function segundos(ms) {
  return Math.max(0, Math.ceil(ms / 1000));
}

// Actualiza un elemento con los segundos que faltan hasta `hasta` (ms).
export function cuentaRegresiva(el, hasta, { alTerminar, cadaSegundo } = {}) {
  let terminado = false;
  const tic = () => {
    const falta = hasta - Date.now();
    el.textContent = segundos(falta);
    cadaSegundo?.(falta);
    if (falta <= 0 && !terminado) {
      terminado = true;
      clearInterval(t);
      alTerminar?.();
    }
  };
  const t = setInterval(tic, 250);
  tic();
  return () => clearInterval(t);
}

export function urlApp(params = '') {
  return location.origin + location.pathname + params;
}

export function letraOpcion(i) {
  return 'ABCDEF'[i];
}

// Sonidos cortos generados (sin archivos). Solo suenan después de un toque.
let audio;
export function sonido(tipo) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.connect(g); g.connect(audio.destination);
    const t = audio.currentTime;
    const tonos = { bien: [660, 990], mal: [220, 150], tic: [880, 880], fin: [523, 1046] };
    const [f1, f2] = tonos[tipo] || tonos.tic;
    o.type = tipo === 'mal' ? 'square' : 'sine';
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + 0.18);
    const dur = tipo === 'tic' ? 0.08 : 0.4;
    g.gain.setValueAtTime(tipo === 'mal' ? 0.08 : 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur);
  } catch { /* sin audio */ }
}

export function vibrar(ms = 80) {
  try { navigator.vibrate?.(ms); } catch { /* nada */ }
}

export function guardarLocal(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* nada */ }
}

export function leerLocal(clave, defecto = null) {
  try { const v = localStorage.getItem(clave); return v == null ? defecto : JSON.parse(v); } catch { return defecto; }
}
