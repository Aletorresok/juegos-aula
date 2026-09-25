# Recreo · juegos para el aula

Juegos didácticos para cualquier materia. El docente abre una sala, la pantalla grande
(proyector o TV) muestra el juego y los alumnos juegan desde el celular, sin cuenta ni
instalación. Nace de la app del cumpleaños de Pau.

## Juegos

| Juego | Qué usa del banco | Cómo se juega |
|---|---|---|
| 🔐 **Escape del aula** | Escapes | Escape room por equipos: una historia y candados (numéricos, de palabra, de flechas o de colores) que se abren resolviendo desafíos. Modo carrera (gana el primero en salir) o cooperativo (los candados se reparten entre los equipos y el final se abre entre todos). Un código incorrecto traba el candado unos segundos; las pistas se piden desde el celular y restan puntos. Admite recompensas que arman el código final, información dividida entre los integrantes, imágenes y pistas físicas impresas con QR. |
| 🧭 **Elegí tu propia aventura** | Historias | Historia con decisiones: el curso vota, se muestra la consecuencia (momento para debatir) y la historia sigue por el camino elegido. Al final se ve el recorrido. |
| ⚡ **Quiz por equipos** | Preguntas | Todos responden desde el celular. Cada equipo suma hasta 100 puntos según qué parte acertó. |
| 🌀 **Rosco de repaso** | Términos | Pasapalabra por equipos, con reloj propio. La app corrige (acepta tildes, mayúsculas y errores de tipeo chicos) y el docente puede corregir a mano. |
| 📊 **El curso dice** | Encuestas (o nada) | Al estilo de 100 argentinos dicen: adivinar las respuestas más dichas. Las encuestas salen de un banco o de lo que responde el curso en el momento. Tres errores y otro equipo puede robar el pozo. |
| 🎲 **¿Cuánto apostás?** | Verdadero o falso | Cada uno responde V o F y apuesta 10, 20 o 50 según qué tan seguro está. Muestra cuántos apostaron todo y se equivocaron: ideal para desarmar mitos. |
| 📅 **Ordená la secuencia** | Secuencias | Líneas de tiempo, pasos de un proceso o jerarquías para ordenar en el celular. Muestra qué paso costó más. |
| 🕵️ **El impostor conceptual** | Pares parecidos | Todos tienen la misma palabra menos uno, que no sabe que es el impostor. Pistas en voz alta y votación. |
| 🌡️ **Termómetro de opiniones** | Para debatir (o nada) | Votación anónima de «totalmente en desacuerdo» a «totalmente de acuerdo», debate y segunda votación para ver cuánto cambiaron las opiniones. |
| ☁️ **Nube de ideas** | Nada | Pregunta abierta y nube de palabras. El docente decide cuándo mostrarla y puede ocultar palabras (los insultos comunes se ocultan solos). |
| 🎯 **¿A quién le toca?** | Nada | Sortea un alumno o un equipo sin repetir. Funciona también con una lista pegada, sin celulares. |

## Portal de clases

En **Mis clases** armás cada clase con links de videos y archivos de Google Drive (PDF,
videos, imágenes, Word, PowerPoint), Presentaciones, Documentos, Hojas y Formularios de
Google, YouTube u otras páginas; también podés importar una carpeta de Drive entera.
Desde una sala, **Presentar una clase** muestra cada material en la pantalla grande; lo
manejás desde el celular (con tus notas a la vista) y podés compartirlo en los celulares
de los alumnos. Los archivos tienen que estar compartidos como «Cualquier persona con el
enlace».

## Bancos listos para usar

Desde **📚 Bancos listos para usar** se agregan con un toque (y después se editan como
cualquier otro). Si más adelante se suma contenido a un banco listo que ya tenés, aparece
**Sumar lo nuevo**, que agrega solo lo que falta sin tocar tus cambios.

- **Construcción de Ciudadanía**: Derechos y participación · ESI: sexualidad y género ·
  Comunicación, TIC y convivencia digital · Historias para decidir · Escape «Rescate en la red».
- **Política y Ciudadanía**: Estado, democracia y derechos · Escape «El voto robado».
- **Trabajo y Ciudadanía**: Derechos laborales y mundo del trabajo · Historias para decidir ·
  Escape «La paritaria bloqueada».
