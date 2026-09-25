// Portal de clases: materiales (videos, presentaciones, documentos, archivos de Drive)
// para proyectar en la pantalla grande durante una clase.
import { db, doc, collection, query, where, getDocs, setDoc, deleteDoc, serverTimestamp } from './fb.js';
import { firebaseConfig } from './config.js';
import { h, montar, toast, confirmar, idAzar } from './util.js';

const ICONOS = { video: '🎬', youtube: '▶️', presentacion: '📊', documento: '📄', hoja: '📈', formulario: '📝', pdf: '📕', imagen: '🖼', archivo: '📎', carpeta: '📁', web: '🌐' };
const NOMBRES = { video: 'Video', youtube: 'Video de YouTube', presentacion: 'Presentación', documento: 'Documento', hoja: 'Planilla', formulario: 'Formulario', pdf: 'PDF', imagen: 'Imagen', archivo: 'Archivo de Drive', carpeta: 'Carpeta de Drive', web: 'Página web' };

export const iconoMaterial = (t) => ICONOS[t] || '📎';

// Reconoce un link y devuelve cómo mostrarlo: { tipo, embed, abrir, id? }.
export function analizarLink(texto) {
  const url = String(texto || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  let m;
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i))) {
    return { tipo: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0`, abrir: `https://www.youtube.com/watch?v=${m[1]}` };
  }
  if ((m = url.match(/docs\.google\.com\/presentation\/d\/([\w-]{10,})/i))) {
    return { tipo: 'presentacion', id: m[1], embed: `https://docs.google.com/presentation/d/${m[1]}/embed?start=false&loop=false`, abrir: `https://docs.google.com/presentation/d/${m[1]}/present` };
  }
  if ((m = url.match(/docs\.google\.com\/document\/d\/([\w-]{10,})/i))) {
    return { tipo: 'documento', id: m[1], embed: `https://docs.google.com/document/d/${m[1]}/preview`, abrir: `https://docs.google.com/document/d/${m[1]}/edit` };
  }
  if ((m = url.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]{10,})/i))) {
    return { tipo: 'hoja', id: m[1], embed: `https://docs.google.com/spreadsheets/d/${m[1]}/preview`, abrir: `https://docs.google.com/spreadsheets/d/${m[1]}/edit` };
  }
  if ((m = url.match(/docs\.google\.com\/forms\/d\/e\/([\w-]{10,})/i))) {
    return { tipo: 'formulario', embed: `https://docs.google.com/forms/d/e/${m[1]}/viewform?embedded=true`, abrir: `https://docs.google.com/forms/d/e/${m[1]}/viewform` };
  }
  if ((m = url.match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|embeddedfolderview\?id=)([\w-]{10,})/i))) {
    return { tipo: 'carpeta', id: m[1], embed: `https://drive.google.com/embeddedfolderview?id=${m[1]}#grid`, abrir: `https://drive.google.com/drive/folders/${m[1]}` };
  }
  if ((m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{10,})/i))) {
    return { tipo: 'archivo', id: m[1], embed: `https://drive.google.com/file/d/${m[1]}/preview`, abrir: `https://drive.google.com/file/d/${m[1]}/view` };
  }
  if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url)) return { tipo: 'imagen', embed: url, abrir: url };
  if (/\.pdf(\?.*)?$/i.test(url)) return { tipo: 'pdf', embed: url, abrir: url };
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) return { tipo: 'video', embed: url, abrir: url };
  return { tipo: 'web', embed: url, abrir: url };
}

// Tipo según el mimeType que devuelve Google Drive.
function desdeDrive(f) {
  const t = f.mimeType || '';
  if (t === 'application/vnd.google-apps.folder') return null;
  if (t === 'application/vnd.google-apps.presentation') return analizarLink(`https://docs.google.com/presentation/d/${f.id}/edit`);
  if (t === 'application/vnd.google-apps.document') return analizarLink(`https://docs.google.com/document/d/${f.id}/edit`);
  if (t === 'application/vnd.google-apps.spreadsheet') return analizarLink(`https://docs.google.com/spreadsheets/d/${f.id}/edit`);
  const base = analizarLink(`https://drive.google.com/file/d/${f.id}/view`);
  if (t.startsWith('video/')) base.tipo = 'video';
  else if (t === 'application/pdf') base.tipo = 'pdf';
  else if (t.startsWith('image/')) base.tipo = 'imagen-drive';
  return base;
}

