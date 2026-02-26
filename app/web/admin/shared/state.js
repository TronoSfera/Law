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
    statusRouteNodes: [],
    statusHistory: [],
    availableStatuses: [],
    currentImportantDateAt: "",
    pendingStatusChangePreset: null,
    messages: [],
    attachments: [],
    messageDraft: "",
    selectedFiles: [],
    fileUploading: false,
  };
}
