# Omnia Compras — Prueba técnica

## Resumen del proyecto
App de compras offline-first integrada con ERPNext. Captura órdenes de compra
sin red, sincroniza a ERPNext como borrador, permite editar y cancelar, y
registra recibos de compra parciales y totales, con reintentos idempotentes
que no dupliquen documentos. ERPNext corre local con Docker Compose, con
MariaDB primario + réplica GTID, cambio al espejo y respaldos/restauración
automatizados. Trabajo Scrum (2 sprints) con GitHub Spec Kit. Entrega final:
ZIP con specs, código, configuración de Docker Compose, configuración de
subagentes, README breve y Evidencias.pdf. Una sola máquina, datos ficticios,
Docker Desktop.

## Stack
- Infra: Docker Compose, frappe_docker (ERPNext), MariaDB con replicación GTID.
- Backend: Java 21 (Eclipse Adoptium Temurin), Spring Boot 3.x + Spring Web.
  Imagen base Docker: `eclipse-temurin:21`.
- Frontend: React + TypeScript, Vite PWA, Dexie (IndexedDB).
- E2E: Playwright.
- Especificación: GitHub Spec Kit (`/speckit.*`).

## Mapa de carpetas y dueños
| Carpeta | Dueño | Contenido |
|---|---|---|
| `infra/` | subagente `infra` | Docker Compose, replicación, respaldos/restauración |
| `backend/` | subagente `backend` | Spring Boot, integración API REST ERPNext |
| `frontend/` | subagente `frontend` | React/TS/Vite PWA, Dexie |
| `e2e/` | subagente `frontend` | Pruebas Playwright |
| `docs/` | coordinador (yo) | Specs, backlog, sprints, notas |
| `evidencias/` | coordinador (yo) | Capturas y salidas para Evidencias.pdf |
| `.specify/` | Spec Kit | Constitución, specs, planes, tareas |

El subagente `reviewer` es de solo lectura y no es dueño de ninguna carpeta:
verifica el resultado integrado de los demás contra specs y convenciones.

## Regla de seguridad
Las credenciales de ERPNext (API Key/Secret) viven **solo en el backend**
(`backend/`, vía variables de entorno/`.env`). El frontend nunca las recibe ni
las almacena. Nunca se commitean secretos: usar `.env` (en `.gitignore`) y
`.env.example` con valores ficticios. Ocultar contraseñas, claves y tokens en
cualquier salida que vaya a servir de evidencia.

## Modo de trabajo (aplica a todas las fases)
1. Trabajamos por fases. Al inicio de cada fase, antes de tocar nada, se
   presenta un plan: qué se hará, en qué orden, qué archivos o contenedores se
   crearán y qué riesgos hay. Se espera un "adelante" antes de ejecutar.
2. Al final de cada fase: verificar con comandos reales, mostrar la evidencia
   (salidas), resumir en pocas líneas qué quedó hecho y qué falta, hacer el
   commit de la fase y detenerse. No se avanza a la siguiente fase sin que el
   usuario escriba "Aprobada, continúa con la Fase N".
3. Explicación de infraestructura (obligatoria): cada vez que se levante o
   cambie algo de infraestructura, explicar en lenguaje claro: qué servicio es
   y para qué sirve, qué imagen y versión usa, qué red de Docker lo conecta,
   qué volumen guarda sus datos, qué puertos expone al host y por qué, qué
   variables de entorno importan, y cómo se comunican los servicios entre sí.
   Al terminar de levantar algo, dar un mapa en texto de la arquitectura
   resultante. Si se usa un comando no obvio, explicar qué hace cada parte.
4. Si algo falla, explicar la causa raíz y proponer el arreglo antes de
   aplicarlo. No cambiar el alcance sin avisar.
5. Usar los subagentes del proyecto (`.claude/agents/`) cuando existan,
   delegando por responsabilidad. El coordinador verifica el resultado
   integrado.
6. Nunca commitear secretos. Usar `.env` (en `.gitignore`) y `.env.example`
   con valores ficticios. Ocultar contraseñas, claves y tokens en cualquier
   salida que vaya a servir de evidencia.
7. Commits en inglés con Conventional Commits, un commit por etapa relevante.

## Convenciones de código
- Documentos (specs, backlog, sprints, README, constitución, notas): español.
- Código en inglés, sin excepciones: variables, funciones, clases, archivos,
  ramas, claves JSON, endpoints y mensajes de log.
- Comentarios en inglés y con criterio: NO comentar cada línea. Un comentario
  de UNA línea encima de cada función, clase o bloque importante explicando su
  propósito o el porqué de una decisión no obvia (idempotencia, reintentos,
  mapeo de errores de ERPNext, cola de sincronización, replicación). Código
  trivial (getters, JSX simple, imports) va sin comentarios.
- Los textos visibles al usuario en la UI van en español, centralizados en un
  solo archivo de mensajes (`frontend/src/i18n/es.ts`).
- Java: JDK 21 Temurin (Eclipse Adoptium). Spring Boot 3.x con
  `<java.version>21</java.version>`. Imagen base Docker del backend:
  `eclipse-temurin:21`.