// Lista los archivos de una carpeta pública de Drive (requiere la Google Drive API activada).
export async function archivosDeCarpeta(idCarpeta) {
  const q = encodeURIComponent(`'${idCarpeta}' in parents and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&orderBy=folder,name&pageSize=200&key=${firebaseConfig.apiKey}`;
  let r;
  try { r = await fetch(url); } catch { throw new Error('No se pudo conectar con Google Drive. Revisá la conexión a internet.'); }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const motivo = datos?.error?.message || r.statusText;
    if (/has not been used|is disabled|not been enabled/i.test(motivo)) throw new Error('La Google Drive API no está activada en el proyecto. Mientras tanto podés agregar la carpeta como material (se ve como grilla) o pegar los archivos uno por uno.');
    if (r.status === 404) throw new Error('No encontré la carpeta. Revisá que esté compartida como «Cualquier persona con el enlace».');
    throw new Error('Drive respondió: ' + motivo);
  }
  return (datos.files || []).map((f) => {
    const a = desdeDrive(f);
    if (!a) return null;
    return { ...a, tipo: a.tipo === 'imagen-drive' ? 'imagen' : a.tipo, titulo: f.name.replace(/\.[a-z0-9]{2,4}$/i, '') };
  }).filter(Boolean);
}

export function nuevoMaterial(link, titulo) {
  const a = analizarLink(link);
  if (!a) return null;
  return { id: idAzar(6), titulo: titulo || NOMBRES[a.tipo], tipo: a.tipo, embed: a.embed, abrir: a.abrir, notas: '' };
}

// Cómo se muestra un material dentro de la página.
export function visorMaterial(m, clase = 'visor') {
  if (m.tipo === 'imagen' && !m.embed.includes('drive.google.com')) {
    return h('div', { class: clase + ' visor-imagen' }, h('img', { src: m.embed, alt: m.titulo }));
  }
  if (m.tipo === 'video' && !m.embed.includes('drive.google.com')) {
    return h('div', { class: clase }, h('video', { src: m.embed, controls: true, playsinline: true }));
  }
  return h('div', { class: clase },
    h('iframe', { src: m.embed, title: m.titulo, allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture', allowfullscreen: true, loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin' }));
}

