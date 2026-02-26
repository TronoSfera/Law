import { createTableState } from "../shared/state.js";

export function useTableFilterActions({
  filterModal,
  closeFilterModal,
  getFieldDef,
  loadKanban,
  loadTable,
  setStatus,
  setTableState,
  tablesRef,
}) {
  const { useCallback } = React;

  const applyFilterModal = useCallback(
    async (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (!filterModal.tableKey) return;

      const fieldDef = getFieldDef(filterModal.tableKey, filterModal.field);
      if (!fieldDef) {
        setStatus("filter", "Поле фильтра не выбрано", "error");
        return;
      }

      let value;
      if (fieldDef.type === "boolean") {
        value = filterModal.rawValue === "true";
      } else if (fieldDef.type === "number") {
        if (String(filterModal.rawValue || "").trim() === "") {
          setStatus("filter", "Введите число", "error");
          return;
        }
        value = Number(filterModal.rawValue);
        if (Number.isNaN(value)) {
          setStatus("filter", "Некорректное число", "error");
          return;
        }
      } else {
        value = String(filterModal.rawValue || "").trim();
        if (!value) {
          setStatus("filter", "Введите значение фильтра", "error");
          return;
        }
      }

      const tableState = tablesRef.current[filterModal.tableKey] || createTableState();
      const nextFilters = [...(tableState.filters || [])];
      const nextClause = { field: fieldDef.field, op: filterModal.op, value };

      if (Number.isInteger(filterModal.editIndex) && filterModal.editIndex >= 0 && filterModal.editIndex < nextFilters.length) {
        nextFilters[filterModal.editIndex] = nextClause;
      } else {
        const existingIndex = nextFilters.findIndex((item) => item.field === nextClause.field && item.op === nextClause.op);
        if (existingIndex >= 0) nextFilters[existingIndex] = nextClause;
        else nextFilters.push(nextClause);
      }

      setTableState(filterModal.tableKey, {
        ...tableState,
        filters: nextFilters,
        offset: 0,
        showAll: false,
      });

      closeFilterModal();
      if (filterModal.tableKey === "kanban") {
        await loadKanban(undefined, { filtersOverride: nextFilters });
      } else {
        await loadTable(filterModal.tableKey, { resetOffset: true, filtersOverride: nextFilters });
      }
    },
    [closeFilterModal, filterModal, getFieldDef, loadKanban, loadTable, setStatus, setTableState, tablesRef]
  );

  const clearFiltersFromModal = useCallback(async () => {
    if (!filterModal.tableKey) return;
    const tableState = tablesRef.current[filterModal.tableKey] || createTableState();
    setTableState(filterModal.tableKey, {
      ...tableState,
      filters: [],
      offset: 0,
      showAll: false,
    });
    closeFilterModal();
    if (filterModal.tableKey === "kanban") {
      await loadKanban(undefined, { filtersOverride: [] });
    } else {
      await loadTable(filterModal.tableKey, { resetOffset: true, filtersOverride: [] });
    }
  }, [closeFilterModal, filterModal.tableKey, loadKanban, loadTable, setTableState, tablesRef]);

  const removeFilterChip = useCallback(
    async (tableKey, index) => {
      const tableState = tablesRef.current[tableKey] || createTableState();
      const nextFilters = [...(tableState.filters || [])];
      nextFilters.splice(index, 1);
      setTableState(tableKey, {
        ...tableState,
        filters: nextFilters,
        offset: 0,
        showAll: false,
      });
      if (tableKey === "kanban") {
        await loadKanban(undefined, { filtersOverride: nextFilters });
      } else {
        await loadTable(tableKey, { resetOffset: true, filtersOverride: nextFilters });
      }
    },
    [loadKanban, loadTable, setTableState, tablesRef]
  );

  return {
    applyFilterModal,
    clearFiltersFromModal,
    removeFilterChip,
  };
}

export default useTableFilterActions;
