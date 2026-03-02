import { OPERATOR_LABELS, TABLE_SERVER_CONFIG } from "../../shared/constants.js";
import { boolLabel, fmtDate } from "../../shared/utils.js";

export function QuotesSection({
  tables,
  status,
  getFieldDef,
  getFilterValuePreview,
  onRefresh,
  onCreate,
  onOpenFilter,
  onRemoveFilter,
  onEditFilter,
  onSort,
  onPrev,
  onNext,
  onLoadAll,
  onEditRecord,
  onDeleteRecord,
  FilterToolbarComponent,
  DataTableComponent,
  TablePagerComponent,
  StatusLineComponent,
  IconButtonComponent,
}) {
  const tableState = tables?.quotes || { rows: [], filters: [], sort: [] };
  const FilterToolbar = FilterToolbarComponent;
  const DataTable = DataTableComponent;
  const TablePager = TablePagerComponent;
  const StatusLine = StatusLineComponent;
  const IconButton = IconButtonComponent;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Цитаты</h2>
          <p className="muted">Управление публичной лентой цитат с серверными фильтрами.</p>
        </div>
      </div>
      <FilterToolbar
        filters={tableState.filters}
        onOpen={onOpenFilter}
        onRemove={onRemoveFilter}
        onEdit={onEditFilter}
        hideAction
        getChipLabel={(clause) => {
          const fieldDef = getFieldDef("quotes", clause.field);
          return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("quotes", clause);
        }}
      />
      <DataTable
        headers={[
          { key: "author", label: "Автор", sortable: true, field: "author" },
          { key: "text", label: "Текст", sortable: true, field: "text" },
          { key: "source", label: "Источник", sortable: true, field: "source" },
          { key: "is_active", label: "Активна", sortable: true, field: "is_active" },
          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
          { key: "created_at", label: "Создана", sortable: true, field: "created_at" },
          { key: "actions", label: "Действия" },
        ]}
        rows={tableState.rows}
        emptyColspan={7}
        onSort={onSort}
        sortClause={(tableState.sort && tableState.sort[0]) || TABLE_SERVER_CONFIG.quotes.sort[0]}
        renderRow={(row) => (
          <tr key={row.id}>
            <td>{row.author || "-"}</td>
            <td>{row.text || "-"}</td>
            <td>{row.source || "-"}</td>
            <td>{boolLabel(row.is_active)}</td>
            <td>{String(row.sort_order ?? 0)}</td>
            <td>{fmtDate(row.created_at)}</td>
            <td>
              <div className="table-actions">
                <IconButton icon="✎" tooltip="Редактировать цитату" onClick={() => onEditRecord(row)} />
                <IconButton icon="🗑" tooltip="Удалить цитату" onClick={() => onDeleteRecord(row.id)} tone="danger" />
              </div>
            </td>
          </tr>
        )}
      />
      <TablePager
        tableState={tableState}
        onPrev={onPrev}
        onNext={onNext}
        onLoadAll={onLoadAll}
        onRefresh={onRefresh}
        onCreate={onCreate}
        onOpenFilter={onOpenFilter}
      />
      <StatusLine status={status} />
    </>
  );
}

export default QuotesSection;
