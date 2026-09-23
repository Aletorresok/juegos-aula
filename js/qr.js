import qrcode from '../vendor/qrcode.mjs';
import { h } from './util.js';

// Devuelve un elemento con el código QR del texto indicado (SVG escalable).
export function qr(texto, clase = 'qr') {
  const q = qrcode(0, 'M');
  q.addData(texto);
  q.make();
  return h('div', { class: clase, role: 'img', 'aria-label': 'Código QR para entrar a la sala', html: q.createSvgTag({ scalable: true, margin: 2 }) });
}
