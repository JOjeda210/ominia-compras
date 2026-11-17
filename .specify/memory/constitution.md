<!--
Sync Impact Report
Version change: (none) → 1.0.0
Modified principles: N/A (initial ratification)
Added sections: Core Principles (I–IX), Alcance y Tecnología, Flujo de Trabajo, Governance
Removed sections: N/A
Deferred TODOs: ninguno
-->

# Omnia Compras Constitution

## Core Principles

### I. Offline-first
La última versión local de una captura NUNCA se pierde. Toda orden de compra
creada o editada sin conexión debe persistir en almacenamiento local (Dexie)
antes de cualquier intento de sincronización. Un fallo de red, un cierre de
la app o un reintento fallido NUNCA debe descartar o sobrescribir con datos
más viejos la última edición hecha por el usuario.
**Razón**: el comprador trabaja en campo sin garantía de conectividad; la
confianza en la app depende de que nada capturado se pierda.

### II. Idempotencia
Toda escritura a ERPNext (creación de Purchase Order, Purchase Receipt)
DEBE llevar una clave de idempotencia estable generada por el cliente.
Si el mismo request llega más de una vez (reintento tras una respuesta
perdida), el backend DEBE recuperar el documento ya creado en vez de generar
uno nuevo. Ningún reintento puede duplicar órdenes ni entradas de inventario.
**Razón**: la red es intermitente por diseño; los reintentos son inevitables
y no deben tener efectos secundarios acumulativos.

### III. ERPNext como fuente de verdad
ERPNext es la única fuente de verdad del estado de un documento (borrador,
presentado, cancelado) y de sus folios. El estado local es una caché de
trabajo, no una fuente autoritativa: ante cualquier conflicto, prevalece lo
que ERPNext reporta una vez hay conexión.
**Razón**: evita que la app y ERPNext diverjan sobre qué pasó realmente con
una orden.

### IV. Seguridad de credenciales
Las credenciales de ERPNext (API Key/Secret) viven EXCLUSIVAMENTE en el
backend, vía variables de entorno. El frontend NUNCA recibe, almacena ni
transmite estas credenciales. Ningún secreto se commitea a git: se usa
`.env` (en `.gitignore`) y `.env.example` con valores ficticios.
**Razón**: el frontend corre en el dispositivo del usuario y es la superficie
de ataque más expuesta; las credenciales de integración deben quedar fuera de
su alcance.

### V. Errores comprensibles
Todo bloqueo o error devuelto por ERPNext DEBE traducirse a un mensaje
comprensible para el usuario en la UI, sin perder la causa raíz en los logs
del backend. El usuario nunca debe ver un código de error crudo de ERPNext
sin explicación.
**Razón**: el usuario final no conoce la terminología interna de ERPNext;
un error sin traducir es un callejón sin salida para él.

### VI. Trazabilidad
Cada criterio de aceptación definido en las specs DEBE ser verificable
(probado con un comando, una prueba automatizada o una captura) y DEBE tener
evidencia asociada antes de considerarse cumplido. No se acepta un criterio
marcado como "cumple" sin evidencia reproducible.
**Razón**: la entrega final depende de poder demostrar, no solo afirmar, que
cada requisito se cumple.

### VII. Reproducibilidad con datos ficticios
Todos los datos de prueba (proveedores, artículos, órdenes) son ficticios.
Toda la infraestructura (Docker Compose, réplica, respaldos) DEBE ser
reproducible desde cero siguiendo un README breve, sin pasos manuales no
documentados.
**Razón**: el entregable debe poder evaluarse en una máquina distinta a la
del autor, sin datos reales ni conocimiento tácito.

### VIII. Convención de código
Todo el código (variables, funciones, clases, archivos, ramas, claves JSON,
endpoints, mensajes de log) se escribe en inglés, sin excepciones. Los
comentarios van en inglés, con criterio: una línea sobre cada función, clase
o bloque importante explicando el propósito o una decisión no obvia
(idempotencia, reintentos, mapeo de errores de ERPNext, replicación); el
código trivial no se comenta. El backend usa Java 21 (Eclipse Adoptium
Temurin) con Spring Boot 3.x. Los textos visibles al usuario van en español,
centralizados en `frontend/src/i18n/es.ts`.
**Razón**: consistencia de código en un proyecto evaluado por terceros, y
separación clara entre código (inglés) y producto visible (español).

### IX. Proceso Spec-Driven
Todo flujo de trabajo sigue la secuencia: especificación → plan → tareas →
implementación. Cada etapa relevante del proceso se cierra con un commit en
inglés siguiendo Conventional Commits.
**Razón**: mantener trazabilidad entre lo especificado y lo implementado, y
un historial de commits legible para el revisor.

## Alcance y Tecnología

Infraestructura: Docker Compose a partir de `frappe/frappe_docker` (ERPNext),
MariaDB con replicación GTID (primario + réplica), respaldos automáticos y
restauración en sitio de prueba. Backend: Java 21 Temurin, Spring Boot 3.x,
integración con la API REST de ERPNext. Frontend: React + TypeScript, Vite
PWA, Dexie (IndexedDB) para catálogos, borradores y cola de sincronización.
Pruebas E2E: Playwright, con foco en escenarios de desconexión/reconexión.
Todo el trabajo ocurre en una sola máquina con Docker Desktop y datos
ficticios.

## Flujo de Trabajo

El proyecto se organiza en fases y, dentro de la implementación, en 2 Sprints
Scrum (Sprint 1: captura y primer borrador; Sprint 2: gestión, recepción y
reintentos). Cada fase se planea antes de ejecutarse y se cierra con
verificación real, evidencia y commit. Los subagentes del proyecto
(`infra`, `backend`, `frontend`, `reviewer`) son dueños de su carpeta
correspondiente; el subagente `reviewer` es de solo lectura y valida los
criterios de aceptación, la idempotencia, el manejo de errores, la ausencia
de secretos expuestos y el cumplimiento de la convención de código (Principio
VIII) contra el resultado integrado.

## Governance

Esta constitución prevalece sobre cualquier práctica o atajo ad-hoc. Toda
enmienda debe: (a) documentarse en este archivo con un Sync Impact Report,
(b) incrementar la versión según semver (MAJOR: eliminación o redefinición
incompatible de un principio; MINOR: principio o sección nueva; PATCH:
aclaración de redacción sin cambio de fondo), y (c) quedar reflejada en un
commit dedicado. El subagente `reviewer` verifica cumplimiento de esta
constitución como parte de su revisión de cada fase; cualquier desviación
encontrada se reporta como hallazgo con criterio, evidencia y arreglo
sugerido. Cualquier complejidad añadida a la arquitectura debe justificarse
explícitamente contra alguno de estos principios.

**Version**: 1.0.0 | **Ratified**: 2026-11-17 | **Last Amended**: 2026-11-17
