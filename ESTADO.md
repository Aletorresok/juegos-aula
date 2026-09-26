# Estado del proyecto

Última actualización: 26/09/2026.

## Puesta en marcha: hecha ✅

- GitHub Pages activado: https://aletorresok.github.io/juegos-aula/
- Base de datos Firestore creada y reglas de `firestore.rules` publicadas.
- Ingreso anónimo (alumnos) y con Google (docentes) activados.
- Dominio `aletorresok.github.io` autorizado.
- Primera prueba real: funciona.

Si `firestore.rules` cambia, hay que volver a publicarla en *Firestore Database → Reglas*.

## Qué hay

- 11 juegos: escape del aula, elegí tu propia aventura, quiz, rosco, el curso dice,
  ¿cuánto apostás?, ordená la secuencia, impostor, termómetro, nube de ideas y sorteo.
- Portal de clases con materiales de Drive, YouTube y Google Docs.
- 39 bancos listos para usar, de todas las materias del diseño curricular bonaerense,
  con 8 escapes y 3 historias.

## Pendiente

- [ ] Revisar el contenido de los bancos listos antes de usarlos en clase. Se escribió
      de memoria: chequear sobre todo leyes, fechas y líneas de ayuda.
- [ ] Probar con un curso real y anotar qué ajustar.
- [ ] Opcional: activar la Google Drive API para importar carpetas enteras
      (enlace en el README).

## Limitaciones conocidas

- Las presentaciones de Google se avanzan desde la computadora del proyector; el
  celular del docente no las puede mover.
- La importación de carpetas de Drive no se pudo probar antes de activar la API.
