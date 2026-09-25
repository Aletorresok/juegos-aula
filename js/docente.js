// Panel del docente: bancos de contenido, salas y control de los juegos.
import { usuario, esDocente, entrarConGoogle, salir, mensajeError, alCambiarUsuario } from './fb.js';
import { Sala, crearSala, misSalas, cerrarSala } from './sala.js';
import { misBancos, borrarBanco, guardarBanco, editorBanco, resumenBanco, claveItem } from './bancos.js';
import { PLANTILLAS } from './plantillas.js';
import { misClases, borrarClase, guardarClase, editorClase, iconoMaterial } from './clases.js';
import { JUEGOS, juego as buscarJuego } from './juegos/index.js';
import { h, montar, toast, confirmar, hoja, urlApp, mezclar, idAzar } from './util.js';
import { qr } from './qr.js';

const SESION = idAzar(10); // identifica esta pestaña para que un solo dispositivo controle la sala

export async function iniciarDocente(raiz) {
  const u = await usuario();
  if (!esDocente(u)) { pantallaIngreso(raiz); return; }
  const docente = { uid: u.uid, nombre: u.displayName || 'Docente', foto: u.photoURL };
  const params = new URLSearchParams(location.search);
  if (params.get('sala')) panelSala(raiz, docente, params.get('sala').toUpperCase());
  else inicio(raiz, docente);
}

function irA(params) {
  history.pushState(null, '', urlApp(params));
}

function pantallaIngreso(raiz) {
  const estado = h('p', { class: 'muted chico', role: 'status' });
  const boton = h('button', { class: 'btn grande', onclick: async () => {
    boton.disabled = true;
    estado.textContent = 'Abriendo Google…';
    try {
      const u = await entrarConGoogle();
      if (u) location.reload();
    } catch (e) {
      estado.textContent = mensajeError(e);
      boton.disabled = false;
    }
  } }, 'Entrar con Google');
  montar(raiz, h('main', { class: 'centrado' },
    h('div', { class: 'tarjeta ingreso pila' },
      h('div', { class: 'marca' }, 'Recreo'),
      h('h1', null, 'Panel docente'),
      h('p', { class: 'muted' }, 'Entrá con tu cuenta de Google para guardar tus bancos de preguntas y abrir salas. Los alumnos no necesitan cuenta.'),
      boton, estado,
      h('a', { class: 'btn-link', href: urlApp('') }, '← Soy alumno'))));
  alCambiarUsuario((u) => { if (esDocente(u)) location.reload(); });
}

function cabecera(docente, extra) {
  return h('header', { class: 'barra' },
    h('a', { class: 'marca', href: urlApp('?docente') }, 'Recreo'),
    extra,
    h('div', { class: 'fila nowrap' },
      h('span', { class: 'muted chico oculto-movil' }, docente.nombre),
      h('button', { class: 'btn-link', onclick: async () => { await salir(); location.href = urlApp('?docente'); } }, 'Salir')));
}

