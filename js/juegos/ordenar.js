// Ordená la secuencia: los pasos aparecen mezclados y cada alumno los ordena en su
// celular. Cada equipo suma según qué parte de los pasos ubicaron bien sus integrantes.
import { h, montar, vista, selectorBanco, selector, ranking, esperando, pildoraEquipo } from './comun.js';
import { itemsDe } from '../bancos.js';
import { mezclar, cuentaRegresiva, toast, sonido, vibrar, idAzar } from '../util.js';

const PUNTOS = 100;

// Mezcla asegurando que no quede en el orden correcto.
function desordenar(n) {
  const base = [...Array(n).keys()];
  for (let i = 0; i < 10; i++) {
    const m = mezclar(base);
    if (m.some((x, k) => x !== k)) return m;
  }
  return base.reverse();
}

// Orden enviado: índices de los pasos mostrados, en el orden elegido. Devuelve cuántos quedaron bien.
function aciertos(valor, correcto) {
  const orden = String(valor || '').split(',').map(Number);
  return correcto.reduce((s, idx, pos) => s + (orden[pos] === idx ? 1 : 0), 0);
}

export default {
  id: 'ordenar',
  nombre: 'Ordená la secuencia',
  icono: '📅',
  resumen: 'Líneas de tiempo, pasos de un proceso o jerarquías para ordenar en el celular.',
  tipos: ['secuencia'],

  configurar({ bancos }) {
    const b = selectorBanco(bancos, 'secuencia', 1);
    const cant = selector('cfg-cantidad', 'Cantidad de secuencias', [[1, '1'], [2, '2'], [3, '3'], [5, '5'], [0, 'Todas']], 3);
    const seg = selector('cfg-segundos', 'Tiempo por secuencia', [[45, '45 segundos'], [60, '1 minuto'], [90, '1 minuto y medio'], [120, '2 minutos']], 60);
    return {
      el: h('div', { class: 'pila' }, b.el, h('div', { class: 'grilla-2' }, cant.el, seg.el),
        h('p', { class: 'muted chico' }, `Cada equipo suma hasta ${PUNTOS} puntos por secuencia, según qué parte de los pasos ubicaron bien sus integrantes.`)),
      leer: () => {
        const banco = b.banco();
        return banco ? { banco, cantidad: Number(cant.valor()), segundos: Number(seg.valor()) } : null;
      },
    };
  },

  async iniciar(sala, { banco, cantidad, segundos }) {
    let items = mezclar(itemsDe(banco, 'secuencia'));
    if (cantidad) items = items.slice(0, cantidad);
    // mostrados[k] = índice del paso original; correcto[pos] = índice en «mostrados» del paso que va en pos.
    const rondas = items.map((it) => {
      const mostrados = desordenar(it.pasos.length);
      const correcto = it.pasos.map((_, pos) => mostrados.indexOf(pos));
      return { consigna: it.consigna, pasos: mostrados.map((i) => it.pasos[i]), correcto };
    });
    const id = idAzar();
    await sala.guardarPrivado({ juego: id, rondas });
    await sala.iniciarJuego({
      tipo: 'ordenar', fase: 'ordenando', n: 0, total: rondas.length, titulo: banco.titulo,
      consigna: rondas[0].consigna, pasos: rondas[0].pasos, duracion: segundos * 1000, terminaEn: Date.now() + segundos * 1000,
    }, id);
  },

  host(el, sala) {
    let privado = null;
    let revelando = -1;
    sala.privadoDelJuego().then((p) => { privado = p; v.actualizar(); });

    async function revelar() {
      const j = sala.juego;
      if (!privado || j.fase !== 'ordenando' || revelando === j.n) return;
      revelando = j.n;
      const { correcto } = privado.rondas[j.n];
      const resp = sala.respuestasJuego(j.n);
      // Por cada posición, qué parte del curso puso bien ese paso.
      const porPaso = correcto.map((idx, pos) => {
        let bien = 0;
        resp.forEach((r) => { if (String(r.valor).split(',').map(Number)[pos] === idx) bien++; });
        return resp.size ? Math.round((100 * bien) / resp.size) : 0;
      });
      const porEquipo = {};
      const sumas = {};
      for (const e of sala.equipos()) {
        const miembros = sala.miembros(e.id);
        const total = miembros.reduce((s, m) => s + (resp.has(m.uid) ? aciertos(resp.get(m.uid).valor, correcto) / correcto.length : 0), 0);
        const pts = miembros.length ? Math.round((PUNTOS * total) / miembros.length) : 0;
        porEquipo[e.id] = { pts, completos: miembros.filter((m) => resp.has(m.uid) && aciertos(resp.get(m.uid).valor, correcto) === correcto.length).length, n: miembros.length };
        sumas[e.id] = pts;
      }
      try {
        await sala.actualizarJuego({ fase: 'revelada', correcto, porPaso, porEquipo });
        await sala.sumar(sumas);
      } catch (e) { revelando = -1; toast('No se pudo revelar: ' + e.message, 'error'); }
    }

    async function siguiente() {
      const j = sala.juego;
      const n = j.n + 1;
      if (n >= j.total) { await sala.actualizarJuego({ fase: 'fin' }); return; }
      const r = privado.rondas[n];
      await sala.actualizarJuego({ fase: 'ordenando', n, consigna: r.consigna, pasos: r.pasos, terminaEn: Date.now() + j.duracion, correcto: undefined, porPaso: undefined, porEquipo: undefined });
    }

    let contador;
    const v = vista({
      clave: () => `${sala.juego.fase}:${sala.juego.n}:${!!privado}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        contador = null;
        if (!privado) { montar(el, esperando('Cargando…')); return; }
        if (j.fase === 'fin') { montar(el, h('h3', null, '¡Terminó!'), ranking(sala)); return; }
        const { correcto } = privado.rondas[j.n];
        const ordenCorrecto = h('ol', { class: 'opciones-host' }, correcto.map((idx, pos) => h('li', null, j.pasos[idx],
          j.porPaso && h('span', { class: 'mono muted' }, ` · ${j.porPaso[pos]}% lo ubicó bien`))));
        if (j.fase === 'ordenando') {
          const reloj = h('span', { class: 'reloj' });
          contador = h('span', { class: 'mono' });
          montar(el, h('div', { class: 'fila entre' }, h('span', { class: 'etiqueta' }, `Secuencia ${j.n + 1} de ${j.total}`), reloj),
            h('p', { class: 'pregunta-host' }, j.consigna),
            h('div', { class: 'etiqueta' }, 'Orden correcto (solo lo ves vos)'), ordenCorrecto,
            h('div', { class: 'fila entre' }, h('span', null, contador, ' confirmaron'), h('button', { class: 'btn', onclick: revelar }, 'Revelar')));
          alLimpiar(cuentaRegresiva(reloj, j.terminaEn, { alTerminar: revelar }));
          return;
        }
        montar(el, h('p', { class: 'pregunta-host' }, j.consigna), ordenCorrecto,
          h('div', { class: 'fila' }, sala.equipos().map((e) => pildoraEquipo(e, ` +${j.porEquipo?.[e.id]?.pts ?? 0}`))),
          h('button', { class: 'btn grande', onclick: siguiente }, j.n + 1 >= j.total ? 'Ver resultados' : 'Siguiente secuencia →'));
      },
      refrescar() {
        const j = sala.juego;
        if (!contador || j.fase !== 'ordenando') return;
        const total = sala.listaJugadores().filter((x) => x.equipo).length;
        const n = sala.respuestasJuego(j.n).size;
        contador.textContent = `${n}/${total}`;
      },
    });
    return v;
  },

  alumno(el, sala) {
    const mios = {};
    return vista({
      clave: () => `${sala.juego.fase}:${sala.juego.n}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        if (j.fase === 'fin') { montar(el, h('h2', null, '¡Terminó!'), ranking(sala)); return; }
        if (j.fase === 'revelada') {
          const mio = mios[j.n];
          const bien = mio ? aciertos(mio.enviado, j.correcto) : 0;
          if (mio?.enviado) vibrar(bien === j.correcto.length ? 60 : [60, 60, 60]);
          montar(el, h('div', { class: 'resultado ' + (!mio?.enviado ? '' : bien === j.correcto.length ? 'bien' : 'mal') },
            h('div', { class: 'resultado-titulo' }, !mio?.enviado ? 'No confirmaste' : `${bien} de ${j.correcto.length} bien`)),
          h('div', { class: 'etiqueta' }, 'El orden correcto'),
          h('ol', { class: 'orden-final' }, j.correcto.map((idx, pos) => {
            const ok = mio?.enviado && String(mio.enviado).split(',').map(Number)[pos] === idx;
            return h('li', { class: mio?.enviado ? (ok ? 'bien' : 'mal') : '' }, j.pasos[idx]);
          })));
          return;
        }
        mios[j.n] ||= { orden: [...j.pasos.keys()], enviado: null };
        const estado = mios[j.n];
        const reloj = h('span', { class: 'reloj' });
        const lista = h('ol', { class: 'ordenable' });
        const aviso = h('p', { class: 'muted chico centro' }, estado.enviado ? 'Orden confirmado. Podés cambiarlo hasta que termine el tiempo.' : 'Usá las flechas para ordenar y después confirmá.');
        const mover = (pos, d) => {
          const k = pos + d;
          if (k < 0 || k >= estado.orden.length) return;
          [estado.orden[pos], estado.orden[k]] = [estado.orden[k], estado.orden[pos]];
          pintar();
          lista.children[k]?.classList.add('movido');
        };
        const pintar = () => montar(lista, estado.orden.map((idx, pos) => h('li', { class: 'ordenable-item' },
          h('span', { class: 'ord-num' }, pos + 1),
          h('span', { class: 'ord-txt' }, j.pasos[idx]),
          h('span', { class: 'ord-botones' },
            h('button', { class: 'btn-icono', 'aria-label': 'Subir', disabled: pos === 0, onclick: () => mover(pos, -1) }, '▲'),
            h('button', { class: 'btn-icono', 'aria-label': 'Bajar', disabled: pos === estado.orden.length - 1, onclick: () => mover(pos, 1) }, '▼')))));
        pintar();
        montar(el,
          h('div', { class: 'fila entre' }, h('span', { class: 'etiqueta' }, `Secuencia ${j.n + 1} de ${j.total}`), reloj),
          h('p', { class: 'pregunta-alumno' }, j.consigna),
          h('div', { class: 'muted chico' }, '▲ primero · ▼ último'),
          lista,
          h('button', { class: 'btn grande', onclick: async () => {
            estado.enviado = estado.orden.join(',');
            aviso.textContent = 'Orden confirmado. Podés cambiarlo hasta que termine el tiempo.';
            vibrar(30);
            try { await sala.responder({ ronda: j.n, valor: estado.enviado }); } catch (e) { toast(e.message, 'error'); }
          } }, '✓ Confirmar orden'),
          aviso);
        alLimpiar(cuentaRegresiva(reloj, j.terminaEn));
      },
    });
  },

  tv(el, sala) {
    let barras = null;
    return vista({
      clave: () => `${sala.juego.fase}:${sala.juego.n}`,
      dibujar(alLimpiar) {
        const j = sala.juego;
        barras = null;
        if (j.fase === 'fin') { sonido('fin'); montar(el, h('div', { class: 'tv-centro' }, h('h1', { class: 'tv-titulo' }, '¡Terminó!'), ranking(sala))); return; }
        const cab = h('div', { class: 'tv-cabecera' }, h('span', { class: 'tv-etiqueta' }, `📅 ${j.titulo || 'Ordená la secuencia'} · ${j.n + 1} de ${j.total}`));
        if (j.fase === 'ordenando') {
          const reloj = h('div', { class: 'tv-reloj' });
          cab.append(reloj);
          barras = h('div', { class: 'tv-equipos' });
          montar(el, cab, h('div', { class: 'tv-pregunta' }, j.consigna),
            h('ul', { class: 'tv-pasos' }, j.pasos.map((p) => h('li', null, p))),
            h('p', { class: 'tv-sub' }, 'Ordenalos en tu celular'), barras);
          alLimpiar(cuentaRegresiva(reloj, j.terminaEn, { cadaSegundo: (f) => reloj.classList.toggle('urgente', f < 10500) }));
          return;
        }
        sonido('bien');
        const peor = j.porPaso.indexOf(Math.min(...j.porPaso));
        const hayPeor = Math.min(...j.porPaso) < Math.max(...j.porPaso);
        montar(el, cab, h('div', { class: 'tv-pregunta' }, j.consigna),
          h('ol', { class: 'tv-pasos correcto' + (j.correcto.length > 4 ? ' dos-col' : '') }, j.correcto.map((idx, pos) => h('li', { class: hayPeor && pos === peor ? 'dificil' : '' },
            h('span', null, j.pasos[idx]), h('span', { class: 'tv-op-n' }, `${j.porPaso[pos]}%`)))),
          hayPeor && h('p', { class: 'tv-sub' }, `El paso que más costó: «${j.pasos[j.correcto[peor]]}»`),
          h('div', { class: 'tv-equipos' }, sala.equipos().map((e) => h('div', { class: 'tv-eq', style: { '--c': e.color } },
            h('span', { class: 'tv-eq-nombre' }, e.nombre),
            h('span', { class: 'tv-eq-dato' }, `✓ ${j.porEquipo?.[e.id]?.completos ?? 0}/${j.porEquipo?.[e.id]?.n ?? 0}`),
            h('span', { class: 'tv-eq-pts' }, `+${j.porEquipo?.[e.id]?.pts ?? 0}`)))));
      },
      refrescar() {
        const j = sala.juego;
        if (!barras || j.fase !== 'ordenando') return;
        const resp = sala.respuestasJuego(j.n);
        montar(barras, sala.equipos().map((e) => {
          const m = sala.miembros(e.id);
          const r = m.filter((x) => resp.has(x.uid)).length;
          return h('div', { class: 'tv-eq', style: { '--c': e.color } },
            h('span', { class: 'tv-eq-nombre' }, e.nombre),
            h('span', { class: 'tv-eq-barra' }, h('b', { style: { width: (m.length ? (100 * r) / m.length : 0) + '%' } })),
            h('span', { class: 'tv-eq-dato' }, `${r}/${m.length}`));
        }));
      },
    });
  },
};
