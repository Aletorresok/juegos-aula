// Punto de entrada: decide qué mostrar según la dirección.
//   ?tv=ABCD       → pantalla grande de la sala
//   ?docente       → panel docente (con &sala=ABCD, el panel de esa sala)
//   ?sala=ABCD     → alumno entrando a la sala
//   (nada)         → alumno: formulario con código y nombre
import { iniciarAlumno } from './alumno.js';
import { iniciarDocente } from './docente.js';
import { iniciarTv } from './tv.js';

const raiz = document.getElementById('app');
const p = new URLSearchParams(location.search);

if (p.has('tv')) iniciarTv(raiz, p.get('tv'));
else if (p.has('docente')) iniciarDocente(raiz);
else iniciarAlumno(raiz, p.get('sala'));
