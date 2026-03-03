import { OPERATOR_LABELS, TABLE_SERVER_CONFIG } from "../../shared/constants.js";
import { fmtDate, invoiceStatusLabel } from "../../shared/utils.js";
import { AddIcon, FilterIcon } from "../../shared/icons.jsx";

export function InvoicesSection({
  role,
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
  onOpenRequest,
  onDownloadPdf,
  onEditRecord,
  onDeleteRecord,
  FilterToolbarComponent,
  DataTableComponent,
  TablePagerComponent,
  StatusLineComponent,
  IconButtonComponent,
}) {
  const tableState = tables?.invoices || { rows: [], filters: [], sort: [] };
  const FilterToolbar = FilterToolbarComponent;
  const DataTable = DataTableComponent;
  const TablePager = TablePagerComponent;
  const StatusLine = StatusLineComponent;
  const IconButton = IconButtonComponent;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Счета</h2>
          <p className="muted">Выставленные счета клиентам, статусы оплаты и выгрузка PDF.</p>
        </div>
        <div className="section-head-actions">
          {onCreate ? (
            <button className="btn secondary table-control-btn" type="button" onClick={onCreate} title="Добавить" aria-label="Добавить">
              <AddIcon />
            </button>
          ) : null}
          <button className="btn secondary table-control-btn" type="button" onClick={onOpenFilter} title="Фильтр" aria-label="Фильтр">
            <FilterIcon />
          </button>
        </div>
      </div>
      <FilterToolbar
        filters={tableState.filters}
        onOpen={onOpenFilter}
        onRemove={onRemoveFilter}
        onEdit={onEditFilter}
        hideAction
        getChipLabel={(clause) => {
          const fieldDef = getFieldDef("invoices", clause.field);
          return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("invoices", clause);
        }}
      />
      <DataTable
        headers={[
          { key: "invoice_number", label: "Номер", sortable: true, field: "invoice_number" },
          { key: "status", label: "Статус", sortable: true, field: "status" },
          { key: "amount", label: "Сумма", sortable: true, field: "amount" },
          { key: "payer_display_name", label: "Плательщик", sortable: true, field: "payer_display_name" },
          { key: "request_track_number", label: "Заявка" },
          { key: "issued_by_name", label: "Выставил", sortable: true, field: "issued_by_admin_user_id" },
          { key: "issued_at", label: "Сформирован", sortable: true, field: "issued_at" },
          { key: "paid_at", label: "Оплачен", sortable: true, field: "paid_at" },
          { key: "actions", label: "Действия" },
        ]}
        rows={tableState.rows}
        emptyColspan={9}
        onSort={onSort}
        sortClause={(tableState.sort && tableState.sort[0]) || TABLE_SERVER_CONFIG.invoices.sort[0]}
        renderRow={(row) => (
          <tr key={row.id}>
            <td>
              <code>{row.invoice_number || "-"}</code>
            </td>
            <td>{row.status_label || invoiceStatusLabel(row.status)}</td>
            <td>{row.amount == null ? "-" : String(row.amount) + " " + String(row.currency || "RUB")}</td>
            <td>{row.payer_display_name || "-"}</td>
            <td>
              {row.request_id ? (
                <button
                  type="button"
                  className="request-track-link"
                  onClick={(event) => onOpenRequest(row, event)}
                  title="Открыть заявку"
                >
                  <code>{row.request_track_number || row.request_id || "-"}</code>
                </button>
              ) : (
                <code>{row.request_track_number || row.request_id || "-"}</code>
              )}
            </td>
            <td>{row.issued_by_name || "-"}</td>
            <td>{fmtDate(row.issued_at)}</td>
            <td>{fmtDate(row.paid_at)}</td>
            <td>
              <div className="table-actions">
                <IconButton icon="⬇" tooltip="Скачать PDF" onClick={() => onDownloadPdf(row)} />
                {role === "ADMIN" ? <IconButton icon="✎" tooltip="Редактировать счет" onClick={() => onEditRecord(row)} /> : null}
                {role === "ADMIN" ? (
                  <IconButton icon="🗑" tooltip="Удалить счет" onClick={() => onDeleteRecord(row.id)} tone="danger" />
                ) : null}
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
      />
      <StatusLine status={status} />
    </>
  );
}

export default InvoicesSection;
