// Sala de juego: estado compartido entre el docente, la pantalla grande y los alumnos.
//
// Firestore:
//   salas/{codigo}                  → equipos, puntos, asignaciones y el juego en curso (todos lo leen)
//   salas/{codigo}/jugadores/{uid}  → nombre de cada alumno (lo escribe cada alumno)
//   salas/{codigo}/respuestas/{uid} → la última respuesta de cada alumno
//   salas/{codigo}/secretos/{uid}   → datos que solo ve ese alumno (p. ej. su palabra)
//   salas/{codigo}/privado/estado   → datos que solo ve el docente (p. ej. respuestas correctas)
import {
  db, doc, collection, getDoc, getDocs, setDoc, updateDoc, onSnapshot, writeBatch,
  increment, deleteField, serverTimestamp, Timestamp, query, where,
} from './fb.js';
import { EQUIPOS_BASE, HORAS_SALA } from './config.js';
import { codigoSala, idAzar } from './util.js';

const refSala = (c) => doc(db, 'salas', c);

export async function crearSala(uid, cantidadEquipos) {
  const equipos = EQUIPOS_BASE.slice(0, cantidadEquipos);
  for (let intento = 0; intento < 8; intento++) {
    const codigo = codigoSala();
    const existe = await getDoc(refSala(codigo)).then((s) => s.exists()).catch(() => false);
    if (existe) continue;
    await setDoc(refSala(codigo), {
      owner: uid,
      creada: serverTimestamp(),
      expira: Timestamp.fromMillis(Date.now() + HORAS_SALA * 3600e3),
      equipos,
      puntos: Object.fromEntries(equipos.map((e) => [e.id, 0])),
      asignaciones: {},
      juego: null,
    });
    return codigo;
  }
  throw new Error('No se pudo generar un código de sala libre. Probá de nuevo.');
}

export async function misSalas(uid) {
  const snap = await getDocs(query(collection(db, 'salas'), where('owner', '==', uid)));
  return snap.docs.map((d) => ({ codigo: d.id, ...d.data() }));
}

export async function existeSala(codigo) {
  const s = await getDoc(refSala(codigo));
  if (!s.exists()) return null;
  const d = s.data();
  if (d.expira && d.expira.toMillis() < Date.now()) return null;
  return d;
}

// Borra la sala con todo lo que tiene adentro.
export async function cerrarSala(codigo) {
  // Primero se avisa a todos, así los alumnos ven «La sala se cerró» y no «te sacaron».
  await updateDoc(refSala(codigo), { cerrada: true }).catch(() => {});
  const subs = ['jugadores', 'respuestas', 'secretos', 'privado', 'recursos'];
  for (const s of subs) {
    const snap = await getDocs(collection(db, 'salas', codigo, s));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const lote = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
      await lote.commit();
    }
  }
  const lote = writeBatch(db);
  lote.delete(refSala(codigo));
  await lote.commit();
}

export async function unirse(codigo, uid, nombre) {
  await setDoc(doc(db, 'salas', codigo, 'jugadores', uid), { nombre, unido: serverTimestamp() });
}

export class Sala {
  constructor(codigo, { rol, uid, nombre = '' }) {
    this.codigo = codigo;
    this.rol = rol;
    this.uid = uid;
    this.nombre = nombre;
    this.data = null;
    this.jugadores = new Map();
    this.respuestas = new Map();
    this.subs = [];
  }

  // Escucha los cambios. `opciones` indica qué colecciones hacen falta en este rol.
  escuchar({ jugadores = false, respuestas = false } = {}, alCambiar, alBorrarse) {
    this.subs.push(onSnapshot(refSala(this.codigo), (s) => {
      if (!s.exists()) { alBorrarse?.(); return; }
      this.data = s.data();
      alCambiar('sala');
    }, (e) => console.error('sala', e)));
    if (jugadores) {
      this.subs.push(onSnapshot(collection(db, 'salas', this.codigo, 'jugadores'), (s) => {
        this.jugadores = new Map(s.docs.map((d) => [d.id, d.data()]));
        alCambiar('jugadores');
      }, (e) => console.error('jugadores', e)));
    }
    if (respuestas) {
      this.subs.push(onSnapshot(collection(db, 'salas', this.codigo, 'respuestas'), (s) => {
        this.respuestas = new Map(s.docs.map((d) => [d.id, d.data()]));
        alCambiar('respuestas');
      }, (e) => console.error('respuestas', e)));
    }
  }

  escucharDoc(sub, id, cb) {
    const u = onSnapshot(doc(db, 'salas', this.codigo, sub, id), (s) => cb(s.exists() ? s.data() : null),
      (e) => console.error(sub, e));
    this.subs.push(u);
    return u;
  }

