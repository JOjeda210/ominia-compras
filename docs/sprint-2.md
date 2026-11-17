# Sprint 2 — Gestión y recepción

## Objetivo
Completar edición, cancelación, recepción de compra (parcial y total) y
reintentos idempotentes sin duplicados, verificados por el subagente
reviewer contra los criterios de aceptación.

## Alcance
1. Edición de un borrador ya sincronizado (misma orden en ERPNext) y
   cancelación con confirmaciones y reglas de estado de ERPNext, con errores
   comprensibles ante bloqueos.
2. Purchase Receipt vinculado a su Purchase Order y renglón, con recepción
   parcial (4 de 10 → saldo 6) y total (6 restantes → saldo 0), sin duplicar
   inventario.
3. Reintentos sin duplicados para orden y recibo, simulando una respuesta
   perdida tras guardar el documento en ERPNext.
4. Verificación integrada con el subagente reviewer; corrección de hallazgos.
5. Cierre de infraestructura final (Fase 5): cambio al espejo y
   restauración, a cargo del subagente infra.

## Revisión del incremento
_Pendiente — se completa al cerrar la Fase 4._

## Retrospectiva
_Pendiente — se completa al cerrar la Fase 4._
