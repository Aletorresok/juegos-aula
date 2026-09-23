// Bancos de contenido del docente: términos, preguntas y pares de conceptos.
import { db, doc, collection, query, where, getDocs, setDoc, deleteDoc, serverTimestamp } from './fb.js';
import { h, montar, toast, confirmar, idAzar } from './util.js';

export const TIPOS = {
  termino: {
    nombre: 'Términos', singular: 'término',
    ayuda: 'Un término con su definición. Lo usan el Rosco y (como pista) otros juegos.',
    campos: [['termino', 'Término', 'cloroplasto'], ['definicion', 'Definición', 'Orgánulo donde ocurre la fotosíntesis']],
    formato: 'término [TAB] definición',
    ejemploPegado: 'cloroplasto\tOrgánulo donde ocurre la fotosíntesis\nmitocondria\tOrgánulo que produce la energía de la célula',
    nota: 'Si hay más de una respuesta válida, separalas con / (ej.: ADN / ácido desoxirribonucleico).',
  },
  pregunta: {
    nombre: 'Preguntas', singular: 'pregunta',
    ayuda: 'Pregunta con una respuesta correcta y hasta 3 incorrectas. La usa el Quiz.',
    campos: [['pregunta', 'Pregunta', '¿Qué orgánulo produce la energía?'], ['correcta', 'Respuesta correcta', 'mitocondria'],
      ['inc1', 'Incorrecta 1', 'ribosoma'], ['inc2', 'Incorrecta 2 (opcional)', 'vacuola'], ['inc3', 'Incorrecta 3 (opcional)', 'núcleo']],
    formato: 'pregunta [TAB] correcta [TAB] incorrecta [TAB] incorrecta [TAB] incorrecta',
    ejemploPegado: '¿Qué orgánulo produce la energía?\tmitocondria\tribosoma\tvacuola\tnúcleo',
    nota: 'Poné siempre la correcta en la segunda columna: el orden de las opciones se mezcla al jugar.',
  },
  par: {
    nombre: 'Pares parecidos', singular: 'par',
    ayuda: 'Dos conceptos que se suelen confundir. Los usa el Impostor.',
    campos: [['a', 'Concepto A', 'mitosis'], ['b', 'Concepto B', 'meiosis']],
    formato: 'concepto A [TAB] concepto B',
    ejemploPegado: 'mitosis\tmeiosis\nósmosis\tdifusión',
    nota: 'Funciona mejor si los dos conceptos son del mismo tema pero distintos en algo importante.',
  },
  encuesta: {
    nombre: 'Encuestas', singular: 'encuesta',
    ayuda: 'Una pregunta con las respuestas más dichas y sus puntos. La usa «El curso dice».',
    campos: [['pregunta', 'Pregunta', 'Nombrá un derecho del trabajador'],
      ['respuestas', 'Respuestas (una por línea, con sus puntos)', 'vacaciones = 30\naguinaldo = 25\nobra social = 15']],
    formato: 'pregunta [TAB] respuesta = puntos [TAB] respuesta = puntos [TAB] …',
    ejemploPegado: 'Nombrá un derecho del trabajador\tvacaciones = 30\taguinaldo = 25\tobra social = 15',
    nota: 'Hasta 8 respuestas. Si no ponés puntos, se asignan de mayor a menor según el orden. Para aceptar variantes usá / (ej.: sueldo / salario = 20).',
  },
};

const PUNTOS_POR_ORDEN = [30, 25, 20, 15, 10, 8, 6, 4];

// «vacaciones / vacaciones pagas = 30» → { texto, puntos }
export function leerRespuestas(lineas) {
  const out = lineas.map((l) => String(l).trim()).filter(Boolean).slice(0, 8).map((l, i) => {
    const m = l.match(/^(.*?)\s*[=:]\s*(\d+)\s*$/);
    return m ? { texto: m[1].trim(), puntos: Number(m[2]) } : { texto: l, puntos: PUNTOS_POR_ORDEN[i] };
  }).filter((r) => r.texto);
  return out.sort((a, b) => b.puntos - a.puntos);
}

export function itemsDe(banco, tipo) {
  return (banco?.items || []).filter((i) => i.tipo === tipo);
}

export function resumenBanco(b) {
  return Object.entries(TIPOS)
    .map(([t, d]) => [itemsDe(b, t).length, d])
    .filter(([n]) => n > 0)
    .map(([n, d]) => `${n} ${n === 1 ? d.singular : d.nombre.toLowerCase()}`)
    .join(' · ') || 'Vacío';
}

