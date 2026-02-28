import { OPERATOR_LABELS, REQUEST_UPDATE_EVENT_LABELS, TABLE_SERVER_CONFIG } from "../../shared/constants.js";
import { fmtDate, statusLabel } from "../../shared/utils.js";

function renderRequestUpdatesCell(row, role) {
  const hasServiceRequestUnread = Boolean(row?.has_service_requests_unread);
  const serviceRequestCount = Number(row?.service_requests_unread_count || 0);
  const viewerUnreadTotal = Number(row?.viewer_unread_total || 0);
  const viewerUnreadByEvent = row?.viewer_unread_by_event && typeof row.viewer_unread_by_event === "object" ? row.viewer_unread_by_event : {};
  const viewerUnreadLabel =
    viewerUnreadTotal > 0
      ? Object.entries(viewerUnreadByEvent)
          .map(([eventType, count]) => {
            const code = String(eventType || "").toUpperCase();
            const label = REQUEST_UPDATE_EVENT_LABELS[code] || code.toLowerCase();
            return label + ": " + String(count || 0);
          })
          .join(", ")
      : "";
  if (role === "LAWYER") {
    const has = Boolean(row.lawyer_has_unread_updates);
    const eventType = String(row.lawyer_unread_event_type || "").toUpperCase();
    if (!has && !hasServiceRequestUnread && !viewerUnreadTotal) return <span className="request-update-empty">нет</span>;
    return (
      <span className="request-updates-stack">
        {viewerUnreadTotal > 0 ? (
          <span className="request-update-chip" title={"Мои непрочитанные: " + (viewerUnreadLabel || String(viewerUnreadTotal))}>
            <span className="request-update-dot" />
            {"Мне: " + String(viewerUnreadTotal)}
          </span>
        ) : null}
        {has ? (
          <span className="request-update-chip" title={"Есть непрочитанное обновление: " + (REQUEST_UPDATE_EVENT_LABELS[eventType] || eventType.toLowerCase())}>
            <span className="request-update-dot" />
            {REQUEST_UPDATE_EVENT_LABELS[eventType] || "обновление"}
          </span>
        ) : null}
        {hasServiceRequestUnread ? (
          <span className="request-update-chip" title={"Непрочитанные запросы клиента: " + String(serviceRequestCount)}>
            <span className="request-update-dot" />
            {"Запросы: " + String(serviceRequestCount || 1)}
          </span>
        ) : null}
      </span>
    );
  }

  const clientHas = Boolean(row.client_has_unread_updates);
  const clientType = String(row.client_unread_event_type || "").toUpperCase();
  const lawyerHas = Boolean(row.lawyer_has_unread_updates);
  const lawyerType = String(row.lawyer_unread_event_type || "").toUpperCase();

  if (!clientHas && !lawyerHas && !hasServiceRequestUnread && !viewerUnreadTotal) return <span className="request-update-empty">нет</span>;
  return (
    <span className="request-updates-stack">
      {viewerUnreadTotal > 0 ? (
        <span className="request-update-chip" title={"Мои непрочитанные: " + (viewerUnreadLabel || String(viewerUnreadTotal))}>
          <span className="request-update-dot" />
          {"Мне: " + String(viewerUnreadTotal)}
        </span>
      ) : null}
      {clientHas ? (
        <span className="request-update-chip" title={"Клиенту: " + (REQUEST_UPDATE_EVENT_LABELS[clientType] || clientType.toLowerCase())}>
          <span className="request-update-dot" />
          {"Клиент: " + (REQUEST_UPDATE_EVENT_LABELS[clientType] || "обновление")}
        </span>
      ) : null}
      {lawyerHas ? (
        <span className="request-update-chip" title={"Юристу: " + (REQUEST_UPDATE_EVENT_LABELS[lawyerType] || lawyerType.toLowerCase())}>
          <span className="request-update-dot" />
          {"Юрист: " + (REQUEST_UPDATE_EVENT_LABELS[lawyerType] || "обновление")}
        </span>
      ) : null}
      {hasServiceRequestUnread ? (
        <span className="request-update-chip" title={"Непрочитанные запросы клиента: " + String(serviceRequestCount)}>
          <span className="request-update-dot" />
          {"Запросы: " + String(serviceRequestCount || 1)}
        </span>
      ) : null}
    </span>
  );
}

