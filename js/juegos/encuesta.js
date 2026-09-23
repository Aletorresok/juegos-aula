// «El curso dice» (al estilo de 100 argentinos dicen): hay que adivinar las respuestas
// más dichas de una encuesta. Las encuestas salen de un banco o de lo que responde el
// propio curso en el momento. Tres errores y otro equipo puede robar el pozo.
import { h, montar, vista, selectorBanco, selector, ranking, esperando, pildoraEquipo } from './comun.js';
import { itemsDe } from '../bancos.js';
import { mezclar, respuestaCorrecta, cuentaRegresiva, toast, sonido, vibrar, idAzar } from '../util.js';
import { contarPalabras, ofensiva } from './nube.js';

const MAX_CASILLEROS = 8;
const STRIKES = 3;

const visible = (t) => String(t).split('/')[0].trim();
const enJuego = (j) => j.fase === 'jugando' || j.fase === 'robo';

function nuevaRonda(j, ronda, pregunta, respuestas) {
  const turno = j.orden[(ronda - 1) % j.orden.length];
  return {
    fase: 'jugando', ronda, pregunta, casilleros: respuestas.length, reveladas: {}, strikes: 0,
    turno, duenio: turno, pozo: 0, paso: (j.paso || 0) + 1, ultimo: null, gano: null, todas: null,
    terminaEn: j.seg ? Date.now() + j.seg * 1000 : 0,
  };
}

function tablero(j, { tv = false } = {}) {
  const celdas = [];
  for (let i = 0; i < j.casilleros; i++) {
    const r = j.reveladas?.[i];
    const perdida = !r && j.todas?.[i];
    const dato = r || perdida;
    celdas.push(h('div', { class: 'casillero' + (r ? ' revelada' : perdida ? ' perdida' : '') },
      h('span', { class: 'cas-num' }, i + 1),
      dato ? [h('span', { class: 'cas-txt' }, dato.texto), h('span', { class: 'cas-pts' }, dato.puntos)] : h('span', { class: 'cas-txt' })));
  }
  return h('div', { class: 'tablero' + (tv ? ' en-tv' : '') }, celdas);
}

function cruces(n) {
  return h('span', { class: 'cruces', 'aria-label': `${n} errores` },
    Array.from({ length: STRIKES }, (_, i) => h('b', { class: i < n ? 'on' : '' }, '✗')));
}

function checksEquipos(sala) {
  const conGente = sala.equipos().filter((e) => sala.miembros(e.id).length).map((e) => e.id);
  return sala.equipos().map((e) => ({ e, input: h('input', { type: 'checkbox', id: 'cfg-eq-' + e.id, checked: !conGente.length || conGente.includes(e.id) }) }));
}

