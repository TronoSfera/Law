import {
  OPERATOR_LABELS,
  SERVICE_REQUEST_STATUS_LABELS,
  SERVICE_REQUEST_TYPE_LABELS,
  TABLE_SERVER_CONFIG,
} from "../../shared/constants.js";
import { fmtDate } from "../../shared/utils.js";
import { AddIcon, FilterIcon } from "../../shared/icons.jsx";

function serviceRequestTypeLabel(value) {
  const code = String(value || "").toUpperCase();
  return SERVICE_REQUEST_TYPE_LABELS[code] || code || "-";
}

function serviceRequestStatusLabel(value) {
  const code = String(value || "").toUpperCase();
  return SERVICE_REQUEST_STATUS_LABELS[code] || code || "-";
}

function unreadLabel(row, role) {
  if (String(role || "").toUpperCase() === "LAWYER") {
    return row?.lawyer_unread ? "Да" : "Нет";
  }
  return row?.admin_unread ? "Да" : "Нет";
}

export function ServiceRequestsSection({
  role,
  tables,
  status,
  getStatus,
  getFieldDef,
  getFilterValuePreview,
  resolveReferenceLabel,
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
  onMarkRead,
  onEditRecord,
  onDeleteRecord,
  FilterToolbarComponent,
  DataTableComponent,
  TablePagerComponent,
  StatusLineComponent,
  IconButtonComponent,
}) {
  const tableState = tables?.serviceRequests || { rows: [], filters: [], sort: [] };
  const FilterToolbar = FilterToolbarComponent;
  const DataTable = DataTableComponent;
  const TablePager = TablePagerComponent;
  const StatusLine = StatusLineComponent;
  const IconButton = IconButtonComponent;
  const roleCode = String(role || "").toUpperCase();

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Запросы</h2>
          <p className="muted">Запросы клиента к куратору и обращения на смену юриста.</p>
        </div>
        <div className="section-head-actions">
          {onCreate && roleCode === "ADMIN" ? (
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
          const fieldDef = getFieldDef("serviceRequests", clause.field);
          return (
            (fieldDef ? fieldDef.label : clause.field) +
            " " +
            OPERATOR_LABELS[clause.op] +
            " " +
            getFilterValuePreview("serviceRequests", clause)
          );
        }}
      />
      <DataTable
        headers={[
          { key: "type", label: "Тип", sortable: true, field: "type" },
          { key: "status", label: "Статус", sortable: true, field: "status" },
          { key: "body", label: "Обращение", sortable: false },
          { key: "request_id", label: "Заявка", sortable: true, field: "request_id" },
          { key: "unread", label: "Непрочитано", sortable: true, field: roleCode === "LAWYER" ? "lawyer_unread" : "admin_unread" },
          { key: "created_at", label: "Создан", sortable: true, field: "created_at" },
          { key: "actions", label: "Действия" },
        ]}
        rows={tableState.rows}
        emptyColspan={7}
        onSort={onSort}
        sortClause={(tableState.sort && tableState.sort[0]) || TABLE_SERVER_CONFIG.serviceRequests.sort[0]}
        renderRow={(row) => (
          <tr key={row.id}>
            <td>{serviceRequestTypeLabel(row.type)}</td>
            <td>{serviceRequestStatusLabel(row.status)}</td>
            <td>{row.body || "-"}</td>
            <td>
              {(() => {
                const requestTrackNumber =
                  String(row?.request_track_number || "").trim() ||
                  String(
                    typeof resolveReferenceLabel === "function"
                      ? resolveReferenceLabel({ table: "requests", value_field: "id", label_field: "track_number" }, row?.request_id)
                      : ""
                  ).trim();
                const requestLabel = requestTrackNumber || String(row?.request_id || "").trim() || "-";
                if (!row.request_id) return "-";
                return (
                  <button type="button" className="request-track-link" onClick={(event) => onOpenRequest(row.request_id, event)} title="Открыть заявку">
                    <code>{requestLabel}</code>
                  </button>
                );
              })()}
            </td>
            <td>{unreadLabel(row, roleCode)}</td>
            <td>{fmtDate(row.created_at)}</td>
            <td>
              <div className="table-actions">
                <IconButton icon="✓" tooltip="Отметить прочитанным" onClick={() => onMarkRead(row.id)} />
                {roleCode === "ADMIN" ? (
                  <>
                    <IconButton icon="✎" tooltip="Редактировать запрос" onClick={() => onEditRecord(row)} />
                    <IconButton icon="🗑" tooltip="Удалить запрос" onClick={() => onDeleteRecord(row.id)} tone="danger" />
                  </>
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
      <StatusLine status={status || (typeof getStatus === "function" ? getStatus("serviceRequests") : null)} />
    </>
  );
}

export default ServiceRequestsSection;
