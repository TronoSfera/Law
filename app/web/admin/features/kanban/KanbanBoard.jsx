import { KANBAN_GROUPS } from "../../shared/constants.js";
import { fallbackStatusGroup, fmtKanbanDate, resolveDeadlineTone, statusLabel } from "../../shared/utils.js";

export function KanbanBoard({
  loading,
  columns,
  rows,
  role,
  actorId,
  filters,
  onRefresh,
  onOpenFilter,
  onRemoveFilter,
  onEditFilter,
  getFilterChipLabel,
  onOpenSort,
  sortActive,
  onOpenRequest,
  onClaimRequest,
  onMoveRequest,
  status,
  FilterToolbarComponent,
  StatusLineComponent,
}) {
  const { useMemo, useState } = React;
  const [draggingId, setDraggingId] = useState("");
  const [dragOverGroup, setDragOverGroup] = useState("");

  const safeColumns = Array.isArray(columns) && columns.length ? columns : KANBAN_GROUPS;
  const grouped = useMemo(() => {
    const map = {};
    safeColumns.forEach((column) => {
      map[String(column.key)] = [];
    });
    (rows || []).forEach((row) => {
      const group = String(row?.status_group || fallbackStatusGroup(row?.status_code));
      if (!map[group]) map[group] = [];
      map[group].push(row);
    });
    return map;
  }, [rows, safeColumns]);

  const rowMap = useMemo(() => {
    const map = new Map();
    (rows || []).forEach((row) => {
      if (!row?.id) return;
      map.set(String(row.id), row);
    });
    return map;
  }, [rows]);

  const onDropToGroup = (event, groupKey) => {
    event.preventDefault();
    const requestId = String(event.dataTransfer.getData("text/plain") || draggingId || "");
    setDragOverGroup("");
    setDraggingId("");
    if (!requestId) return;
    const row = rowMap.get(requestId);
    if (!row) return;
    onMoveRequest(row, String(groupKey || ""));
  };

  const FilterToolbar = FilterToolbarComponent;
  const StatusLine = StatusLineComponent;

  return (
    <div className="kanban-wrap">
      <div className="section-head">
        <div>
          <h2>Канбан заявок</h2>
          <p className="muted">Группировка по группам статусов и серверная фильтрация карточек.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className={"btn secondary" + (sortActive ? " active-success" : "")} type="button" onClick={onOpenSort}>
            Сортировка
          </button>
          <button className="btn secondary" type="button" onClick={onRefresh} disabled={loading}>
            Обновить
          </button>
        </div>
      </div>
      {FilterToolbar ? (
        <FilterToolbar
          filters={filters || []}
          onOpen={onOpenFilter}
          onRemove={onRemoveFilter}
          onEdit={onEditFilter}
          getChipLabel={getFilterChipLabel}
        />
      ) : null}
      <div className="kanban-board" id="kanban-board">
        {safeColumns.map((column) => {
          const key = String(column.key || "");
          const cards = grouped[key] || [];
          const isOver = dragOverGroup === key;
          return (
            <div
              key={key}
              className={"kanban-column" + (isOver ? " drag-over" : "")}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverGroup(key);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget)) return;
                setDragOverGroup((prev) => (prev === key ? "" : prev));
              }}
              onDrop={(event) => onDropToGroup(event, key)}
            >
              <div className="kanban-column-head">
                <b>{column.label || key}</b>
                <span>{Number(column.total ?? cards.length)}</span>
              </div>
              <div className="kanban-column-body">
                {cards.length ? (
                  cards.map((row) => {
                    const requestId = String(row.id || "");
                    const isUnassigned = !String(row.assigned_lawyer_id || "").trim();
                    const canClaim = role === "LAWYER" && isUnassigned;
                    const canMove =
                      role === "ADMIN" ||
                      (!isUnassigned && String(row.assigned_lawyer_id || "").trim() === String(actorId || "").trim());
                    const transitionOptions = Array.isArray(row.available_transitions) ? row.available_transitions : [];
                    const deadline = row.sla_deadline_at || row.case_deadline_at || "";
                    const deadlineTone = resolveDeadlineTone(deadline);
                    const unreadTypes = new Set();
                    if (role === "LAWYER") {
                      if (row.lawyer_has_unread_updates && row.lawyer_unread_event_type) unreadTypes.add(String(row.lawyer_unread_event_type).toUpperCase());
                    } else {
                      if (row.client_has_unread_updates && row.client_unread_event_type) unreadTypes.add(String(row.client_unread_event_type).toUpperCase());
                      if (row.lawyer_has_unread_updates && row.lawyer_unread_event_type) unreadTypes.add(String(row.lawyer_unread_event_type).toUpperCase());
                    }
                    const hasUnreadMessage = unreadTypes.has("MESSAGE");
                    const hasUnreadAttachment = unreadTypes.has("ATTACHMENT");
                    return (
                      <article
                        key={requestId}
                        className={"kanban-card" + (canMove ? " draggable" : "")}
                        draggable={canMove}
                        role="button"
                        tabIndex={0}
                        onClick={(event) => onOpenRequest(requestId, event)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onOpenRequest(requestId, event);
                          }
                        }}
                        onDragStart={(event) => {
                          if (!canMove) {
                            event.preventDefault();
                            return;
                          }
                          setDraggingId(requestId);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", requestId);
                        }}
                        onDragEnd={() => {
                          setDraggingId("");
                          setDragOverGroup("");
                        }}
                      >
                        <div className="kanban-card-head">
                          <button
                            type="button"
                            className="request-track-link"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenRequest(requestId, event);
                            }}
                            title="Открыть заявку"
                          >
                            <code>{row.track_number || "-"}</code>
                          </button>
                          <span className={"kanban-status-badge group-" + String(row.status_group || "").toLowerCase()}>
                            {row.status_name || statusLabel(row.status_code)}
                          </span>
                        </div>
                        <p className="kanban-card-desc">{String(row.description || "Описание не заполнено")}</p>
                        <div className="kanban-card-meta">
                          <span>{row.client_name || "-"}</span>
                          <span>{fmtKanbanDate(row.created_at)}</span>
                        </div>
                        <div className="kanban-card-meta">
                          <span>{row.topic_code || "-"}</span>
                          <span>{row.assigned_lawyer_name || (isUnassigned ? "Не назначено" : row.assigned_lawyer_id || "-")}</span>
                        </div>
                        <div className="kanban-card-meta">
                          <div className="kanban-update-icons">
                            <span className={"kanban-update-icon" + (hasUnreadMessage ? " is-unread" : "")} title="Непрочитанные сообщения">
                              💬
                            </span>
                            <span className={"kanban-update-icon" + (hasUnreadAttachment ? " is-unread" : "")} title="Непрочитанные файлы">
                              📎
                            </span>
                          </div>
                          <span className={"kanban-deadline-chip tone-" + deadlineTone}>{deadline ? fmtKanbanDate(deadline) : "—"}</span>
                        </div>
                        <div
                          className="kanban-card-actions"
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                        >
                          {canClaim ? (
                            <button className="btn secondary btn-sm" type="button" onClick={() => onClaimRequest(requestId)}>
                              Взять в работу
                            </button>
                          ) : null}
                          {canMove && transitionOptions.length ? (
                            <select
                              className="kanban-transition-select"
                              defaultValue=""
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                const targetStatus = String(event.target.value || "");
                                if (!targetStatus) return;
                                onMoveRequest(row, "", targetStatus);
                                event.target.value = "";
                              }}
                            >
                              <option value="">Перевести…</option>
                              {transitionOptions.map((transition) => (
                                <option key={String(transition.to_status)} value={String(transition.to_status)}>
                                  {String(transition.to_status_name || transition.to_status)}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <p className="muted kanban-empty">Пусто</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {StatusLine ? <StatusLine status={status} /> : null}
    </div>
  );
}

export default KanbanBoard;