export default {
  id: 'encuesta',
  nombre: 'El curso dice',
  icono: '📊',
  resumen: 'Al estilo 100 argentinos dicen: adivinar las respuestas más dichas.',
  tipos: ['encuesta'],

  configurar({ bancos, sala }) {
    const fuente = selector('cfg-fuente', 'Preguntas', [['banco', 'De un banco (encuestas ya cargadas)'], ['curso', 'Encuesta al curso: primero responden todos']], 'banco');
    const b = selectorBanco(bancos, 'encuesta', 1);
    const rondas = selector('cfg-rondas', 'Rondas', [[3, '3'], [5, '5'], [0, 'Todas las del banco']], 5);
    const pregunta = h('input', { class: 'campo', id: 'cfg-pregunta', maxlength: 120, placeholder: 'Nombrá un derecho que tenemos en la escuela' });
    const seg = selector('cfg-seg', 'Tiempo para responder', [[0, 'Sin límite'], [20, '20 segundos'], [30, '30 segundos'], [45, '45 segundos']], 30);
    const checks = checksEquipos(sala);
    const zonaBanco = h('div', { class: 'pila' }, b.el, rondas.el);
    const zonaCurso = h('div', { class: 'pila', hidden: true },
      h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Primera pregunta'), pregunta),
      h('p', { class: 'muted chico' }, 'Cada alumno responde desde su celular. Con las respuestas más repetidas se arma el tablero: cada una vale tantos puntos como personas la dijeron.'));
    const selFuente = fuente.el.querySelector('select');
    selFuente.addEventListener('change', () => { zonaBanco.hidden = selFuente.value !== 'banco'; zonaCurso.hidden = selFuente.value !== 'curso'; });
    return {
      el: h('div', { class: 'pila' }, fuente.el, zonaBanco, zonaCurso, seg.el,
        h('fieldset', { class: 'pila-s' }, h('legend', { class: 'etq' }, 'Equipos que juegan'),
          h('div', { class: 'fila' }, checks.map(({ e, input }) => h('label', { class: 'check' }, input, pildoraEquipo(e))))),
        h('p', { class: 'muted chico' }, `Los equipos se turnan cada ronda. El equipo en turno responde hasta completar el tablero o sumar ${STRIKES} errores; ahí el siguiente equipo tiene una oportunidad de robar el pozo.`)),
      leer: () => {
        const equipos = checks.filter((c) => c.input.checked).map((c) => c.e.id);
        if (!equipos.length) { toast('Elegí al menos un equipo', 'error'); return null; }
        const base = { fuente: fuente.valor(), seg: Number(seg.valor()), equipos };
        if (base.fuente === 'curso') {
          const q = pregunta.value.trim();
          if (!q) { toast('Escribí la pregunta', 'error'); pregunta.focus(); return null; }
          return { ...base, pregunta: q };
        }
        const banco = b.banco();
        if (!banco) return null;
        return { ...base, banco, rondas: Number(rondas.valor()) };
      },
    };
  },

  async iniciar(sala, cfg) {
    const id = idAzar();
    const orden = mezclar(cfg.equipos);
    const base = { tipo: 'encuesta', fuente: cfg.fuente, orden, seg: cfg.seg, paso: 0 };
    if (cfg.fuente === 'curso') {
      await sala.guardarPrivado({ juego: id, fuente: 'curso', actual: [] });
      await sala.iniciarJuego({ ...base, titulo: 'Encuesta al curso', total: 0, fase: 'encuesta', ronda: 1, pregunta: cfg.pregunta, casilleros: 0, reveladas: {}, strikes: 0, pozo: 0 }, id);
      return;
    }
    let encuestas = mezclar(itemsDe(cfg.banco, 'encuesta')).map((e) => ({
      pregunta: e.pregunta, respuestas: [...e.respuestas].sort((a, b) => b.puntos - a.puntos).slice(0, MAX_CASILLEROS),
    }));
    if (cfg.rondas) encuestas = encuestas.slice(0, cfg.rondas);
    await sala.guardarPrivado({ juego: id, fuente: 'banco', encuestas, actual: encuestas[0].respuestas });
    await sala.iniciarJuego({ ...base, titulo: cfg.banco.titulo, total: encuestas.length,
      ...nuevaRonda(base, 1, encuestas[0].pregunta, encuestas[0].respuestas) }, id);
  },

  host(el, sala) {
    let privado = null;
    let procesado = -1;
    let temporizador = null;
    const excluidas = new Set();
    sala.privadoDelJuego().then((p) => { privado = p; v.actualizar('privado'); });

    async function guardar(j) {
      const campos = {};
      for (const k of ['fase', 'reveladas', 'strikes', 'turno', 'pozo', 'paso', 'ultimo', 'gano', 'todas', 'terminaEn']) campos[k] = j[k] ?? null;
      try { await sala.actualizarJuego(campos); } catch (e) { toast('No se pudo guardar: ' + e.message, 'error'); }
    }

    async function cerrarRonda(j) {
      j.fase = 'fin_ronda';
      j.todas = privado.actual.map((r) => ({ texto: visible(r.texto), puntos: r.puntos }));
      j.terminaEn = 0;
      j.paso++;
      await guardar(j);
      if (j.gano && j.pozo) await sala.sumar({ [j.gano]: j.pozo });
      sonido('fin');
    }

    // Una respuesta del equipo en turno: por texto (escrita en el celular), por casillero
    // (el docente la marca a mano) o un error.
    async function jugar({ valor = '', idx, error = false }) {
      const j = structuredClone(sala.juego);
      if (!privado || !enJuego(j) || procesado === j.paso) return;
      procesado = j.paso;
      const resp = privado.actual;
      // Si coincide con varias, se prefiere una que todavía no esté en el tablero.
      const coincide = (r, k) => respuestaCorrecta(valor, r.texto) && k;
      let i = error ? -1 : idx ?? resp.findIndex((r, k) => coincide(r, !j.reveladas[k]));
      if (i < 0 && !error && idx === undefined) i = resp.findIndex((r) => respuestaCorrecta(valor, r.texto));
      if (i >= 0 && j.reveladas[i]) {
        j.ultimo = { eid: j.turno, texto: valor, repetida: true };
        j.paso++;
        j.terminaEn = j.seg ? Date.now() + j.seg * 1000 : 0;
        await guardar(j);
        return;
      }
      const acierto = i >= 0;
      if (acierto) {
        j.reveladas[i] = { texto: visible(resp[i].texto), puntos: resp[i].puntos };
        j.pozo += resp[i].puntos;
      }
      j.ultimo = { eid: j.turno, texto: valor || (acierto ? visible(resp[i].texto) : ''), ok: acierto };
      sonido(acierto ? 'bien' : 'mal');
      if (j.fase === 'robo') {
        j.gano = acierto ? j.turno : j.duenio;
        await cerrarRonda(j);
        return;
      }
      if (acierto && Object.keys(j.reveladas).length >= j.casilleros) {
        j.gano = j.turno;
        await cerrarRonda(j);
        return;
      }
      if (!acierto) {
        j.strikes++;
        if (j.strikes >= STRIKES) {
          const idxDuenio = j.orden.indexOf(j.duenio);
          const ladron = j.orden.length > 1 ? j.orden[(idxDuenio + 1) % j.orden.length] : null;
          if (!ladron) { j.gano = j.duenio; await cerrarRonda(j); return; }
          j.fase = 'robo';
          j.turno = ladron;
        }
      }
      j.paso++;
      j.terminaEn = j.seg ? Date.now() + j.seg * 1000 : 0;
      await guardar(j);
    }

    async function siguiente() {
      const j = sala.juego;
      if (j.fuente === 'banco') {
        if (j.ronda >= privado.encuestas.length) { await sala.actualizarJuego({ fase: 'fin' }); return; }
        const e = privado.encuestas[j.ronda];
        privado = { ...privado, actual: e.respuestas };
        await sala.guardarPrivado(privado);
        await sala.actualizarJuego(nuevaRonda(j, j.ronda + 1, e.pregunta, e.respuestas));
      }
    }

    async function nuevaPreguntaCurso(texto) {
      const j = sala.juego;
      excluidas.clear();
      privado = { ...privado, actual: [] };
      await sala.guardarPrivado(privado);
      await sala.actualizarJuego({ fase: 'encuesta', ronda: j.ronda + 1, pregunta: texto, casilleros: 0, reveladas: {}, strikes: 0, pozo: 0, ultimo: null, gano: null, todas: null, paso: j.paso + 1, terminaEn: 0 });
    }

    function gruposCurso() {
      const j = sala.juego;
      const resp = [...sala.respuestasJuego(j.ronda).values()].map((r) => ({ palabras: [r.valor] }));
      return contarPalabras(resp).filter((g) => !ofensiva(g.clave)).sort((a, b) => b.n - a.n);
    }

    async function armarTablero() {
      const j = sala.juego;
      const grupos = gruposCurso().filter((g) => !excluidas.has(g.clave)).slice(0, MAX_CASILLEROS);
      if (grupos.length < 2) { toast('Hacen falta al menos 2 respuestas distintas', 'error'); return; }
      const actual = grupos.map((g) => ({ texto: g.texto, puntos: g.n }));
      privado = { ...privado, actual };
      await sala.guardarPrivado(privado);
      await sala.actualizarJuego(nuevaRonda(j, j.ronda, j.pregunta, actual));
    }

    function procesarRespuestas() {
      const j = sala.juego;
      if (!privado || !enJuego(j)) return;
      const r = [...sala.respuestasJuego().values()]
        .filter((x) => x.paso === j.paso && x.equipo === j.turno && x.accion === 'resp')
        .sort((a, b) => a.t - b.t)[0];
      if (r) jugar({ valor: r.valor });
    }

    let zonaEncuesta = null;
    function pintarEncuesta() {
      if (!zonaEncuesta) return;
      const grupos = gruposCurso();
      const total = sala.respuestasJuego(sala.juego.ronda).size;
      montar(zonaEncuesta,
        h('p', null, h('b', null, total), ` ${total === 1 ? 'alumno respondió' : 'alumnos respondieron'}. Tocá una respuesta para dejarla afuera del tablero.`),
        grupos.length
          ? h('ul', { class: 'votos' }, grupos.map((g) => h('li', { class: excluidas.has(g.clave) ? 'excluida' : '', onclick: () => { excluidas.has(g.clave) ? excluidas.delete(g.clave) : excluidas.add(g.clave); pintarEncuesta(); } },
            h('span', null, g.texto), h('b', null, g.n))))
          : h('p', { class: 'vacio' }, 'Todavía no hay respuestas.'));
    }

    const v = vista({
      clave: () => `${sala.juego.fase}:${sala.juego.ronda}:${sala.juego.paso}:${!!privado}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        zonaEncuesta = null;
        clearTimeout(temporizador);
        if (!privado) { montar(el, esperando('Cargando…')); return; }
        if (j.fase === 'fin') { montar(el, h('h3', null, '¡Terminó el juego!'), ranking(sala)); return; }
        if (j.fase === 'encuesta') {
          zonaEncuesta = h('div', { class: 'pila-s' });
          montar(el, h('div', { class: 'etiqueta' }, `Ronda ${j.ronda} · encuesta al curso`),
            h('p', { class: 'pregunta-host' }, j.pregunta), zonaEncuesta,
            h('button', { class: 'btn grande', onclick: armarTablero }, 'Cerrar la encuesta y armar el tablero'));
          pintarEncuesta();
          return;
        }
        const eq = sala.equipo(j.turno);
        const reloj = h('span', { class: 'reloj' });
        if (enJuego(j) && j.terminaEn) {
          alLimpiar(cuentaRegresiva(reloj, j.terminaEn));
          const paso = j.paso;
          temporizador = setTimeout(() => { if (sala.juego.paso === paso) jugar({ error: true }); }, Math.max(0, j.terminaEn - Date.now()) + 200);
          alLimpiar(() => clearTimeout(temporizador));
        }
        const u = j.ultimo;
        const lista = h('ol', { class: 'tablero-host' }, privado.actual.map((r, i) => {
          const rev = j.reveladas[i];
          return h('li', { class: rev ? 'revelada' : '' },
            h('span', null, visible(r.texto), h('span', { class: 'mono muted' }, ` · ${r.puntos}`)),
            enJuego(j) && !rev && h('button', { class: 'btn sec chico', onclick: () => jugar({ idx: i }) }, 'Acertó'));
        }));
        const cabecera = h('div', { class: 'fila entre' },
          h('span', null, j.fase === 'robo' ? 'Roba ' : 'Turno de ', pildoraEquipo(eq)),
          h('span', { class: 'fila nowrap' }, cruces(j.strikes), j.terminaEn ? reloj : null));
        const ultimo = u && h('p', { class: 'ultimo ' + (u.repetida ? '' : u.ok ? 'bien' : 'mal') },
          u.repetida ? `«${u.texto}» ya está en el tablero` : u.ok ? `✓ ${u.texto}` : `✗ ${u.texto || 'Error'}`);
        if (j.fase === 'fin_ronda') {
          const ganador = sala.equipo(j.gano);
          const ultimaRonda = j.fuente === 'banco' && j.ronda >= privado.encuestas.length;
          const otra = h('input', { class: 'campo', id: 'otra-pregunta', maxlength: 120, placeholder: 'Siguiente pregunta para el curso' });
          montar(el, h('p', { class: 'pregunta-host' }, j.pregunta), ultimo,
            h('p', { class: 'grande' }, ganador ? `${ganador.nombre} se lleva ${j.pozo} puntos` : 'Nadie suma en esta ronda'),
            tablero(j),
            j.fuente === 'banco'
              ? h('button', { class: 'btn grande', onclick: siguiente }, ultimaRonda ? 'Ver resultados' : 'Siguiente ronda →')
              : h('form', { class: 'pila', onsubmit: (e) => { e.preventDefault(); const t = otra.value.trim(); if (t) nuevaPreguntaCurso(t); } },
                otra, h('button', { class: 'btn', type: 'submit' }, 'Nueva pregunta al curso'),
                h('button', { class: 'btn-link', type: 'button', onclick: () => sala.actualizarJuego({ fase: 'fin' }) }, 'Terminar y ver resultados')));
          return;
        }
        montar(el,
          h('div', { class: 'etiqueta' }, `Ronda ${j.ronda}${j.total ? ' de ' + j.total : ''} · pozo ${j.pozo}`),
          h('p', { class: 'pregunta-host' }, j.pregunta),
          cabecera,
          j.fase === 'robo' && h('p', { class: 'aviso' }, `${eq?.nombre} tiene una sola oportunidad para robar el pozo.`),
          ultimo,
          lista,
          h('button', { class: 'btn peligro', onclick: () => jugar({ error: true }) }, j.fase === 'robo' ? '✗ No acertó el robo' : '✗ Respuesta incorrecta'));
      },
      refrescar(motivo) {
        if (sala.juego.fase === 'encuesta' && motivo === 'respuestas') pintarEncuesta();
        if (motivo === 'respuestas' || motivo === 'privado' || motivo === 'sala') procesarRespuestas();
      },
      destruir() { clearTimeout(temporizador); },
    });
    return v;
  },

  alumno(el, sala) {
    let enviado = -1;
    let miEncuesta = {};
    return vista({
      clave: () => `${sala.juego.fase}:${sala.juego.ronda}:${sala.juego.paso}:${sala.data.asignaciones?.[sala.uid]}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        const mio = sala.data.asignaciones?.[sala.uid];
        if (j.fase === 'fin') { montar(el, h('h2', null, '¡Terminó el juego!'), ranking(sala)); return; }
        if (j.fase === 'encuesta') {
          const input = h('input', { class: 'campo grande', id: 'encuesta-resp', maxlength: 40, autocomplete: 'off', placeholder: 'Tu respuesta' });
          const estado = h('p', { class: 'muted chico' }, miEncuesta[j.ronda] ? `Respondiste: «${miEncuesta[j.ronda]}». Podés cambiarla.` : 'Respondé lo primero que se te ocurra.');
          montar(el, h('div', { class: 'etiqueta' }, 'Encuesta'), h('p', { class: 'pregunta-alumno' }, j.pregunta),
            h('form', { class: 'pila', onsubmit: async (e) => {
              e.preventDefault();
              const valor = input.value.trim();
              if (!valor) return;
              miEncuesta[j.ronda] = valor; input.value = ''; vibrar(30);
              estado.textContent = `Respondiste: «${valor}». Podés cambiarla.`;
              try { await sala.responder({ ronda: j.ronda, valor }); } catch (err) { toast(err.message, 'error'); }
            } }, input, h('button', { class: 'btn grande', type: 'submit' }, 'Enviar')),
            estado);
          return;
        }
        const eq = sala.equipo(j.turno);
        const u = j.ultimo;
        if (u && u.eid === mio && !u.repetida) vibrar(u.ok ? 50 : [80, 60, 80]);
        const ultimo = u && h('p', { class: 'ultimo ' + (u.repetida ? '' : u.ok ? 'bien' : 'mal') },
          u.repetida ? `«${u.texto}» ya estaba` : u.ok ? `✓ ${u.texto}` : `✗ ${u.texto || 'Error'}`);
        const resumen = h('div', { class: 'fila entre' }, h('span', { class: 'etiqueta' }, `Pozo: ${j.pozo}`), cruces(j.strikes));
        if (j.fase === 'fin_ronda') {
          const g = sala.equipo(j.gano);
          montar(el, h('div', { class: 'resultado ' + (j.gano === mio ? 'bien' : '') },
            h('div', { class: 'resultado-titulo' }, g ? (j.gano === mio ? '¡Ganó tu equipo!' : `Ganó ${g.nombre}`) : 'Nadie suma'),
            g && h('p', null, `+${j.pozo} puntos`)), tablero(j));
          return;
        }
        if (j.turno !== mio) {
          montar(el, ultimo, esperando(j.fase === 'robo' ? `${eq?.nombre} intenta robar el pozo` : `Juega el equipo ${eq?.nombre}`, j.pregunta), resumen, tablero(j));
          return;
        }
        const reloj = h('span', { class: 'reloj' });
        if (j.terminaEn) alLimpiar(cuentaRegresiva(reloj, j.terminaEn));
        const input = h('input', { class: 'campo grande', id: 'encuesta-juego', maxlength: 60, autocomplete: 'off', placeholder: 'Escribí una respuesta' });
        const bloqueado = enviado === j.paso;
        const form = h('form', { class: 'pila', onsubmit: async (e) => {
          e.preventDefault();
          const valor = input.value.trim();
          if (!valor || enviado === j.paso) return;
          enviado = j.paso;
          form.querySelectorAll('button,input').forEach((x) => { x.disabled = true; });
          try { await sala.responder({ paso: j.paso, accion: 'resp', valor }); } catch (err) { enviado = -1; toast(err.message, 'error'); }
        } }, input, h('button', { class: 'btn grande', type: 'submit', disabled: bloqueado }, 'Responder'));
        montar(el, ultimo,
          h('div', { class: 'fila entre' }, h('h2', null, j.fase === 'robo' ? '¡Pueden robar el pozo!' : '¡Le toca a tu equipo!'), j.terminaEn ? reloj : null),
          h('p', { class: 'pregunta-alumno' }, j.pregunta),
          form, resumen, tablero(j));
        if (!bloqueado) setTimeout(() => input.focus(), 50);
      },
    });
  },

  tv(el, sala) {
    let contador = null;
    return vista({
      clave: () => `${sala.juego.fase}:${sala.juego.ronda}:${sala.juego.paso}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        contador = null;
        if (j.fase === 'fin') {
          sonido('fin');
          montar(el, h('div', { class: 'tv-centro' }, h('h1', { class: 'tv-titulo' }, '¡Terminó el juego!'), ranking(sala)));
          return;
        }
        if (j.fase === 'encuesta') {
          contador = h('div', { class: 'tv-contador enorme' }, '0');
          montar(el, h('div', { class: 'tv-cabecera' }, h('span', { class: 'tv-etiqueta' }, `El curso dice · Ronda ${j.ronda} · Encuesta`)),
            h('div', { class: 'tv-pregunta' }, j.pregunta),
            h('div', { class: 'tv-centro' }, contador, h('p', { class: 'tv-sub' }, 'respuestas'),
              h('p', { class: 'tv-sub muted' }, 'Respondé desde tu celular. Después hay que adivinar lo que más dijo el curso.')));
          return;
        }
        const eq = sala.equipo(j.turno);
        const u = j.ultimo;
        const reloj = h('div', { class: 'tv-reloj' });
        if (enJuego(j) && j.terminaEn) alLimpiar(cuentaRegresiva(reloj, j.terminaEn, { cadaSegundo: (f) => reloj.classList.toggle('urgente', f < 5500) }));
        const escena = h('div', { class: 'tv-encuesta' },
          tablero(j, { tv: true }),
          h('div', { class: 'tv-encuesta-lado' },
            h('div', { class: 'tv-etiqueta' }, 'Pozo'),
            h('div', { class: 'tv-pozo' }, j.pozo),
            cruces(j.strikes),
            j.fase === 'fin_ronda'
              ? h('div', { class: 'pila-s centro' }, h('div', { class: 'tv-etiqueta' }, j.gano ? 'Se lo lleva' : 'Nadie suma'), j.gano && pildoraEquipo(sala.equipo(j.gano)))
              : h('div', { class: 'pila-s centro' }, h('div', { class: 'tv-etiqueta' }, j.fase === 'robo' ? '¡Roba!' : 'Juega'), pildoraEquipo(eq)),
            j.terminaEn && enJuego(j) ? reloj : null));
        montar(el,
          h('div', { class: 'tv-cabecera' }, h('span', { class: 'tv-etiqueta' }, `El curso dice · Ronda ${j.ronda}${j.total ? ' de ' + j.total : ''}`)),
          h('div', { class: 'tv-pregunta' }, j.pregunta),
          escena,
          u && !u.repetida && h('div', { class: 'tv-ultimo ' + (u.ok ? 'bien' : 'mal') }, u.ok ? `✓ ${u.texto}` : `✗ ${u.texto || 'No está en el tablero'}`),
          u?.repetida && h('div', { class: 'tv-ultimo' }, `«${u.texto}» ya está en el tablero`));
        if (u && u.ok === false) {
          const x = h('div', { class: 'tv-strike' }, '✗'.repeat(Math.max(1, Math.min(STRIKES, j.strikes))));
          el.append(x);
          const t = setTimeout(() => x.remove(), 1300);
          alLimpiar(() => { clearTimeout(t); x.remove(); });
        }
      },
      refrescar() {
        if (!contador) return;
        contador.textContent = sala.respuestasJuego(sala.juego.ronda).size;
      },
    });
  },
};
