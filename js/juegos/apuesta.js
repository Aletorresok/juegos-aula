// ¿Cuánto apostás?: verdadero o falso con apuesta de confianza. Acertar suma lo apostado
// y errar lo resta; al revelar se ve cuántos estaban muy seguros y se equivocaron.
import { h, montar, vista, selectorBanco, selector, ranking, esperando, pildoraEquipo } from './comun.js';
import { itemsDe } from '../bancos.js';
import { mezclar, cuentaRegresiva, toast, sonido, vibrar, idAzar } from '../util.js';

const APUESTAS = [10, 20, 50];

// La respuesta viaja como texto: «V20», «F50»…
const leer = (valor) => {
  const m = /^([VF])(\d+)$/.exec(String(valor || ''));
  return m ? { vf: m[1], apuesta: Number(m[2]) } : null;
};

export default {
  id: 'apuesta',
  nombre: '¿Cuánto apostás?',
  icono: '🎲',
  resumen: 'Verdadero o falso apostando según qué tan seguro estás.',
  tipos: ['afirmacion'],

  configurar({ bancos }) {
    const b = selectorBanco(bancos, 'afirmacion', 1);
    const cant = selector('cfg-cantidad', 'Cantidad de afirmaciones', [[5, '5'], [8, '8'], [10, '10'], [0, 'Todas']], 8);
    const seg = selector('cfg-segundos', 'Tiempo para responder', [[15, '15 segundos'], [20, '20 segundos'], [30, '30 segundos'], [45, '45 segundos']], 20);
    return {
      el: h('div', { class: 'pila' }, b.el, h('div', { class: 'grilla-2' }, cant.el, seg.el),
        h('p', { class: 'muted chico' }, `Cada alumno elige V o F y apuesta ${APUESTAS.join(', ')} puntos. Si acierta suma lo apostado y si se equivoca lo resta. Cada equipo suma el promedio de sus integrantes.`)),
      leer: () => {
        const banco = b.banco();
        return banco ? { banco, cantidad: Number(cant.valor()), segundos: Number(seg.valor()) } : null;
      },
    };
  },

  async iniciar(sala, { banco, cantidad, segundos }) {
    let items = mezclar(itemsDe(banco, 'afirmacion'));
    if (cantidad) items = items.slice(0, cantidad);
    const id = idAzar();
    await sala.guardarPrivado({ juego: id, items });
    await sala.iniciarJuego({
      tipo: 'apuesta', fase: 'pregunta', n: 0, total: items.length, titulo: banco.titulo,
      texto: items[0].texto, duracion: segundos * 1000, terminaEn: Date.now() + segundos * 1000,
    }, id);
  },

  host(el, sala) {
    let privado = null;
    let revelando = -1;
    sala.privadoDelJuego().then((p) => { privado = p; v.actualizar(); });

    async function revelar() {
      const j = sala.juego;
      if (!privado || j.fase !== 'pregunta' || revelando === j.n) return;
      revelando = j.n;
      const it = privado.items[j.n];
      const correcta = it.verdadera ? 'V' : 'F';
      const resp = sala.respuestasJuego(j.n);
      const conteo = { V: 0, F: 0 };
      let segurosMal = 0, segurosBien = 0;
      resp.forEach((r) => {
        const x = leer(r.valor);
        if (!x) return;
        conteo[x.vf]++;
        if (x.apuesta === APUESTAS[APUESTAS.length - 1]) { if (x.vf === correcta) segurosBien++; else segurosMal++; }
      });
      const porEquipo = {};
      const sumas = {};
      for (const e of sala.equipos()) {
        const miembros = sala.miembros(e.id);
        let neto = 0;
        miembros.forEach((m) => {
          const x = leer(resp.get(m.uid)?.valor);
          if (x) neto += x.vf === correcta ? x.apuesta : -x.apuesta;
        });
        const pts = miembros.length ? Math.round(neto / miembros.length) : 0;
        porEquipo[e.id] = { pts, n: miembros.length };
        sumas[e.id] = pts;
      }
      try {
        await sala.actualizarJuego({ fase: 'revelada', correcta, explicacion: it.explicacion || '', conteo, segurosMal, segurosBien, porEquipo });
        await sala.sumar(sumas);
      } catch (e) { revelando = -1; toast('No se pudo revelar: ' + e.message, 'error'); }
    }

    async function siguiente() {
      const j = sala.juego;
      const n = j.n + 1;
      if (n >= j.total) { await sala.actualizarJuego({ fase: 'fin' }); return; }
      await sala.actualizarJuego({
        fase: 'pregunta', n, texto: privado.items[n].texto, terminaEn: Date.now() + j.duracion,
        correcta: undefined, explicacion: undefined, conteo: undefined, segurosMal: undefined, segurosBien: undefined, porEquipo: undefined,
      });
    }

    let contador;
    const v = vista({
      clave: () => `${sala.juego.fase}:${sala.juego.n}:${!!privado}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        contador = null;
        if (!privado) { montar(el, esperando('Cargando…')); return; }
        if (j.fase === 'fin') { montar(el, h('h3', null, '¡Terminó!'), ranking(sala)); return; }
        const it = privado.items[j.n];
        const reloj = h('span', { class: 'reloj' });
        if (j.fase === 'pregunta') {
          contador = h('span', { class: 'mono' });
          montar(el,
            h('div', { class: 'fila entre' }, h('span', { class: 'etiqueta' }, `Afirmación ${j.n + 1} de ${j.total}`), reloj),
            h('p', { class: 'pregunta-host' }, j.texto),
            h('p', { class: it.verdadera ? 'ok-txt' : 'mal-txt' }, 'Es ', h('b', null, it.verdadera ? 'VERDADERA' : 'FALSA'), it.explicacion ? ` · ${it.explicacion}` : ''),
            h('div', { class: 'fila entre' }, h('span', null, contador, ' respondieron'), h('button', { class: 'btn', onclick: revelar }, 'Revelar')));
          alLimpiar(cuentaRegresiva(reloj, j.terminaEn, { alTerminar: revelar }));
          return;
        }
        montar(el,
          h('p', { class: 'pregunta-host' }, j.texto),
          h('p', null, `Era ${j.correcta === 'V' ? 'VERDADERA' : 'FALSA'} · ${j.conteo.V} dijeron V y ${j.conteo.F} dijeron F`),
          h('p', { class: 'muted' }, `${j.segurosMal} apostaron todo y se equivocaron. Buen momento para charlarlo.`),
          h('div', { class: 'fila' }, sala.equipos().map((e) => pildoraEquipo(e, ` ${j.porEquipo?.[e.id]?.pts >= 0 ? '+' : ''}${j.porEquipo?.[e.id]?.pts ?? 0}`))),
          h('button', { class: 'btn grande', onclick: siguiente }, j.n + 1 >= j.total ? 'Ver resultados' : 'Siguiente →'));
      },
      refrescar() {
        const j = sala.juego;
        if (!contador || j.fase !== 'pregunta') return;
        const total = sala.listaJugadores().filter((x) => x.equipo).length;
        const n = sala.respuestasJuego(j.n).size;
        contador.textContent = `${n}/${total}`;
        if (total > 0 && n >= total) setTimeout(revelar, 800);
      },
    });
    return v;
  },

  alumno(el, sala) {
    const mias = {};
    return vista({
      clave: () => `${sala.juego.fase}:${sala.juego.n}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        if (j.fase === 'fin') { montar(el, h('h2', null, '¡Terminó!'), ranking(sala)); return; }
        if (j.fase === 'revelada') {
          const x = mias[j.n];
          const bien = x && x.vf === j.correcta;
          if (x) vibrar(bien ? 60 : [60, 60, 60]);
          montar(el, h('div', { class: 'resultado ' + (!x ? '' : bien ? 'bien' : 'mal') },
            h('div', { class: 'resultado-titulo' }, !x ? 'No respondiste' : bien ? `¡Bien! +${x.apuesta}` : `Uy… −${x.apuesta}`),
            h('p', null, 'Era ', h('b', null, j.correcta === 'V' ? 'VERDADERA' : 'FALSA')),
            j.explicacion && h('p', null, j.explicacion)));
          return;
        }
        const elegido = mias[j.n] || { vf: null, apuesta: null };
        const reloj = h('span', { class: 'reloj' });
        const estado = h('p', { class: 'muted chico centro' });
        const enviar = async () => {
          if (!elegido.vf || !elegido.apuesta) { estado.textContent = elegido.vf ? 'Ahora elegí cuánto apostás.' : 'Elegí verdadero o falso.'; return; }
          mias[j.n] = { ...elegido };
          estado.textContent = `Apostaste ${elegido.apuesta} a ${elegido.vf === 'V' ? 'VERDADERO' : 'FALSO'}. Podés cambiar hasta que termine el tiempo.`;
          vibrar(30);
          try { await sala.responder({ ronda: j.n, valor: elegido.vf + elegido.apuesta }); } catch (e) { toast(e.message, 'error'); }
        };
        const botonVF = (vf, texto) => h('button', { class: 'btn-vf ' + vf + (elegido.vf === vf ? ' elegido' : ''), onclick: (e) => {
          elegido.vf = vf;
          el.querySelectorAll('.btn-vf').forEach((b) => b.classList.toggle('elegido', b === e.currentTarget));
          enviar();
        } }, texto);
        const botonApuesta = (n) => h('button', { class: 'btn-apuesta' + (elegido.apuesta === n ? ' elegido' : ''), onclick: (e) => {
          elegido.apuesta = n;
          el.querySelectorAll('.btn-apuesta').forEach((b) => b.classList.toggle('elegido', b === e.currentTarget));
          enviar();
        } }, n);
        montar(el,
          h('div', { class: 'fila entre' }, h('span', { class: 'etiqueta' }, `${j.n + 1} de ${j.total}`), reloj),
          h('p', { class: 'pregunta-alumno' }, j.texto),
          h('div', { class: 'grilla-2 vf' }, botonVF('V', 'Verdadero'), botonVF('F', 'Falso')),
          h('div', { class: 'etiqueta' }, '¿Cuánto apostás?'),
          h('div', { class: 'apuestas' }, APUESTAS.map(botonApuesta)),
          h('p', { class: 'muted chico centro' }, 'Más seguro, más apostás: si le errás, lo perdés.'),
          estado);
        if (mias[j.n]) estado.textContent = `Apostaste ${mias[j.n].apuesta} a ${mias[j.n].vf === 'V' ? 'VERDADERO' : 'FALSO'}.`;
        alLimpiar(cuentaRegresiva(reloj, j.terminaEn));
      },
    });
  },

  tv(el, sala) {
    let contador = null;
    return vista({
      clave: () => `${sala.juego.fase}:${sala.juego.n}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        contador = null;
        if (j.fase === 'fin') { sonido('fin'); montar(el, h('div', { class: 'tv-centro' }, h('h1', { class: 'tv-titulo' }, '¡Terminó!'), ranking(sala))); return; }
        if (j.fase === 'pregunta') {
          const reloj = h('div', { class: 'tv-reloj' });
          contador = h('div', { class: 'tv-sub' });
          montar(el,
            h('div', { class: 'tv-cabecera' }, h('span', { class: 'tv-etiqueta' }, `🎲 ¿Cuánto apostás? · ${j.n + 1} de ${j.total}`), reloj),
            h('div', { class: 'tv-centro' },
              h('div', { class: 'tv-afirmacion' }, `«${j.texto}»`),
              h('div', { class: 'tv-vf' }, h('span', { class: 'V' }, 'Verdadero'), h('span', { class: 'F' }, 'Falso')),
              contador));
          alLimpiar(cuentaRegresiva(reloj, j.terminaEn, { cadaSegundo: (f) => reloj.classList.toggle('urgente', f < 5500) }));
          return;
        }
        sonido('bien');
        const total = Math.max(1, j.conteo.V + j.conteo.F);
        montar(el,
          h('div', { class: 'tv-cabecera' }, h('span', { class: 'tv-etiqueta' }, `🎲 ¿Cuánto apostás? · ${j.n + 1} de ${j.total}`)),
          h('div', { class: 'tv-centro' },
            h('div', { class: 'tv-afirmacion' }, `«${j.texto}»`),
            h('div', { class: 'tv-veredicto ' + j.correcta }, j.correcta === 'V' ? 'VERDADERA' : 'FALSA'),
            j.explicacion && h('p', { class: 'tv-sub' }, j.explicacion),
            h('div', { class: 'tv-reparto' },
              ['V', 'F'].map((k) => h('div', { class: 'tv-reparto-fila ' + k + (k === j.correcta ? ' correcta' : '') },
                h('span', null, k === 'V' ? 'Dijeron verdadero' : 'Dijeron falso'),
                h('span', { class: 'tv-eq-barra' }, h('b', { style: { width: (100 * j.conteo[k]) / total + '%' } })),
                h('span', { class: 'mono' }, `${Math.round((100 * j.conteo[k]) / total)}%`)))),
            j.segurosMal > 0 && h('p', { class: 'tv-alerta' }, `😱 ${j.segurosMal} ${j.segurosMal === 1 ? 'persona apostó' : 'personas apostaron'} todo… y se ${j.segurosMal === 1 ? 'equivocó' : 'equivocaron'}`)));
      },
      refrescar() {
        if (!contador) return;
        const n = sala.respuestasJuego(sala.juego.n).size;
        contador.textContent = `${n} ${n === 1 ? 'respuesta' : 'respuestas'}`;
      },
    });
  },
};