export async function misClases(uid) {
  const snap = await getDocs(query(collection(db, 'clases'), where('owner', '==', uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.actualizado?.toMillis?.() || 0) - (a.actualizado?.toMillis?.() || 0));
}

export async function guardarClase(uid, clase) {
  const id = clase.id || idAzar(12);
  const { id: _omitido, ...datos } = clase;
  await setDoc(doc(db, 'clases', id), { ...datos, owner: uid, actualizado: serverTimestamp() });
  return id;
}

export function borrarClase(id) {
  return deleteDoc(doc(db, 'clases', id));
}

// Editor de una clase: título y lista de materiales.
export function editorClase(el, uid, inicial, alSalir) {
  const clase = structuredClone(inicial || { titulo: '', materia: '', curso: '', materiales: [] });
  let cambios = false;
  const marcar = () => { cambios = true; };
  const campo = (k, ph, max = 80) => {
    const i = h('input', { class: 'campo', id: 'clase-' + k, placeholder: ph, maxlength: max });
    i.value = clase[k] || '';
    i.addEventListener('input', () => { clase[k] = i.value; marcar(); });
    return i;
  };
  const lista = h('ol', { class: 'lista-items materiales' });
  const link = h('input', { class: 'campo', id: 'material-link', type: 'url', placeholder: 'Pegá un link de Drive, YouTube, Presentaciones de Google…' });
  const titulo = h('input', { class: 'campo', id: 'material-titulo', placeholder: 'Título (opcional)', maxlength: 80 });
  const carpeta = h('input', { class: 'campo', id: 'carpeta-link', type: 'url', placeholder: 'Link de una carpeta de Google Drive' });

  function pintar() {
    montar(lista, clase.materiales.length
      ? clase.materiales.map((m, i) => {
        const tit = h('input', { class: 'campo', value: m.titulo, maxlength: 80, 'aria-label': 'Título del material' });
        tit.addEventListener('input', () => { m.titulo = tit.value; marcar(); });
        const notas = h('textarea', { class: 'campo', rows: 2, maxlength: 1500, placeholder: 'Notas para vos (solo las ves en tu celular mientras presentás)' });
        notas.value = m.notas || '';
        notas.addEventListener('input', () => { m.notas = notas.value; marcar(); });
        const mover = (d) => { const j = i + d; if (j < 0 || j >= clase.materiales.length) return; [clase.materiales[i], clase.materiales[j]] = [clase.materiales[j], clase.materiales[i]]; marcar(); pintar(); };
        return h('li', { class: 'material' },
          h('div', { class: 'pila-s', style: { flex: '1', minWidth: '0' } },
            h('div', { class: 'fila nowrap' }, h('span', { class: 'material-icono' }, iconoMaterial(m.tipo)), tit),
            notas,
            h('a', { class: 'muted chico quebrar', href: m.abrir, target: '_blank', rel: 'noopener' }, 'Abrir en otra pestaña ↗')),
          h('div', { class: 'pila-s' },
            h('button', { class: 'btn-icono', 'aria-label': 'Subir', disabled: i === 0, onclick: () => mover(-1) }, '↑'),
            h('button', { class: 'btn-icono', 'aria-label': 'Bajar', disabled: i === clase.materiales.length - 1, onclick: () => mover(1) }, '↓'),
            h('button', { class: 'btn-icono', 'aria-label': 'Borrar material', onclick: () => { clase.materiales.splice(i, 1); marcar(); pintar(); } }, '🗑')));
      })
      : h('p', { class: 'vacio' }, 'Todavía no hay materiales. Pegá un link arriba.'));
  }

  function agregar(e) {
    e.preventDefault();
    const m = nuevoMaterial(link.value, titulo.value.trim());
    if (!m) { toast('Pegá un link que empiece con https://', 'error'); link.focus(); return; }
    clase.materiales.push(m);
    link.value = ''; titulo.value = '';
    marcar(); pintar();
    link.focus();
  }

  async function importar(e) {
    e.preventDefault();
    const a = analizarLink(carpeta.value);
    if (!a || a.tipo !== 'carpeta') { toast('Ese link no es de una carpeta de Drive', 'error'); return; }
    const boton = e.submitter; if (boton) boton.disabled = true;
    try {
      const archivos = await archivosDeCarpeta(a.id);
      if (!archivos.length) toast('La carpeta está vacía o no es pública', 'error');
      archivos.forEach((f) => clase.materiales.push({ id: idAzar(6), notas: '', ...f }));
      if (archivos.length) { toast(`Se agregaron ${archivos.length} materiales`, 'ok'); carpeta.value = ''; marcar(); pintar(); }
    } catch (err) { toast(err.message, 'error'); }
    if (boton) boton.disabled = false;
  }

  async function guardar() {
    if (!clase.titulo?.trim()) { toast('Poné un título a la clase', 'error'); return; }
    try { clase.id = await guardarClase(uid, clase); cambios = false; toast('Clase guardada', 'ok'); } catch (e) { toast('No se pudo guardar: ' + (e.code || e.message), 'error'); }
  }

  async function volver() {
    if (cambios && !(await confirmar({ titulo: '¿Salir sin guardar?', texto: 'Hay cambios en esta clase que no guardaste.', ok: 'Salir sin guardar', peligro: true }))) return;
    alSalir();
  }

  montar(el,
    h('div', { class: 'fila entre' },
      h('button', { class: 'btn-link', onclick: volver }, '← Volver'),
      h('button', { class: 'btn', onclick: guardar }, 'Guardar clase')),
    h('h2', null, inicial?.id ? 'Editar clase' : 'Nueva clase'),
    h('div', { class: 'grilla-3' },
      h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Título'), campo('titulo', 'Ej.: La división de poderes')),
      h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Materia'), campo('materia', 'Ej.: Política y Ciudadanía', 40)),
      h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Curso'), campo('curso', 'Ej.: 5° año', 30))),
    h('form', { class: 'tarjeta suave pila', onsubmit: agregar },
      h('div', { class: 'etiqueta' }, 'Agregar material'),
      link, titulo,
      h('button', { class: 'btn', type: 'submit' }, 'Agregar'),
      h('p', { class: 'muted chico' }, 'Para que se vea en la pantalla grande, compartí cada archivo de Drive como «Cualquier persona con el enlace». Funciona con videos, PDF, imágenes, Word y PowerPoint subidos a Drive, Presentaciones, Documentos, Hojas y Formularios de Google, YouTube y otras páginas.')),
    h('form', { class: 'tarjeta suave pila', onsubmit: importar },
      h('div', { class: 'etiqueta' }, 'Importar una carpeta de Drive'),
      carpeta,
      h('button', { class: 'btn sec', type: 'submit' }, 'Importar los archivos de la carpeta'),
      h('p', { class: 'muted chico' }, 'La carpeta tiene que estar compartida como «Cualquier persona con el enlace». Si preferís, pegá el link de la carpeta arriba como material y se va a ver como grilla de archivos.')),
    h('div', { class: 'etiqueta' }, 'Materiales en orden'),
    lista);
  pintar();
}
