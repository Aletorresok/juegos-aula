// Rosco de repaso (Pasapalabra): cada equipo tiene su rosco y su propio reloj.
// Los equipos se turnan: al errar o decir «pasapalabra» juega el siguiente.
import { h, montar, vista, selectorBanco, selector, ranking, esperando, pildoraEquipo } from './comun.js';
import { itemsDe } from '../bancos.js';
import { mezclar, normalizar, respuestaCorrecta, segundos, toast, sonido, vibrar, idAzar } from '../util.js';

const LETRAS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
const PUNTOS_LETRA = 10;

const primeraAlternativa = (t) => String(t).split('/')[0];

// Arma un rosco por equipo tratando de no repetir términos entre equipos.
export function armarRoscos(terminos, equipos, maxLetras) {
  const usados = new Set();
  const roscos = {};
  const respuestas = {};
  for (const eid of equipos) {
    const letras = [];
    for (const l of LETRAS) {
      const ln = normalizar(l);
      const empieza = [], contiene = [];
      terminos.forEach((t, i) => {
        const n = normalizar(primeraAlternativa(t.termino));
        if (n.startsWith(ln)) empieza.push(i);
        else if (n.includes(ln)) contiene.push(i);
      });
      const grupo = empieza.length ? empieza : contiene;
      if (!grupo.length) continue;
      const libres = grupo.filter((i) => !usados.has(i));
      const i = mezclar(libres.length ? libres : grupo)[0];
      letras.push({ l, modo: empieza.length ? 'empieza' : 'contiene', i });
    }
    let elegidas = letras;
    if (maxLetras && letras.length > maxLetras) {
      const prioridad = mezclar(letras).sort((a, b) => (a.modo === 'empieza' ? 0 : 1) - (b.modo === 'empieza' ? 0 : 1));
      const keep = new Set(prioridad.slice(0, maxLetras).map((x) => x.l));
      elegidas = letras.filter((x) => keep.has(x.l));
    }
    elegidas.forEach((x) => usados.add(x.i));
    roscos[eid] = elegidas.map((x) => ({ l: x.l, modo: x.modo, def: terminos[x.i].definicion, e: 'p' }));
    respuestas[eid] = elegidas.map((x) => terminos[x.i].termino);
  }
  return { roscos, respuestas };
}

// Tiempo que le queda al equipo, contando el turno en curso.
function restante(j, eid) {
  const base = j.restante[eid] || 0;
  return j.corriendo && j.turno === eid ? base - (Date.now() - j.desde) : base;
}

function siguientePendiente(rosco, desde, incluirActual) {
  const n = rosco.length;
  for (let k = incluirActual ? 0 : 1; k <= n; k++) {
    const i = (desde + k) % n;
    if (rosco[i].e === 'p') return i;
  }
  return -1;
}

function anillo(rosco, actual, clase = '') {
  const n = rosco.length;
  return h('div', { class: 'anillo ' + clase, style: { '--n': n } }, rosco.map((x, i) =>
    h('span', { class: `letra ${x.e}${i === actual ? ' actual' : ''}`, style: { '--i': i } }, x.l)));
}

