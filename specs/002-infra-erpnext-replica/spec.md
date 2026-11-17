# Feature Specification: Infraestructura ERPNext con réplica y continuidad

**Feature Branch**: `002-infra-erpnext-replica`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "Infraestructura de ERPNext local con réplica MariaDB y continuidad ante fallas."

## Clarifications

### Session 2026-11-17

- Q: ¿Con qué frecuencia deben generarse los respaldos automáticos? → A: Una vez al día, fuera del horario de uso simulado. Suficiente para demostrar el mecanismo sin sobre-diseñar para el alcance de esta prueba.
- Q: ¿El "sitio de prueba" para restauración debe ser otro site de Frappe dentro del mismo bench, o una pila Docker Compose completamente separada? → A: Otro site de Frappe dentro del mismo bench/contenedor (multi-tenant nativo), más ligero y suficiente para demostrar la restauración.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Despliegue reproducible de ERPNext (Priority: P1)

Un administrador despliega ERPNext en una sola máquina a partir de Docker
Compose, con datos ficticios de prueba (una empresa, un almacén, proveedores
y artículos con control de inventario y unidad de medida), y puede
reproducir el despliegue completo desde cero siguiendo los pasos
documentados.

**Why this priority**: Sin un despliegue reproducible no existe laboratorio
sobre el cual probar ningún otro escenario de este proyecto; es la base de
todo lo demás.

**Independent Test**: Puede probarse borrando el entorno y volviendo a
levantarlo siguiendo únicamente la documentación, verificando que el sitio
de ERPNext abre y que los datos de prueba quedan disponibles.

**Acceptance Scenarios**:

1. **Given** una máquina limpia con Docker Desktop instalado, **When** el
   administrador sigue los pasos documentados de despliegue, **Then**
   ERPNext queda accesible en el navegador con los datos ficticios de
   prueba ya configurados.
2. **Given** un despliegue ya existente, **When** el administrador lo
   destruye y lo vuelve a levantar siguiendo la misma documentación,
   **Then** el resultado es equivalente, sin pasos manuales adicionales no
   documentados.

---

### User Story 2 - Réplica con GTID (Priority: P2)

El administrador ejecuta dos instancias de MariaDB (un primario y una
réplica) con volúmenes de datos separados, conectadas por una red privada
de Docker, con replicación basada en GTID, y verifica que una orden creada
en el primario aparece con el mismo folio en la réplica.

**Why this priority**: La réplica es el requisito previo indispensable para
poder demostrar continuidad ante una falla (Historia 3); sin ella no hay
nada a qué cambiar.

**Independent Test**: Puede probarse de forma aislada creando una orden en
el primario y consultando directamente la réplica para confirmar que llegó
con el mismo folio, sin necesidad de simular ninguna caída.

**Acceptance Scenarios**:

1. **Given** el primario y la réplica en operación normal, **When** el
   administrador consulta el estado de replicación en la réplica, **Then**
   los hilos de replicación se reportan en estado "Yes/Yes" y el retraso
   reportado es de 0 segundos.
2. **Given** la réplica funcionando correctamente, **When** el
   administrador crea una orden de compra en el primario, **Then** la misma
   orden, con el mismo folio, puede consultarse en la réplica.

---

### User Story 3 - Cambio al espejo ante caída del primario (Priority: P3)

El administrador detiene el contenedor de la base de datos primaria
(simulando una caída), cambia ERPNext para que use la réplica, y verifica
que puede consultar una orden anterior y crear una orden nueva usando la
réplica como base activa, manteniendo el antiguo primario fuera de
escritura al reiniciarlo.

**Why this priority**: Es la prueba central de continuidad operativa del
proyecto: demuestra que una caída de la base de datos no significa pérdida
de servicio ni de datos.

**Independent Test**: Puede probarse deteniendo el contenedor primario,
cambiando la configuración de ERPNext hacia la réplica, y verificando que
tanto la consulta de una orden previa como la creación de una nueva
funcionan usando solo la réplica.

**Acceptance Scenarios**:

1. **Given** el contenedor de la base primaria detenido, **When** el
   administrador cambia ERPNext para apuntar a la réplica, **Then** puede
   consultar una orden que existía antes de la caída y crear una orden
   nueva, ambas usando la réplica como base activa.
