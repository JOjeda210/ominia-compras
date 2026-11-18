# Product Backlog — Omnia Compras

Prioridad: Alta / Media / Baja. Estado: Pendiente / En progreso / Hecho.
Estimación en puntos de historia (escala Fibonacci: 1, 2, 3, 5, 8, 13).

## Épica 1 — Infraestructura ERPNext

| ID | Historia | Prioridad | Puntos | Estado |
|---|---|---|---|---|
| E1-H1 | Como administrador, quiero ERPNext desplegado con Docker Compose para tener un entorno local reproducible. | Alta | 8 | Hecho |
| E1-H2 | Como administrador, quiero un sitio de laboratorio con datos ficticios (Company, Warehouse, Supplier, Item con inventario y UoM) para probar el flujo completo. | Alta | 5 | Hecho |
| E1-H3 | Como administrador, quiero un usuario de integración con API Key/Secret guardado solo en el backend para que la app pueda autenticarse sin exponer credenciales. | Alta | 3 | Hecho |
| E1-H4 | Como administrador, quiero una réplica MariaDB con GTID en una red privada de Docker para tener redundancia de datos. | Alta | 8 | Hecho |
| E1-H5 | Como administrador, quiero verificar el estado de la réplica (Yes/Yes, 0 s de retraso) con un comando reproducible. | Alta | 3 | Hecho |
| E1-H6 | Como administrador, quiero poder cambiar al espejo (promover la réplica) cuando el primario falla, sin perder órdenes ya creadas. | Alta | 8 | Hecho |
| E1-H7 | Como administrador, quiero que el primario quede sin escritura (read_only/super_read_only) al reiniciarlo tras un cambio de rol, para evitar divergencia de datos. | Alta | 5 | Hecho |
| E1-H8 | Como administrador, quiero respaldos automáticos (base de datos + archivos del sitio) a un destino separado de los volúmenes, para poder recuperar el sistema ante un fallo. | Alta | 5 | Hecho |
| E1-H9 | Como administrador, quiero restaurar un respaldo en un sitio de prueba y confirmar que los datos restaurados son correctos. | Alta | 5 | Hecho |

## Épica 2 — Catálogos y captura offline

| ID | Historia | Prioridad | Puntos | Estado |
|---|---|---|---|---|
| E2-H1 | Como comprador, quiero que los catálogos de proveedores y artículos se descarguen y queden disponibles sin red. | Alta | 5 | Hecho |
| E2-H2 | Como comprador, quiero crear una orden de compra sin conexión a internet y que quede guardada localmente. | Alta | 8 | Hecho |
| E2-H3 | Como comprador, quiero editar cantidades de una orden en borrador local antes de que se sincronice. | Media | 3 | Hecho |
| E2-H4 | Como comprador, quiero reabrir la app sin red y seguir viendo mis órdenes pendientes y borradores. | Media | 3 | Hecho |
| E2-H5 | Como comprador, quiero que al editar una orden sin red se conserve siempre la última versión capturada, sin perder cambios. | Alta | 5 | Hecho |
| E2-H6 | Como comprador, quiero ver claramente qué órdenes están pendientes de sincronizar. | Media | 2 | Hecho |
| E2-H7 | Como comprador, quiero poder descartar una orden pendiente con una confirmación explícita, para que salga de la cola. | Media | 2 | Hecho |

## Épica 3 — Sincronización automática

| ID | Historia | Prioridad | Puntos | Estado |
|---|---|---|---|---|
| E3-H1 | Como comprador, quiero que mis órdenes pendientes se sincronicen automáticamente con ERPNext al recuperar la red, sin tener que presionar un botón. | Alta | 8 | Hecho |
| E3-H2 | Como comprador, quiero que una orden sincronizada llegue a ERPNext como borrador, no como documento presentado. | Alta | 5 | Hecho |
| E3-H3 | Como sistema, quiero que si la respuesta de sincronización se pierde y el cliente reintenta, se recupere la misma orden ya creada en vez de duplicarla. | Alta | 8 | Hecho |

## Épica 4 — Edición, presentación y cancelación

| ID | Historia | Prioridad | Puntos | Estado |
|---|---|---|---|---|
| E4-H1 | Como comprador, quiero editar una orden ya sincronizada (aún en borrador en ERPNext) respetando sus reglas de estado. | Alta | 5 | Hecho |
| E4-H2 | Como comprador, quiero presentar (submit) una orden cuando esté lista. | Media | 3 | Hecho |
| E4-H3 | Como comprador, quiero cancelar una orden con una confirmación explícita, viendo el folio de ERPNext. | Alta | 5 | Hecho |
| E4-H4 | Como comprador, quiero que si ERPNext bloquea una edición o cancelación, la app me explique la causa en lenguaje comprensible. | Alta | 5 | Hecho |

## Épica 5 — Recepción de compra

| ID | Historia | Prioridad | Puntos | Estado |
|---|---|---|---|---|
| E5-H1 | Como almacenista, quiero registrar un recibo de compra con cantidades por artículo y almacén, vinculado a su orden y renglón. | Alta | 8 | Hecho |
| E5-H2 | Como almacenista, quiero registrar una recepción parcial (p. ej. 4 de 10) y ver el saldo pendiente actualizado (6). | Alta | 5 | Hecho |
| E5-H3 | Como almacenista, quiero completar la recepción (los 6 restantes) y ver el saldo en 0 sin duplicar inventario. | Alta | 5 | Hecho |
| E5-H4 | Como sistema, quiero que si la respuesta de un recibo se pierde y el cliente reintenta, se recupere el mismo recibo ya creado en vez de duplicarlo. | Alta | 8 | Hecho |

## Épica 6 — Calidad, evidencias y entrega

| ID | Historia | Prioridad | Puntos | Estado |
|---|---|---|---|---|
| E6-H1 | Como equipo, queremos pruebas Playwright de desconexión/reconexión que demuestren el flujo offline-first. | Alta | 5 | Hecho |
| E6-H2 | Como equipo, queremos que el subagente reviewer verifique los criterios de aceptación contra el resultado integrado. | Alta | 3 | Hecho |
| E6-H3 | Como equipo, queremos una lista de evidencias (capturas) trazable a cada criterio de aceptación. | Media | 3 | Hecho |
| E6-H4 | Como equipo, queremos un README breve que permita levantar y probar el proyecto desde cero. | Media | 3 | Hecho |
| E6-H5 | Como equipo, queremos un script que genere el ZIP de entrega excluyendo secretos, node_modules y target. | Media | 2 | Hecho |