export async function misBancos(uid) {
  const snap = await getDocs(query(collection(db, 'bancos'), where('owner', '==', uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.actualizado?.toMillis?.() || 0) - (a.actualizado?.toMillis?.() || 0));
}

export async function guardarBanco(uid, banco) {
  const id = banco.id || idAzar(12);
  const { id: _omitido, ...datos } = banco;
  await setDoc(doc(db, 'bancos', id), { ...datos, owner: uid, actualizado: serverTimestamp() });
  return id;
}

export function borrarBanco(id) {
  return deleteDoc(doc(db, 'bancos', id));
}

// Convierte texto pegado (desde una planilla o escrito a mano) en ítems.
export function leerPegado(tipo, texto) {
  const items = [];
  const errores = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return;
    const sep = linea.includes('\t') ? '\t' : linea.includes('|') ? '|' : ';';
    const c = linea.split(sep).map((x) => x.trim());
    if (tipo === 'termino' && c[0] && c[1]) items.push({ tipo, termino: c[0], definicion: c.slice(1).join(' ').trim() });
    else if (tipo === 'par' && c[0] && c[1]) items.push({ tipo, a: c[0], b: c[1] });
    else if (tipo === 'encuesta' && c[0] && c[1]) items.push({ tipo, pregunta: c[0], respuestas: leerRespuestas(c.slice(1)) });
    else if (tipo === 'pregunta' && c[0] && c[1] && c[2]) {
      items.push({ tipo, pregunta: c[0], correcta: c[1], incorrectas: c.slice(2, 5).filter(Boolean) });
    } else errores.push(i + 1);
  });
  return { items, errores };
}

function textoItem(it) {
  if (it.tipo === 'termino') return [h('b', null, it.termino), ' — ', it.definicion];
  if (it.tipo === 'par') return [h('b', null, it.a), ' / ', h('b', null, it.b)];
  if (it.tipo === 'encuesta') return [h('b', null, it.pregunta), h('br'), h('span', { class: 'muted' }, it.respuestas.map((r) => `${r.texto} (${r.puntos})`).join(' · '))];
  return [h('b', null, it.pregunta), h('br'), h('span', { class: 'ok-txt' }, '✓ ' + it.correcta), ' · ',
    h('span', { class: 'muted' }, it.incorrectas.join(' · '))];
}

function itemDesdeForm(tipo, v) {
  if (tipo === 'termino') return v.termino && v.definicion ? { tipo, termino: v.termino, definicion: v.definicion } : null;
  if (tipo === 'par') return v.a && v.b ? { tipo, a: v.a, b: v.b } : null;
  if (tipo === 'encuesta') {
    const respuestas = leerRespuestas(v.respuestas.split(/\r?\n/));
    return v.pregunta && respuestas.length >= 2 ? { tipo, pregunta: v.pregunta, respuestas } : null;
  }
  const incorrectas = [v.inc1, v.inc2, v.inc3].filter(Boolean);
  return v.pregunta && v.correcta && incorrectas.length ? { tipo, pregunta: v.pregunta, correcta: v.correcta, incorrectas } : null;
}

function valoresDeItem(it) {
  if (it.tipo === 'encuesta') return { ...it, respuestas: it.respuestas.map((r) => `${r.texto} = ${r.puntos}`).join('\n') };
  if (it.tipo !== 'pregunta') return it;
  const [inc1 = '', inc2 = '', inc3 = ''] = it.incorrectas;
  return { ...it, inc1, inc2, inc3 };
}

