CONTEXTO
Estoy resolviendo una prueba técnica de Omnia. Objetivo final: desplegar ERPNext
local con Docker Compose (MariaDB primario + réplica GTID, cambio al espejo,
respaldos automáticos y restauración) y desarrollar una app de compras
offline-first (React + TypeScript + Vite PWA + Dexie, backend Spring Boot) que
capture órdenes de compra sin red, las sincronice a ERPNext como borrador,
permita editar y cancelar, y registrar recibos de compra parciales y totales,
con reintentos idempotentes que no dupliquen documentos. Trabajo con Scrum
(2 sprints) y GitHub Spec Kit. Entrega final: un ZIP con specs, código,
configuración de Docker Compose, configuración de subagentes, README breve y
Evidencias.pdf. Trabajo en una sola máquina con datos ficticios, con Docker
Desktop.

MODO DE TRABAJO (aplica a TODAS las fases)
1. Trabajamos por fases. Al INICIO de cada fase, ANTES de tocar nada, presenta
   un plan: qué vas a hacer, en qué orden, qué archivos o contenedores
   crearás y qué riesgos ves. Espera mi "adelante".
2. Al FINAL de cada fase: verifica con comandos reales, muestra la evidencia
   (salidas), resume en pocas líneas qué quedó hecho y qué falta, haz el
   commit de la fase y DETENTE. No empieces la siguiente fase sin que yo
   escriba "Aprobada, continúa con la Fase N".
3. Explicación de infraestructura (obligatoria): cada vez que levantes o
   cambies algo de infraestructura, explícame en lenguaje claro: qué servicio
   es y para qué sirve, qué imagen y versión usa, qué red de Docker lo conecta,
   qué volumen guarda sus datos, qué puertos expone al host y por qué, qué
   variables de entorno importan, y cómo se comunican los servicios entre sí.
   Al terminar de levantar algo, dame un mapa en texto de la arquitectura
   resultante. Si usas un comando no obvio, explica qué hace cada parte.
4. Si algo falla, explícame la causa raíz y propón el arreglo antes de aplicarlo.
   No cambies el alcance sin avisarme.
5. Usa los subagentes del proyecto (.claude/agents/) cuando existan, delegando
   por responsabilidad. Tú coordinas y verificas el resultado integrado.
6. Nunca commitees secretos. Usa .env (en .gitignore) y .env.example con
   valores ficticios. Oculta contraseñas, claves y tokens en cualquier salida
   que vaya a servir de evidencia.
7. Commits en inglés con Conventional Commits, un commit por etapa relevante.

CONVENCIONES DE CÓDIGO
- Documentos (specs, backlog, sprints, README, constitución, notas): español.
- Código en inglés, sin excepciones: variables, funciones, clases, archivos,
  ramas, claves JSON, endpoints y mensajes de log.
- Comentarios en inglés y con criterio: NO comentes cada línea. Pon un
  comentario de UNA línea encima de cada función, clase o bloque importante
  explicando su propósito o el porqué de una decisión no obvia (idempotencia,
  reintentos, mapeo de errores de ERPNext, cola de sincronización,
  replicación). Código trivial (getters, JSX simple, imports) va sin comentarios.
- Los textos visibles al usuario en la UI van en español, centralizados en un
  solo archivo de mensajes (frontend/src/i18n/es.ts).
- Java: JDK 21 Temurin (Eclipse Adoptium). Spring Boot 3.x con
  <java.version>21</java.version>. Imagen base Docker del backend:
  eclipse-temurin:21.

==================================================
FASE 1: CIMIENTOS  (EJECUTA SOLO ESTA FASE AHORA)
==================================================
Presenta el plan de la fase y espera mi "adelante". No escribas código de
aplicación ni levantes ERPNext en esta fase.

Paso 1. Verificación de entorno
Comprueba y reporta versiones de: git, docker, docker compose, node, npm, uv y
Java. Confirma que el daemon de Docker responde (docker info) y cuánta RAM tiene
asignada Docker Desktop. Para Java: ejecuta java -version y echo $JAVA_HOME y
confirma que es Temurin 21. Si hay otra versión activa, dime cómo apuntar
JAVA_HOME a Temurin 21; no instales otro JDK. Si falta algo, dime cómo
instalarlo y detente en este paso hasta que yo confirme.

Paso 2. Estructura del repositorio
Crea infra/, backend/, frontend/, e2e/, docs/, evidencias/ (con .gitkeep donde
estén vacías) y un .gitignore para Node, Java/Maven, Docker, .env, backups
locales (infra/backups/), node_modules, target y dist.

Paso 3. CLAUDE.md
Crea CLAUDE.md en la raíz con: resumen del proyecto, stack (Java 21 Temurin),
mapa de carpetas y dueño de cada una (infra, backend, frontend/e2e, reviewer),
el MODO DE TRABAJO y las CONVENCIONES DE CÓDIGO de arriba, y la regla de que las
credenciales de ERPNext viven solo en el backend.