2. **Given** el antiguo primario ya promovido a réplica, **When** el
   administrador lo vuelve a iniciar, **Then** el antiguo primario arranca
   sin permitir escrituras, evitando que sus datos diverjan de los ya
   aceptados por la réplica promovida.

---

### User Story 4 - Respaldos automáticos (Priority: P4)

El sistema genera, de forma programada y sin intervención manual, respaldos
de la base de datos y de los archivos del sitio de ERPNext, guardándolos en
un destino local separado de los volúmenes de los contenedores.

**Why this priority**: Sin respaldos automáticos no hay nada que restaurar
en la Historia 5; es la base de la recuperación ante desastre.

**Independent Test**: Puede probarse esperando a que se dispare la
programación (o forzando una ejecución) y verificando que aparece un
respaldo nuevo, identificable por fecha y ubicación, sin que el
administrador haya ejecutado el respaldo manualmente.

**Acceptance Scenarios**:

1. **Given** la programación de respaldos activa, **When** llega el momento
   programado, **Then** se genera automáticamente un respaldo de la base de
   datos y otro de los archivos del sitio, guardados en un destino local
   distinto de los volúmenes de los contenedores.
2. **Given** uno o más respaldos ya generados, **When** el administrador los
   revisa, **Then** puede identificar claramente la fecha y la ubicación de
   cada uno.

---

### User Story 5 - Restauración verificable (Priority: P5)

El administrador restaura un respaldo existente en un sitio de prueba
distinto y comprueba que puede consultar en ese sitio restaurado una orden
de compra que ya existía en el momento en que se generó ese respaldo.

**Why this priority**: Un respaldo que nunca se restauró con éxito no es una
garantía real; esta historia cierra el ciclo de recuperación ante desastre.

**Independent Test**: Puede probarse de forma aislada tomando cualquier
respaldo ya generado y restaurándolo en un sitio de prueba distinto del
laboratorio original, sin depender de las historias de réplica ni de
cambio al espejo.

**Acceptance Scenarios**:

1. **Given** un respaldo existente de la base de datos y de los archivos del
   sitio, **When** el administrador lo restaura en otro site de Frappe
   dentro del mismo bench, distinto del sitio de laboratorio original,
   **Then** la restauración concluye exitosamente.
2. **Given** el sitio de prueba restaurado, **When** el administrador
   consulta una orden de compra que existía al momento de generar ese
   respaldo, **Then** puede verla con los mismos datos y el mismo folio.

---

### Edge Cases

- ¿Qué pasa si se intenta escribir en el antiguo primario después de que la
  réplica fue promovida, antes de que el administrador aplique la
  protección de solo lectura? Debe evitarse que esa escritura ocurra o, si
  ocurre, debe quedar documentado el riesgo de divergencia.
- ¿Qué pasa si el destino de respaldos se queda sin espacio disponible? El
  sistema debe fallar de forma visible (no silenciosa) para que el
  administrador lo note antes de depender de un respaldo inexistente.
- ¿Qué pasa si se intenta restaurar un respaldo incompleto o corrupto? La
  restauración debe fallar con un mensaje claro, no dejar un sitio de
  prueba en un estado parcialmente restaurado sin aviso.
- ¿Qué pasa si el retraso de replicación es mayor a 0 segundos en el
  momento de consultar el estado? Debe poder observarse ese retraso como
  parte de la verificación, no ocultarse.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir desplegar ERPNext en una sola máquina
  de forma reproducible, documentando los pasos necesarios para levantarlo
  desde cero.
- **FR-002**: El despliegue DEBE incluir datos ficticios de prueba (una
  empresa, un almacén, proveedores y artículos con control de inventario y
  unidad de medida) listos para usarse sin configuración manual adicional.
- **FR-003**: El sistema DEBE ejecutar una instancia primaria y una instancia
  réplica de la base de datos, cada una con su propio volumen de datos
  separado.
- **FR-004**: La instancia primaria y la réplica DEBEN comunicarse por una
  red privada aislada, no expuesta directamente fuera del entorno.
  Replicación basada en GTID.
