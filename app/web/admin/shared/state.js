export function createTableState() {
  return {
    filters: [],
    sort: null,
    offset: 0,
    total: 0,
    showAll: false,
    rows: [],
  };
}

export function createRequestModalState() {
  return {
    loading: false,
    requestId: null,
    trackNumber: "",
    requestData: null,
    financeSummary: null,
    invoices: [],
    statusRouteNodes: [],
    statusHistory: [],
    availableStatuses: [],
    currentImportantDateAt: "",
    pendingStatusChangePreset: null,
    messages: [],
    messagesHasMore: false,
    messagesLoadingMore: false,
    messagesLoadedCount: 0,
    messagesTotal: 0,
    attachments: [],
    messageDraft: "",
    selectedFiles: [],
    fileUploading: false,
  };
}