export default {
  id: 'rosco',
  nombre: 'Rosco de repaso',
  icono: '🌀',
  resumen: 'Pasapalabra con las definiciones del banco. Los equipos se turnan.',
  tipos: ['termino'],

  configurar({ bancos, sala }) {
    const b = selectorBanco(bancos, 'termino', 5);
    const seg = selector('cfg-seg', 'Tiempo por equipo', [[60, '1 minuto'], [90, '1 minuto y medio'], [120, '2 minutos'], [180, '3 minutos'], [240, '4 minutos']], 120);
    const max = selector('cfg-max', 'Letras por rosco', [[10, '10'], [15, '15'], [20, '20'], [0, 'Todas las posibles']], 15);
    const conGente = sala.equipos().filter((e) => sala.miembros(e.id).length).map((e) => e.id);
    const checks = sala.equipos().map((e) => ({ e, input: h('input', { type: 'checkbox', id: 'cfg-eq-' + e.id, checked: !conGente.length || conGente.includes(e.id) }) }));
    return {
      el: h('div', { class: 'pila' }, b.el, h('div', { class: 'grilla-2' }, seg.el, max.el),
        h('fieldset', { class: 'pila-s' }, h('legend', { class: 'etq' }, 'Equipos que juegan'),
          h('div', { class: 'fila' }, checks.map(({ e, input }) => h('label', { class: 'check' }, input, pildoraEquipo(e))))),
        h('p', { class: 'muted chico' }, 'Cualquier integrante del equipo en turno puede escribir la respuesta. También podés marcar vos si respondieron en voz alta.')),
      leer: () => {
        const banco = b.banco();
        const equipos = checks.filter((c) => c.input.checked).map((c) => c.e.id);
        if (!banco) return null;
        if (!equipos.length) { toast('Elegí al menos un equipo', 'error'); return null; }
        return { banco, equipos, segundos: Number(seg.valor()), maxLetras: Number(max.valor()) };
      },
    };
  },

  async iniciar(sala, { banco, equipos, segundos: seg, maxLetras }) {
    const orden = mezclar(equipos);
    const { roscos, respuestas } = armarRoscos(itemsDe(banco, 'termino'), orden, maxLetras);
    const id = idAzar();
    await sala.guardarPrivado({ juego: id, respuestas });
    await sala.iniciarJuego({
      tipo: 'rosco', fase: 'jugando', titulo: banco.titulo, orden, turno: orden[0], roscos,
      pos: Object.fromEntries(orden.map((e) => [e, 0])),
      restante: Object.fromEntries(orden.map((e) => [e, seg * 1000])),
      corriendo: false, desde: 0, paso: 0, ultimo: null,
    }, id);
  },

  host(el, sala) {
    let privado = null;
    let procesado = -1;
    let temporizador = null;
    sala.privadoDelJuego().then((p) => { privado = p; v.actualizar('privado'); });

    // Aplica el resultado de la letra actual y decide quién sigue.
    async function aplicar(resultado, textoResp = '') {
      const j = structuredClone(sala.juego);
      if (j.fase !== 'jugando' || procesado === j.paso) return;
      procesado = j.paso;
      const eid = j.turno;
      const rosco = j.roscos[eid];
      const i = j.pos[eid];
      const correcta = privado.respuestas[eid][i];
      const ahora = Date.now();
      if (resultado === 'ok') rosco[i].e = 'ok';
      if (resultado === 'mal') rosco[i].e = 'mal';
      j.ultimo = { eid, l: rosco[i].l, resp: textoResp, ok: resultado === 'pasa' ? null : resultado === 'ok', correcta: resultado === 'mal' ? correcta : null, i };
      const sig = siguientePendiente(rosco, i, false);
      j.pos[eid] = sig >= 0 ? sig : i;
      if (resultado !== 'ok' || sig < 0) cambiarTurno(j, ahora);
      j.paso++;
      await guardar(j);
      sonido(resultado === 'ok' ? 'bien' : resultado === 'mal' ? 'mal' : 'tic');
    }

    function cambiarTurno(j, ahora) {
      if (j.corriendo) j.restante[j.turno] = Math.max(0, j.restante[j.turno] - (ahora - j.desde));
      const vivos = j.orden.filter((e) => j.restante[e] > 0 && j.roscos[e].some((x) => x.e === 'p'));
      if (!vivos.length) { j.fase = 'fin'; j.corriendo = false; return; }
      const idx = j.orden.indexOf(j.turno);
      let prox = null;
      for (let k = 1; k <= j.orden.length; k++) {
        const e = j.orden[(idx + k) % j.orden.length];
        if (vivos.includes(e)) { prox = e; break; }
      }
      if (prox === j.turno && j.corriendo) { j.desde = ahora; return; } // sigue el mismo equipo
      j.turno = prox;
      j.corriendo = false;
    }

    async function guardar(j) {
      const campos = { fase: j.fase, turno: j.turno, roscos: j.roscos, pos: j.pos, restante: j.restante, corriendo: j.corriendo, desde: j.desde, paso: j.paso, ultimo: j.ultimo };
      try {
        await sala.actualizarJuego(campos);
        if (j.fase === 'fin') {
          const sumas = Object.fromEntries(j.orden.map((e) => [e, j.roscos[e].filter((x) => x.e === 'ok').length * PUNTOS_LETRA]));
          await sala.sumar(sumas);
        }
      } catch (e) { toast('No se pudo guardar: ' + e.message, 'error'); }
    }

    async function arrancar() {
      const j = sala.juego;
      if (j.corriendo || j.fase !== 'jugando') return;
      await sala.actualizarJuego({ corriendo: true, desde: Date.now(), paso: j.paso + 1 });
    }

    async function pausar() {
      const j = structuredClone(sala.juego);
      if (!j.corriendo) return;
      j.restante[j.turno] = Math.max(0, j.restante[j.turno] - (Date.now() - j.desde));
      await sala.actualizarJuego({ corriendo: false, restante: j.restante, paso: j.paso + 1 });
    }

    async function tiempoAgotado() {
      const j = structuredClone(sala.juego);
      if (!j.corriendo || restante(j, j.turno) > 0) return;
      j.restante[j.turno] = 0;
      j.corriendo = false;
      j.ultimo = { eid: j.turno, agotado: true };
      cambiarTurno(j, Date.now());
      j.paso++;
      await guardar(j);
      sonido('mal');
    }

    async function corregirUltimo() {
      const j = structuredClone(sala.juego);
      const u = j.ultimo;
      if (!u || u.ok !== false) return;
      j.roscos[u.eid][u.i].e = 'ok';
      j.ultimo = { ...u, ok: true, corregida: true };
      await sala.actualizarJuego({ roscos: j.roscos, ultimo: j.ultimo });
      if (j.fase === 'fin') await sala.sumar({ [u.eid]: PUNTOS_LETRA });
    }

    function procesarRespuestas() {
      const j = sala.juego;
      if (!privado || j.fase !== 'jugando') return;
      const candidatas = [...sala.respuestasJuego().values()]
        .filter((r) => r.paso === j.paso && r.equipo === j.turno)
        .sort((a, b) => a.t - b.t);
      const r = candidatas[0];
      if (!r) return;
      if (r.accion === 'arrancar') { if (!j.corriendo) arrancar(); return; }
      if (!j.corriendo) return;
      if (r.accion === 'pasa') aplicar('pasa');
      else if (r.accion === 'resp') {
        const ok = respuestaCorrecta(r.valor, privado.respuestas[j.turno][j.pos[j.turno]]);
        aplicar(ok ? 'ok' : 'mal', r.valor);
      }
    }

    const v = vista({
      clave: () => `${sala.juego.fase}:${sala.juego.paso}:${sala.juego.ultimo?.ok}:${!!privado}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        clearTimeout(temporizador);
        if (!privado) { montar(el, esperando('Cargando el rosco…')); return; }
        if (j.fase === 'fin') { montar(el, h('h3', null, '¡Terminó el rosco!'), resumenEquipos(sala, j), ranking(sala)); return; }
        const eq = sala.equipo(j.turno);
        const i = j.pos[j.turno];
        const letra = j.roscos[j.turno][i];
        const reloj = h('span', { class: 'reloj grande' });
        const tic = () => { reloj.textContent = segundos(restante(sala.juego, j.turno)); };
        tic();
        const iv = setInterval(tic, 250);
        alLimpiar(() => clearInterval(iv));
        if (j.corriendo) {
          temporizador = setTimeout(tiempoAgotado, Math.max(0, restante(j, j.turno)) + 150);
          alLimpiar(() => clearTimeout(temporizador));
        }
        const u = j.ultimo;
        montar(el,
          h('div', { class: 'fila entre' }, h('span', null, 'Turno de ', pildoraEquipo(eq)), reloj),
          u && !u.agotado && h('p', { class: 'ultimo ' + (u.ok ? 'bien' : u.ok === false ? 'mal' : '') },
            `${sala.equipo(u.eid)?.nombre} · ${u.l}: `,
            u.ok === null ? 'pasapalabra' : u.ok ? `✓ ${u.resp || 'correcta'}` : `✗ «${u.resp || '—'}» (era: ${u.correcta})`,
            u.ok === false && h('button', { class: 'btn-link', onclick: corregirUltimo }, 'Estaba bien')),
          h('div', { class: 'tarjeta suave pila-s' },
            h('div', { class: 'etiqueta' }, `${letra.modo === 'empieza' ? 'Empieza con' : 'Contiene la'} ${letra.l}`),
            h('p', { class: 'pregunta-host' }, letra.def),
            h('p', { class: 'ok-txt' }, 'Respuesta: ', h('b', null, privado.respuestas[j.turno][i]))),
          j.corriendo
            ? h('div', { class: 'grilla-3' },
              h('button', { class: 'btn ok', onclick: () => aplicar('ok') }, '✓ Correcta'),
              h('button', { class: 'btn peligro', onclick: () => aplicar('mal') }, '✗ Incorrecta'),
              h('button', { class: 'btn sec', onclick: () => aplicar('pasa') }, 'Pasapalabra'))
            : h('button', { class: 'btn grande', onclick: arrancar }, `▶ Arrancar turno de ${eq?.nombre}`),
          j.corriendo && h('button', { class: 'btn-link', onclick: pausar }, 'Pausar el reloj'),
          resumenEquipos(sala, j));
      },
      refrescar(motivo) {
        if (motivo === 'respuestas' || motivo === 'privado' || motivo === 'sala') procesarRespuestas();
      },
      destruir() { clearTimeout(temporizador); },
    });
    return v;
  },

  alumno(el, sala) {
    let enviado = -1;
    return vista({
      clave: () => `${sala.juego.fase}:${sala.juego.paso}:${sala.data.asignaciones?.[sala.uid]}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        const mio = sala.data.asignaciones?.[sala.uid];
        if (j.fase === 'fin') { montar(el, h('h2', null, '¡Terminó el rosco!'), resumenEquipos(sala, j), ranking(sala)); return; }
        const u = j.ultimo;
        if (u && u.eid === mio && u.ok !== undefined && !u.agotado) vibrar(u.ok ? 50 : [80, 60, 80]);
        const ultimo = u && !u.agotado && h('p', { class: 'ultimo ' + (u.ok ? 'bien' : u.ok === false ? 'mal' : '') },
          `${sala.equipo(u.eid)?.nombre} · ${u.l}: `, u.ok === null ? 'pasapalabra' : u.ok ? '✓ correcta' : `✗ era «${u.correcta}»`);
        if (!j.orden.includes(mio)) { montar(el, esperando('Tu equipo no juega este rosco', 'Mirá la pantalla grande.')); return; }
        if (j.turno !== mio) {
          const eq = sala.equipo(j.turno);
          const ok = j.roscos[mio].filter((x) => x.e === 'ok').length;
          montar(el, ultimo, esperando(`Juega el equipo ${eq?.nombre}`, `Tu equipo lleva ${ok} de ${j.roscos[mio].length} · le quedan ${segundos(j.restante[mio])} s`),
            anillo(j.roscos[mio], -1, 'chico'));
          return;
        }
        if (!j.corriendo) {
          montar(el, ultimo, h('div', { class: 'pila centro' },
            h('h2', null, '¡Le toca a tu equipo!'),
            h('p', { class: 'muted' }, `Tienen ${segundos(j.restante[mio])} segundos. Cuando estén listos:`),
            h('button', { class: 'btn grande', disabled: enviado === j.paso, onclick: async (e) => {
              e.currentTarget.disabled = true; enviado = j.paso;
              try { await sala.responder({ paso: j.paso, accion: 'arrancar' }); } catch (err) { toast(err.message, 'error'); }
            } }, '▶ ¡Arrancamos!')));
          return;
        }
        const i = j.pos[mio];
        const letra = j.roscos[mio][i];
        const reloj = h('span', { class: 'reloj' });
        const tic = () => { reloj.textContent = segundos(restante(sala.juego, mio)); };
        tic();
        const iv = setInterval(tic, 250);
        alLimpiar(() => clearInterval(iv));
        const input = h('input', { class: 'campo grande', id: 'rosco-resp', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'Escribí la respuesta' });
        const bloqueado = enviado === j.paso;
        const enviar = async (accion) => {
          if (enviado === j.paso) return;
          const valor = input.value.trim();
          if (accion === 'resp' && !valor) { input.focus(); return; }
          enviado = j.paso;
          form.querySelectorAll('button,input').forEach((b) => { b.disabled = true; });
          try { await sala.responder({ paso: j.paso, accion, valor }); } catch (err) { enviado = -1; toast(err.message, 'error'); }
        };
        const form = h('form', { class: 'pila', onsubmit: (e) => { e.preventDefault(); enviar('resp'); } },
          input,
          h('button', { class: 'btn grande', type: 'submit', disabled: bloqueado }, 'Responder'),
          h('button', { class: 'btn sec grande', type: 'button', disabled: bloqueado, onclick: () => enviar('pasa') }, 'Pasapalabra'));
        montar(el, ultimo,
          h('div', { class: 'fila entre' }, h('span', { class: 'letra-grande' }, letra.l), reloj),
          h('div', { class: 'etiqueta' }, letra.modo === 'empieza' ? `Empieza con ${letra.l}` : `Contiene la ${letra.l}`),
          h('p', { class: 'pregunta-alumno' }, letra.def),
          form);
        if (!bloqueado) setTimeout(() => input.focus(), 50);
      },
    });
  },

  tv(el, sala) {
    return vista({
      clave: () => `${sala.juego.fase}:${sala.juego.paso}:${sala.juego.ultimo?.ok}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        if (j.fase === 'fin') {
          sonido('fin');
          montar(el, h('div', { class: 'tv-centro' }, h('h1', { class: 'tv-titulo' }, '¡Terminó el rosco!'), resumenEquipos(sala, j, true), ranking(sala)));
          return;
        }
        const eq = sala.equipo(j.turno);
        const rosco = j.roscos[j.turno];
        const i = j.pos[j.turno];
        const letra = rosco[i];
        const reloj = h('div', { class: 'tv-reloj enorme' });
        const tic = () => {
          const f = restante(sala.juego, j.turno);
          reloj.textContent = segundos(f);
          reloj.classList.toggle('urgente', j.corriendo && f < 10500);
        };
        tic();
        const iv = setInterval(tic, 250);
        alLimpiar(() => clearInterval(iv));
        const u = j.ultimo;
        montar(el,
          h('div', { class: 'tv-rosco' },
            h('div', { class: 'tv-anillo-caja' },
              anillo(rosco, j.corriendo ? i : -1, 'en-tv'),
              h('div', { class: 'anillo-centro' },
                h('div', { class: 'anillo-letra' }, letra.l),
                h('div', { class: 'anillo-modo' }, letra.modo === 'empieza' ? 'Empieza con' : 'Contiene'))),
            h('div', { class: 'tv-rosco-info' },
              h('div', { class: 'tv-etiqueta' }, j.titulo || 'Rosco'),
              h('div', null, pildoraEquipo(eq)),
              j.corriendo
                ? h('div', { class: 'tv-definicion' }, letra.def)
                : h('div', { class: 'tv-definicion muted' }, `Turno del equipo ${eq?.nombre}. ¡Prepárense!`),
              reloj,
              u && !u.agotado && h('div', { class: 'tv-ultimo ' + (u.ok ? 'bien' : u.ok === false ? 'mal' : '') },
                u.ok === null ? `${u.l}: pasapalabra` : u.ok ? `✓ ${u.l}: ${u.resp || 'correcta'}` : `✗ ${u.l}: era «${u.correcta}»`),
              u?.agotado && h('div', { class: 'tv-ultimo mal' }, `Se terminó el tiempo de ${sala.equipo(u.eid)?.nombre}`))),
          resumenEquipos(sala, j, true));
      },
    });
  },
};

function resumenEquipos(sala, j, tv = false) {
  return h('div', { class: tv ? 'tv-equipos' : 'fila' }, j.orden.map((eid) => {
    const e = sala.equipo(eid);
    const r = j.roscos[eid];
    const ok = r.filter((x) => x.e === 'ok').length;
    const mal = r.filter((x) => x.e === 'mal').length;
    return tv
      ? h('div', { class: 'tv-eq' + (eid === j.turno && j.fase !== 'fin' ? ' activo' : ''), style: { '--c': e?.color } },
        h('span', { class: 'tv-eq-nombre' }, e?.nombre),
        h('span', { class: 'tv-eq-dato' }, h('span', { class: 'ok-txt' }, `✓${ok}`), ' ', h('span', { class: 'mal-txt' }, `✗${mal}`)),
        h('span', { class: 'tv-eq-pts' }, `${segundos(restante(j, eid))} s`))
      : pildoraEquipo(e, ` ✓${ok} ✗${mal}`);
  }));
}