- **FR-005**: El administrador DEBE poder verificar, en cualquier momento,
  el estado de los hilos de replicación y el retraso reportado de la
  réplica respecto al primario.
- **FR-006**: El sistema DEBE permitir cambiar ERPNext para operar contra la
  réplica cuando el primario deja de estar disponible, sin pérdida de las
  órdenes ya aceptadas antes de la caída.
- **FR-007**: El sistema DEBE evitar que el antiguo primario acepte
  escrituras al volver a iniciarse después de un cambio al espejo, mientras
  conserve su rol de réplica.
- **FR-008**: El sistema DEBE generar respaldos de la base de datos y de los
  archivos del sitio de forma programada (una vez al día, fuera del horario
  de uso simulado), sin requerir que el administrador los dispare
  manualmente.
- **FR-009**: Cada respaldo generado DEBE guardarse en un destino local
  distinto de los volúmenes usados por los contenedores en operación.
- **FR-010**: El administrador DEBE poder identificar, para cada respaldo,
  su fecha de generación y su ubicación.
- **FR-011**: El sistema DEBE permitir restaurar un respaldo existente en un
  sitio de prueba distinto del laboratorio original.
- **FR-012**: Tras una restauración exitosa, el sitio restaurado DEBE
  permitir consultar los datos (incluidas las órdenes de compra) tal como
  existían en el momento en que se generó ese respaldo.

### Key Entities *(include if feature involves data)*

- **Instancia MariaDB primaria**: base de datos activa que recibe las
  escrituras de ERPNext en operación normal.
- **Instancia MariaDB réplica**: copia que recibe los cambios del primario
  vía replicación GTID, con su propio estado de hilos y retraso observable.
- **Respaldo**: copia puntual de la base de datos y de los archivos del
  sitio, identificable por fecha y ubicación, almacenada fuera de los
  volúmenes activos.
- **Sitio ERPNext**: instancia de la aplicación (de laboratorio o de prueba
  para restauración) que opera contra el primario o la réplica según el
  rol activo en cada momento.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador nuevo puede levantar el laboratorio completo
  desde cero siguiendo solo la documentación, sin ayuda adicional, en menos
  de 30 minutos.
- **SC-002**: En operación normal, el retraso de replicación observado es
  de 0 segundos y los hilos de replicación se reportan ambos en estado
  "Yes/Yes".
- **SC-003**: El 100% de las órdenes creadas en el primario son visibles con
  el mismo folio en la réplica antes de realizar cualquier cambio al
  espejo.
- **SC-004**: Tras un cambio al espejo, el 100% de las órdenes creadas antes
  de la caída del primario siguen siendo consultables, y es posible crear
  una orden nueva sin errores usando la réplica como base activa.
- **SC-005**: El antiguo primario, al reiniciarse después de un cambio al
  espejo, rechaza el 100% de los intentos de escritura mientras conserva su
  rol de réplica.
- **SC-006**: Se genera al menos un respaldo automático identificable (por
  fecha y ubicación) sin que el administrador lo haya disparado
  manualmente.
- **SC-007**: Una restauración en un sitio de prueba permite consultar, con
  los mismos datos y folio, una orden que existía al momento de generar el
  respaldo restaurado.

## Out of Scope

- Balanceo de carga entre instancias de base de datos.
- Alta disponibilidad real con failover automático sin intervención del
  administrador.
- Replicación multi-maestro (múltiples nodos aceptando escrituras).
- Cualquier infraestructura fuera de Docker Compose en una sola máquina
  (despliegue distribuido en varios equipos, orquestadores externos, etc.).

## Assumptions

- Todo el entorno corre en una sola máquina con Docker Desktop; no se
  evalúa un despliegue distribuido en varios equipos.
- Los datos usados son ficticios y suficientes solo para demostrar los
  escenarios de este proyecto, no para un volumen de producción real.
- El cambio al espejo y la promoción de la réplica se ejecutan con
  intervención manual del administrador; no se exige un mecanismo de
  failover automático sin supervisión.
- La programación de respaldos automáticos se configura una sola vez y no
  requiere intervención del administrador en cada ejecución, aunque sí
  requiere configuración inicial.
- El destino de los respaldos tiene espacio suficiente para los respaldos
  generados durante la prueba.
