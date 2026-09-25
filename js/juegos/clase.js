// Presentar una clase: el docente elige qué material se ve en la pantalla grande
// y, si quiere, lo comparte también en los celulares de los alumnos.
import { h, montar, vista, esperando } from './comun.js';
import { visorMaterial, iconoMaterial } from '../clases.js';
import { idAzar, toast } from '../util.js';

export default {
  id: 'clase',
  nombre: 'Presentar una clase',
  icono: '📚',
  resumen: 'Proyectá videos, presentaciones y archivos de Drive de una clase guardada.',
  tipos: [],
  sinMarcador: true,

  configurar({ clases = [] }) {
    const aptas = clases.filter((c) => c.materiales?.length);
    if (!aptas.length) {
      return {
        el: h('p', { class: 'aviso' }, 'Todavía no tenés clases con materiales. Creá una en «Mis clases», en el inicio del panel.'),
        leer: () => null,
      };
    }
    const sel = h('select', { class: 'campo', id: 'cfg-clase' }, aptas.map((c) => h('option', { value: c.id }, `${c.titulo} — ${c.materiales.length} materiales`)));
    const compartir = h('input', { type: 'checkbox', id: 'cfg-compartir' });
    return {
      el: h('div', { class: 'pila' },
        h('label', { class: 'pila-s' }, h('span', { class: 'etq' }, 'Clase'), sel),
        h('label', { class: 'check' }, compartir, 'Mostrar también los materiales en los celulares de los alumnos'),
        h('p', { class: 'muted chico' }, 'Vos elegís desde tu celular qué se ve. Los controles propios de cada material (pasar diapositivas, pausar un video) se usan en la computadora del proyector.')),
      leer: () => {
        const c = aptas.find((x) => x.id === sel.value);
        return c ? { clase: c, compartir: compartir.checked } : null;
      },
    };
  },

  async iniciar(sala, { clase, compartir }) {
    const id = idAzar();
    await sala.guardarPrivado({ juego: id, notas: Object.fromEntries(clase.materiales.map((m, i) => [i, m.notas || '']).filter(([, n]) => n)) });
    await sala.iniciarJuego({
      tipo: 'clase', titulo: clase.titulo, actual: 0, compartir: !!compartir,
      materiales: clase.materiales.map((m) => ({ titulo: m.titulo, tipo: m.tipo, embed: m.embed, abrir: m.abrir })),
    }, id);
  },

  host(el, sala) {
    let privado = null;
    sala.privadoDelJuego().then((p) => { privado = p; v.actualizar(); }).catch(() => {});
    const ir = (i) => sala.actualizarJuego({ actual: i }).catch((e) => toast(e.message, 'error'));
    const v = vista({
      clave: () => `${sala.juego.actual}:${sala.juego.compartir}:${!!privado}`,
      dibujar() {
        const j = sala.juego;
        const m = j.materiales[j.actual];
        const nota = privado?.notas?.[j.actual];
        montar(el,
          h('div', { class: 'fila entre' }, h('b', null, j.titulo), h('span', { class: 'mono muted' }, `${j.actual + 1} / ${j.materiales.length}`)),
          h('div', { class: 'grilla-2' },
            h('button', { class: 'btn sec', disabled: j.actual === 0, onclick: () => ir(j.actual - 1) }, '← Anterior'),
            h('button', { class: 'btn', disabled: j.actual >= j.materiales.length - 1, onclick: () => ir(j.actual + 1) }, 'Siguiente →')),
          h('div', { class: 'tarjeta suave pila-s' },
            h('div', { class: 'etiqueta' }, 'En la pantalla grande'),
            h('p', { class: 'pregunta-host' }, iconoMaterial(m.tipo), ' ', m.titulo),
            nota && h('p', { class: 'nota-docente' }, nota),
            h('a', { class: 'btn-link', href: m.abrir, target: '_blank', rel: 'noopener' }, 'Abrir en otra pestaña ↗')),
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: j.compartir, onchange: (e) => sala.actualizarJuego({ compartir: e.target.checked }) }),
            'Mostrarlo también en los celulares de los alumnos'),
          h('ol', { class: 'lista-materiales' }, j.materiales.map((x, i) => h('li', null,
            h('button', { class: 'material-boton' + (i === j.actual ? ' actual' : ''), onclick: () => ir(i) },
              h('span', null, iconoMaterial(x.tipo)), h('span', null, `${i + 1}. ${x.titulo}`))))));
      },
    });
    return v;
  },

  alumno(el, sala) {
    return vista({
      clave: () => `${sala.juego.actual}:${sala.juego.compartir}`,
      dibujar() {
        const j = sala.juego;
        const m = j.materiales[j.actual];
        if (!j.compartir) { montar(el, esperando('Mirá la pantalla grande', `${iconoMaterial(m.tipo)} ${m.titulo}`)); return; }
        montar(el,
          h('div', { class: 'etiqueta' }, `${j.titulo} · ${j.actual + 1} de ${j.materiales.length}`),
          h('h2', null, iconoMaterial(m.tipo), ' ', m.titulo),
          visorMaterial(m, 'visor visor-alumno'),
          h('a', { class: 'btn sec', href: m.abrir, target: '_blank', rel: 'noopener' }, 'Abrir en pantalla completa ↗'));
      },
    });
  },

  tv(el, sala) {
    return vista({
      clave: () => `${sala.juego.actual}`,
      dibujar() {
        const j = sala.juego;
        const m = j.materiales[j.actual];
        montar(el,
          h('div', { class: 'tv-cabecera tv-clase-cab' },
            h('span', { class: 'tv-etiqueta' }, `${j.titulo} · ${j.actual + 1} / ${j.materiales.length}`),
            h('span', { class: 'tv-etiqueta' }, iconoMaterial(m.tipo), ' ', m.titulo)),
          visorMaterial(m, 'visor visor-tv'));
      },
    });
  },
};
