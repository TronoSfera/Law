import { KANBAN_GROUPS } from "../shared/constants.js";
import { createTableState } from "../shared/state.js";

function normalizeKanbanColumns(rows, columns) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeColumns = Array.isArray(columns) ? columns : [];
  const canonicalByLabel = new Map();
  const aliases = new Map();
  const mergedColumns = [];

  safeColumns.forEach((column, index) => {
    const key = String(column?.key || "").trim();
    if (!key) return;
    const label = String(column?.label || key).trim() || key;
    const labelKey = label.toLocaleLowerCase("ru-RU");
    const sortOrder = Number.isFinite(Number(column?.sort_order)) ? Number(column.sort_order) : index;
    if (!canonicalByLabel.has(labelKey)) {
      const canonical = {
        key,
        label,
        sort_order: sortOrder,
        total: 0,
      };
      canonicalByLabel.set(labelKey, canonical);
      mergedColumns.push(canonical);
      return;
    }
    const canonical = canonicalByLabel.get(labelKey);
    if (canonical && canonical.key !== key) aliases.set(key, canonical.key);
  });

  if (!aliases.size) {
    return { rows: safeRows, columns: safeColumns };
  }

  const remapGroup = (groupKey) => {
    const normalized = String(groupKey || "").trim();
    if (!normalized) return normalized;
    return aliases.get(normalized) || normalized;
  };

  const normalizedRows = safeRows.map((row) => ({
    ...row,
    status_group: remapGroup(row?.status_group),
    available_transitions: Array.isArray(row?.available_transitions)
      ? row.available_transitions.map((transition) => ({
          ...transition,
          target_group: remapGroup(transition?.target_group),
        }))
      : [],
  }));

  const totals = new Map();
  normalizedRows.forEach((row) => {
    const key = String(row?.status_group || "").trim();
    if (!key) return;
    totals.set(key, Number(totals.get(key) || 0) + 1);
  });

  const normalizedColumns = mergedColumns.map((column) => ({
    ...column,
    total: Number(totals.get(String(column.key || "").trim()) || 0),
  }));

  return { rows: normalizedRows, columns: normalizedColumns };
}

export function useKanban({ api, setStatus, setTableState, tablesRef }) {
  const { useCallback, useState } = React;

  const [kanbanData, setKanbanData] = useState({
    rows: [],
    columns: KANBAN_GROUPS,
    total: 0,
    truncated: false,
  });
  const [kanbanLoading, setKanbanLoading] = useState(false);
  const [kanbanSortModal, setKanbanSortModal] = useState({
    open: false,
    value: "created_newest",
  });
  const [kanbanSortApplied, setKanbanSortApplied] = useState(false);

  const loadKanban = useCallback(
    async (tokenOverride, options) => {
      const opts = options || {};
      const currentKanbanState = tablesRef.current.kanban || createTableState();
      const activeFilters = Array.isArray(opts.filtersOverride) ? [...opts.filtersOverride] : [...(currentKanbanState.filters || [])];
      const currentSortMode = Array.isArray(currentKanbanState.sort) && currentKanbanState.sort[0] ? String(currentKanbanState.sort[0].field || "") : "";
      const activeSortMode = String(opts.sortModeOverride || currentSortMode || kanbanSortModal.value || "created_newest").trim() || "created_newest";
      const params = new URLSearchParams({ limit: "400", sort_mode: activeSortMode });
      if (activeFilters.length) params.set("filters", JSON.stringify(activeFilters));

      setKanbanLoading(true);
      setStatus("kanban", "Загрузка...", "");
      try {
        const data = await api("/api/admin/requests/kanban?" + params.toString(), {}, tokenOverride);
        const rawRows = Array.isArray(data.rows) ? data.rows : [];
        const rawColumns = Array.isArray(data.columns) && data.columns.length ? data.columns : KANBAN_GROUPS;
        const normalized = normalizeKanbanColumns(rawRows, rawColumns);
        const rows = Array.isArray(normalized.rows) ? normalized.rows : rawRows;
        const columns = Array.isArray(normalized.columns) && normalized.columns.length ? normalized.columns : rawColumns;
        setKanbanData({
          rows,
          columns,
          total: Number(data.total || rows.length),
          truncated: Boolean(data.truncated),
        });
        setTableState("kanban", {
          ...currentKanbanState,
          filters: activeFilters,
          sort: [{ field: activeSortMode, dir: "asc" }],
          rows,
          total: Number(data.total || rows.length),
          offset: 0,
          showAll: false,
        });
        const tail = Boolean(data.truncated) ? " Показана ограниченная выборка." : "";
        setStatus("kanban", "Канбан обновлен." + tail, "ok");
      } catch (error) {
        setStatus("kanban", "Ошибка: " + error.message, "error");
      } finally {
        setKanbanLoading(false);
      }
    },
    [api, kanbanSortModal.value, setStatus, setTableState, tablesRef]
  );

  const openKanbanSortModal = useCallback(() => {
    const tableState = tablesRef.current.kanban || createTableState();
    const currentMode = Array.isArray(tableState.sort) && tableState.sort[0] ? String(tableState.sort[0].field || "") : "";
    setKanbanSortModal({
      open: true,
      value: currentMode || "created_newest",
    });
    setStatus("kanbanSort", "", "");
  }, [setStatus, tablesRef]);

  const closeKanbanSortModal = useCallback(() => {
    setKanbanSortModal((prev) => ({ ...prev, open: false }));
    setStatus("kanbanSort", "", "");
  }, [setStatus]);

  const updateKanbanSortMode = useCallback((event) => {
    setKanbanSortModal((prev) => ({ ...prev, value: String(event.target.value || "created_newest") }));
  }, []);

  const submitKanbanSortModal = useCallback(
    async (event) => {
      event.preventDefault();
      const nextMode = String(kanbanSortModal.value || "created_newest");
      const tableState = tablesRef.current.kanban || createTableState();
      setTableState("kanban", {
        ...tableState,
        sort: [{ field: nextMode, dir: "asc" }],
        offset: 0,
        showAll: false,
      });
      setKanbanSortApplied(true);
      closeKanbanSortModal();
      await loadKanban(undefined, { sortModeOverride: nextMode });
    },
    [closeKanbanSortModal, kanbanSortModal.value, loadKanban, setTableState, tablesRef]
  );

  const resetKanbanState = useCallback(() => {
    setKanbanSortModal({ open: false, value: "created_newest" });
    setKanbanSortApplied(false);
    setKanbanData({ rows: [], columns: KANBAN_GROUPS, total: 0, truncated: false });
    setKanbanLoading(false);
  }, []);

  return {
    kanbanData,
    kanbanLoading,
    kanbanSortModal,
    kanbanSortApplied,
    loadKanban,
    openKanbanSortModal,
    closeKanbanSortModal,
    updateKanbanSortMode,
    submitKanbanSortModal,
    resetKanbanState,
  };
}

export default useKanban;