// ── Inicio: salas y bancos ──
async function inicio(raiz, docente) {
  const zonaSalas = h('div', { class: 'pila' }, h('p', { class: 'muted' }, 'Cargando…'));
  const zonaBancos = h('div', { class: 'pila' }, h('p', { class: 'muted' }, 'Cargando…'));
  const zonaClases = h('div', { class: 'pila' }, h('p', { class: 'muted' }, 'Cargando…'));
  const cant = h('select', { class: 'campo', id: 'cant-equipos' }, [2, 3, 4, 5, 6].map((n) => h('option', { value: n, selected: n === 4 }, `${n} equipos`)));
  const botonSala = h('button', { class: 'btn grande', onclick: async () => {
    botonSala.disabled = true;
    try {
      const codigo = await crearSala(docente.uid, Number(cant.value));
      irA('?docente&sala=' + codigo);
      panelSala(raiz, docente, codigo);
    } catch (e) { toast(mensajeError(e), 'error'); botonSala.disabled = false; }
  } }, 'Abrir una sala');

  montar(raiz, cabecera(docente),
    h('main', { class: 'contenido pila-l' },
      h('section', { class: 'tarjeta pila' },
        h('h2', null, 'Empezar una clase'),
        h('p', { class: 'muted' }, 'Abrí una sala, proyectá la pantalla grande y los chicos entran escaneando el QR o con el código.'),
        h('div', { class: 'fila' }, cant, botonSala),
        zonaSalas),
      h('section', { class: 'pila' },
        h('div', { class: 'fila entre' }, h('h2', null, 'Mis bancos'),
          h('button', { class: 'btn', onclick: () => editar(null) }, '+ Nuevo banco')),
        zonaBancos),
      h('section', { class: 'pila' },
        h('div', { class: 'fila entre' }, h('h2', null, 'Mis clases'),
          h('button', { class: 'btn', onclick: () => editarClase(null) }, '+ Nueva clase')),
        h('p', { class: 'muted chico' }, 'Armá tus clases con videos, presentaciones y archivos de Google Drive para proyectarlas en la pantalla grande (desde una sala, con «Presentar una clase»).'),
        zonaClases)));

  function editarClase(clase) {
    const cont = h('main', { class: 'contenido pila' });
    montar(raiz, cabecera(docente), cont);
    editorClase(cont, docente.uid, clase, () => inicio(raiz, docente));
  }

  misClases(docente.uid).then((clases) => {
    montar(zonaClases, clases.length
      ? h('ul', { class: 'bancos' }, clases.map((c) => h('li', { class: 'tarjeta banco' },
        h('div', { class: 'pila-s' },
          h('b', null, '📚 ', c.titulo),
          h('span', { class: 'muted chico' }, [c.materia, c.curso].filter(Boolean).join(' · ')),
          h('span', { class: 'chico' }, `${c.materiales.length} materiales `, c.materiales.slice(0, 8).map((m) => iconoMaterial(m.tipo)).join(' '))),
        h('div', { class: 'fila nowrap' },
          h('button', { class: 'btn sec chico', onclick: () => editarClase(c) }, 'Editar'),
          h('button', { class: 'btn-icono', 'aria-label': 'Duplicar', title: 'Duplicar', onclick: async () => {
            const { id: _id, ...copia } = c;
            await guardarClase(docente.uid, { ...copia, titulo: c.titulo + ' (copia)' });
            inicio(raiz, docente);
          } }, '⧉'),
          h('button', { class: 'btn-icono', 'aria-label': 'Borrar', title: 'Borrar', onclick: async () => {
            if (!(await confirmar({ titulo: `¿Borrar la clase «${c.titulo}»?`, texto: 'Los archivos de tu Drive no se tocan.', ok: 'Borrar', peligro: true }))) return;
            await borrarClase(c.id); inicio(raiz, docente);
          } }, '🗑')))))
      : h('p', { class: 'vacio' }, 'Todavía no tenés clases.'));
  }).catch((e) => montar(zonaClases, h('p', { class: 'aviso' }, mensajeError(e))));

  function editar(banco) {
    const cont = h('main', { class: 'contenido pila' });
    montar(raiz, cabecera(docente), cont);
    editorBanco(cont, docente.uid, banco, () => inicio(raiz, docente));
  }

  try {
    const salas = await misSalas(docente.uid);
    const vigentes = salas.filter((s) => (s.expira?.toMillis?.() || 0) > Date.now());
    salas.filter((s) => !vigentes.includes(s)).forEach((s) => cerrarSala(s.codigo).catch(() => {}));
    montar(zonaSalas, vigentes.length ? [
      h('div', { class: 'etiqueta' }, 'Salas abiertas'),
      h('ul', { class: 'lista' }, vigentes.map((s) => h('li', { class: 'fila entre' },
        h('span', null, h('b', { class: 'mono' }, s.codigo), ' · ', s.equipos.length, ' equipos'),
        h('div', { class: 'fila nowrap' },
          h('button', { class: 'btn sec chico', onclick: () => { irA('?docente&sala=' + s.codigo); panelSala(raiz, docente, s.codigo); } }, 'Entrar'),
          h('button', { class: 'btn-link peligro', onclick: async () => {
            if (!(await confirmar({ titulo: `¿Cerrar la sala ${s.codigo}?`, texto: 'Se borran los alumnos conectados y sus respuestas. Tus bancos no se tocan.', ok: 'Cerrar sala', peligro: true }))) return;
            await cerrarSala(s.codigo); inicio(raiz, docente);
          } }, 'Cerrar'))))),
    ] : []);
  } catch (e) { montar(zonaSalas, h('p', { class: 'aviso' }, mensajeError(e))); }

  try {
    const bancos = await misBancos(docente.uid);
    const catalogo = h('button', { class: 'btn sec', onclick: () => catalogoPlantillas(docente, bancos, () => inicio(raiz, docente)) }, '📚 Bancos listos para usar');
    montar(zonaBancos,
      bancos.length
        ? h('ul', { class: 'bancos' }, bancos.map((b) => h('li', { class: 'tarjeta banco' },
          h('div', { class: 'pila-s' },
            h('b', null, b.titulo),
            h('span', { class: 'muted chico' }, [b.materia, b.curso].filter(Boolean).join(' · ')),
            h('span', { class: 'chico' }, resumenBanco(b))),
          h('div', { class: 'fila nowrap' },
            h('button', { class: 'btn sec chico', onclick: () => editar(b) }, 'Editar'),
            h('button', { class: 'btn-icono', 'aria-label': 'Duplicar', title: 'Duplicar', onclick: async () => {
              const { id: _id, ...copia } = b;
              await guardarBanco(docente.uid, { ...copia, titulo: b.titulo + ' (copia)' });
              inicio(raiz, docente);
            } }, '⧉'),
            h('button', { class: 'btn-icono', 'aria-label': 'Borrar', title: 'Borrar', onclick: async () => {
              if (!(await confirmar({ titulo: `¿Borrar «${b.titulo}»?`, texto: 'No se puede deshacer.', ok: 'Borrar', peligro: true }))) return;
              await borrarBanco(b.id); inicio(raiz, docente);
            } }, '🗑')))))
        : h('div', { class: 'tarjeta suave pila' },
          h('p', null, 'Todavía no tenés bancos. Un banco es un conjunto de contenidos de un tema (términos, preguntas y pares de conceptos) que usan los juegos.'),
          h('p', { class: 'muted chico' }, 'Para empezar rápido, agregá alguno de los bancos listos para usar.')),
      catalogo);
  } catch (e) { montar(zonaBancos, h('p', { class: 'aviso' }, mensajeError(e))); }
}

