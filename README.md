# Recreo · juegos para el aula

Juegos didácticos para cualquier materia. El docente abre una sala, la pantalla grande
(proyector o TV) muestra el juego y los alumnos juegan desde el celular, sin cuenta ni
instalación. Nace de la app del cumpleaños de Pau.

## Juegos

| Juego | Qué usa del banco | Cómo se juega |
|---|---|---|
| ⚡ **Quiz por equipos** | Preguntas | Todos responden desde el celular. Cada equipo suma hasta 100 puntos según qué parte acertó. |
| 🌀 **Rosco de repaso** | Términos | Pasapalabra por equipos, con reloj propio. La app corrige (acepta tildes, mayúsculas y errores de tipeo chicos) y el docente puede corregir a mano. |
| 📊 **El curso dice** | Encuestas (o nada) | Al estilo de 100 argentinos dicen: adivinar las respuestas más dichas. Las encuestas salen de un banco o de lo que responde el curso en el momento. Tres errores y otro equipo puede robar el pozo. |
| 🕵️ **El impostor conceptual** | Pares parecidos | Todos tienen la misma palabra menos uno, que no sabe que es el impostor. Pistas en voz alta y votación. |
| ☁️ **Nube de ideas** | Nada | Pregunta abierta y nube de palabras. El docente decide cuándo mostrarla y puede ocultar palabras (los insultos comunes se ocultan solos). |
| 🎯 **¿A quién le toca?** | Nada | Sortea un alumno o un equipo sin repetir. Funciona también con una lista pegada, sin celulares. |

## Cómo se usa

1. Entrá a la app y tocá **Soy docente →**. Entrás con tu cuenta de Google.
2. Creá un **banco** o agregá uno de los **bancos listos para usar** (Construcción de Ciudadanía, Política y Ciudadanía, Trabajo y Ciudadanía, Derecho y un ejemplo de Biología). Podés pegar filas desde una planilla de Google o Excel.
3. **Abrí una sala** y tocá **Abrir pantalla grande** en la computadora del proyector.
4. Los chicos escanean el QR o entran con el código de 4 letras.
5. Elegí un juego desde tu celular. Los alumnos se reparten solos en equipos (podés moverlos).

## Puesta en marcha (una sola vez)

La app es una página estática: no hay que instalar nada. Usa Firebase (plan gratuito Spark)
para las salas en tiempo real.

### 1. Firebase

En la [consola de Firebase](https://console.firebase.google.com), proyecto `juegos-aula`:

1. **Reglas de seguridad**: *Firestore Database → Reglas*. Borrá lo que haya, pegá el contenido
   de [`firestore.rules`](firestore.rules) y tocá **Publicar**. Sin esto la app no funciona.
2. **Ingreso de alumnos**: *Authentication → Método de acceso → Anónimo* activado.
3. **Ingreso de docentes**: *Authentication → Método de acceso → Agregar proveedor → Google*,
   activarlo, elegir el correo de asistencia y **Guardar**.
4. **Dominio autorizado**: *Authentication → Configuración → Dominios autorizados → Agregar dominio*:
   `aletorresok.github.io`.

### 2. Publicar con GitHub Pages

En GitHub: *Settings → Pages → Build and deployment → Source: Deploy from a branch*,
rama `main`, carpeta `/ (root)`, **Save**. A los minutos queda en
`https://aletorresok.github.io/juegos-aula/`.

## Privacidad

- Los alumnos solo escriben un nombre o apodo. No se piden correos ni cuentas.
- Cada alumno ve solo su propia información secreta (por ejemplo, su palabra en el Impostor).
  Las respuestas correctas solo las ve el docente.
- Al cerrar una sala se borra todo lo que tenía (alumnos, respuestas y puntos). Las salas que
  quedan abiertas dejan de aceptar alumnos a las 12 horas y se borran la próxima vez que el
  docente entra al panel.
- Los bancos de cada docente son privados.

## Estructura del código

```
index.html            página única
css/estilos.css       estilos (la pantalla grande es siempre oscura)
js/app.js             decide qué mostrar: ?tv=, ?docente, ?sala=
js/config.js          configuración de Firebase y colores de equipos
js/fb.js              conexión con Firebase
js/sala.js            estado compartido de una sala
js/bancos.js          bancos de contenido y su editor
js/plantillas.js      bancos listos para usar
js/docente.js         panel docente
js/alumno.js          vista del alumno
js/tv.js              pantalla grande
js/juegos/*.js        un archivo por juego (configurar, iniciar, host, alumno, tv)
firestore.rules       reglas de seguridad de la base de datos
vendor/qrcode.mjs     generador de códigos QR (MIT)
```

Para agregar un juego nuevo: crear `js/juegos/mijuego.js` con la misma forma que los demás
y sumarlo a `js/juegos/index.js`.
