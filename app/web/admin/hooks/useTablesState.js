import { createTableState } from "../shared/state.js";

function createInitialTablesState() {
  return {
    kanban: createTableState(),
    requests: createTableState(),
    serviceRequests: createTableState(),
    invoices: createTableState(),
    quotes: createTableState(),
    topics: createTableState(),
    statuses: createTableState(),
    formFields: createTableState(),
    topicRequiredFields: createTableState(),
    topicDataTemplates: createTableState(),
    statusTransitions: createTableState(),
    users: createTableState(),
    userTopics: createTableState(),
    availableTables: createTableState(),
  };
}

export function useTablesState() {
  const { useCallback, useEffect, useRef, useState } = React;

  const [tables, setTables] = useState(createInitialTablesState);
  const [tableCatalog, setTableCatalog] = useState([]);
  const [referenceRowsMap, setReferenceRowsMap] = useState({});
  const tablesRef = useRef(tables);

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  const setTableState = useCallback((tableKey, next) => {
    setTables((prev) => ({ ...prev, [tableKey]: next }));
  }, []);

  const resetTablesState = useCallback(() => {
    setTables(createInitialTablesState());
    setTableCatalog([]);
    setReferenceRowsMap({});
  }, []);

  return {
    tables,
    setTables,
    tablesRef,
    setTableState,
    resetTablesState,
    tableCatalog,
    setTableCatalog,
    referenceRowsMap,
    setReferenceRowsMap,
  };
}

export default useTablesState;
