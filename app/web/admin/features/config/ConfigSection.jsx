import { KNOWN_CONFIG_TABLE_KEYS, OPERATOR_LABELS, PAGE_SIZE, TABLE_SERVER_CONFIG } from "../../shared/constants.js";
import { AddIcon, DownloadIcon, FilterIcon, NextIcon, PrevIcon, RefreshIcon } from "../../shared/icons.jsx";
import { boolLabel, fmtDate, listPreview, normalizeReferenceMeta, roleLabel, statusKindLabel } from "../../shared/utils.js";

function fmtBalance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽";
}

function smsBalanceSummary(health) {
  if (!health || typeof health !== "object") return "Баланс SMS Aero: загрузка...";
  const provider = String(health.provider || "").toLowerCase();
  if (provider !== "smsaero") {
    return "SMS провайдер: " + String(health.provider || "-") + " (баланс недоступен)";
  }
  if (health.balance_available) {
    return "Баланс SMS Aero: " + fmtBalance(health.balance_amount);
  }
  const issues = Array.isArray(health.issues) ? health.issues.filter(Boolean) : [];
  return "Баланс SMS Aero недоступен" + (issues.length ? " • " + String(issues[0]) : "");
}

export function ConfigSection(props) {
  const {
    token,
    tables,
    dictionaries,
    configActiveKey,
    activeConfigTableState,
    activeConfigMeta,
    genericConfigHeaders,
    canCreateInConfig,
    canUpdateInConfig,
    canDeleteInConfig,
    statusDesignerTopicCode,
    statusDesignerCards,
    getTableLabel,
    getFieldDef,
    getFilterValuePreview,
    resolveReferenceLabel,
    resolveTableConfig,
    getStatus,
    loadCurrentConfigTable,
    onRefreshSmsProviderHealth,
    smsProviderHealth,
    openCreateRecordModal,
    openFilterModal,
    removeFilterChip,
    openFilterEditModal,
    toggleTableSort,
    openEditRecordModal,
    deleteRecord,
    loadStatusDesignerTopic,
    openCreateStatusTransitionForTopic,
    loadPrevPage,
    loadNextPage,
    loadAllRows,
    FilterToolbarComponent,
    DataTableComponent,
    StatusLineComponent,
    IconButtonComponent,
    UserAvatarComponent,
  } = props;

  const FilterToolbar = FilterToolbarComponent;
  const DataTable = DataTableComponent;
  const StatusLine = StatusLineComponent;
  const IconButton = IconButtonComponent;
  const UserAvatar = UserAvatarComponent;
  const statusRouteLabel = (code) =>
    resolveReferenceLabel({ table: "statuses", value_field: "code", label_field: "name" }, code);
  const canRefresh = Boolean(configActiveKey);
  const canCreateRecord = Boolean(canCreateInConfig && configActiveKey);
  const canLoadAllRows = Boolean(
    configActiveKey &&
      activeConfigTableState.total > 0 &&
      !activeConfigTableState.showAll &&
      activeConfigTableState.rows.length < activeConfigTableState.total
  );
  const canLoadPrev = Boolean(configActiveKey && !activeConfigTableState.showAll && activeConfigTableState.offset > 0);
  const canLoadNext = Boolean(
    configActiveKey &&
      !activeConfigTableState.showAll &&
      activeConfigTableState.offset + PAGE_SIZE < activeConfigTableState.total
  );

  return (
    <>
              <div className="section-head">
                <div>
                  <h2>Справочники</h2>
                  <p className="breadcrumbs">{configActiveKey ? getTableLabel(configActiveKey) : "Справочник не выбран"}</p>
                  {configActiveKey === "otp_sessions" ? (
                    <p className="muted">
                      {smsBalanceSummary(smsProviderHealth)}
                      {smsProviderHealth?.loaded_at ? " • обновлено " + fmtDate(smsProviderHealth.loaded_at) : ""}
                    </p>
                  ) : null}
                </div>
                <div className="config-head-actions">
                  {configActiveKey === "otp_sessions" ? (
                    <button className="btn secondary" type="button" onClick={onRefreshSmsProviderHealth}>
                      Баланс
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="config-layout">
                <div className="config-panel config-panel-flat">
                  <div className="config-content">
                    <div className="config-floating-actions">
                      <button
                        className="btn secondary table-control-btn"
                        type="button"
                        onClick={() => openCreateRecordModal(configActiveKey)}
                        disabled={!canCreateRecord}
                        title="Добавить"
                        aria-label="Добавить"
                      >
                        <AddIcon />
                      </button>
                      <button
                        className="btn secondary table-control-btn"
                        type="button"
                        onClick={() => openFilterModal(configActiveKey)}
                        disabled={!configActiveKey}
                        title="Фильтр"
                        aria-label="Фильтр"
                      >
                        <FilterIcon />
                      </button>
                    </div>
                    <FilterToolbar
                      filters={activeConfigTableState.filters}
                      onOpen={() => openFilterModal(configActiveKey)}
                      onRemove={(index) => removeFilterChip(configActiveKey, index)}
                      onEdit={(index) => openFilterEditModal(configActiveKey, index)}
                      hideAction
                      getChipLabel={(clause) => {
                        const fieldDef = getFieldDef(configActiveKey, clause.field);
                        return (
                          (fieldDef ? fieldDef.label : clause.field) +
                          " " +
                          OPERATOR_LABELS[clause.op] +
                          " " +
                          getFilterValuePreview(configActiveKey, clause)
                        );
                      }}
                    />
                    {configActiveKey === "topics" ? (
                      <DataTable
                        headers={[
                          { key: "code", label: "Код", sortable: true, field: "code" },
                          { key: "name", label: "Название", sortable: true, field: "name" },
                          { key: "enabled", label: "Активна", sortable: true, field: "enabled" },
                          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.topics.rows}
                        emptyColspan={5}
                        onSort={(field) => toggleTableSort("topics", field)}
                        sortClause={(tables.topics.sort && tables.topics.sort[0]) || TABLE_SERVER_CONFIG.topics.sort[0]}
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>
                              <code>{row.code || "-"}</code>
                            </td>
                            <td>{row.name || "-"}</td>
                            <td>{boolLabel(row.enabled)}</td>
                            <td>{String(row.sort_order ?? 0)}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton icon="✎" tooltip="Редактировать тему" onClick={() => openEditRecordModal("topics", row)} />
                                <IconButton icon="🗑" tooltip="Удалить тему" onClick={() => deleteRecord("topics", row.id)} tone="danger" />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "quotes" ? (
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
                        rows={tables.quotes.rows}
                        emptyColspan={7}
                        onSort={(field) => toggleTableSort("quotes", field)}
                        sortClause={(tables.quotes.sort && tables.quotes.sort[0]) || TABLE_SERVER_CONFIG.quotes.sort[0]}
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
                                <IconButton icon="✎" tooltip="Редактировать цитату" onClick={() => openEditRecordModal("quotes", row)} />
                                <IconButton icon="🗑" tooltip="Удалить цитату" onClick={() => deleteRecord("quotes", row.id)} tone="danger" />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "statuses" ? (
                      <DataTable
                        headers={[
                          { key: "code", label: "Код", sortable: true, field: "code" },
                          { key: "name", label: "Название", sortable: true, field: "name" },
                          { key: "status_group_id", label: "Группа", sortable: true, field: "status_group_id" },
                          { key: "kind", label: "Тип", sortable: true, field: "kind" },
                          { key: "enabled", label: "Активен", sortable: true, field: "enabled" },
                          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                          { key: "is_terminal", label: "Терминальный", sortable: true, field: "is_terminal" },
                          { key: "invoice_template", label: "Шаблон счета" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.statuses.rows}
                        emptyColspan={9}
                        onSort={(field) => toggleTableSort("statuses", field)}
                        sortClause={(tables.statuses.sort && tables.statuses.sort[0]) || TABLE_SERVER_CONFIG.statuses.sort[0]}
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>
                              <code>{row.code || "-"}</code>
                            </td>
                            <td>{row.name || "-"}</td>
                            <td>{resolveReferenceLabel({ table: "status_groups", value_field: "id", label_field: "name" }, row.status_group_id)}</td>
                            <td>{statusKindLabel(row.kind)}</td>
                            <td>{boolLabel(row.enabled)}</td>
                            <td>{String(row.sort_order ?? 0)}</td>
                            <td>{boolLabel(row.is_terminal)}</td>
                            <td>{row.invoice_template || "-"}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton icon="✎" tooltip="Редактировать статус" onClick={() => openEditRecordModal("statuses", row)} />
                                <IconButton icon="🗑" tooltip="Удалить статус" onClick={() => deleteRecord("statuses", row.id)} tone="danger" />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "formFields" ? (
                      <DataTable
                        headers={[
                          { key: "key", label: "Ключ", sortable: true, field: "key" },
                          { key: "label", label: "Метка", sortable: true, field: "label" },
                          { key: "type", label: "Тип", sortable: true, field: "type" },
                          { key: "required", label: "Обязательное", sortable: true, field: "required" },
                          { key: "enabled", label: "Активно", sortable: true, field: "enabled" },
                          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.formFields.rows}
                        emptyColspan={7}
                        onSort={(field) => toggleTableSort("formFields", field)}
                        sortClause={(tables.formFields.sort && tables.formFields.sort[0]) || TABLE_SERVER_CONFIG.formFields.sort[0]}
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>
                              <code>{row.key || "-"}</code>
                            </td>
                            <td>{row.label || "-"}</td>
                            <td>{row.type || "-"}</td>
                            <td>{boolLabel(row.required)}</td>
                            <td>{boolLabel(row.enabled)}</td>
                            <td>{String(row.sort_order ?? 0)}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton icon="✎" tooltip="Редактировать поле формы" onClick={() => openEditRecordModal("formFields", row)} />
                                <IconButton icon="🗑" tooltip="Удалить поле формы" onClick={() => deleteRecord("formFields", row.id)} tone="danger" />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "topicRequiredFields" ? (
                      <DataTable
                        headers={[
                          { key: "topic_code", label: "Тема", sortable: true, field: "topic_code" },
                          { key: "field_key", label: "Поле формы", sortable: true, field: "field_key" },
                          { key: "required", label: "Обязательное", sortable: true, field: "required" },
                          { key: "enabled", label: "Активно", sortable: true, field: "enabled" },
                          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                          { key: "created_at", label: "Создано", sortable: true, field: "created_at" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.topicRequiredFields.rows}
                        emptyColspan={7}
                        onSort={(field) => toggleTableSort("topicRequiredFields", field)}
                        sortClause={
                          (tables.topicRequiredFields.sort && tables.topicRequiredFields.sort[0]) ||
                          TABLE_SERVER_CONFIG.topicRequiredFields.sort[0]
                        }
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>{row.topic_code || "-"}</td>
                            <td>
                              <code>{row.field_key || "-"}</code>
                            </td>
                            <td>{boolLabel(row.required)}</td>
                            <td>{boolLabel(row.enabled)}</td>
                            <td>{String(row.sort_order ?? 0)}</td>
                            <td>{fmtDate(row.created_at)}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton
                                  icon="✎"
                                  tooltip="Редактировать обязательное поле"
                                  onClick={() => openEditRecordModal("topicRequiredFields", row)}
                                />
                                <IconButton
                                  icon="🗑"
                                  tooltip="Удалить обязательное поле"
                                  onClick={() => deleteRecord("topicRequiredFields", row.id)}
                                  tone="danger"
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "topicDataTemplates" ? (
                      <DataTable
                        headers={[
                          { key: "topic_code", label: "Тема", sortable: true, field: "topic_code" },
                          { key: "key", label: "Ключ", sortable: true, field: "key" },
                          { key: "label", label: "Метка", sortable: true, field: "label" },
                          { key: "description", label: "Описание", sortable: true, field: "description" },
                          { key: "required", label: "Обязательное", sortable: true, field: "required" },
                          { key: "enabled", label: "Активно", sortable: true, field: "enabled" },
                          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                          { key: "created_at", label: "Создано", sortable: true, field: "created_at" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.topicDataTemplates.rows}
                        emptyColspan={9}
                        onSort={(field) => toggleTableSort("topicDataTemplates", field)}
                        sortClause={
                          (tables.topicDataTemplates.sort && tables.topicDataTemplates.sort[0]) ||
                          TABLE_SERVER_CONFIG.topicDataTemplates.sort[0]
                        }
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>{row.topic_code || "-"}</td>
                            <td>
                              <code>{row.key || "-"}</code>
                            </td>
                            <td>{row.label || "-"}</td>
                            <td>{row.description || "-"}</td>
                            <td>{boolLabel(row.required)}</td>
                            <td>{boolLabel(row.enabled)}</td>
                            <td>{String(row.sort_order ?? 0)}</td>
                            <td>{fmtDate(row.created_at)}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton icon="✎" tooltip="Редактировать шаблон" onClick={() => openEditRecordModal("topicDataTemplates", row)} />
                                <IconButton icon="🗑" tooltip="Удалить шаблон" onClick={() => deleteRecord("topicDataTemplates", row.id)} tone="danger" />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "statusTransitions" ? (
                      <>
                        <div className="status-designer">
                          <div className="status-designer-head">
                            <div>
                              <h4>Конструктор маршрута статусов</h4>
                              <p className="muted">Ветвления, возвраты, SLA и требования к данным/файлам на каждом переходе.</p>
                            </div>
                            <div className="status-designer-controls">
                              <select
                                id="status-designer-topic"
                                value={statusDesignerTopicCode}
                                onChange={(event) => loadStatusDesignerTopic(event.target.value)}
                              >
                                <option value="">Выберите тему</option>
                                {(dictionaries.topics || []).map((topic) => (
                                  <option key={topic.code} value={topic.code}>
                                    {(topic.name || topic.code) + " (" + topic.code + ")"}
                                  </option>
                                ))}
                              </select>
                              <button className="btn secondary btn-sm" type="button" onClick={() => loadStatusDesignerTopic(statusDesignerTopicCode)}>
                                Обновить тему
                              </button>
                              <button className="btn btn-sm" type="button" onClick={openCreateStatusTransitionForTopic}>
                                Добавить переход
                              </button>
                            </div>
                          </div>
                          {statusDesignerCards.length ? (
                            <div className="status-designer-grid" id="status-designer-cards">
                              {statusDesignerCards.map((card) => (
                                <div className="status-node-card" key={card.code}>
                                  <div className="status-node-head">
                                    <div>
                                      <b>{card.name}</b>
                                      <code>{card.code}</code>
                                    </div>
                                    {card.isTerminal ? <span className="status-node-terminal">Терминальный</span> : null}
                                  </div>
                                  {card.outgoing.length ? (
                                    <ul className="simple-list status-node-links">
                                      {card.outgoing.map((link) => (
                                        <li key={String(link.id)}>
                                          <button
                                            className="status-link-chip"
                                            type="button"
                                            onClick={() => openEditRecordModal("statusTransitions", link)}
                                          >
                                            <span>{statusRouteLabel(link.to_status)}</span>
                                            <small>
                                              {"SLA: " +
                                                (link.sla_hours == null ? "-" : String(link.sla_hours) + " ч") +
                                                " • Данные: " +
                                                listPreview(link.required_data_keys, "-") +
                                                " • Файлы: " +
                                                listPreview(link.required_mime_types, "-")}
                                            </small>
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="muted">Нет исходящих переходов</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="muted">Для выбранной темы переходы пока не настроены.</p>
                          )}
                        </div>
                        <DataTable
                          headers={[
                            { key: "topic_code", label: "Тема", sortable: true, field: "topic_code" },
                            { key: "from_status", label: "Из статуса", sortable: true, field: "from_status" },
                            { key: "to_status", label: "В статус", sortable: true, field: "to_status" },
                            { key: "sla_hours", label: "SLA (часы)", sortable: true, field: "sla_hours" },
                            { key: "required_data_keys", label: "Обязательные данные" },
                            { key: "required_mime_types", label: "Обязательные файлы" },
                            { key: "enabled", label: "Активен", sortable: true, field: "enabled" },
                            { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                            { key: "actions", label: "Действия" },
                          ]}
                          rows={tables.statusTransitions.rows}
                          emptyColspan={9}
                          onSort={(field) => toggleTableSort("statusTransitions", field)}
                          sortClause={
                            (tables.statusTransitions.sort && tables.statusTransitions.sort[0]) || TABLE_SERVER_CONFIG.statusTransitions.sort[0]
                          }
                          renderRow={(row) => (
                            <tr key={row.id}>
                              <td>{row.topic_code || "-"}</td>
                              <td>{statusRouteLabel(row.from_status)}</td>
                              <td>{statusRouteLabel(row.to_status)}</td>
                              <td>{row.sla_hours == null ? "-" : String(row.sla_hours)}</td>
                              <td>{listPreview(row.required_data_keys, "-")}</td>
                              <td>{listPreview(row.required_mime_types, "-")}</td>
                              <td>{boolLabel(row.enabled)}</td>
                              <td>{String(row.sort_order ?? 0)}</td>
                              <td>
                                <div className="table-actions">
                                  <IconButton
                                    icon="✎"
                                    tooltip="Редактировать переход"
                                    onClick={() => openEditRecordModal("statusTransitions", row)}
                                  />
                                  <IconButton
                                    icon="🗑"
                                    tooltip="Удалить переход"
                                    onClick={() => deleteRecord("statusTransitions", row.id)}
                                    tone="danger"
                                  />
                                </div>
                              </td>
                            </tr>
                          )}
                        />
                      </>
                    ) : null}
                    {configActiveKey === "users" ? (
                      <DataTable
                        headers={[
                          { key: "name", label: "Пользователь", sortable: true, field: "name" },
                          { key: "email", label: "Email", sortable: true, field: "email" },
                          { key: "role", label: "Роль", sortable: true, field: "role" },
                          { key: "primary_topic_code", label: "Профиль (тема)", sortable: true, field: "primary_topic_code" },
                          { key: "default_rate", label: "Ставка", sortable: true, field: "default_rate" },
                          { key: "salary_percent", label: "Процент", sortable: true, field: "salary_percent" },
                          { key: "is_active", label: "Активен", sortable: true, field: "is_active" },
                          { key: "responsible", label: "Ответственный", sortable: true, field: "responsible" },
                          { key: "created_at", label: "Создан", sortable: true, field: "created_at" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.users.rows}
                        emptyColspan={10}
                        onSort={(field) => toggleTableSort("users", field)}
                        sortClause={(tables.users.sort && tables.users.sort[0]) || TABLE_SERVER_CONFIG.users.sort[0]}
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>
                              <div className="user-identity">
                                <UserAvatar name={row.name} email={row.email} avatarUrl={row.avatar_url} accessToken={token} size={32} />
                                <div className="user-identity-text">
                                  <b>{row.name || "-"}</b>
                                </div>
                              </div>
                            </td>
                            <td>{row.email || "-"}</td>
                            <td>{roleLabel(row.role)}</td>
                            <td>{resolveReferenceLabel({ table: "topics", value_field: "code", label_field: "name" }, row.primary_topic_code)}</td>
                            <td>{row.default_rate == null ? "-" : String(row.default_rate)}</td>
                            <td>{row.salary_percent == null ? "-" : String(row.salary_percent)}</td>
                            <td>{boolLabel(row.is_active)}</td>
                            <td>{row.responsible || "-"}</td>
                            <td>{fmtDate(row.created_at)}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton icon="✎" tooltip="Редактировать пользователя" onClick={() => openEditRecordModal("users", row)} />
                                <IconButton icon="🗑" tooltip="Удалить пользователя" onClick={() => deleteRecord("users", row.id)} tone="danger" />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "userTopics" ? (
                      <DataTable
                        headers={[
                          { key: "admin_user_id", label: "Юрист", sortable: true, field: "admin_user_id" },
                          { key: "topic_code", label: "Доп. тема", sortable: true, field: "topic_code" },
                          { key: "responsible", label: "Ответственный", sortable: true, field: "responsible" },
                          { key: "created_at", label: "Создано", sortable: true, field: "created_at" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.userTopics.rows}
                        emptyColspan={5}
                        onSort={(field) => toggleTableSort("userTopics", field)}
                        sortClause={(tables.userTopics.sort && tables.userTopics.sort[0]) || TABLE_SERVER_CONFIG.userTopics.sort[0]}
                        renderRow={(row) => {
                          const lawyer = (dictionaries.users || []).find((item) => String(item.id) === String(row.admin_user_id));
                          const lawyerLabel = lawyer ? (lawyer.name || lawyer.email || row.admin_user_id) : row.admin_user_id || "-";
                          return (
                            <tr key={row.id}>
                              <td>{lawyerLabel}</td>
                              <td>{row.topic_code || "-"}</td>
                              <td>{row.responsible || "-"}</td>
                              <td>{fmtDate(row.created_at)}</td>
                              <td>
                                <div className="table-actions">
                                  <IconButton icon="✎" tooltip="Редактировать связь" onClick={() => openEditRecordModal("userTopics", row)} />
                                  <IconButton icon="🗑" tooltip="Удалить связь" onClick={() => deleteRecord("userTopics", row.id)} tone="danger" />
                                </div>
                              </td>
                            </tr>
                          );
                        }}
                      />
                    ) : null}
                    {configActiveKey && !KNOWN_CONFIG_TABLE_KEYS.has(configActiveKey) ? (
                      <DataTable
                        headers={genericConfigHeaders}
                        rows={activeConfigTableState.rows}
                        emptyColspan={Math.max(1, genericConfigHeaders.length)}
                        onSort={(field) => toggleTableSort(configActiveKey, field)}
                        sortClause={
                          (activeConfigTableState.sort && activeConfigTableState.sort[0]) ||
                          ((resolveTableConfig(configActiveKey)?.sort || [])[0])
                        }
                        renderRow={(row) => (
                          <tr key={row.id || JSON.stringify(row)}>
                            {(activeConfigMeta?.columns || []).map((column) => {
                              const key = String(column.name || "");
                              const value = row[key];
                              if (column.kind === "boolean") return <td key={key}>{boolLabel(Boolean(value))}</td>;
                              if (column.kind === "date" || column.kind === "datetime") return <td key={key}>{fmtDate(value)}</td>;
                              if (column.kind === "json") return <td key={key}>{value == null ? "-" : JSON.stringify(value)}</td>;
                              const reference = normalizeReferenceMeta(column.reference);
                              if (reference) return <td key={key}>{resolveReferenceLabel(reference, value)}</td>;
                              return <td key={key}>{value == null || value === "" ? "-" : String(value)}</td>;
                            })}
                            {canUpdateInConfig || canDeleteInConfig ? (
                              <td>
                                <div className="table-actions">
                                  {canUpdateInConfig ? (
                                    <IconButton icon="✎" tooltip="Редактировать запись" onClick={() => openEditRecordModal(configActiveKey, row)} />
                                  ) : null}
                                  {canDeleteInConfig ? (
                                    <IconButton icon="🗑" tooltip="Удалить запись" onClick={() => deleteRecord(configActiveKey, row.id)} tone="danger" />
                                  ) : null}
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        )}
                      />
                    ) : null}
                    <div className="pager table-footer-bar config-controls-bar">
                      <div className="config-controls-summary">
                        {activeConfigTableState.showAll
                          ? "Всего: " + activeConfigTableState.total + " • показаны все записи"
                          : "Всего: " + activeConfigTableState.total + " • смещение: " + activeConfigTableState.offset}
                      </div>
                      <div className="config-controls-actions">
                        <button
                          className="btn secondary table-control-btn table-control-loadall"
                          type="button"
                          onClick={() => loadAllRows(configActiveKey)}
                          disabled={!canLoadAllRows}
                          title={"Загрузить все " + activeConfigTableState.total}
                          aria-label={"Загрузить все " + activeConfigTableState.total}
                        >
                          <DownloadIcon />
                          <span>{activeConfigTableState.total}</span>
                        </button>
                        <button
                          className="btn secondary table-control-btn"
                          type="button"
                          onClick={() => loadCurrentConfigTable(true)}
                          disabled={!canRefresh}
                          title="Обновить"
                          aria-label="Обновить"
                        >
                          <RefreshIcon />
                        </button>
                        <button
                          className="btn secondary table-control-btn"
                          type="button"
                          onClick={() => loadPrevPage(configActiveKey)}
                          disabled={!canLoadPrev}
                          title="Назад"
                          aria-label="Назад"
                        >
                          <PrevIcon />
                        </button>
                        <button
                          className="btn secondary table-control-btn"
                          type="button"
                          onClick={() => loadNextPage(configActiveKey)}
                          disabled={!canLoadNext}
                          title="Вперед"
                          aria-label="Вперед"
                        >
                          <NextIcon />
                        </button>
                      </div>
                    </div>
                    <StatusLine status={getStatus(configActiveKey)} />
                  </div>
                </div>
              </div>
    </>
  );
}

export default ConfigSection;
