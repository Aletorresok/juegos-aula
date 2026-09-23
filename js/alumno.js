// Vista del alumno: entra con código y nombre, y juega desde el celular.
import { asegurarSesion, mensajeError, db, collection, getDocs, deleteDoc, doc } from './fb.js';
import { Sala, existeSala, unirse } from './sala.js';
import { juego as buscarJuego } from './juegos/index.js';
import { esperando, pildoraEquipo } from './juegos/comun.js';
import { h, montar, urlApp, normalizar, guardarLocal, leerLocal, toast } from './util.js';

const CLAVE = 'recreo-alumno';

export function iniciarAlumno(raiz, codigoUrl) {
  const guardado = leerLocal(CLAVE);
  const vigente = guardado && Date.now() - guardado.t < 12 * 3600e3 ? guardado : null;
  const codigo = (codigoUrl || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

  // Si ya había entrado a esta sala, vuelve directo.
  if (vigente && (!codigo || codigo === vigente.codigo)) {
    entrar(raiz, vigente.codigo, vigente.nombre, true);
    return;
  }
  formulario(raiz, codigo);
}

function formulario(raiz, codigo, aviso = '') {
  const inCodigo = h('input', {
    class: 'campo grande mono codigo-input', id: 'codigo', value: codigo, maxlength: 4, autocomplete: 'off',
    autocapitalize: 'characters', placeholder: 'ABCD', 'aria-label': 'Código de la sala',
  });
  inCodigo.addEventListener('input', () => { inCodigo.value = inCodigo.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  const inNombre = h('input', { class: 'campo grande', id: 'nombre', maxlength: 20, autocomplete: 'given-name', placeholder: 'Tu nombre', 'aria-label': 'Tu nombre' });
  const estado = h('p', { class: 'aviso-txt', role: 'status' }, aviso);
  const boton = h('button', { class: 'btn grande', type: 'submit' }, 'Entrar');
  const form = h('form', { class: 'tarjeta ingreso pila', onsubmit: async (e) => {
    e.preventDefault();
    const c = inCodigo.value.trim();
    const n = inNombre.value.trim().replace(/\s+/g, ' ');
    if (c.length !== 4) { estado.textContent = 'El código tiene 4 letras. Está en la pantalla grande.'; inCodigo.focus(); return; }
    if (!n) { estado.textContent = 'Escribí tu nombre.'; inNombre.focus(); return; }
    boton.disabled = true;
    estado.textContent = 'Entrando…';
    const error = await entrar(raiz, c, n, false);
    if (error) { estado.textContent = error; boton.disabled = false; }
  } },
  h('div', { class: 'marca' }, 'Recreo'),
  h('h1', null, 'Entrar a la sala'),
  h('label', { class: 'pila-s', hidden: !!codigo }, h('span', { class: 'etq' }, 'Código de la sala'), inCodigo),
  codigo && h('p', { class: 'muted' }, 'Sala ', h('b', { class: 'mono' }, codigo)),
  h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Tu nombre'), inNombre),
  h('p', { class: 'muted chico' }, 'Usá tu nombre o apodo, sin apellido. Así te reconoce tu docente.'),
  boton, estado);
  montar(raiz, h('main', { class: 'centrado' }, form,
    h('a', { class: 'btn-link pie', href: urlApp('?docente') }, 'Soy docente →')));
  (codigo ? inNombre : inCodigo).focus();
}

// Devuelve un mensaje de error, o nada si entró bien.
async function entrar(raiz, codigo, nombre, reconexion) {
  try {
    const u = await asegurarSesion();
    const datos = await existeSala(codigo);
    if (!datos) {
      guardarLocal(CLAVE, null);
      if (reconexion) { formulario(raiz, '', `La sala ${codigo} ya no está abierta.`); return null; }
      return 'No existe una sala abierta con ese código. Revisalo en la pantalla grande.';
    }
    if (!reconexion) {
      const otros = await getDocs(collection(db, 'salas', codigo, 'jugadores'));
      const repetido = otros.docs.some((d) => d.id !== u.uid && normalizar(d.data().nombre) === normalizar(nombre));
      if (repetido) return `Ya hay alguien con el nombre «${nombre}». Agregá la inicial del apellido.`;
    }
    await unirse(codigo, u.uid, nombre);
    guardarLocal(CLAVE, { codigo, nombre, t: Date.now() });
    history.replaceState(null, '', urlApp('?sala=' + codigo));
    enSala(raiz, codigo, u.uid, nombre);
    return null;
  } catch (e) {
    if (reconexion) { formulario(raiz, codigo, mensajeError(e)); return null; }
    return mensajeError(e);
  }
}

function enSala(raiz, codigo, uid, nombre) {
  const sala = new Sala(codigo, { rol: 'alumno', uid, nombre });
  const miEquipo = h('span');
  const cuerpo = h('main', { class: 'alumno-cuerpo' });
  let vistaJuego = null;
  let idJuego = undefined;

  const salir = async () => {
    sala.detener();
    vistaJuego?.destruir();
    guardarLocal(CLAVE, null);
    try { await deleteDoc(doc(db, 'salas', codigo, 'jugadores', uid)); } catch { /* ya no estaba */ }
    location.href = urlApp('');
  };

  montar(raiz,
    h('header', { class: 'barra alumno-barra' },
      h('span', { class: 'fila nowrap' }, h('b', null, nombre), miEquipo),
      h('button', { class: 'btn-link chico', onclick: salir }, 'Salir')),
    cuerpo);

  const cerrada = () => {
    guardarLocal(CLAVE, null);
    sala.detener();
    vistaJuego?.destruir();
    montar(raiz, h('main', { class: 'centrado' }, h('div', { class: 'tarjeta ingreso pila centro' },
      h('h1', null, 'La sala se cerró'), h('p', { class: 'muted' }, '¡Gracias por jugar!'),
      h('a', { class: 'btn', href: urlApp('') }, 'Entrar a otra sala'))));
  };

  sala.escuchar({}, (motivo) => {
    if (sala.data.cerrada) { cerrada(); return; }
    const eq = sala.equipoDe(uid);
    montar(miEquipo, pildoraEquipo(eq, eq ? ` · ${eq.puntos} pts` : ''));
    document.documentElement.style.setProperty('--mi-color', eq?.color || 'var(--accent)');
    const j = sala.juego;
    if ((j?.id || null) !== idJuego) {
      idJuego = j?.id || null;
      vistaJuego?.destruir();
      vistaJuego = null;
      if (j) {
        const def = buscarJuego(j.tipo);
        const zona = h('div', { class: 'pila juego-alumno' });
        montar(cuerpo, zona);
        vistaJuego = def ? def.alumno(zona, sala) : null;
      }
    }
    if (!j) {
      montar(cuerpo, esperando('¡Ya estás adentro!', eq ? `Estás en el equipo ${eq.nombre}. Esperá a que empiece un juego.` : 'Esperá a que empiece un juego.'));
    }
    vistaJuego?.actualizar(motivo);
  }, cerrada);

  // Si el docente lo saca de la sala.
  let estaba = false;
  sala.escucharDoc('jugadores', uid, (d) => {
    if (d) { estaba = true; return; }
    if (!estaba || sala.data?.cerrada) return;
    guardarLocal(CLAVE, null);
    sala.detener();
    vistaJuego?.destruir();
    toast('Saliste de la sala');
    formulario(raiz, codigo);
  });
}
