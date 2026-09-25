// Termómetro de opiniones: ante una consigna polémica cada uno se ubica en una escala,
// se ve cómo quedó el curso (en forma anónima), se debate y se vuelve a votar para ver
// cuánto se movieron las opiniones. No da puntos.
import { h, montar, vista, selectorBanco, selector, esperando } from './comun.js';
import { itemsDe } from '../bancos.js';
import { mezclar, toast, vibrar, idAzar } from '../util.js';

export const ESCALA = [
  { v: 1, corto: 'Totalmente en desacuerdo', color: '#D8434B' },
  { v: 2, corto: 'En desacuerdo', color: '#E4822E' },
  { v: 3, corto: 'Ni de acuerdo ni en desacuerdo', color: '#9AA3AD' },
  { v: 4, corto: 'De acuerdo', color: '#5FB36B' },
  { v: 5, corto: 'Totalmente de acuerdo', color: '#1F8A55' },
];

const claveRonda = (j) => j.ronda * 10 + j.vuelta;

function contar(resp) {
  const c = [0, 0, 0, 0, 0];
  resp.forEach((r) => { const n = Number(r.valor); if (n >= 1 && n <= 5) c[n - 1]++; });
  return c;
}

const promedio = (c) => {
  const n = c.reduce((a, b) => a + b, 0);
  return n ? c.reduce((s, x, i) => s + x * (i + 1), 0) / n : 0;
};

function grafico(c, { antes = null, tv = false } = {}) {
  const max = Math.max(1, ...c, ...(antes || []));
  return h('div', { class: 'termo' + (tv ? ' en-tv' : '') }, ESCALA.map((e, i) =>
    h('div', { class: 'termo-col' },
      h('div', { class: 'termo-barras' },
        antes && h('div', { class: 'termo-barra antes', style: { height: (100 * antes[i]) / max + '%' }, title: `Antes: ${antes[i]}` }),
        h('div', { class: 'termo-barra', style: { height: (100 * c[i]) / max + '%', background: e.color } },
          h('span', { class: 'termo-n' }, c[i]))),
      h('div', { class: 'termo-etq' }, e.corto))));
}

