import quiz from './quiz.js';
import rosco from './rosco.js';
import impostor from './impostor.js';
import nube from './nube.js';
import ruleta from './ruleta.js';
import encuesta from './encuesta.js';
import escape from './escape.js';
import clase from './clase.js';

export const JUEGOS = [clase, escape, quiz, rosco, encuesta, impostor, nube, ruleta];

export const juego = (id) => JUEGOS.find((j) => j.id === id) || null;
