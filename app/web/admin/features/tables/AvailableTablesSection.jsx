import { boolLabel, fmtDate } from "../../shared/utils.js";
import { RefreshIcon } from "../../shared/icons.jsx";

export function AvailableTablesSection({
  tables,
  status,
  onRefresh,
  onToggleActive,
  DataTableComponent,
  StatusLineComponent,
  IconButtonComponent,
}) {
  const tableState = tables?.availableTables || { rows: [] };
  const DataTable = DataTableComponent;
  const StatusLine = StatusLineComponent;
  const IconButton = IconButtonComponent;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Доступность таблиц</h2>
          <p className="muted">Скрытая служебная вкладка. Доступ только для администратора по прямой ссылке.</p>
        </div>
        <button className="btn secondary table-control-btn" type="button" onClick={onRefresh} title="Обновить" aria-label="Обновить">
          <RefreshIcon />
        </button>
      </div>
      <DataTable
        headers={[
          { key: "label", label: "Таблица" },
          { key: "table", label: "Код" },
          { key: "section", label: "Раздел" },
          { key: "is_active", label: "Активна" },
          { key: "updated_at", label: "Обновлена" },
          { key: "responsible", label: "Ответственный" },
          { key: "actions", label: "Действия" },
        ]}
        rows={tableState.rows}
        emptyColspan={7}
        renderRow={(row) => (
          <tr key={String(row.table || row.label)}>
            <td>{row.label || "-"}</td>
            <td>
              <code>{row.table || "-"}</code>
            </td>
            <td>{row.section || "-"}</td>
            <td>{boolLabel(Boolean(row.is_active))}</td>
            <td>{fmtDate(row.updated_at)}</td>
            <td>{row.responsible || "-"}</td>
            <td>
              <div className="table-actions">
                <IconButton
                  icon={row.is_active ? "⏸" : "▶"}
                  tooltip={row.is_active ? "Деактивировать таблицу" : "Активировать таблицу"}
                  onClick={() => onToggleActive(row.table, !Boolean(row.is_active))}
                />
              </div>
            </td>
          </tr>
        )}
      />
      <StatusLine status={status} />
    </>
  );
}

export default AvailableTablesSection;