Paso 4. Subagentes en .claude/agents/
Crea cuatro archivos Markdown con frontmatter (name, description, tools) y un
prompt de sistema claro. A TODOS añade: "Convención obligatoria: código y
comentarios en inglés, comentario de una línea en funciones o bloques
importantes, sin comentar líneas triviales."

a) infra.md: dueño de /infra. Docker Compose partiendo de frappe/frappe_docker
   (registrar versiones de ERPNext y MariaDB), volúmenes separados, red privada
   de Docker, replicación GTID primario/réplica, verificación de hilos Yes/Yes y
   retraso 0 s, cambio al espejo, cómo mantener el primario sin escritura al
   reiniciarlo, respaldos automáticos (base de datos + archivos del sitio) a un
   destino local separado de los volúmenes, y restauración en un sitio de
   prueba. Debe dejar comandos reproducibles, explicar la infraestructura que
   levanta (ver MODO DE TRABAJO, punto 3) y guardar salidas de verificación
   para las evidencias. Tools: Read, Write, Edit, Bash, Glob, Grep.

b) backend.md: dueño de /backend. Java 21 Temurin, Spring Boot 3.x + Spring Web,
   integración con la API REST de ERPNext (Authorization: token key:secret),
   lectura de catálogos (Supplier, Item), creación/actualización de Purchase
   Order como borrador, presentación y cancelación, creación de Purchase
   Receipt vinculado a la orden y a su renglón, idempotencia con clave estable
   por operación (recuperar el folio ya creado si el reintento llega tras una
   respuesta perdida), traducción de errores de ERPNext a mensajes comprensibles.
   Nunca expone credenciales al frontend. Tools: Read, Write, Edit, Bash, Glob,
   Grep.

c) frontend.md: dueño de /frontend y /e2e. React + TypeScript, Vite PWA, Dexie
   (catálogos, borradores, cola de sincronización), listado, detalle y
   formulario de órdenes, estados visibles (pendiente, sincronizada, borrador,
   presentada, cancelada), folio de ERPNext, errores comprensibles,
   confirmaciones al descartar o cancelar, sincronización automática al
   recuperar red, pruebas Playwright de desconexión/reconexión. Tools: Read,
   Write, Edit, Bash, Glob, Grep.

d) reviewer.md: solo lectura (Read, Glob, Grep, y Bash solo para consultas).
   Verifica los criterios de aceptación de las specs contra el resultado
   integrado; revisa duplicados, idempotencia, manejo de errores, secretos
   expuestos y que se cumpla la convención de código (marca como hallazgo
   cualquier código o comentario fuera de convención). Informe con: criterio,
   estado (cumple/falla/no verificable), evidencia y arreglo sugerido. No
   modifica archivos.

Paso 5. Spec Kit
Revisa el README actual de github.com/github/spec-kit (los comandos cambian
entre versiones) e inicialízalo en este repo para Claude Code sin borrar lo ya
creado. Antes de ejecutar, resume qué preguntas o cambios hará. Reporta qué
carpetas y comandos /speckit.* quedaron disponibles.

Paso 6. Constitución
Con el comando de constitución de Spec Kit, redacta
.specify/memory/constitution.md con principios verificables:
1. Offline-first: la última versión local de una captura nunca se pierde.
2. Idempotencia: toda escritura a ERPNext lleva clave estable; reintentar no
   duplica órdenes ni entradas de inventario.
3. ERPNext es la fuente de verdad del estado y de los folios.
4. Seguridad: credenciales solo en el backend, nada de secretos en git.
5. Errores comprensibles: la UI explica los bloqueos de ERPNext.
6. Trazabilidad: cada criterio de aceptación es probable y tiene evidencia.
7. Datos ficticios; infraestructura reproducible con README breve.
8. Código en inglés con comentarios de una línea en lo importante; Java 21
   Temurin.
9. Proceso: spec -> plan -> tareas -> implementación, con commit por etapa.
Muéstrame el borrador antes de darlo por final.

Paso 7. Backlog y sprints
Crea docs/backlog.md con un Product Backlog priorizado (épicas e historias con
prioridad, estimación en puntos y estado) que cubra: despliegue ERPNext +
Compose, réplica GTID, cambio al espejo, respaldos y restauración, catálogos
offline, captura offline con cola, sincronización automática, edición,
cancelación, recibo de compra, recepción parcial y total, reintentos sin
duplicados, evidencias y README. Crea docs/sprint-1.md y docs/sprint-2.md con:
Objetivo, Alcance, Revisión del incremento y Retrospectiva breve (las dos
últimas vacías por ahora).
- Sprint 1 (Captura y primer borrador): contrato de datos, despliegue,
  integración y UI offline; cierra con una orden capturada sin red y
  sincronizada en ERPNext.
- Sprint 2 (Gestión y recepción): edición, cancelación, recepción, reintentos,
  revisión, cambio al espejo y restauración.

