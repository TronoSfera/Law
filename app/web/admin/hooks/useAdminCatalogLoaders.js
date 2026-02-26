import { normalizeReferenceMeta } from "../shared/utils.js";

export function useAdminCatalogLoaders({ api, setStatus, setTableState, setReferenceRowsMap, buildUniversalQuery }) {
  const { useCallback } = React;

  const loadAvailableTables = useCallback(
    async (tokenOverride) => {
      setStatus("availableTables", "Загрузка...", "");
      try {
        const data = await api("/api/admin/crud/meta/available-tables", {}, tokenOverride);
        const rows = Array.isArray(data.rows) ? data.rows : [];
        setTableState("availableTables", {
          filters: [],
          sort: null,
          offset: 0,
          total: rows.length,
          showAll: true,
          rows,
        });
        setStatus("availableTables", "Список обновлен", "ok");
        return true;
      } catch (error) {
        setStatus("availableTables", "Ошибка: " + error.message, "error");
        return false;
      }
    },
    [api, setStatus, setTableState]
  );

  const loadReferenceRows = useCallback(
    async (catalogRows, tokenOverride) => {
      const rows = Array.isArray(catalogRows) ? catalogRows : [];
      const byTable = {};
      rows.forEach((item) => {
        const table = String(item?.table || "");
        if (!table) return;
        byTable[table] = item;
      });
      const references = new Set();
      rows.forEach((item) => {
        (item?.columns || []).forEach((column) => {
          const meta = normalizeReferenceMeta(column?.reference);
          if (meta?.table) references.add(meta.table);
        });
      });
      if (!references.size) {
        setReferenceRowsMap({});
        return;
      }
      const nextMap = {};
      await Promise.all(
        Array.from(references.values()).map(async (table) => {
          const meta = byTable[table];
          const endpoint = String(meta?.query_endpoint || ("/api/admin/crud/" + table + "/query"));
          const sort = Array.isArray(meta?.default_sort) && meta.default_sort.length ? meta.default_sort : [{ field: "created_at", dir: "desc" }];
          try {
            const data = await api(
              endpoint,
              {
                method: "POST",
                body: buildUniversalQuery([], sort, 500, 0),
              },
              tokenOverride
            );
            nextMap[table] = Array.isArray(data?.rows) ? data.rows : [];
          } catch (_) {
            nextMap[table] = [];
          }
        })
      );
      setReferenceRowsMap(nextMap);
    },
    [api, buildUniversalQuery, setReferenceRowsMap]
  );

  return {
    loadAvailableTables,
    loadReferenceRows,
  };
}

export default useAdminCatalogLoaders;