// Catálogo de bancos listos para agregar.
function catalogoPlantillas(docente, bancos, alTerminar) {
  const suyo = Object.fromEntries(bancos.filter((b) => b.plantilla).map((b) => [b.plantilla, b]));
  const materias = [...new Set(PLANTILLAS.map((p) => p.materia))];
  let agregados = 0;
  const cerrar = hoja('Bancos listos para usar', h('div', { class: 'pila' },
    h('p', { class: 'muted chico' }, 'Se copian a «Mis bancos» y después los podés editar, sumar contenido o borrar lo que no uses. Revisá los datos antes de usarlos en clase.'),
    materias.map((m) => h('div', { class: 'pila-s' },
      h('div', { class: 'etiqueta' }, m),
      h('ul', { class: 'bancos' }, PLANTILLAS.filter((p) => p.materia === m).map((p) => {
        const propio = suyo[p.id];
        // Si ya lo tiene, se ofrece sumar solo el contenido nuevo (sin tocar lo que editó).
        const nuevos = propio ? p.items.filter((it) => !propio.items.some((x) => claveItem(x) === claveItem(it))) : [];
        const texto = !propio ? 'Agregar' : nuevos.length ? `Sumar lo nuevo (${nuevos.length})` : 'Ya lo tenés';
        const boton = h('button', { class: 'btn chico' + (propio && !nuevos.length ? ' sec' : ''), disabled: !!propio && !nuevos.length, onclick: async () => {
          boton.disabled = true;
          try {
            if (propio) {
              await guardarBanco(docente.uid, { ...propio, items: [...propio.items, ...structuredClone(nuevos)] });
              boton.textContent = '✓ Actualizado';
            } else {
              const { id, ...datos } = p;
              await guardarBanco(docente.uid, { ...structuredClone(datos), plantilla: id });
              boton.textContent = '✓ Agregado';
            }
            boton.classList.add('sec'); agregados++;
          } catch (e) { toast(mensajeError(e), 'error'); boton.disabled = false; }
        } }, texto);
        return h('li', { class: 'tarjeta banco' },
          h('div', { class: 'pila-s' }, h('b', null, p.titulo), h('span', { class: 'muted chico' }, p.curso), h('span', { class: 'chico' }, resumenBanco(p))),
          boton);
      })))),
    h('button', { class: 'btn grande', onclick: () => cerrar() }, 'Listo')), () => { if (agregados) alTerminar(); });
}