  detener() {
    this.subs.forEach((u) => { try { u(); } catch { /* nada */ } });
    this.subs = [];
  }

  get juego() { return this.data?.juego || null; }

  equipos() {
    const p = this.data?.puntos || {};
    return (this.data?.equipos || []).map((e) => ({ ...e, puntos: p[e.id] || 0 }));
  }

  equipo(id) { return this.equipos().find((e) => e.id === id) || null; }

  equipoDe(uid) { return this.equipo(this.data?.asignaciones?.[uid]); }

  nombreDe(uid) { return this.jugadores.get(uid)?.nombre || '—'; }

  // Alumnos conectados, con su equipo.
  listaJugadores() {
    const asig = this.data?.asignaciones || {};
    return [...this.jugadores.entries()]
      .map(([uid, j]) => ({ uid, nombre: j.nombre, equipo: asig[uid] || null }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  miembros(eid) { return this.listaJugadores().filter((j) => j.equipo === eid); }

  // Respuestas del juego actual (y de la ronda indicada, si se pasa).
  respuestasJuego(ronda) {
    const id = this.juego?.id;
    const out = new Map();
    for (const [uid, r] of this.respuestas) {
      if (r.juego !== id) continue;
      if (ronda !== undefined && r.ronda !== ronda) continue;
      out.set(uid, r);
    }
    return out;
  }

  // ── Acciones del docente ──
  actualizar(campos) { return updateDoc(refSala(this.codigo), campos); }

  actualizarJuego(patch) {
    const campos = {};
    for (const [k, v] of Object.entries(patch)) campos['juego.' + k] = v === undefined ? deleteField() : v;
    return this.actualizar(campos);
  }

  async iniciarJuego(juego, id = idAzar()) {
    await this.actualizar({ juego: { ...juego, id } });
    return id;
  }

  terminarJuego() { return this.actualizar({ juego: null }); }

  sumar(puntosPorEquipo) {
    const campos = {};
    for (const [eid, n] of Object.entries(puntosPorEquipo)) if (n) campos['puntos.' + eid] = increment(n);
    return Object.keys(campos).length ? this.actualizar(campos) : Promise.resolve();
  }

  reiniciarPuntos() {
    return this.actualizar({ puntos: Object.fromEntries((this.data?.equipos || []).map((e) => [e.id, 0])) });
  }

  asignar(asignaciones) {
    const campos = {};
    for (const [uid, eid] of Object.entries(asignaciones)) campos['asignaciones.' + uid] = eid || deleteField();
    return this.actualizar(campos);
  }

  async quitarJugador(uid) {
    const lote = writeBatch(db);
    lote.delete(doc(db, 'salas', this.codigo, 'jugadores', uid));
    lote.update(refSala(this.codigo), { ['asignaciones.' + uid]: deleteField() });
    await lote.commit();
  }

  renombrarEquipo(eid, nombre) {
    const equipos = (this.data?.equipos || []).map((e) => (e.id === eid ? { ...e, nombre } : e));
    return this.actualizar({ equipos });
  }

  guardarPrivado(datos) { return setDoc(doc(db, 'salas', this.codigo, 'privado', 'estado'), datos); }

  async leerPrivado() {
    const s = await getDoc(doc(db, 'salas', this.codigo, 'privado', 'estado'));
    return s.exists() ? s.data() : null;
  }

  // Lee los datos privados del juego en curso, reintentando si todavía no llegaron.
  async privadoDelJuego(valido = () => true) {
    for (let i = 0; i < 20; i++) {
      const p = await this.leerPrivado().catch(() => null);
      if (p && p.juego === this.juego?.id && valido(p)) return p;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }

  // Recursos del juego que todos pueden leer pero solo escribe el docente (p. ej. imágenes).
  guardarRecurso(id, datos) { return setDoc(doc(db, 'salas', this.codigo, 'recursos', id), datos); }

  async leerRecurso(id) {
    const s = await getDoc(doc(db, 'salas', this.codigo, 'recursos', id));
    return s.exists() ? s.data() : null;
  }

  async repartirSecretos(porUid) {
    const entradas = Object.entries(porUid);
    for (let i = 0; i < entradas.length; i += 400) {
      const lote = writeBatch(db);
      entradas.slice(i, i + 400).forEach(([uid, d]) => lote.set(doc(db, 'salas', this.codigo, 'secretos', uid), d));
      await lote.commit();
    }
  }

  // ── Acciones del alumno ──
  responder(datos) {
    return setDoc(doc(db, 'salas', this.codigo, 'respuestas', this.uid), {
      ...datos,
      juego: this.juego?.id || null,
      equipo: this.data?.asignaciones?.[this.uid] || null,
      t: Date.now(),
    });
  }
}
