// Escape del aula: cada equipo abre una serie de candados resolviendo desafíos.
// Un código incorrecto bloquea el candado unos segundos; las pistas se piden desde el celular.
import { h, montar, vista, selector, ranking, esperando, pildoraEquipo } from './comun.js';
import { itemsDe } from '../bancos.js';
import { codigoCorrecto, largoCandado, textoCodigo, compositor, TIPOS_CANDADO } from '../escapes.js';
import { mezclar, cuentaRegresiva, toast, sonido, vibrar, idAzar, segundos } from '../util.js';

const PUNTOS_LLEGADA = [100, 70, 50];
const PUNTOS_ESCAPAR = 30;
const DESCUENTO_PISTA = 5;
const PUNTOS_CANDADO = 10;

function reloj(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Cuenta regresiva en formato mm:ss.
function relojRegresivo(el, hasta, alTerminar) {
  let fin = false;
  const tic = () => {
    const falta = hasta - Date.now();
    el.textContent = reloj(falta);
    el.classList.toggle('urgente', falta < 60000);
    if (falta <= 0 && !fin) { fin = true; clearInterval(t); alTerminar?.(); }
  };
  const t = setInterval(tic, 500);
  tic();
  return () => clearInterval(t);
}

function filaCandados(j, p) {
  return h('div', { class: 'candados-fila' }, j.candados.map((_, i) =>
    h('span', { class: 'cand ' + (i < p.n ? 'abierto' : i === p.n && !p.termino ? 'actual' : ''), 'aria-label': `Candado ${i + 1}${i < p.n ? ' abierto' : ''}` }, i < p.n ? '✓' : i + 1)));
}

function puntosFinales(j) {
  const puntos = {};
  for (const eid of j.orden) {
    const p = j.progreso[eid];
    const lugar = (j.llegada || []).indexOf(eid);
    if (lugar >= 0) puntos[eid] = Math.max(PUNTOS_CANDADO, (PUNTOS_LLEGADA[lugar] ?? PUNTOS_ESCAPAR) - DESCUENTO_PISTA * p.pistas);
    else puntos[eid] = PUNTOS_CANDADO * p.n;
  }
  return puntos;
}

function resultados(sala, j, { tv = false } = {}) {
  const filas = j.orden.map((eid) => ({ eid, p: j.progreso[eid], lugar: (j.llegada || []).indexOf(eid) }))
    .sort((a, b) => (a.lugar < 0) - (b.lugar < 0) || a.lugar - b.lugar || b.p.n - a.p.n);
  return h('ol', { class: tv ? 'tv-escape-res' : 'escape-res' }, filas.map(({ eid, p, lugar }) => {
    const e = sala.equipo(eid);
    return h('li', { style: { '--c': e?.color } },
      h('span', { class: 'res-nombre' }, e?.nombre),
      h('span', { class: 'res-dato' }, lugar >= 0 ? `🔓 Escaparon en ${reloj(p.termino - j.inicio)}` : `${p.n} de ${j.candados.length} candados`),
      h('span', { class: 'res-dato' }, `${p.pistas} ${p.pistas === 1 ? 'pista' : 'pistas'}`),
      j.puntos && h('span', { class: 'res-pts' }, `+${j.puntos[eid]}`));
  }));
}

export default {
  id: 'escape',
  nombre: 'Escape del aula',
  icono: '🔐',
  resumen: 'Escape room por equipos: candados con desafíos, pistas y contrarreloj.',
  tipos: ['escape'],

  configurar({ bancos, sala }) {
    const aptos = bancos.flatMap((b) => itemsDe(b, 'escape').map((e, i) => ({ b, e, clave: `${b.id}:${i}` })));
    if (!aptos.length) {
      return {
        el: h('p', { class: 'aviso' }, 'Necesitás un escape. Agregá «El voto robado» desde «Bancos listos para usar» o creá uno en la pestaña «Escapes» de un banco.'),
        leer: () => null,
      };
    }
    const sel = h('select', { class: 'campo', id: 'cfg-escape' }, aptos.map((a) =>
      h('option', { value: a.clave }, `${a.e.titulo} — ${a.e.candados.length} candados (${a.b.titulo})`)));
    const minutos = selector('cfg-minutos', 'Tiempo', [[0, 'El que trae el escape'], [15, '15 minutos'], [20, '20 minutos'], [30, '30 minutos'], [40, '40 minutos'], [60, '1 hora']], 0);
    const espera = selector('cfg-espera', 'Espera tras un código incorrecto', [[10, '10 segundos'], [20, '20 segundos'], [30, '30 segundos']], 20);
    const conGente = sala.equipos().filter((e) => sala.miembros(e.id).length).map((e) => e.id);
    const checks = sala.equipos().map((e) => ({ e, input: h('input', { type: 'checkbox', id: 'cfg-eq-' + e.id, checked: !conGente.length || conGente.includes(e.id) }) }));
    return {
      el: h('div', { class: 'pila' },
        h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Escape'), sel),
        h('div', { class: 'grilla-2' }, minutos.el, espera.el),
        h('fieldset', { class: 'pila-s' }, h('legend', { class: 'etq' }, 'Equipos que juegan'),
          h('div', { class: 'fila' }, checks.map(({ e, input }) => h('label', { class: 'check' }, input, pildoraEquipo(e))))),
        h('p', { class: 'muted chico' }, `Cualquier integrante del equipo puede probar códigos y pedir pistas. Puntos: ${PUNTOS_LLEGADA.join(', ')} para los tres primeros en escapar y ${PUNTOS_ESCAPAR} para el resto (−${DESCUENTO_PISTA} por pista); si no escapan, ${PUNTOS_CANDADO} por candado abierto.`)),
      leer: () => {
        const a = aptos.find((x) => x.clave === sel.value);
        const equipos = checks.filter((c) => c.input.checked).map((c) => c.e.id);
        if (!equipos.length) { toast('Elegí al menos un equipo', 'error'); return null; }
        return { escape: a.e, equipos, minutos: Number(minutos.valor()) || a.e.minutos || 30, espera: Number(espera.valor()) };
      },
    };
  },

  async iniciar(sala, { escape, equipos, minutos, espera }) {
    const id = idAzar();
    const orden = mezclar(equipos);
    await sala.guardarPrivado({ juego: id, respuestas: escape.candados.map((c) => c.respuesta), pistas: Object.fromEntries(escape.candados.map((c, i) => [i, c.pistas || []])) });
    await sala.iniciarJuego({
      tipo: 'escape', fase: 'intro', titulo: escape.titulo, intro: escape.intro || '', final: escape.final || '',
      candados: escape.candados.map((c) => ({ titulo: c.titulo || '', desafio: c.desafio, tipo: c.tipo, largo: largoCandado(c), pistas: (c.pistas || []).length })),
      orden, minutos, espera: espera * 1000, inicio: 0, terminaEn: 0, llegada: [], pistasVistas: {},
      progreso: Object.fromEntries(orden.map((e) => [e, { n: 0, errores: 0, pistas: 0, bloqueoHasta: 0, termino: 0, vistos: {}, ultimo: null }])),
    }, id);
  },

  host(el, sala) {
    let privado = null;
    let ocupado = false;
    let otraVez = false;
    let temporizador = null;
    sala.privadoDelJuego().then((p) => { privado = p; v.actualizar('privado'); });

    function darPista(j, eid, prog, vistas) {
      const p = prog[eid];
      const lista = privado.pistas[p.n] || [];
      const ya = vistas[eid]?.[p.n]?.length || 0;
      if (ya >= lista.length) return false;
      vistas[eid] = { ...(vistas[eid] || {}), [p.n]: lista.slice(0, ya + 1) };
      p.pistas++;
      return true;
    }

    function abrir(j, eid, prog, llegada, valor) {
      const p = prog[eid];
      p.n++;
      p.ultimo = { ok: true, valor: valor ?? '' };
      if (p.n >= j.candados.length && !p.termino) { p.termino = Date.now(); llegada.push(eid); }
    }

    // Aplica un cambio sobre el progreso y lo guarda (sin pisar procesos en curso).
    async function aplicar(cambio) {
      const j = sala.juego;
      if (!privado || j.fase !== 'jugando') return;
      const prog = structuredClone(j.progreso);
      const vistas = structuredClone(j.pistasVistas || {});
      const llegada = [...(j.llegada || [])];
      if (!cambio(j, prog, vistas, llegada)) return;
      await sala.actualizarJuego({ progreso: prog, pistasVistas: vistas, llegada });
      if (j.orden.every((e) => prog[e].termino)) await terminar({ ...j, progreso: prog, llegada });
    }

    async function procesar() {
      if (ocupado) { otraVez = true; return; }
      ocupado = true;
      try {
        await aplicar((j, prog, vistas, llegada) => {
          let hubo = false;
          const ahora = Date.now();
          const resps = [...sala.respuestasJuego().entries()].sort((a, b) => a[1].t - b[1].t);
          for (const [uid, r] of resps) {
            const p = prog[r.equipo];
            if (!p || p.termino || r.t <= (p.vistos[uid] || 0)) continue;
            p.vistos[uid] = r.t;
            hubo = true;
            if (r.ronda !== p.n) continue;
            if (r.accion === 'pista') { darPista(j, r.equipo, prog, vistas); continue; }
            if (r.accion !== 'probar' || ahora < p.bloqueoHasta) continue;
            if (codigoCorrecto(j.candados[p.n].tipo, r.valor, privado.respuestas[p.n])) abrir(j, r.equipo, prog, llegada, r.valor);
            else { p.errores++; p.bloqueoHasta = ahora + j.espera; p.ultimo = { ok: false, valor: r.valor }; }
          }
          return hubo;
        });
      } catch (e) { toast('No se pudo guardar: ' + e.message, 'error'); }
      ocupado = false;
      if (otraVez) { otraVez = false; procesar(); }
    }

    async function empezar() {
      const j = sala.juego;
      const inicio = Date.now();
      await sala.actualizarJuego({ fase: 'jugando', inicio, terminaEn: inicio + j.minutos * 60000 });
    }

    let terminado = false;
    async function terminar(actual) {
      const j = actual || sala.juego;
      if (j.fase === 'fin' || terminado) return;
      terminado = true;
      const puntos = puntosFinales(j);
      await sala.actualizarJuego({ fase: 'fin', puntos });
      await sala.sumar(puntos);
    }

    const v = vista({
      clave: () => { const j = sala.juego; return `${j.fase}:${JSON.stringify(j.progreso)}:${JSON.stringify(j.pistasVistas)}:${!!privado}`; },
      dibujar(alLimpiar) {
        const j = sala.juego;
        clearTimeout(temporizador);
        if (!privado) { montar(el, esperando('Cargando el escape…')); return; }
        const solucion = h('details', { class: 'tarjeta suave secreto-docente' },
          h('summary', null, 'Ver soluciones (no lo proyectes)'),
          h('ol', { class: 'soluciones' }, j.candados.map((c, i) => h('li', null,
            h('b', null, textoCodigo(c.tipo, privado.respuestas[i])), h('span', { class: 'muted chico' }, ` · ${TIPOS_CANDADO[c.tipo].nombre}`)))));
        if (j.fase === 'intro') {
          montar(el, h('h3', null, '🔐 ', j.titulo),
            j.intro && h('p', { class: 'historia' }, j.intro),
            h('p', { class: 'muted' }, `${j.candados.length} candados · ${j.minutos} minutos. Leé la historia en voz alta mientras se ve en la pantalla grande.`),
            solucion,
            h('button', { class: 'btn grande', onclick: empezar }, `▶ Empezar (${j.minutos} min)`));
          return;
        }
        if (j.fase === 'fin') {
          montar(el, h('h3', null, 'Terminó el escape'), resultados(sala, j), ranking(sala));
          return;
        }
        const r = h('span', { class: 'reloj grande' });
        alLimpiar(relojRegresivo(r, j.terminaEn));
        temporizador = setTimeout(() => terminar(), Math.max(0, j.terminaEn - Date.now()) + 300);
        alLimpiar(() => clearTimeout(temporizador));
        montar(el,
          h('div', { class: 'fila entre' }, h('b', null, j.titulo), r),
          h('div', { class: 'escape-equipos' }, j.orden.map((eid) => {
            const p = j.progreso[eid];
            const c = j.candados[p.n];
            const quedan = c ? c.pistas - (j.pistasVistas?.[eid]?.[p.n]?.length || 0) : 0;
            return h('div', { class: 'tarjeta pila-s', style: { '--c': sala.equipo(eid)?.color } },
              h('div', { class: 'fila entre' }, pildoraEquipo(sala.equipo(eid)),
                h('span', { class: 'muted chico' }, `${p.errores} errores · ${p.pistas} pistas`)),
              filaCandados(j, p),
              p.termino
                ? h('p', { class: 'ok-txt' }, `🔓 ¡Escaparon en ${reloj(p.termino - j.inicio)}!`)
                : h('div', { class: 'fila' },
                  h('span', { class: 'chico' }, `Candado ${p.n + 1}: `, h('b', null, textoCodigo(c.tipo, privado.respuestas[p.n]))),
                  quedan > 0 && h('button', { class: 'btn sec chico', onclick: () => aplicar((jj, prog, vistas) => darPista(jj, eid, prog, vistas)) }, 'Dar pista'),
                  h('button', { class: 'btn sec chico', onclick: () => aplicar((jj, prog, vistas, llegada) => { abrir(jj, eid, prog, llegada); return true; }) }, 'Abrir candado')));
          })),
          solucion,
          h('button', { class: 'btn-link peligro', onclick: () => terminar() }, 'Terminar el escape ahora'));
      },
      refrescar(motivo) {
        if (motivo === 'respuestas' || motivo === 'privado' || motivo === 'sala') procesar();
      },
      destruir() { clearTimeout(temporizador); },
    });
    return v;
  },

  alumno(el, sala) {
    return vista({
      clave: () => {
        const j = sala.juego;
        const mio = sala.data.asignaciones?.[sala.uid];
        const p = j.progreso?.[mio];
        return `${j.fase}:${mio}:${p?.n}:${p?.bloqueoHasta}:${p?.termino}:${JSON.stringify(j.pistasVistas?.[mio] || {})}`;
      },
      dibujar(alLimpiar) {
        const j = sala.juego;
        const mio = sala.data.asignaciones?.[sala.uid];
        const p = j.progreso?.[mio];
        if (!p) { montar(el, esperando('Tu equipo no juega este escape', 'Mirá la pantalla grande.')); return; }
        if (j.fase === 'intro') {
          montar(el, h('div', { class: 'etiqueta' }, 'Escape del aula'), h('h2', null, '🔐 ', j.titulo),
            j.intro && h('p', { class: 'historia' }, j.intro),
            esperando('Esperá la señal para empezar', `${j.candados.length} candados · ${j.minutos} minutos`));
          return;
        }
        if (j.fase === 'fin') {
          montar(el, h('div', { class: 'resultado ' + (p.termino ? 'bien' : 'mal') },
            h('div', { class: 'resultado-titulo' }, p.termino ? '¡Escaparon!' : 'Se terminó el tiempo'),
            p.termino && j.final && h('p', { class: 'historia' }, j.final),
            j.puntos && h('p', null, `Tu equipo suma ${j.puntos[mio]} puntos`)), resultados(sala, j));
          return;
        }
        const r = h('span', { class: 'reloj' });
        alLimpiar(relojRegresivo(r, j.terminaEn));
        if (p.termino) {
          vibrar([100, 60, 100]);
          montar(el, h('div', { class: 'resultado bien' },
            h('div', { class: 'resultado-titulo' }, '🔓 ¡Escaparon!'),
            h('p', null, `Tiempo: ${reloj(p.termino - j.inicio)}`),
            j.final && h('p', { class: 'historia' }, j.final)),
            h('p', { class: 'muted centro' }, 'Esperen a que terminen los demás equipos.'));
          return;
        }
        const c = j.candados[p.n];
        const vistas = j.pistasVistas?.[mio]?.[p.n] || [];
        const quedan = c.pistas - vistas.length;
        if (p.ultimo) vibrar(p.ultimo.ok ? 60 : [80, 60, 80]);

        let leer;
        let entrada;
        if (c.tipo === 'direccion' || c.tipo === 'color') {
          const comp = compositor(c.tipo, { max: c.largo });
          entrada = comp.el;
          leer = comp.valor;
        } else {
          const input = h('input', {
            class: 'campo grande mono codigo-escape', id: 'escape-codigo', autocomplete: 'off', autocapitalize: 'off', spellcheck: false,
            inputmode: c.tipo === 'numero' ? 'numeric' : 'text', maxlength: c.tipo === 'numero' ? c.largo : 60,
            placeholder: c.tipo === 'numero' ? '_ '.repeat(c.largo).trim() : `${c.largo} letras`,
          });
          entrada = input;
          leer = () => input.value.trim();
          setTimeout(() => input.focus(), 50);
        }
        const bloqueo = h('p', { class: 'bloqueo', hidden: true });
        const probar = h('button', { class: 'btn grande', type: 'submit' }, '🔑 Probar código');
        const bloquear = (hasta) => {
          const falta = hasta - Date.now();
          if (falta <= 0) return;
          probar.disabled = true;
          bloqueo.hidden = false;
          const stop = cuentaRegresiva(h('span'), hasta, {
            cadaSegundo: (f) => { bloqueo.textContent = `Código incorrecto. El candado se trabó: esperá ${segundos(f)} s.`; },
            alTerminar: () => { probar.disabled = false; bloqueo.hidden = true; },
          });
          alLimpiar(stop);
        };
        const form = h('form', { class: 'pila', onsubmit: async (e) => {
          e.preventDefault();
          const valor = leer();
          if (!valor) return;
          probar.disabled = true;
          const reintento = setTimeout(() => { probar.disabled = false; }, 4000);
          alLimpiar(() => clearTimeout(reintento));
          try { await sala.responder({ ronda: p.n, accion: 'probar', valor }); } catch (err) { toast(err.message, 'error'); probar.disabled = false; }
        } }, entrada, probar, bloqueo);
        montar(el,
          h('div', { class: 'fila entre' }, h('span', { class: 'etiqueta' }, `Candado ${p.n + 1} de ${j.candados.length}`), r),
          filaCandados(j, p),
          p.ultimo?.ok && p.n > 0 && h('p', { class: 'ultimo bien' }, '🔓 ¡Candado abierto!'),
          h('div', { class: 'candado-tarjeta pila-s' },
            h('div', { class: 'etiqueta' }, `🔒 ${c.titulo || TIPOS_CANDADO[c.tipo].nombre}`),
            h('p', { class: 'desafio' }, c.desafio),
            h('p', { class: 'muted chico' }, c.tipo === 'numero' ? `Código de ${c.largo} números` : c.tipo === 'palabra' ? `Palabra de ${c.largo} letras` : `Secuencia de ${c.largo}`)),
          vistas.length > 0 && h('div', { class: 'pistas' }, vistas.map((t, i) => h('p', null, h('b', null, `💡 Pista ${i + 1}: `), t))),
          form,
          quedan > 0 && h('button', { class: 'btn-link', onclick: async (e) => {
            e.currentTarget.disabled = true;
            try { await sala.responder({ ronda: p.n, accion: 'pista', valor: '' }); } catch (err) { toast(err.message, 'error'); }
          } }, `💡 Pedir una pista (quedan ${quedan}, cuesta ${DESCUENTO_PISTA} puntos)`));
        if (p.bloqueoHasta > Date.now()) bloquear(p.bloqueoHasta);
      },
    });
  },

  tv(el, sala) {
    let abiertos = 0, errores = 0;
    return vista({
      clave: () => { const j = sala.juego; return `${j.fase}:${JSON.stringify(j.progreso)}`; },
      dibujar(alLimpiar) {
        const j = sala.juego;
        if (j.fase === 'intro') {
          montar(el, h('div', { class: 'tv-centro tv-escape-intro' },
            h('div', { class: 'tv-etiqueta' }, 'Escape del aula'),
            h('h1', { class: 'tv-titulo enorme' }, j.titulo),
            j.intro && h('p', { class: 'tv-historia' }, j.intro),
            h('p', { class: 'tv-sub' }, `🔒 ${j.candados.length} candados · ⏱ ${j.minutos} minutos`)));
          return;
        }
        if (j.fase === 'fin') {
          sonido('fin');
          montar(el, h('div', { class: 'tv-centro' },
            h('h1', { class: 'tv-titulo' }, (j.llegada || []).length ? '¡Se terminó el escape!' : 'Se terminó el tiempo'),
            (j.llegada || []).length > 0 && j.final && h('p', { class: 'tv-historia' }, j.final),
            resultados(sala, j, { tv: true })));
          return;
        }
        const r = h('div', { class: 'tv-reloj enorme' });
        alLimpiar(relojRegresivo(r, j.terminaEn));
        const ps = Object.values(j.progreso);
        const a = ps.reduce((s, p) => s + p.n, 0);
        const e = ps.reduce((s, p) => s + p.errores, 0);
        if (a > abiertos) sonido('bien'); else if (e > errores) sonido('mal');
        abiertos = a; errores = e;
        montar(el,
          h('div', { class: 'tv-cabecera' }, h('span', { class: 'tv-etiqueta' }, `🔐 ${j.titulo}`), r),
          h('div', { class: 'tv-escape' }, j.orden.map((eid) => {
            const p = j.progreso[eid];
            const e = sala.equipo(eid);
            const lugar = (j.llegada || []).indexOf(eid);
            return h('div', { class: 'tv-escape-eq' + (p.termino ? ' escapo' : ''), style: { '--c': e?.color } },
              h('span', { class: 'tv-eq-nombre' }, e?.nombre),
              filaCandados(j, p),
              h('span', { class: 'tv-eq-dato' }, p.termino ? `${lugar + 1}° · ${reloj(p.termino - j.inicio)}` : `${p.pistas} 💡`));
          })));
      },
    });
  },
};