// Editor de un banco. `alSalir` se llama al volver (con o sin cambios guardados).
export function editorBanco(el, uid, bancoInicial, alSalir) {
  const banco = structuredClone(bancoInicial || { titulo: '', materia: '', curso: '', items: [] });
  let tipo = 'termino';
  let editando = -1; // índice dentro de banco.items
  let cambios = false;

  const titulo = h('input', { class: 'campo', id: 'banco-titulo', placeholder: 'Ej.: La célula', value: banco.titulo, maxlength: 80 });
  const materia = h('input', { class: 'campo', id: 'banco-materia', placeholder: 'Ej.: Biología', value: banco.materia, maxlength: 40 });
  const curso = h('input', { class: 'campo', id: 'banco-curso', placeholder: 'Ej.: 2° año', value: banco.curso, maxlength: 30 });
  [titulo, materia, curso].forEach((i) => i.addEventListener('input', () => { cambios = true; }));

  const zonaTabs = h('div', { class: 'tabs', role: 'tablist' });
  const zonaTipo = h('div', { class: 'pila' });

  async function guardar() {
    banco.titulo = titulo.value.trim();
    banco.materia = materia.value.trim();
    banco.curso = curso.value.trim();
    if (!banco.titulo) { toast('Poné un nombre al banco', 'error'); titulo.focus(); return; }
    try {
      banco.id = await guardarBanco(uid, banco);
      cambios = false;
      toast('Banco guardado', 'ok');
    } catch (e) { toast('No se pudo guardar: ' + (e.code || e.message), 'error'); }
  }

  async function volver() {
    if (cambios && !(await confirmar({ titulo: '¿Salir sin guardar?', texto: 'Hay cambios en este banco que no guardaste.', ok: 'Salir sin guardar', peligro: true }))) return;
    alSalir();
  }

  function dibujarTabs() {
    montar(zonaTabs, Object.entries(TIPOS).map(([t, d]) =>
      h('button', { class: 'tab', role: 'tab', 'aria-selected': String(t === tipo), onclick: () => { tipo = t; editando = -1; dibujar(); } },
        d.nombre, h('span', { class: 'tab-n' }, itemsDe(banco, t).length))));
  }

  function formulario() {
    const def = TIPOS[tipo];
    const previo = editando >= 0 ? valoresDeItem(banco.items[editando]) : {};
    const inputs = {};
    const form = h('form', { class: 'pila tarjeta suave', onsubmit: (e) => {
      e.preventDefault();
      const v = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()]));
      const it = itemDesdeForm(tipo, v);
      if (!it) { toast('Completá los campos obligatorios', 'error'); return; }
      if (editando >= 0) banco.items[editando] = it; else banco.items.push(it);
      editando = -1; cambios = true; dibujar();
      zonaTipo.querySelector('input,textarea')?.focus();
    } },
    h('div', { class: 'etiqueta' }, editando >= 0 ? 'Editar ' + def.singular : 'Agregar ' + def.singular),
    def.campos.map(([k, label, ph]) => {
      const largo = k === 'definicion' || k === 'pregunta' || k === 'respuestas';
      inputs[k] = h(largo ? 'textarea' : 'input', { class: 'campo', id: `item-${k}`, placeholder: ph, rows: k === 'respuestas' ? 6 : largo ? 2 : null, value: previo[k] || '' });
      if (largo) inputs[k].value = previo[k] || '';
      return h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, label), inputs[k]);
    }),
    h('div', { class: 'fila' },
      h('button', { class: 'btn', type: 'submit' }, editando >= 0 ? 'Guardar cambio' : 'Agregar'),
      editando >= 0 && h('button', { class: 'btn sec', type: 'button', onclick: () => { editando = -1; dibujar(); } }, 'Cancelar')));
    return form;
  }

  function pegar() {
    const def = TIPOS[tipo];
    const area = h('textarea', { class: 'campo mono', id: 'pegado', rows: 8, placeholder: def.ejemploPegado });
    const cerrarHoja = hojaPegado(area, def, () => {
      const { items, errores } = leerPegado(tipo, area.value);
      if (!items.length) { toast('No encontré filas válidas. Revisá el formato.', 'error'); return; }
      banco.items.push(...items); cambios = true; cerrarHoja(); dibujar();
      toast(`Se agregaron ${items.length}` + (errores.length ? ` · se saltearon las filas ${errores.join(', ')}` : ''), 'ok');
    });
  }

  function dibujar() {
    dibujarTabs();
    const def = TIPOS[tipo];
    const lista = banco.items.map((it, i) => [it, i]).filter(([it]) => it.tipo === tipo);
    montar(zonaTipo,
      h('p', { class: 'muted' }, def.ayuda),
      formulario(),
      h('div', { class: 'fila entre' },
        h('div', { class: 'etiqueta' }, `${lista.length} ${lista.length === 1 ? def.singular : def.nombre.toLowerCase()}`),
        h('button', { class: 'btn sec chico', onclick: pegar }, 'Pegar desde planilla')),
      lista.length
        ? h('ol', { class: 'lista-items' }, lista.map(([it, i]) => h('li', { class: i === editando ? 'activo' : '' },
          h('div', { class: 'item-txt' }, textoItem(it)),
          h('div', { class: 'fila nowrap' },
            h('button', { class: 'btn-icono', 'aria-label': 'Editar', title: 'Editar', onclick: () => { editando = i; dibujar(); zonaTipo.scrollIntoView({ behavior: 'smooth' }); } }, '✎'),
            h('button', { class: 'btn-icono', 'aria-label': 'Borrar', title: 'Borrar', onclick: () => { banco.items.splice(i, 1); editando = -1; cambios = true; dibujar(); } }, '🗑')))))
        : h('p', { class: 'vacio' }, 'Todavía no hay ' + def.nombre.toLowerCase() + '.'));
  }

  montar(el,
    h('div', { class: 'fila entre' },
      h('button', { class: 'btn-link', onclick: volver }, '← Mis bancos'),
      h('button', { class: 'btn', onclick: guardar }, 'Guardar banco')),
    h('h2', null, bancoInicial?.id ? 'Editar banco' : 'Nuevo banco'),
    h('div', { class: 'grilla-3' },
      h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Nombre'), titulo),
      h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Materia'), materia),
      h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Curso'), curso)),
    zonaTabs,
    zonaTipo);
  dibujar();
}

function hojaPegado(area, def, alAgregar) {
  const fondo = h('div', { class: 'modal-fondo' });
  const cerrar = () => fondo.remove();
  montar(fondo, h('div', { class: 'modal ancho', role: 'dialog', 'aria-modal': 'true' },
    h('h3', null, 'Pegar ' + def.nombre.toLowerCase()),
    h('p', { class: 'muted' }, 'Copiá las filas de una planilla de Google o Excel y pegalas acá. Una fila por ítem, con las columnas en este orden:'),
    h('p', { class: 'mono formato' }, def.formato),
    h('p', { class: 'muted chico' }, def.nota, ' Si escribís a mano, podés separar las columnas con | o ;'),
    area,
    h('div', { class: 'fila fin' },
      h('button', { class: 'btn sec', onclick: cerrar }, 'Cancelar'),
      h('button', { class: 'btn', onclick: alAgregar }, 'Agregar'))));
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
  document.body.append(fondo);
  area.focus();
  return cerrar;
}
