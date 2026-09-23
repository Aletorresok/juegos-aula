// Conexión con Firebase: autenticación y base de datos.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously, signOut,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, doc, collection, query, where,
  getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
  increment, deleteField, serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Solo para pruebas locales con los emuladores de Firebase.
const esLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
let usarEmulador = false;
try { usarEmulador = esLocal && localStorage.getItem('emulador') === '1'; } catch { /* sin storage */ }
if (usarEmulador) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

export {
  doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, writeBatch, increment, deleteField, serverTimestamp, Timestamp,
};

// Espera a que Firebase sepa si hay una sesión guardada.
const listo = new Promise((resolve) => {
  const stop = onAuthStateChanged(auth, (u) => { stop(); resolve(u); });
});

export async function usuario() {
  await listo;
  return auth.currentUser;
}

export function alCambiarUsuario(cb) {
  return onAuthStateChanged(auth, cb);
}

// Alumnos y pantalla grande: sesión anónima (sin cuenta ni contraseña).
export async function asegurarSesion() {
  const u = await usuario();
  if (u) return u;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export function esDocente(u) {
  return !!u && !u.isAnonymous && u.providerData.some((p) => p.providerId === 'google.com');
}

export async function entrarConGoogle() {
  const proveedor = new GoogleAuthProvider();
  proveedor.setCustomParameters({ prompt: 'select_account' });
  const actual = await usuario();
  if (actual && actual.isAnonymous) await signOut(auth);
  try {
    return (await signInWithPopup(auth, proveedor)).user;
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, proveedor);
      return null;
    }
    throw e;
  }
}

export function salir() {
  return signOut(auth);
}

export function mensajeError(e) {
  const c = e?.code || '';
  if (c === 'permission-denied') return 'No tenés permiso para hacer esto. Si recién configuraste Firebase, revisá que estén publicadas las reglas de seguridad.';
  if (c === 'unavailable') return 'No hay conexión con el servidor. Revisá el wifi o los datos.';
  if (c === 'auth/operation-not-allowed') return 'Este método de ingreso no está activado en Firebase (Authentication → Método de acceso).';
  if (c === 'auth/unauthorized-domain') return 'Esta dirección no está autorizada en Firebase (Authentication → Configuración → Dominios autorizados).';
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return 'Se cerró la ventana de Google antes de terminar.';
  if (c === 'auth/network-request-failed') return 'No hay conexión a internet.';
  return e?.message || String(e);
}
