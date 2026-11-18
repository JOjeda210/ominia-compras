// Centralized Spanish UI copy. No component may hardcode user-visible text (Constitution
// Principle VIII / CLAUDE.md): every string shown to the buyer lives here.
export const es = {
  app: {
    title: 'Compras Omnia',
    subtitle: 'Captura de órdenes de compra sin conexión',
  },
  connectivity: {
    offline: 'Sin conexión: tus cambios se guardan en este dispositivo.',
    online: 'Conectado. Sincronizando pendientes automáticamente...',
    checking: 'Verificando la conexión...',
  },
  nav: {
    orders: 'Órdenes de compra',
    newOrder: 'Nueva orden',
  },
  syncStatus: {
    pending: 'Pendiente',
    syncing: 'Sincronizando...',
    synced: 'Sincronizada',
    failed: 'Error de sincronización',
  },
  erpnextStatus: {
    draft: 'Borrador',
    submitted: 'Presentada',
    cancelled: 'Cancelada',
  },
  orderList: {
    title: 'Órdenes de compra',
    empty: 'Todavía no hay órdenes capturadas en este dispositivo.',
    createButton: 'Nueva orden',
    folioLabel: 'Folio ERPNext',
    noFolioYet: 'Sin folio todavía',
    viewDetailButton: 'Ver detalle',
    itemCount: (count: number) => `${count} ${count === 1 ? 'artículo' : 'artículos'}`,
  },
  orderForm: {
    titleCreate: 'Nueva orden de compra',
    titleEdit: 'Editar orden de compra',
    supplierLabel: 'Proveedor',
    supplierPlaceholder: 'Selecciona un proveedor',
    itemsTitle: 'Artículos',
    itemLabel: 'Artículo',
    itemPlaceholder: 'Selecciona un artículo',
    quantityLabel: 'Cantidad',
    addLineButton: 'Agregar artículo',
    removeLineButton: 'Quitar',
    saveButton: 'Guardar',
    cancelButton: 'Cancelar',
    noCatalogWarning:
      'No hay catálogo de proveedores o artículos descargado en este dispositivo todavía.',
    validation: {
      supplierRequired: 'Selecciona un proveedor.',
      atLeastOneLine: 'Agrega al menos un artículo.',
      quantityPositive: 'La cantidad debe ser mayor a cero.',
      itemRequired: 'Selecciona un artículo para cada renglón.',
    },
  },
  orderDetail: {
    title: 'Detalle de la orden',
    supplierLabel: 'Proveedor',
    statusLabel: 'Estado',
    folioLabel: 'Folio ERPNext',
    createdAtLabel: 'Creada',
    updatedAtLabel: 'Última edición',
    errorLabel: 'Último error reportado',
    editButton: 'Editar',
    discardButton: 'Descartar',
    backButton: 'Volver al listado',
    notFound: 'Esta orden ya no existe en este dispositivo.',
  },
  confirmDiscard: {
    title: 'Descartar esta captura',
    message:
      'Esta orden pendiente se eliminará de este dispositivo y no se enviará a ERPNext. Esta acción no se puede deshacer.',
    confirmButton: 'Sí, descartar',
    cancelButton: 'No, conservar',
  },
  catalog: {
    downloading: 'Descargando catálogos de proveedores y artículos...',
    downloadError:
      'No se pudo descargar el catálogo. Se usará la última copia guardada en este dispositivo.',
    refreshButton: 'Actualizar catálogos',
    lastUpdatedLabel: 'Última actualización',
    neverDownloaded: 'Todavía no se ha descargado ningún catálogo.',
  },
  errors: {
    generic: 'Ocurrió un error inesperado. Vuelve a intentarlo.',
    erpnextUnreachable:
      'No se pudo contactar al servidor en este momento. La orden seguirá pendiente y se reintentará automáticamente al recuperar la conexión.',
  },
} as const;