export function RequestsSection({
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
  onClaimRequest,
  onOpenReassign,
  onOpenRequest,
  onEditRecord,
  onDeleteRecord,
  FilterToolbarComponent,
  DataTableComponent,
  TablePagerComponent,
  StatusLineComponent,
  IconButtonComponent,
}) {
  const tableState = tables?.requests || { rows: [], filters: [], sort: [] };
  const FilterToolbar = FilterToolbarComponent;
  const DataTable = DataTableComponent;
  const TablePager = TablePagerComponent;
  const StatusLine = StatusLineComponent;
  const IconButton = IconButtonComponent;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Заявки</h2>
          <p className="muted">Серверная фильтрация и просмотр клиентских заявок.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn secondary" type="button" onClick={onRefresh}>
            Обновить
          </button>
          <button className="btn" type="button" onClick={onCreate}>
            Новая заявка
          </button>
        </div>
      </div>
      <FilterToolbar
        filters={tableState.filters}
        onOpen={onOpenFilter}
        onRemove={onRemoveFilter}
        onEdit={onEditFilter}
        getChipLabel={(clause) => {
          const fieldDef = getFieldDef("requests", clause.field);
          return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("requests", clause);
        }}
      />
      <DataTable
        headers={[
          { key: "track_number", label: "Номер", sortable: true, field: "track_number" },
          { key: "client_name", label: "Клиент", sortable: true, field: "client_name" },
          { key: "client_phone", label: "Телефон", sortable: true, field: "client_phone" },
          { key: "status_code", label: "Статус", sortable: true, field: "status_code" },
          { key: "topic_code", label: "Тема", sortable: true, field: "topic_code" },
          { key: "assigned_lawyer_id", label: "Назначен", sortable: true, field: "assigned_lawyer_id" },
          { key: "invoice_amount", label: "Счет", sortable: true, field: "invoice_amount" },
          { key: "paid_at", label: "Оплачено", sortable: true, field: "paid_at" },
          { key: "updates", label: "Обновления" },
          { key: "created_at", label: "Создана", sortable: true, field: "created_at" },
          { key: "actions", label: "Действия" },
        ]}
        rows={tableState.rows}
        emptyColspan={11}
        onSort={onSort}
        sortClause={(tableState.sort && tableState.sort[0]) || TABLE_SERVER_CONFIG.requests.sort[0]}
        renderRow={(row) => (
          <tr key={row.id}>
            <td>
              <button
                type="button"
                className="request-track-link"
                onClick={(event) => onOpenRequest(row.id, event)}
                title="Открыть заявку"
              >
                <code>{row.track_number || "-"}</code>
              </button>
            </td>
            <td>{row.client_name || "-"}</td>
            <td>{row.client_phone || "-"}</td>
            <td>{statusLabel(row.status_code)}</td>
            <td>{row.topic_code || "-"}</td>
            <td>{resolveReferenceLabel({ table: "admin_users", value_field: "id", label_field: "name" }, row.assigned_lawyer_id)}</td>
            <td>{row.invoice_amount == null ? "-" : String(row.invoice_amount)}</td>
            <td>{fmtDate(row.paid_at)}</td>
            <td>{renderRequestUpdatesCell(row, role)}</td>
            <td>{fmtDate(row.created_at)}</td>
            <td>
              <div className="table-actions">
                {role === "LAWYER" && !row.assigned_lawyer_id ? (
                  <IconButton icon="📥" tooltip="Взять в работу" onClick={() => onClaimRequest(row.id)} />
                ) : null}
                {role === "ADMIN" && row.assigned_lawyer_id ? (
                  <IconButton icon="⇄" tooltip="Переназначить" onClick={() => onOpenReassign(row)} />
                ) : null}
                <IconButton icon="✎" tooltip="Редактировать заявку" onClick={() => onEditRecord(row)} />
                <IconButton icon="🗑" tooltip="Удалить заявку" onClick={() => onDeleteRecord(row.id)} tone="danger" />
              </div>
            </td>
          </tr>
        )}
      />
      <TablePager tableState={tableState} onPrev={onPrev} onNext={onNext} onLoadAll={onLoadAll} />
      <StatusLine status={status || (typeof getStatus === "function" ? getStatus("requests") : null)} />
    </>
  );
}

export default RequestsSection;