export default {
  id: 'termometro',
  nombre: 'Termómetro de opiniones',
  icono: '🌡️',
  resumen: 'Cada uno se ubica entre «en desacuerdo» y «de acuerdo», se debate y se vuelve a votar.',
  tipos: ['debate'],
  sinMarcador: true,

  configurar({ bancos }) {
    const fuente = selector('cfg-fuente-termo', 'Consignas', [['banco', 'De un banco («Para debatir»)'], ['libre', 'Las escribo en el momento']], bancos.some((b) => itemsDe(b, 'debate').length) ? 'banco' : 'libre');
    const b = selectorBanco(bancos, 'debate', 1);
    const consigna = h('input', { class: 'campo', id: 'cfg-consigna', maxlength: 160, placeholder: 'Debería bajarse la edad para votar a los 14 años.' });
    const zonaBanco = h('div', null, b.el);
    const zonaLibre = h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Primera consigna'), consigna);
    const sel = fuente.el.querySelector('select');
    const mostrar = () => { zonaBanco.hidden = sel.value !== 'banco'; zonaLibre.hidden = sel.value !== 'libre'; };
    sel.addEventListener('change', mostrar);
    mostrar();
    return {
      el: h('div', { class: 'pila' }, fuente.el, zonaBanco, zonaLibre,
        h('p', { class: 'muted chico' }, 'La votación es anónima: en la pantalla solo se ve cuántos eligieron cada opción. Después del debate se vota de nuevo y se ve cuántos cambiaron de opinión.')),
      leer: () => {
        if (sel.value === 'libre') {
          const t = consigna.value.trim();
          if (!t) { toast('Escribí la consigna', 'error'); consigna.focus(); return null; }
          return { consignas: [t], libre: true };
        }
        const banco = b.banco();
        return banco ? { consignas: mezclar(itemsDe(banco, 'debate')).map((d) => d.texto), libre: false, titulo: banco.titulo } : null;
      },
    };
  },

  async iniciar(sala, { consignas, libre, titulo }) {
    const id = idAzar();
    await sala.guardarPrivado({ juego: id, consignas, vuelta1: {} });
    await sala.iniciarJuego({ tipo: 'termometro', libre, titulo: titulo || 'Termómetro de opiniones', total: libre ? 0 : consignas.length, fase: 'votando', ronda: 1, vuelta: 1, texto: consignas[0], r1: null }, id);
  },

  host(el, sala) {
    let privado = null;
    let zona = null;
    sala.privadoDelJuego().then((p) => { privado = p; v.actualizar(); });

    async function mostrarResultados() {
      const j = sala.juego;
      const c = contar(sala.respuestasJuego(claveRonda(j)));
      const extra = {};
      if (j.vuelta === 2) {
        let cambiaron = 0, compararon = 0;
        sala.respuestasJuego(claveRonda(j)).forEach((r, uid) => {
          const antes = privado.vuelta1?.[uid];
          if (antes) { compararon++; if (Number(antes) !== Number(r.valor)) cambiaron++; }
        });
        extra.cambiaron = cambiaron; extra.compararon = compararon;
      }
      await sala.actualizarJuego({ fase: 'resultado', conteo: c, ...extra });
    }

    async function volverAVotar() {
      const j = sala.juego;
      const vuelta1 = {};
      sala.respuestasJuego(claveRonda(j)).forEach((r, uid) => { vuelta1[uid] = String(r.valor); });
      privado = { ...privado, vuelta1 };
      await sala.guardarPrivado(privado);
      await sala.actualizarJuego({ fase: 'votando', vuelta: 2, r1: j.conteo, conteo: undefined });
    }

    async function siguiente(texto) {
      const j = sala.juego;
      const t = texto || privado.consignas[j.ronda];
      if (!t) { await sala.actualizarJuego({ fase: 'fin' }); return; }
      if (texto) { privado = { ...privado, consignas: [...privado.consignas, texto] }; await sala.guardarPrivado(privado); }
      await sala.actualizarJuego({ fase: 'votando', ronda: j.ronda + 1, vuelta: 1, texto: t, r1: null, conteo: undefined, cambiaron: undefined, compararon: undefined });
    }

    const v = vista({
      clave: () => `${sala.juego.fase}:${sala.juego.ronda}:${sala.juego.vuelta}:${!!privado}`,
      dibujar() {
        const j = sala.juego;
        zona = null;
        if (!privado) { montar(el, esperando('Cargando…')); return; }
        if (j.fase === 'fin') { montar(el, h('h3', null, 'Terminó el debate'), h('p', { class: 'muted' }, 'No hay más consignas en el banco.')); return; }
        const cabecera = [h('div', { class: 'etiqueta' }, `Consigna ${j.ronda}${j.total ? ' de ' + j.total : ''} · ${j.vuelta === 1 ? 'primera votación' : 'después del debate'}`),
          h('p', { class: 'pregunta-host' }, j.texto)];
        if (j.fase === 'votando') {
          zona = h('div', { class: 'pila-s' });
          montar(el, cabecera, zona, h('button', { class: 'btn grande', onclick: mostrarResultados }, 'Mostrar resultados en la pantalla'));
          return;
        }
        const otra = h('input', { class: 'campo', id: 'otra-consigna', maxlength: 160, placeholder: 'Siguiente consigna' });
        montar(el, cabecera, grafico(j.conteo, { antes: j.vuelta === 2 ? j.r1 : null }),
          j.vuelta === 2 && h('p', null, h('b', null, `${j.cambiaron} de ${j.compararon}`), ' cambiaron de opinión después del debate.'),
          j.vuelta === 1
            ? h('button', { class: 'btn grande', onclick: volverAVotar }, 'Ya debatimos: volver a votar')
            : null,
          j.libre
            ? h('form', { class: 'fila', onsubmit: (e) => { e.preventDefault(); const t = otra.value.trim(); if (t) siguiente(t); } }, otra, h('button', { class: 'btn', type: 'submit' }, 'Nueva consigna'))
            : h('button', { class: 'btn sec', onclick: () => siguiente() }, j.ronda >= j.total ? 'Terminar' : 'Siguiente consigna →'));
      },
      refrescar() {
        if (!zona) return;
        const j = sala.juego;
        const c = contar(sala.respuestasJuego(claveRonda(j)));
        const n = c.reduce((a, b) => a + b, 0);
        montar(zona, h('p', null, h('b', null, n), ` ${n === 1 ? 'voto' : 'votos'} (solo lo ves vos hasta que muestres los resultados)`), grafico(c));
      },
    });
    return v;
  },

  alumno(el, sala) {
    const mios = {};
    return vista({
      clave: () => `${sala.juego.fase}:${sala.juego.ronda}:${sala.juego.vuelta}`,
      dibujar() {
        const j = sala.juego;
        if (j.fase === 'fin') { montar(el, esperando('Terminó el debate', '¡Gracias por participar!')); return; }
        if (j.fase === 'resultado') { montar(el, esperando('Mirá los resultados en la pantalla grande', j.texto)); return; }
        const k = claveRonda(j);
        const estado = h('p', { class: 'muted chico centro' }, mios[k] ? 'Tu voto quedó registrado. Podés cambiarlo.' : 'Es anónimo: nadie ve qué elegiste.');
        const botones = ESCALA.map((e) => h('button', {
          class: 'btn-escala' + (mios[k] === e.v ? ' elegido' : ''), style: { '--c': e.color },
          onclick: async (ev) => {
            mios[k] = e.v;
            botones.forEach((b) => b.classList.toggle('elegido', b === ev.currentTarget));
            estado.textContent = 'Tu voto quedó registrado. Podés cambiarlo.';
            vibrar(30);
            try { await sala.responder({ ronda: k, valor: String(e.v) }); } catch (err) { toast(err.message, 'error'); }
          },
        }, e.corto));
        montar(el,
          h('div', { class: 'etiqueta' }, j.vuelta === 1 ? '¿Qué opinás?' : 'Después del debate, ¿qué opinás ahora?'),
          h('p', { class: 'pregunta-alumno' }, j.texto),
          h('div', { class: 'escala' }, botones),
          estado);
      },
    });
  },

  tv(el, sala) {
    let contador = null;
    return vista({
      clave: () => `${sala.juego.fase}:${sala.juego.ronda}:${sala.juego.vuelta}`,
      dibujar() {
        const j = sala.juego;
        contador = null;
        if (j.fase === 'fin') { montar(el, h('div', { class: 'tv-centro' }, h('h1', { class: 'tv-titulo' }, 'Terminó el debate'))); return; }
        const cab = h('div', { class: 'tv-cabecera' }, h('span', { class: 'tv-etiqueta' }, `🌡️ Termómetro de opiniones · ${j.vuelta === 1 ? 'primera votación' : 'después del debate'}`));
        if (j.fase === 'votando') {
          contador = h('div', { class: 'tv-contador enorme' }, '0');
          montar(el, cab, h('div', { class: 'tv-centro' },
            h('div', { class: 'tv-afirmacion' }, `«${j.texto}»`),
            contador, h('p', { class: 'tv-sub' }, 'votos · votá desde tu celular, es anónimo')));
          return;
        }
        const prom = promedio(j.conteo);
        montar(el, cab,
          h('div', { class: 'tv-afirmacion chica' }, `«${j.texto}»`),
          grafico(j.conteo, { antes: j.vuelta === 2 ? j.r1 : null, tv: true }),
          h('div', { class: 'tv-sub centro' },
            prom ? `Promedio del curso: ${ESCALA[Math.round(prom) - 1].corto.toLowerCase()}` : 'Nadie votó',
            j.vuelta === 2 ? ` · ${j.cambiaron} de ${j.compararon} cambiaron de opinión (las barras grises son la primera votación)` : ''));
      },
      refrescar() {
        if (!contador) return;
        const j = sala.juego;
        contador.textContent = sala.respuestasJuego(claveRonda(j)).size;
      },
    });
  },
};