Paso 8. Commit y cierre
Commit "chore: cimientos del proyecto (fase 1)". Muestra git log --oneline y el
árbol de carpetas (2 niveles). Dime que ejecute /agents para confirmar que los
4 subagentes cargaron. DETENTE y espera "Aprobada, continúa con la Fase 2".

==================================================
FASE 2: SPECS Y CONTRATO  (no ejecutar hasta que yo apruebe)
==================================================
Plan primero, luego:
1. /speckit.specify con las historias y criterios de aceptación medibles de
   TODOS estos flujos: captura offline (crear, editar cantidades, reabrir sin
   red, conservar última versión, mostrar pendiente, descartar sale de la cola);
   sincronización automática (sin botón, llega como borrador, respuesta
   perdida recupera la misma orden); edición y cancelación (misma orden,
   confirmaciones, reglas de estado de ERPNext, bloqueos explicados);
   recibo de compra (cantidades por artículo + almacén, folio y saldo);
   recepción parcial y cierre (4 de 10, quedan 6, luego 6, saldo 0, sin
   duplicar inventario); reintentos sin duplicados (orden y recibo).
   Infra: réplica GTID, cambio al espejo, respaldos, restauración.
2. /speckit.clarify para resolver ambigüedades; hazme las preguntas.
3. /speckit.plan con el plan técnico (stack, arquitectura, decisión de cómo
   guardar la clave de idempotencia en ERPNext, por ejemplo un Custom Field,
   y cómo recibir la orden vía el método soportado por MY versión de ERPNext).
4. Contrato de datos app <-> backend: endpoints, payloads JSON (claves en
   inglés), estados, clave de idempotencia, formato de errores traducidos.
   Muéstralo en el chat para mi revisión.
5. /speckit.tasks marcando dependencias y qué puede ir en paralelo y qué
   subagente es dueño de cada tarea. /speckit.analyze para consistencia.
6. Commit "docs: specs, plan, contrato y tareas (fase 2)". DETENTE.

==================================================
FASE 3: SPRINT 1  (no ejecutar hasta que yo apruebe)
==================================================
Plan primero. Orden: (a) infra arranca primero porque ERPNext tarda en levantar;
(b) mientras tanto backend y frontend trabajan en paralelo contra el contrato.
1. infra: despliegue ERPNext con Docker Compose partiendo de frappe_docker,
   sitio de laboratorio, datos de prueba (Company, Warehouse, Supplier, Item
   con inventario y UoM), usuario de integración con API Key/Secret en .env,
   y la réplica MariaDB con GTID por red privada. EXPLÍCAME paso a paso la
   infraestructura (servicios, redes, volúmenes, puertos, replicación GTID,
   cómo verificar Yes/Yes y retraso 0 s). Crea una orden de prueba y
   compruébala en la réplica.
2. backend: catálogos y creación de borrador con idempotencia.
3. frontend: PWA, catálogos en Dexie, captura offline y cola con sincronización
   automática.
4. Prueba integrada de Playwright: orden creada sin red -> sincronizada como
   borrador en ERPNext al volver la red.
5. Llena la revisión y retrospectiva de docs/sprint-1.md. Commit. DETENTE.

==================================================
FASE 4: SPRINT 2  (no ejecutar hasta que yo apruebe)
==================================================
Plan primero. Implementa edición, cancelación (con reglas y mensajes de
ERPNext), recibo de compra vinculado a orden y renglón, recepción parcial y
total, y reintentos sin duplicados para orden y recibo (simula respuesta
perdida). Usa el subagente reviewer para verificar los flujos integrados
contra los criterios de aceptación y corrige los fallos. Llena docs/sprint-2.md.
Commit. DETENTE.

==================================================
FASE 5: INFRA FINAL  (no ejecutar hasta que yo apruebe)
==================================================
Plan primero. Con el subagente infra y explicándome cada paso:
1. Cambio al espejo: detener el contenedor primario, promover la réplica,
   apuntar ERPNext a ella, consultar la orden anterior y crear una nueva.
   Documenta cómo se mantiene el primario fuera de escritura al reiniciarlo
   (read_only / super_read_only y su rol de réplica).
2. Respaldos automáticos (base de datos + archivos del sitio) con programación
   y destino local separado de los volúmenes; muestra una ejecución automática.
3. Restauración en un sitio de prueba y consulta de una orden existente al
   generar el respaldo.
Guarda las salidas para las evidencias. Commit. DETENTE.

==================================================
FASE 6: EVIDENCIAS Y ENTREGA  (no ejecutar hasta que yo apruebe)
==================================================
Plan primero. Prepara el README breve (levantar y probar), la lista de
evidencias 1 a 11 con qué captura tomar y qué comando o pantalla usar para cada
una (yo tomaré las capturas), un script para generar el ZIP (specs, Spec Kit,
backlog, notas de sprint, código, compose, subagentes, README, Evidencias.pdf)
excluyendo secretos, node_modules y target. Revisión final con el reviewer.
Commit final. DETENTE.

EMPIEZA AHORA: ejecuta solo la FASE 1. Presenta primero el plan de la fase y
espera mi "adelante".