// ── Panel de una sala ──
function panelSala(raiz, docente, codigo) {
  const sala = new Sala(codigo, { rol: 'docente', uid: docente.uid });
  let bancos = [];
  let vistaJuego = null;
  let idJuego = null;
  let asignando = false;
  misBancos(docente.uid).then((b) => { bancos = b; }).catch(() => {});

  const enlace = urlApp('?sala=' + codigo);
  const zonaJuego = h('section', { class: 'tarjeta pila' });
  const zonaEquipos = h('section', { class: 'tarjeta pila' });
  const contadorAlumnos = h('span', null, '0');
  let entrada;

  const salirAlInicio = () => { sala.detener(); vistaJuego?.destruir(); irA('?docente'); inicio(raiz, docente); };

  montar(raiz,
    cabecera(docente, h('span', { class: 'sala-codigo mono' }, codigo)),
    h('main', { class: 'contenido panel' },
      entrada = h('section', { class: 'tarjeta entrada' },
        qr(enlace, 'qr qr-chico'),
        h('div', { class: 'pila-s' },
          h('div', { class: 'etiqueta' }, 'Para entrar'),
          h('div', { class: 'codigo-grande mono' }, codigo),
          h('div', { class: 'muted chico quebrar' }, enlace),
          h('div', null, contadorAlumnos, ' alumnos conectados'),
          h('div', { class: 'fila' },
            h('a', { class: 'btn', href: urlApp('?tv=' + codigo), target: '_blank', rel: 'noopener' }, '📺 Abrir pantalla grande'),
            h('button', { class: 'btn sec', onclick: async () => {
              try { await navigator.clipboard.writeText(enlace); toast('Enlace copiado', 'ok'); } catch { toast(enlace); }
            } }, 'Copiar enlace')))),
      zonaJuego,
      zonaEquipos,
      h('div', { class: 'fila entre' },
        h('button', { class: 'btn-link', onclick: salirAlInicio }, '← Volver al inicio (la sala sigue abierta)'),
        h('button', { class: 'btn-link peligro', onclick: async () => {
          if (!(await confirmar({ titulo: 'Cerrar la sala', texto: 'Se desconecta a todos los alumnos y se borran sus respuestas. Los puntos no se guardan.', ok: 'Cerrar sala', peligro: true }))) return;
          sala.detener(); vistaJuego?.destruir();
          try { await cerrarSala(codigo); } catch (e) { toast(mensajeError(e), 'error'); }
          irA('?docente'); inicio(raiz, docente);
        } }, 'Cerrar sala'))));

  // Esta pestaña pasa a ser la que controla los juegos.
  sala.actualizar({ controlador: SESION }).catch((e) => toast(mensajeError(e), 'error'));

  sala.escuchar({ jugadores: true, respuestas: true }, (motivo) => {
    contadorAlumnos.textContent = sala.jugadores.size;
    if (motivo === 'jugadores' || motivo === 'sala') autoAsignar();
    if (motivo !== 'respuestas') dibujarEquipos();
    dibujarJuego(motivo);
  }, () => salirAlInicio());

  // Los alumnos nuevos van al equipo con menos integrantes.
  async function autoAsignar() {
    if (asignando || !sala.data) return;
    const sinEquipo = sala.listaJugadores().filter((j) => !j.equipo);
    if (!sinEquipo.length) return;
    asignando = true;
    const tam = Object.fromEntries(sala.equipos().map((e) => [e.id, sala.miembros(e.id).length]));
    const nuevas = {};
    for (const j of mezclar(sinEquipo)) {
      const eid = Object.entries(tam).sort((a, b) => a[1] - b[1])[0][0];
      nuevas[j.uid] = eid; tam[eid]++;
    }
    try { await sala.asignar(nuevas); } catch (e) { console.error(e); }
    asignando = false;
  }

  function dibujarJuego(motivo) {
    const j = sala.juego;
    entrada?.classList.toggle('compacta', !!j);
    const controlo = sala.data?.controlador === SESION;
    const clave = j ? `${j.id}:${controlo}` : `nada:${controlo}`;
    if (clave !== idJuego) {
      idJuego = clave;
      vistaJuego?.destruir();
      vistaJuego = null;
      if (!controlo) {
        montar(zonaJuego, h('p', null, 'Esta sala se está controlando desde otra pestaña o dispositivo.'),
          h('button', { class: 'btn', onclick: () => sala.actualizar({ controlador: SESION }) }, 'Controlar desde acá'));
        return;
      }
      if (j) {
        const def = buscarJuego(j.tipo);
        const cuerpo = h('div', { class: 'pila' });
        montar(zonaJuego,
          h('div', { class: 'fila entre' },
            h('h2', null, def.icono, ' ', def.nombre),
            h('button', { class: 'btn sec chico', onclick: async () => {
              if (!(await confirmar({ titulo: '¿Terminar el juego?', texto: 'Los puntos que ya se sumaron quedan.', ok: 'Terminar' }))) return;
              await sala.terminarJuego();
            } }, 'Terminar juego')),
          cuerpo);
        vistaJuego = def.host(cuerpo, sala);
      } else {
        montar(zonaJuego, h('h2', null, 'Elegí un juego o presentá una clase'),
          h('div', { class: 'juegos' }, JUEGOS.map((def) => h('button', { class: 'juego-tarjeta', onclick: () => configurarJuego(def) },
            h('span', { class: 'juego-icono' }, def.icono),
            h('span', { class: 'pila-s' }, h('b', null, def.nombre), h('span', { class: 'muted chico' }, def.resumen))))));
      }
    }
    vistaJuego?.actualizar(motivo);
  }

  async function configurarJuego(def) {
    try { bancos = await misBancos(docente.uid); } catch { /* se usan los que había */ }
    let clases = [];
    if (def.id === 'clase') { try { clases = await misClases(docente.uid); } catch (e) { toast(mensajeError(e), 'error'); } }
    const cfg = def.configurar({ bancos, sala, clases });
    const empezar = h('button', { class: 'btn grande', onclick: async () => {
      const valores = cfg.leer();
      if (!valores) return;
      empezar.disabled = true;
      try { await def.iniciar(sala, valores); cerrar(); } catch (e) { toast(mensajeError(e), 'error'); empezar.disabled = false; }
    } }, 'Empezar');
    const cerrar = hoja(`${def.icono} ${def.nombre}`, h('div', { class: 'pila' }, cfg.el, empezar));
  }

  function dibujarEquipos() {
    if (!sala.data) return;
    const eqs = sala.equipos();
    const sinEquipo = sala.listaJugadores().filter((j) => !j.equipo);
    montar(zonaEquipos,
      h('div', { class: 'fila entre' }, h('h2', null, 'Equipos y puntos'),
        h('div', { class: 'fila nowrap' },
          h('button', { class: 'btn sec chico', onclick: mezclarEquipos }, 'Armar al azar'),
          h('button', { class: 'btn-link', onclick: async () => {
            if (await confirmar({ titulo: '¿Poner los puntos en cero?', ok: 'Reiniciar puntos', peligro: true })) sala.reiniciarPuntos();
          } }, 'Puntos a cero'))),
      h('div', { class: 'equipos' }, eqs.map((e) => {
        const miembros = sala.miembros(e.id);
        return h('div', { class: 'equipo', style: { '--c': e.color } },
          h('div', { class: 'fila entre nowrap' },
            h('button', { class: 'equipo-nombre', title: 'Cambiar nombre', onclick: () => renombrar(e) }, e.nombre),
            h('span', { class: 'equipo-pts mono' }, e.puntos)),
          h('div', { class: 'fila nowrap' },
            [-10, 10, 50].map((n) => h('button', { class: 'btn-pts', onclick: () => sala.sumar({ [e.id]: n }) }, (n > 0 ? '+' : '−') + Math.abs(n)))),
          h('div', { class: 'miembros' }, miembros.length
            ? miembros.map((m) => h('button', { class: 'chip', onclick: () => moverAlumno(m) }, m.nombre))
            : h('span', { class: 'muted chico' }, 'Sin integrantes')));
      })),
      sinEquipo.length > 0 && h('p', { class: 'muted chico' }, 'Sin equipo: ', sinEquipo.map((m) => m.nombre).join(', ')),
      !sala.jugadores.size && h('p', { class: 'muted' }, 'Todavía no entró nadie. Los alumnos que entren se reparten solos entre los equipos.'));
  }

  async function mezclarEquipos() {
    if (!(await confirmar({ titulo: '¿Armar los equipos al azar?', texto: 'Se reparten todos los alumnos de nuevo, en equipos parejos.', ok: 'Mezclar' }))) return;
    const eqs = sala.equipos();
    const nuevas = {};
    mezclar(sala.listaJugadores()).forEach((j, i) => { nuevas[j.uid] = eqs[i % eqs.length].id; });
    await sala.asignar(nuevas);
    toast('Equipos armados', 'ok');
  }

  function renombrar(e) {
    const input = h('input', { class: 'campo', id: 'nombre-equipo', value: e.nombre, maxlength: 20 });
    const cerrar = hoja('Nombre del equipo', h('form', { class: 'pila', onsubmit: async (ev) => {
      ev.preventDefault();
      const n = input.value.trim();
      if (n) await sala.renombrarEquipo(e.id, n);
      cerrar();
    } }, input, h('button', { class: 'btn', type: 'submit' }, 'Guardar')));
    input.select();
  }

  function moverAlumno(m) {
    const cerrar = hoja(m.nombre, h('div', { class: 'pila' },
      h('div', { class: 'etiqueta' }, 'Mover a'),
      h('div', { class: 'fila' }, sala.equipos().map((e) => h('button', {
        class: 'pildora-boton' + (e.id === m.equipo ? ' actual' : ''), style: { '--c': e.color },
        onclick: async () => { await sala.asignar({ [m.uid]: e.id }); cerrar(); },
      }, e.nombre))),
      h('button', { class: 'btn-link peligro', onclick: async () => {
        await sala.quitarJugador(m.uid); cerrar(); toast(`${m.nombre} salió de la sala`);
      } }, 'Sacar de la sala')));
  }

  window.addEventListener('popstate', () => location.reload(), { once: true });
}