- **Derecho**: Introducción al derecho · Organizaciones y contratos · Derechos y garantías
  constitucionales · Escape «El contrato trampa».
- **Materias generales**: Prácticas del Lenguaje · Matemática (con el escape «La caja fuerte
  del profe») · Historia · Geografía · Fisicoquímica · Inglés · Biología (ejemplo).

Revisá los datos antes de usarlos en clase.

## Cómo se usa

1. Entrá a la app y tocá **Soy docente →**. Entrás con tu cuenta de Google.
2. Creá un **banco** o agregá uno de los **bancos listos para usar**. Podés pegar filas desde
   una planilla de Google o Excel.
3. **Abrí una sala** y tocá **Abrir pantalla grande** en la computadora del proyector.
4. Los chicos escanean el QR o entran con el código de 4 letras.
5. Elegí un juego (o presentá una clase) desde tu celular. Los alumnos se reparten solos en
   equipos (podés moverlos).

## Puesta en marcha (una sola vez)

La app es una página estática: no hay que instalar nada. Usa Firebase (plan gratuito Spark)
para las salas en tiempo real.

### 1. Firebase

En la [consola de Firebase](https://console.firebase.google.com), proyecto `juegos-aula`:

1. **Reglas de seguridad**: *Firestore Database → Reglas*. Borrá lo que haya, pegá el contenido
   de [`firestore.rules`](firestore.rules) y tocá **Publicar**. Sin esto la app no funciona.
   Cada vez que este archivo cambie hay que volver a publicarlo.
2. **Ingreso de alumnos**: *Authentication → Método de acceso → Anónimo* activado.
3. **Ingreso de docentes**: *Authentication → Método de acceso → Agregar proveedor → Google*,
   activarlo, elegir el correo de asistencia y **Guardar**.
4. **Dominio autorizado**: *Authentication → Configuración → Dominios autorizados → Agregar dominio*:
   `aletorresok.github.io`.
5. **(Opcional) Importar carpetas de Drive**: en [Google Cloud](https://console.cloud.google.com/apis/library/drive.googleapis.com?project=juegos-aula)
   activá la **Google Drive API** para el proyecto `juegos-aula`. Si la clave de la app tiene
   restricciones de API (*APIs y servicios → Credenciales → Browser key*), agregale la Drive API.

### 2. Publicar con GitHub Pages

En GitHub: *Settings → Pages → Build and deployment → Source: Deploy from a branch*,
rama `main`, carpeta `/ (root)`, **Save**. A los minutos queda en
`https://aletorresok.github.io/juegos-aula/`.

## Privacidad

- Los alumnos solo escriben un nombre o apodo. No se piden correos ni cuentas.
- Cada alumno ve solo su propia información secreta (por ejemplo, su palabra en el Impostor).
  Las respuestas correctas solo las ve el docente.
- Las votaciones del Termómetro de opiniones son anónimas en la pantalla.
- Al cerrar una sala se borra todo lo que tenía (alumnos, respuestas, imágenes y puntos). Las
  salas que quedan abiertas dejan de aceptar alumnos a las 12 horas y se borran la próxima vez
  que el docente entra al panel.
- Los bancos y las clases de cada docente son privados.

## Estructura del código

```
index.html                 página única
css/estilos.css            estilos (la pantalla grande es siempre oscura)
js/app.js                  decide qué mostrar: ?tv=, ?docente, ?sala=
js/config.js               configuración de Firebase y colores de equipos
js/fb.js                   conexión con Firebase
js/sala.js                 estado compartido de una sala
js/bancos.js               bancos de contenido y su editor
js/plantillas.js           bancos listos para usar
js/plantillas-generales.js bancos listos de Derecho y materias generales
js/escapes.js              candados, comparación de códigos y editor de escapes
js/historias.js            historias con decisiones y su editor
js/clases.js               portal de clases: materiales, links de Drive y editor
js/docente.js              panel docente
js/alumno.js               vista del alumno
js/tv.js                   pantalla grande
js/juegos/*.js             un archivo por juego (configurar, iniciar, host, alumno, tv)
firestore.rules            reglas de seguridad de la base de datos
vendor/qrcode.mjs          generador de códigos QR (MIT)
```

Para agregar un juego nuevo: crear `js/juegos/mijuego.js` con la misma forma que los demás
y sumarlo a `js/juegos/index.js`.
