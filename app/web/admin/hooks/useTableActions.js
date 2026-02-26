import { DEFAULT_FORM_FIELD_TYPES, PAGE_SIZE, STATUS_LABELS } from "../shared/constants.js";
import { createTableState } from "../shared/state.js";
import { sortByName, statusLabel } from "../shared/utils.js";

export function useTableActions({ api, setStatus, resolveTableConfig, tablesRef, setTableState, setDictionaries, buildUniversalQuery }) {
  const { useCallback } = React;

  const loadTable = useCallback(
    async (tableKey, options, tokenOverride) => {
      const opts = options || {};
      const config = resolveTableConfig(tableKey);
      if (!config) return false;

      const current = tablesRef.current[tableKey] || createTableState();
      const next = {
        ...current,
        filters: Array.isArray(opts.filtersOverride) ? [...opts.filtersOverride] : [...(current.filters || [])],
        sort: Array.isArray(opts.sortOverride) ? [...opts.sortOverride] : Array.isArray(current.sort) ? [...current.sort] : null,
        rows: [...(current.rows || [])],
      };

      if (opts.resetOffset) {
        next.offset = 0;
        next.showAll = false;
      }
      if (opts.loadAll) {
        next.offset = 0;
        next.showAll = true;
      }

      const statusKey = tableKey;
      setStatus(statusKey, "Загрузка...", "");

      try {
        const activeSort = next.sort && next.sort.length ? next.sort : config.sort;
        let limit = next.showAll ? Math.max(next.total || PAGE_SIZE, PAGE_SIZE) : PAGE_SIZE;
        const offset = next.showAll ? 0 : next.offset;
        let data = await api(
          config.endpoint,
          {
            method: "POST",
            body: buildUniversalQuery(next.filters, activeSort, limit, offset),
          },
          tokenOverride
        );

        next.total = Number(data.total || 0);
        next.rows = data.rows || [];

        if (next.showAll && next.total > next.rows.length) {
          limit = next.total;
          data = await api(
            config.endpoint,
            {
              method: "POST",
              body: buildUniversalQuery(next.filters, activeSort, limit, 0),
            },
            tokenOverride
          );
          next.total = Number(data.total || next.total);
          next.rows = data.rows || [];
        }

        if (!next.showAll && next.total > 0 && next.offset >= next.total) {
          next.offset = Math.floor((next.total - 1) / PAGE_SIZE) * PAGE_SIZE;
          setTableState(tableKey, next);
          return loadTable(tableKey, {}, tokenOverride);
        }

        setTableState(tableKey, next);

        if (tableKey === "requests") {
          setDictionaries((prev) => {
            const map = new Map((prev.topics || []).map((topic) => [topic.code, topic]));
            (next.rows || []).forEach((row) => {
              if (!row.topic_code || map.has(row.topic_code)) return;
              map.set(row.topic_code, { code: row.topic_code, name: row.topic_code });
            });
            return { ...prev, topics: sortByName(Array.from(map.values())) };
          });
        }

        if (tableKey === "topics") {
          setDictionaries((prev) => ({
            ...prev,
            topics: sortByName((next.rows || []).map((row) => ({ code: row.code, name: row.name || row.code }))),
          }));
        }

        if (tableKey === "statuses") {
          setDictionaries((prev) => {
            const map = new Map(Object.entries(STATUS_LABELS).map(([code, name]) => [code, { code, name }]));
            (next.rows || []).forEach((row) => {
              if (!row.code) return;
              map.set(row.code, { code: row.code, name: row.name || statusLabel(row.code) });
            });
            return { ...prev, statuses: sortByName(Array.from(map.values())) };
          });
        }

        if (tableKey === "formFields" || tableKey === "form_fields") {
          setDictionaries((prev) => {
            const set = new Set(DEFAULT_FORM_FIELD_TYPES);
            (next.rows || []).forEach((row) => {
              if (row?.type) set.add(row.type);
            });
            const fieldKeys = (next.rows || [])
              .filter((row) => row && row.key)
              .map((row) => ({ key: row.key, label: row.label || row.key }))
              .sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), "ru"));
            return {
              ...prev,
              formFieldTypes: Array.from(set.values()).sort((a, b) => String(a).localeCompare(String(b), "ru")),
              formFieldKeys: fieldKeys,
            };
          });
        }

        if (tableKey === "users" || tableKey === "admin_users") {
          setDictionaries((prev) => {
            const map = new Map((prev.users || []).map((user) => [user.id, user]));
            (next.rows || []).forEach((row) => {
              map.set(row.id, {
                id: row.id,
                name: row.name || "",
                email: row.email || "",
                role: row.role || "",
                is_active: Boolean(row.is_active),
              });
            });
            return { ...prev, users: Array.from(map.values()) };
          });
        }

        setStatus(statusKey, "Список обновлен", "ok");
        return true;
      } catch (error) {
        setStatus(statusKey, "Ошибка: " + error.message, "error");
        return false;
      }
    },
    [api, buildUniversalQuery, resolveTableConfig, setDictionaries, setStatus, setTableState, tablesRef]
  );

  const loadPrevPage = useCallback(
    (tableKey) => {
      const tableState = tablesRef.current[tableKey] || createTableState();
      const next = { ...tableState, offset: Math.max(0, tableState.offset - PAGE_SIZE), showAll: false };
      setTableState(tableKey, next);
      loadTable(tableKey, {});
    },
    [loadTable, setTableState, tablesRef]
  );

  const loadNextPage = useCallback(
    (tableKey) => {
      const tableState = tablesRef.current[tableKey] || createTableState();
      if (tableState.offset + PAGE_SIZE >= tableState.total) return;
      const next = { ...tableState, offset: tableState.offset + PAGE_SIZE, showAll: false };
      setTableState(tableKey, next);
      loadTable(tableKey, {});
    },
    [loadTable, setTableState, tablesRef]
  );

  const loadAllRows = useCallback(
    (tableKey) => {
      const tableState = tablesRef.current[tableKey] || createTableState();
      if (!tableState.total) return;
      const next = { ...tableState, offset: 0, showAll: true };
      setTableState(tableKey, next);
      loadTable(tableKey, { loadAll: true });
    },
    [loadTable, setTableState, tablesRef]
  );

  const toggleTableSort = useCallback(
    (tableKey, field) => {
      const tableState = tablesRef.current[tableKey] || createTableState();
      const currentSort = Array.isArray(tableState.sort) ? tableState.sort[0] : null;
      const dir = currentSort && currentSort.field === field ? (currentSort.dir === "asc" ? "desc" : "asc") : "asc";
      const sortOverride = [{ field, dir }];
      const next = { ...tableState, sort: sortOverride, offset: 0, showAll: false };
      setTableState(tableKey, next);
      loadTable(tableKey, { resetOffset: true, sortOverride });
    },
    [loadTable, setTableState, tablesRef]
  );

  return {
    loadTable,
    loadPrevPage,
    loadNextPage,
    loadAllRows,
    toggleTableSort,
  };
}

export default useTableActions;
