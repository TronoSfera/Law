import {
  DEFAULT_FORM_FIELD_TYPES,
  INVOICE_STATUS_LABELS,
  LS_TOKEN,
  OPERATOR_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  STATUS_KIND_LABELS,
  TABLE_KEY_ALIASES,
  TABLE_MUTATION_CONFIG,
  TABLE_SERVER_CONFIG,
  TABLE_UNALIASES,
  PAGE_SIZE,
} from "./admin/shared/constants.js";
import { createTableState } from "./admin/shared/state.js";
import { KanbanBoard } from "./admin/features/kanban/KanbanBoard.jsx";
import { ConfigSection } from "./admin/features/config/ConfigSection.jsx";
import { DashboardSection } from "./admin/features/dashboard/DashboardSection.jsx";
import { InvoicesSection } from "./admin/features/invoices/InvoicesSection.jsx";
import { RequestsSection } from "./admin/features/requests/RequestsSection.jsx";
import { QuotesSection } from "./admin/features/quotes/QuotesSection.jsx";
import { ServiceRequestsSection } from "./admin/features/service-requests/ServiceRequestsSection.jsx";
import { RequestWorkspace } from "./admin/features/requests/RequestWorkspace.jsx";
import { AvailableTablesSection } from "./admin/features/tables/AvailableTablesSection.jsx";
import { useAdminApi } from "./admin/hooks/useAdminApi.js";
import { useAdminCatalogLoaders } from "./admin/hooks/useAdminCatalogLoaders.js";
import { useKanban } from "./admin/hooks/useKanban.js";
import { useRequestWorkspace } from "./admin/hooks/useRequestWorkspace.js";
import { useTableActions } from "./admin/hooks/useTableActions.js";
import { useTableFilterActions } from "./admin/hooks/useTableFilterActions.js";
import { useTablesState } from "./admin/hooks/useTablesState.js";
import {
  avatarColor,
  boolFilterLabel,
  buildUniversalQuery,
  canAccessSection,
  decodeJwtPayload,
  detectAttachmentPreviewKind,
  fallbackStatusGroup,
  fmtAmount,
  fmtBytes,
  fmtDateOnly,
  fmtKanbanDate,
  fmtTimeOnly,
  getOperatorsForType,
  humanizeKey,
  localizeMeta,
  localizeRequestDetails,
  metaKindToFilterType,
  metaKindToRecordType,
  normalizeReferenceMeta,
  normalizeStringList,
  resolveAdminObjectSrc,
  resolveAdminRoute,
  resolveAvatarSrc,
  resolveDeadlineTone,
  roleLabel,
  sortByName,
  statusLabel,
  translateApiError,
  userInitials,
} from "./admin/shared/utils.js";

(function () {
const { useCallback, useEffect, useMemo, useRef, useState } = React;
const LEGACY_HIDDEN_DICTIONARY_TABLES = new Set(["formFields", "topicRequiredFields", "statusTransitions"]);
const NEW_REQUEST_CLIENT_OPTION = "__new_client__";

  function StatusLine({ status }) {
    return <p className={"status" + (status?.kind ? " " + status.kind : "")}>{status?.message || ""}</p>;
  }

  function Section({ active, children, id }) {
    return (
      <section className={"section" + (active ? " active" : "")} id={id}>
        {children}
      </section>
    );
  }

  function DataTable({ headers, rows, emptyColspan, renderRow, onSort, sortClause }) {
    return (
      <div className="table-wrap table-scroll-region">
        <table>
          <thead>
            <tr>
              {headers.map((header) => {
                const h = typeof header === "string" ? { key: header, label: header } : header;
                const sortable = Boolean(h.sortable && h.field && onSort);
                const active = Boolean(sortable && sortClause && sortClause.field === h.field);
                const direction = active ? sortClause.dir : "";
                return (
                  <th
                    key={h.key || h.label}
                    className={sortable ? "sortable-th" : ""}
                    onClick={sortable ? () => onSort(h.field) : undefined}
                    title={sortable ? "Нажмите для сортировки" : undefined}
                  >
                    <span className={sortable ? "sortable-head" : ""}>
                      {h.label}
                      {sortable ? <span className={"sort-indicator" + (active ? " active" : "")}>{direction === "desc" ? "↓" : "↑"}</span> : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => renderRow(row, index))
            ) : (
              <tr>
                <td colSpan={emptyColspan}>Нет данных</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  function TablePager({ tableState, onPrev, onNext, onLoadAll }) {
    return (
      <div className="pager table-footer-bar">
        <div>
          {tableState.showAll
            ? "Всего: " + tableState.total + " • показаны все записи"
            : "Всего: " + tableState.total + " • смещение: " + tableState.offset}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn secondary"
            type="button"
            onClick={onLoadAll}
            disabled={tableState.total === 0 || tableState.showAll || tableState.rows.length >= tableState.total}
          >
            {"Загрузить все " + tableState.total}
          </button>
          <button className="btn secondary" type="button" onClick={onPrev} disabled={tableState.showAll || tableState.offset <= 0}>
            Назад
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={onNext}
            disabled={tableState.showAll || tableState.offset + PAGE_SIZE >= tableState.total}
          >
            Вперед
          </button>
        </div>
      </div>
    );
  }

  function FilterToolbar({ filters, onOpen, onRemove, onEdit, getChipLabel }) {
    return (
      <div className="filter-toolbar">
        <div className="filter-chips">
          {filters.length ? (
            filters.map((filter, index) => (
              <div
                className="filter-chip"
                key={filter.field + filter.op + index}
                onClick={() => onEdit(index)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onEdit(index);
                  }
                }}
                title="Редактировать фильтр"
              >
                <span>{getChipLabel(filter)}</span>
                <button
                  type="button"
                  aria-label="Удалить фильтр"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(index);
                  }}
                >
                  ×
                </button>
              </div>
            ))
          ) : (
            <span className="chip-placeholder">Фильтры не заданы</span>
          )}
        </div>
        <div className="filter-action">
          <button className="btn secondary" type="button" onClick={onOpen}>
            Фильтр
          </button>
        </div>
      </div>
    );
  }

  function Overlay({ open, onClose, children, id }) {
    return (
      <div className={"overlay" + (open ? " open" : "")} id={id} onClick={onClose}>
        {children}
      </div>
    );
  }

  function IconButton({ icon, tooltip, onClick, tone }) {
    const handleClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.nativeEvent && typeof event.nativeEvent.stopImmediatePropagation === "function") {
        event.nativeEvent.stopImmediatePropagation();
      }
      if (typeof onClick === "function") onClick(event);
    };
    const handleAuxClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.nativeEvent && typeof event.nativeEvent.stopImmediatePropagation === "function") {
        event.nativeEvent.stopImmediatePropagation();
      }
    };
    return (
      <button
        className={"icon-btn" + (tone ? " " + tone : "")}
        type="button"
        data-tooltip={tooltip}
        onClick={handleClick}
        onAuxClick={handleAuxClick}
        aria-label={tooltip}
      >
        {icon}
      </button>
    );
  }

  function UserAvatar({ name, email, avatarUrl, accessToken, size = 32 }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => setBroken(false), [avatarUrl]);
    const initials = userInitials(name, email);
    const bg = avatarColor(name || email || initials);
    const src = resolveAvatarSrc(avatarUrl, accessToken);
    const canShowImage = Boolean(src && !broken);
    return (
      <span className="avatar" style={{ width: size + "px", height: size + "px", backgroundColor: bg }}>
        {canShowImage ? (
          <img src={src} alt={name || email || "avatar"} onError={() => setBroken(true)} />
        ) : (
          <span>{initials}</span>
        )}
      </span>
    );
  }

  function LoginScreen({ onSubmit, status }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [totpCode, setTotpCode] = useState("");

    const submit = (event) => {
      event.preventDefault();
      onSubmit(email, password, totpCode);
    };

    return (
      <div className="login-screen">
        <div className="login-card">
          <h2>Вход в админ-панель</h2>
          <p className="muted">Используйте учетную запись администратора или юриста.</p>
          <form className="stack" style={{ marginTop: "0.7rem" }} onSubmit={submit}>
            <div className="field">
              <label htmlFor="login-email">Эл. почта</label>
              <input
                id="login-email"
                type="email"
                required
                placeholder="admin@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="login-password">Пароль</label>
              <input
                id="login-password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="login-totp">TOTP / резервный код</label>
              <input
                id="login-totp"
                type="text"
                placeholder="123456 или backup-code"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
              />
            </div>
            <button className="btn" type="submit">
              Войти
            </button>
            <StatusLine status={status} />
          </form>
        </div>
      </div>
    );
  }

  function FilterModal({
    open,
    tableLabel,
    fields,
    draft,
    status,
    onClose,
    onFieldChange,
    onOpChange,
    onValueChange,
    onSubmit,
    onClear,
    getOperators,
    getFieldOptions,
  }) {
    if (!open) return null;

    const selectedField = fields.find((field) => field.field === draft.field) || fields[0] || null;
    const operators = getOperators(selectedField?.type || "text");
    const options = selectedField ? getFieldOptions(selectedField) : [];

    return (
      <Overlay open={open} id="filter-overlay" onClose={(event) => event.target.id === "filter-overlay" && onClose()}>
        <div className="modal" style={{ width: "min(560px, 100%)" }} onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>Фильтр таблицы</h3>
              <p className="muted" style={{ marginTop: "0.35rem" }}>
                {tableLabel
                  ? (draft.editIndex !== null ? "Редактирование фильтра • " : "Новый фильтр • ") + "Таблица: " + tableLabel
                  : "Выберите поле, оператор и значение."}
              </p>
            </div>
            <button className="close" type="button" onClick={onClose}>
              ×
            </button>
          </div>
          <form className="stack" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="filter-field">Поле</label>
              <select id="filter-field" value={draft.field} onChange={onFieldChange}>
                {fields.map((field) => (
                  <option value={field.field} key={field.field}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="filter-op">Оператор</label>
              <select id="filter-op" value={draft.op} onChange={onOpChange}>
                {operators.map((op) => (
                  <option value={op} key={op}>
                    {OPERATOR_LABELS[op]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="filter-value">{selectedField ? "Значение: " + selectedField.label : "Значение"}</label>
              {!selectedField || selectedField.type === "text" ? (
                <input id="filter-value" type="text" value={draft.rawValue} onChange={onValueChange} placeholder="Введите значение" />
              ) : selectedField.type === "number" ? (
                <input id="filter-value" type="number" step="any" value={draft.rawValue} onChange={onValueChange} placeholder="Число" />
              ) : selectedField.type === "date" ? (
                <input id="filter-value" type="date" value={draft.rawValue} onChange={onValueChange} />
              ) : selectedField.type === "boolean" ? (
                <select id="filter-value" value={draft.rawValue} onChange={onValueChange}>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              ) : selectedField.type === "reference" || selectedField.type === "enum" ? (
                <select id="filter-value" value={draft.rawValue} onChange={onValueChange} disabled={!options.length}>
                  {!options.length ? (
                    <option value="">Нет доступных значений</option>
                  ) : (
                    options.map((option) => (
                      <option value={String(option.value)} key={String(option.value)}>
                        {option.label}
                      </option>
                    ))
                  )}
                </select>
              ) : (
                <input id="filter-value" type="text" value={draft.rawValue} onChange={onValueChange} placeholder="Введите значение" />
              )}
            </div>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button className="btn" type="submit">
                {draft.editIndex !== null ? "Сохранить" : "Добавить"}
              </button>
              <button className="btn secondary" type="button" onClick={onClear}>
                Очистить все
              </button>
              <button className="btn secondary" type="button" onClick={onClose}>
                Отмена
              </button>
            </div>
            <StatusLine status={status} />
          </form>
        </div>
      </Overlay>
    );
  }

  function ReassignModal({ open, status, options, value, onChange, onClose, onSubmit, trackNumber }) {
    if (!open) return null;
    return (
      <Overlay open={open} id="reassign-overlay" onClose={(event) => event.target.id === "reassign-overlay" && onClose()}>
        <div className="modal" style={{ width: "min(520px, 100%)" }} onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>Переназначение заявки</h3>
              <p className="muted" style={{ marginTop: "0.35rem" }}>
                {trackNumber ? "Заявка: " + trackNumber : "Выберите нового юриста"}
              </p>
            </div>
            <button className="close" type="button" onClick={onClose}>
              ×
            </button>
          </div>
          <form className="stack" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="reassign-lawyer">Новый юрист</label>
              <select id="reassign-lawyer" value={value} onChange={onChange} disabled={!options.length}>
                {!options.length ? (
                  <option value="">Нет доступных юристов</option>
                ) : (
                  options.map((option) => (
                    <option value={String(option.value)} key={String(option.value)}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button className="btn" type="submit" disabled={!value}>
                Сохранить
              </button>
              <button className="btn secondary" type="button" onClick={onClose}>
                Отмена
              </button>
            </div>
            <StatusLine status={status} />
          </form>
        </div>
      </Overlay>
    );
  }

  function KanbanSortModal({ open, value, status, onChange, onClose, onSubmit }) {
    if (!open) return null;
    return (
      <Overlay open={open} id="kanban-sort-overlay" onClose={(event) => event.target.id === "kanban-sort-overlay" && onClose()}>
        <div className="modal" style={{ width: "min(520px, 100%)" }} onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>Сортировка канбана</h3>
              <p className="muted" style={{ marginTop: "0.35rem" }}>
                Выберите способ сортировки карточек.
              </p>
            </div>
            <button className="close" type="button" onClick={onClose}>
              ×
            </button>
          </div>
          <form className="stack" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="kanban-sort-mode">Тип сортировки</label>
              <select id="kanban-sort-mode" value={value} onChange={onChange}>
                <option value="created_newest">Дата заявки (новые сверху)</option>
                <option value="lawyer">Юрист</option>
                <option value="deadline">Дедлайн</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button className="btn" type="submit">
                Ок
              </button>
              <button className="btn secondary" type="button" onClick={onClose}>
                Отмена
              </button>
            </div>
            <StatusLine status={status} />
          </form>
        </div>
      </Overlay>
    );
  }

  function AttachmentPreviewModal({ open, title, url, fileName, mimeType, onClose }) {
    const [resolvedUrl, setResolvedUrl] = useState("");
    const [resolvedText, setResolvedText] = useState("");
    const [resolvedKind, setResolvedKind] = useState("");
    const [hint, setHint] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const decodeTextPreview = (arrayBuffer) => {
      const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
      const sampleLength = Math.min(bytes.length, 4096);
      let suspicious = 0;
      for (let i = 0; i < sampleLength; i += 1) {
        const byte = bytes[i];
        if (byte === 0) suspicious += 4;
        else if (byte < 9 || (byte > 13 && byte < 32)) suspicious += 1;
      }
      if (sampleLength && suspicious / sampleLength > 0.08) return null;
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "");
      const normalized = text.length > 200000 ? text.slice(0, 200000) + "\n\n[Текст обрезан для предпросмотра]" : text;
      return normalized;
    };

    useEffect(() => {
      if (!open || !url) {
        setResolvedUrl("");
        setResolvedText("");
        setResolvedKind("");
        setHint("");
        setLoading(false);
        setError("");
        return;
      }
      const kind = detectAttachmentPreviewKind(fileName, mimeType);
      setResolvedKind(kind);
      setResolvedText("");
      setHint("");
      if (kind === "none") {
        setResolvedUrl("");
        setLoading(false);
        setError("");
        return;
      }

      let cancelled = false;
      let objectUrl = "";
      setLoading(true);
      setError("");
      setResolvedUrl("");

      (async () => {
        try {
          const response = await fetch(url, { credentials: "same-origin" });
          if (!response.ok) throw new Error("Не удалось загрузить файл для предпросмотра");
          const buffer = await response.arrayBuffer();
          if (cancelled) return;

          if (kind === "pdf") {
            const header = new Uint8Array(buffer.slice(0, 5));
            const isPdf =
              header.length >= 5 &&
              header[0] === 0x25 &&
              header[1] === 0x50 &&
              header[2] === 0x44 &&
              header[3] === 0x46 &&
              header[4] === 0x2d;
            if (isPdf) {
              setResolvedUrl(String(url));
              setResolvedKind("pdf");
              setLoading(false);
              return;
            }
            const textPreview = decodeTextPreview(buffer);
            if (textPreview != null) {
              setResolvedUrl("");
              setResolvedText(textPreview);
              setResolvedKind("text");
              setHint("Файл помечен как PDF, но не является валидным PDF. Показан текстовый предпросмотр.");
              setLoading(false);
              return;
            }
            throw new Error("Файл помечен как PDF, но не является валидным PDF-документом.");
          }

          if (kind === "text") {
            const textPreview = decodeTextPreview(buffer);
            if (textPreview == null) throw new Error("Не удалось распознать текстовый файл для предпросмотра.");
            setResolvedUrl("");
            setResolvedText(textPreview);
            setResolvedKind("text");
            setLoading(false);
            return;
          }

          const blob = new Blob([buffer], { type: response.headers.get("content-type") || mimeType || "application/octet-stream" });
          objectUrl = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          setResolvedUrl(objectUrl);
          setResolvedKind(kind);
          setLoading(false);
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Не удалось открыть предпросмотр");
          setLoading(false);
        }
      })();

      return () => {
        cancelled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }, [fileName, mimeType, open, url]);

    if (!open || !url) return null;
    const kind = resolvedKind || detectAttachmentPreviewKind(fileName, mimeType);
    return (
      <Overlay open={open} id="request-file-preview-overlay" onClose={(event) => event.target.id === "request-file-preview-overlay" && onClose()}>
        <div className="modal request-preview-modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <h3>{title || fileName || "Предпросмотр файла"}</h3>
            <div className="request-preview-head-actions">
              <a
                className="icon-btn file-action-btn request-preview-download-icon"
                href={url}
                target="_blank"
                rel="noreferrer"
                aria-label="Скачать файл"
                data-tooltip="Скачать"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                  <path
                    d="M12 3a1 1 0 0 1 1 1v8.17l2.58-2.58a1 1 0 1 1 1.42 1.42l-4.3 4.3a1 1 0 0 1-1.4 0l-4.3-4.3a1 1 0 0 1 1.42-1.42L11 12.17V4a1 1 0 0 1 1-1zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z"
                    fill="currentColor"
                  />
                </svg>
              </a>
              <button className="close" type="button" onClick={onClose}>
                ×
              </button>
            </div>
          </div>
          <div className="request-preview-body">
            {loading ? <p className="request-preview-note">Загрузка предпросмотра...</p> : null}
            {!loading && !error && hint ? <p className="request-preview-note">{hint}</p> : null}
            {error ? <p className="request-preview-note">{error}</p> : null}
            {!loading && !error && kind === "image" && resolvedUrl ? (
              <img className="request-preview-image" src={resolvedUrl} alt={fileName || "attachment"} />
            ) : null}
            {!loading && !error && kind === "video" && resolvedUrl ? (
              <video className="request-preview-video" src={resolvedUrl} controls preload="metadata" />
            ) : null}
            {!loading && !error && kind === "pdf" && resolvedUrl ? (
              <iframe className="request-preview-frame" src={resolvedUrl} title={fileName || "preview"} />
            ) : null}
            {!loading && !error && kind === "text" ? (
              <pre className="request-preview-text">{resolvedText || "Файл пуст."}</pre>
            ) : null}
            {kind === "none" ? <p className="request-preview-note">Для этого типа файла доступно только открытие или скачивание.</p> : null}
          </div>
        </div>
      </Overlay>
    );
  }

  function RecordModal({ open, title, fields, form, status, onClose, onChange, onSubmit, onUploadField }) {
    if (!open) return null;
    const visibleFields = (fields || []).filter((field) => {
      if (typeof field.visibleWhen !== "function") return true;
      try {
        return Boolean(field.visibleWhen(form || {}));
      } catch (_) {
        return true;
      }
    });

    const renderField = (field) => {
      const value = form[field.key] ?? "";
      const options = typeof field.options === "function" ? field.options() : [];
      const id = "record-field-" + field.key;
      const disabled = Boolean(field.readOnly) || (typeof field.readOnlyWhen === "function" ? Boolean(field.readOnlyWhen(form || {})) : false);

      if (field.type === "textarea" || field.type === "json") {
        return (
          <textarea
            id={id}
            value={value}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={field.placeholder || ""}
            required={Boolean(field.required)}
            disabled={disabled}
          />
        );
      }
      if (field.type === "boolean") {
        return (
          <select id={id} value={value} onChange={(event) => onChange(field.key, event.target.value)} disabled={disabled}>
            <option value="true">Да</option>
            <option value="false">Нет</option>
          </select>
        );
      }
      if (field.type === "reference" || field.type === "enum") {
        const extraOptions = Array.isArray(field.extraOptions) ? field.extraOptions : [];
        return (
          <select id={id} value={value} onChange={(event) => onChange(field.key, event.target.value)} disabled={disabled}>
            {field.optional ? <option value="">-</option> : null}
            {extraOptions.map((option) => (
              <option value={String(option.value)} key={String(option.value)}>
                {option.label}
              </option>
            ))}
            {options.map((option) => (
              <option value={String(option.value)} key={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        );
      }
      if (field.uploadScope) {
        return (
          <div className="field-inline">
            <input
              id={id}
              type="text"
              value={value}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder || ""}
              required={Boolean(field.required)}
              disabled={disabled}
            />
            <label className="btn secondary btn-sm" style={{ whiteSpace: "nowrap", opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? "none" : "auto" }}>
              Загрузить
              <input
                type="file"
                accept={field.accept || "*/*"}
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files && event.target.files[0];
                  if (file && onUploadField) onUploadField(field, file);
                  event.target.value = "";
                }}
                disabled={disabled}
              />
            </label>
          </div>
        );
      }
      return (
        <input
          id={id}
          type={field.type === "number" ? "number" : field.type === "password" ? "password" : "text"}
          step={field.type === "number" ? "any" : undefined}
          value={value}
          onChange={(event) => onChange(field.key, event.target.value)}
          placeholder={field.placeholder || ""}
          required={Boolean(field.required)}
          disabled={disabled}
        />
      );
    };

    return (
      <Overlay open={open} id="record-overlay" onClose={(event) => event.target.id === "record-overlay" && onClose()}>
        <div className="modal" style={{ width: "min(760px, 100%)" }} onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>{title}</h3>
              <p className="muted" style={{ marginTop: "0.35rem" }}>
                Создание и редактирование записи.
              </p>
            </div>
            <button className="close" type="button" onClick={onClose}>
              ×
            </button>
          </div>
          <form className="stack" onSubmit={onSubmit}>
            <div className="filters" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
              {visibleFields.map((field) => (
                <div className="field" key={field.key} style={field.fullRow ? { gridColumn: "1 / -1" } : undefined}>
                  <label htmlFor={"record-field-" + field.key}>{field.label}</label>
                  {renderField(field)}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button className="btn" type="submit">
                Сохранить
              </button>
              <button className="btn secondary" type="button" onClick={onClose}>
                Отмена
              </button>
            </div>
            <StatusLine status={status} />
          </form>
        </div>
      </Overlay>
    );
  }

  function GlobalTooltipLayer() {
    const [tooltip, setTooltip] = useState({ open: false, text: "", x: 0, y: 0, maxWidth: 320 });
    const activeRef = useRef(null);

    useEffect(() => {
      const getTarget = (node) => {
        if (!(node instanceof Element)) return null;
        const el = node.closest("[data-tooltip]");
        if (!el) return null;
        const text = String(el.getAttribute("data-tooltip") || "").trim();
        return text ? el : null;
      };

      const reposition = (el) => {
        if (!(el instanceof Element)) return;
        const text = String(el.getAttribute("data-tooltip") || "").trim();
        if (!text) return;
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth || 0;
        const maxWidth = Math.min(360, Math.max(140, vw - 24));
        const approxWidth = Math.min(maxWidth, Math.max(80, text.length * 7.1 + 22));
        const centerX = rect.left + rect.width / 2;
        const x = Math.max(12 + approxWidth / 2, Math.min(vw - 12 - approxWidth / 2, centerX));
        const y = Math.max(8, rect.top - 8);
        setTooltip({ open: true, text, x, y, maxWidth });
      };

      const open = (node) => {
        const target = getTarget(node);
        if (!target) return;
        activeRef.current = target;
        reposition(target);
      };

      const closeIfNeeded = (related) => {
        const current = activeRef.current;
        if (!current) return;
        if (related instanceof Element) {
          if (related === current || current.contains(related)) return;
          const nextTarget = getTarget(related);
          if (nextTarget === current) return;
        }
        activeRef.current = null;
        setTooltip((prev) => ({ ...prev, open: false }));
      };

      const onMouseOver = (event) => open(event.target);
      const onFocusIn = (event) => open(event.target);
      const onMouseOut = (event) => closeIfNeeded(event.relatedTarget);
      const onFocusOut = (event) => closeIfNeeded(event.relatedTarget);
      const onUpdatePosition = () => {
        if (activeRef.current) reposition(activeRef.current);
      };

      document.addEventListener("mouseover", onMouseOver, true);
      document.addEventListener("focusin", onFocusIn, true);
      document.addEventListener("mouseout", onMouseOut, true);
      document.addEventListener("focusout", onFocusOut, true);
      window.addEventListener("scroll", onUpdatePosition, true);
      window.addEventListener("resize", onUpdatePosition);

      return () => {
        document.removeEventListener("mouseover", onMouseOver, true);
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("mouseout", onMouseOut, true);
        document.removeEventListener("focusout", onFocusOut, true);
        window.removeEventListener("scroll", onUpdatePosition, true);
        window.removeEventListener("resize", onUpdatePosition);
      };
    }, []);

    return (
      <div
        className={"global-tooltip-layer" + (tooltip.open ? " open" : "")}
        style={{ left: tooltip.x + "px", top: tooltip.y + "px", maxWidth: tooltip.maxWidth + "px" }}
        role="tooltip"
        aria-hidden={tooltip.open ? "false" : "true"}
      >
        {tooltip.text}
      </div>
    );
  }

  function App() {
    const routeInfo = useMemo(() => resolveAdminRoute(window.location.search), []);
    const isRequestWorkspaceRoute = routeInfo.view === "request" && Boolean(routeInfo.requestId);
    const initialSection = isRequestWorkspaceRoute ? "requestWorkspace" : routeInfo.section || "dashboard";

    const [token, setToken] = useState("");
    const [role, setRole] = useState("");
    const [email, setEmail] = useState("");
    const [userId, setUserId] = useState("");
    const [activeSection, setActiveSection] = useState(initialSection);

    const [dashboardData, setDashboardData] = useState({
      scope: "",
      cards: [],
      byStatus: {},
      lawyerLoads: [],
      myUnreadByEvent: {},
      myUnreadTotal: 0,
      myUnreadNotificationsTotal: 0,
      unreadForClients: 0,
      unreadForLawyers: 0,
      serviceRequestUnreadTotal: 0,
      deadlineAlertTotal: 0,
      monthRevenue: 0,
      monthExpenses: 0,
    });

    const {
      tables,
      tablesRef,
      setTableState,
      resetTablesState,
      tableCatalog,
      setTableCatalog,
      referenceRowsMap,
      setReferenceRowsMap,
    } = useTablesState();

    const [dictionaries, setDictionaries] = useState({
      topics: [],
      statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name })),
      formFieldTypes: [...DEFAULT_FORM_FIELD_TYPES],
      formFieldKeys: [],
      users: [],
    });

    const [statusMap, setStatusMap] = useState({});
    const [smsProviderHealth, setSmsProviderHealth] = useState(null);
    const [totpStatus, setTotpStatus] = useState({
      mode: "password_totp_optional",
      enabled: false,
      required: false,
      has_backup_codes: false,
    });

    const [recordModal, setRecordModal] = useState({
      open: false,
      tableKey: null,
      mode: "create",
      rowId: null,
      form: {},
    });

    const [configActiveKey, setConfigActiveKey] = useState("");
    const [referencesExpanded, setReferencesExpanded] = useState(true);
    const [statusDesignerTopicCode, setStatusDesignerTopicCode] = useState("");

    const [metaEntity, setMetaEntity] = useState("quotes");
    const [metaJson, setMetaJson] = useState("");

    const [filterModal, setFilterModal] = useState({
      open: false,
      tableKey: null,
      field: "",
      op: "=",
      rawValue: "",
      editIndex: null,
    });
    const [reassignModal, setReassignModal] = useState({
      open: false,
      requestId: null,
      trackNumber: "",
      lawyerId: "",
    });

    const initialRouteHandledRef = useRef(false);
    const statusDesignerLoadedTopicRef = useRef("");

    const setStatus = useCallback((key, message, kind) => {
      setStatusMap((prev) => ({ ...prev, [key]: { message: message || "", kind: kind || "" } }));
    }, []);

    const getStatus = useCallback((key) => statusMap[key] || { message: "", kind: "" }, [statusMap]);

    const api = useAdminApi(token);

    const {
      requestModal,
      setRequestModal,
      resetRequestWorkspaceState,
      updateRequestModalMessageDraft,
      appendRequestModalFiles,
      removeRequestModalFile,
      clearRequestModalFiles,
      loadRequestModalData,
      refreshRequestModal,
      openRequestDetails,
      clearPendingStatusChangePreset,
      submitRequestStatusChange,
      submitRequestModalMessage,
      probeRequestLive,
      setRequestTyping,
      loadRequestDataTemplates,
      loadRequestDataBatch,
      loadRequestDataTemplateDetails,
      saveRequestDataTemplate,
      saveRequestDataBatch,
    } = useRequestWorkspace({
      api,
      setStatus,
      setActiveSection,
      token,
      users: dictionaries.users,
      buildUniversalQuery,
      resolveAdminObjectSrc,
    });

    const getStatusOptions = useCallback(() => {
      return (dictionaries.statuses || [])
        .filter((item) => item && item.code)
        .map((item) => ({ value: item.code, label: (item.name || statusLabel(item.code)) + " (" + item.code + ")" }));
    }, [dictionaries.statuses]);

    const getInvoiceStatusOptions = useCallback(() => {
      return Object.entries(INVOICE_STATUS_LABELS).map(([code, name]) => ({ value: code, label: name + " (" + code + ")" }));
    }, []);

    const getStatusKindOptions = useCallback(() => {
      return Object.entries(STATUS_KIND_LABELS).map(([code, name]) => ({ value: code, label: name + " (" + code + ")" }));
    }, []);

    const getTopicOptions = useCallback(() => {
      return (dictionaries.topics || [])
        .filter((item) => item && item.code)
        .map((item) => ({ value: item.code, label: (item.name || item.code) + " (" + item.code + ")" }));
    }, [dictionaries.topics]);

    const getLawyerOptions = useCallback(() => {
      return (dictionaries.users || [])
        .filter((item) => item && item.id && String(item.role || "").toUpperCase() === "LAWYER")
        .map((item) => ({
          value: item.id,
          label: (item.name || item.email || item.id) + (item.email ? " (" + item.email + ")" : ""),
        }));
    }, [dictionaries.users]);

    const getFormFieldTypeOptions = useCallback(() => {
      return (dictionaries.formFieldTypes || []).filter(Boolean).map((item) => ({ value: item, label: item }));
    }, [dictionaries.formFieldTypes]);

    const getRequestDataValueTypeOptions = useCallback(() => {
      return [
        { value: "string", label: "Строка (string)" },
        { value: "date", label: "Дата (date)" },
        { value: "number", label: "Число (number)" },
        { value: "file", label: "Файл (file)" },
        { value: "text", label: "Текст (text)" },
      ];
    }, []);

    const getFormFieldKeyOptions = useCallback(() => {
      return (dictionaries.formFieldKeys || [])
        .filter((item) => item && item.key)
        .map((item) => ({ value: item.key, label: (item.label || item.key) + " (" + item.key + ")" }));
    }, [dictionaries.formFieldKeys]);

    const getRoleOptions = useCallback(() => {
      return Object.entries(ROLE_LABELS).map(([code, label]) => ({ value: code, label: label + " (" + code + ")" }));
    }, []);

    const tableCatalogMap = useMemo(() => {
      const map = {};
      (tableCatalog || []).forEach((item) => {
        if (!item || !item.key) return;
        map[item.key] = item;
      });
      return map;
    }, [tableCatalog]);

    const getReferenceOptions = useCallback(
      (rawReference) => {
        const reference = normalizeReferenceMeta(rawReference);
        if (!reference) return [];
        const rows = referenceRowsMap[reference.table] || [];
        const map = new Map();
        rows.forEach((row) => {
          if (!row || typeof row !== "object") return;
          const rawValue = row[reference.value_field];
          if (rawValue == null || rawValue === "") return;
          const value = String(rawValue);
          const labelRaw = row[reference.label_field];
          const label = String(labelRaw == null || labelRaw === "" ? rawValue : labelRaw);
          if (!map.has(value)) map.set(value, label);
        });
        return Array.from(map.entries())
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => String(a.label).localeCompare(String(b.label), "ru"));
      },
      [referenceRowsMap]
    );

    const resolveReferenceLabel = useCallback(
      (rawReference, rawValue) => {
        if (rawValue == null || rawValue === "") return "-";
        const value = String(rawValue);
        const options = getReferenceOptions(rawReference);
        const found = options.find((item) => String(item.value) === value);
        return found ? found.label : value;
      },
      [getReferenceOptions]
    );

    const getStatusGroupOptions = useCallback(() => {
      return getReferenceOptions({ table: "status_groups", value_field: "id", label_field: "name" });
    }, [getReferenceOptions]);

    const getClientOptions = useCallback(() => {
      return getReferenceOptions({ table: "clients", value_field: "id", label_field: "full_name" });
    }, [getReferenceOptions]);

    const dictionaryTableItems = useMemo(() => {
      return (tableCatalog || [])
        .filter(
          (item) =>
            item &&
            item.section === "dictionary" &&
            Array.isArray(item.actions) &&
            item.actions.includes("query") &&
            !LEGACY_HIDDEN_DICTIONARY_TABLES.has(String(item.key || ""))
        )
        .sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), "ru"));
    }, [tableCatalog]);

    const resolveTableConfig = useCallback(
      (tableKey) => {
        if (TABLE_SERVER_CONFIG[tableKey]) return TABLE_SERVER_CONFIG[tableKey];
        const meta = tableCatalogMap[tableKey];
        if (!meta || !meta.table) return null;
        const tableName = String(meta.table || tableKey);
        return {
          table: tableName,
          endpoint: String(meta.query_endpoint || ("/api/admin/crud/" + tableName + "/query")),
          sort: Array.isArray(meta.default_sort) && meta.default_sort.length ? meta.default_sort : [{ field: "created_at", dir: "desc" }],
        };
      },
      [tableCatalogMap]
    );

    const resolveMutationConfig = useCallback(
      (tableKey) => {
        if (TABLE_MUTATION_CONFIG[tableKey]) return TABLE_MUTATION_CONFIG[tableKey];
        const meta = tableCatalogMap[tableKey];
        if (!meta || !meta.table) return null;
        const tableName = String(meta.table || tableKey);
        return {
          create: String(meta.create_endpoint || ("/api/admin/crud/" + tableName)),
          update: (id) => String(meta.update_endpoint_template || ("/api/admin/crud/" + tableName + "/{id}")).replace("{id}", String(id)),
          delete: (id) => String(meta.delete_endpoint_template || ("/api/admin/crud/" + tableName + "/{id}")).replace("{id}", String(id)),
        };
      },
      [tableCatalogMap]
    );

    const getFilterFields = useCallback(
      (tableKey) => {
        if (tableKey === "kanban") {
          return [
            { field: "assigned_lawyer_id", label: "Юрист", type: "reference", options: getLawyerOptions },
            { field: "client_name", label: "Клиент", type: "text" },
            { field: "status_code", label: "Статус", type: "reference", options: getStatusOptions },
            { field: "created_at", label: "Дата", type: "date" },
            { field: "topic_code", label: "Тема", type: "reference", options: getTopicOptions },
            { field: "overdue", label: "Просрочен", type: "boolean" },
          ];
        }
        if (tableKey === "requests") {
          return [
            { field: "track_number", label: "Номер заявки", type: "text" },
            { field: "client_name", label: "Клиент", type: "text" },
            { field: "client_phone", label: "Телефон", type: "text" },
            { field: "status_code", label: "Статус", type: "reference", options: getStatusOptions },
            { field: "topic_code", label: "Тема", type: "reference", options: getTopicOptions },
            { field: "important_date_at", label: "Важная дата", type: "date" },
            { field: "has_unread_updates", label: "Есть оповещения", type: "boolean" },
            { field: "deadline_alert", label: "Горящие дедлайны", type: "boolean" },
            { field: "client_has_unread_updates", label: "Непрочитано клиентом", type: "boolean" },
            { field: "lawyer_has_unread_updates", label: "Непрочитано юристом", type: "boolean" },
            { field: "invoice_amount", label: "Сумма счета", type: "number" },
            { field: "effective_rate", label: "Ставка", type: "number" },
            { field: "paid_at", label: "Оплачено", type: "date" },
            { field: "created_at", label: "Дата создания", type: "date" },
          ];
        }
        if (tableKey === "serviceRequests") {
          return [
            { field: "type", label: "Тип", type: "text" },
            { field: "status", label: "Статус", type: "text" },
            { field: "request_id", label: "ID заявки", type: "text" },
            { field: "client_id", label: "ID клиента", type: "text" },
            { field: "assigned_lawyer_id", label: "Назначенный юрист", type: "reference", options: getLawyerOptions },
            { field: "admin_unread", label: "Непрочитано администратором", type: "boolean" },
            { field: "lawyer_unread", label: "Непрочитано юристом", type: "boolean" },
            { field: "resolved_at", label: "Дата обработки", type: "date" },
            { field: "created_at", label: "Дата создания", type: "date" },
          ];
        }
        if (tableKey === "invoices") {
          return [
            { field: "invoice_number", label: "Номер счета", type: "text" },
            { field: "status", label: "Статус", type: "enum", options: getInvoiceStatusOptions },
            { field: "amount", label: "Сумма", type: "number" },
            { field: "currency", label: "Валюта", type: "text" },
            { field: "payer_display_name", label: "Плательщик", type: "text" },
            { field: "request_id", label: "ID заявки", type: "text" },
            { field: "issued_by_admin_user_id", label: "ID сотрудника", type: "text" },
            { field: "issued_at", label: "Дата формирования", type: "date" },
            { field: "paid_at", label: "Дата оплаты", type: "date" },
            { field: "created_at", label: "Дата создания", type: "date" },
          ];
        }
        if (tableKey === "quotes") {
          return [
            { field: "author", label: "Автор", type: "text" },
            { field: "text", label: "Текст", type: "text" },
            { field: "source", label: "Источник", type: "text" },
            { field: "is_active", label: "Активна", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
            { field: "created_at", label: "Дата создания", type: "date" },
          ];
        }
        if (tableKey === "topics") {
          return [
            { field: "code", label: "Код", type: "text" },
            { field: "name", label: "Название", type: "text" },
            { field: "enabled", label: "Активна", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
          ];
        }
        if (tableKey === "statuses") {
          return [
            { field: "code", label: "Код", type: "text" },
            { field: "name", label: "Название", type: "text" },
            { field: "status_group_id", label: "Группа", type: "reference", options: getStatusGroupOptions },
            { field: "kind", label: "Тип", type: "enum", options: getStatusKindOptions },
            { field: "enabled", label: "Активен", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
            { field: "is_terminal", label: "Терминальный", type: "boolean" },
          ];
        }
        if (tableKey === "formFields") {
          return [
            { field: "key", label: "Ключ", type: "text" },
            { field: "label", label: "Метка", type: "text" },
            { field: "type", label: "Тип", type: "enum", options: getFormFieldTypeOptions },
            { field: "required", label: "Обязательное", type: "boolean" },
            { field: "enabled", label: "Активно", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
          ];
        }
        if (tableKey === "topicRequiredFields") {
          return [
            { field: "topic_code", label: "Тема", type: "reference", options: getTopicOptions },
            { field: "field_key", label: "Поле формы", type: "reference", options: getFormFieldKeyOptions },
            { field: "required", label: "Обязательное", type: "boolean" },
            { field: "enabled", label: "Активно", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
          ];
        }
        if (tableKey === "topicDataTemplates") {
          return [
            { field: "topic_code", label: "Тема", type: "reference", options: getTopicOptions },
            { field: "key", label: "Ключ", type: "text" },
            { field: "label", label: "Метка", type: "text" },
            { field: "value_type", label: "Тип значения", type: "enum", options: getRequestDataValueTypeOptions },
            { field: "document_name", label: "Документ", type: "text" },
            { field: "required", label: "Обязательное", type: "boolean" },
            { field: "enabled", label: "Активно", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
            { field: "created_at", label: "Дата создания", type: "date" },
          ];
        }
        if (tableKey === "statusTransitions") {
          return [
            { field: "topic_code", label: "Тема", type: "reference", options: getTopicOptions },
            { field: "from_status", label: "Из статуса", type: "reference", options: getStatusOptions },
            { field: "to_status", label: "В статус", type: "reference", options: getStatusOptions },
            { field: "sla_hours", label: "SLA (часы)", type: "number" },
            { field: "enabled", label: "Активен", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
          ];
        }
        if (tableKey === "users") {
          return [
            { field: "name", label: "Имя", type: "text" },
            { field: "email", label: "Email", type: "text" },
            { field: "phone", label: "Телефон", type: "text" },
            { field: "role", label: "Роль", type: "enum", options: getRoleOptions },
            { field: "primary_topic_code", label: "Профиль (тема)", type: "reference", options: getTopicOptions },
            { field: "default_rate", label: "Ставка по умолчанию", type: "number" },
            { field: "salary_percent", label: "Процент зарплаты", type: "number" },
            { field: "is_active", label: "Активен", type: "boolean" },
            { field: "responsible", label: "Ответственный", type: "text" },
            { field: "created_at", label: "Дата создания", type: "date" },
          ];
        }
        if (tableKey === "userTopics") {
          return [
            { field: "admin_user_id", label: "Юрист", type: "reference", options: getLawyerOptions },
            { field: "topic_code", label: "Доп. тема", type: "reference", options: getTopicOptions },
            { field: "responsible", label: "Ответственный", type: "text" },
            { field: "created_at", label: "Дата создания", type: "date" },
          ];
        }
        const meta = tableCatalogMap[tableKey];
        if (!meta || !Array.isArray(meta.columns)) return [];
        return (meta.columns || [])
          .filter((column) => column && column.name && column.filterable !== false)
          .map((column) => {
            const name = String(column.name);
            const label = String(column.label || humanizeKey(name));
            if (name === "topic_code") return { field: name, label, type: "reference", options: getTopicOptions };
            if (name === "status_code" || name === "from_status" || name === "to_status") {
              return { field: name, label, type: "reference", options: getStatusOptions };
            }
            if (name === "field_key") return { field: name, label, type: "reference", options: getFormFieldKeyOptions };
            const reference = normalizeReferenceMeta(column.reference);
            if (reference) {
              return { field: name, label, type: "reference", options: () => getReferenceOptions(reference) };
            }
            return { field: name, label, type: metaKindToFilterType(column.kind) };
          });
      },
      [
        getReferenceOptions,
        tableCatalogMap,
        getFormFieldKeyOptions,
        getFormFieldTypeOptions,
        getInvoiceStatusOptions,
        getLawyerOptions,
        getRoleOptions,
        role,
        getStatusGroupOptions,
        getStatusKindOptions,
        getStatusOptions,
        getTopicOptions,
      ]
    );

    const getTableLabel = useCallback((tableKey) => {
      if (tableKey === "kanban") return "Канбан";
      if (tableKey === "requests") return "Заявки";
      if (tableKey === "serviceRequests") return "Запросы";
      if (tableKey === "invoices") return "Счета";
      if (tableKey === "quotes") return "Цитаты";
      if (tableKey === "topics") return "Темы";
      if (tableKey === "statuses") return "Статусы";
      if (tableKey === "statusGroups") return "Группы статусов";
      if (tableKey === "formFields") return "Поля формы";
      if (tableKey === "topicRequiredFields") return "Обязательные поля по темам";
      if (tableKey === "topicDataTemplates") return "Шаблоны дозапроса по темам";
      if (tableKey === "statusTransitions") return "Переходы статусов";
      if (tableKey === "users") return "Пользователи";
      if (tableKey === "userTopics") return "Дополнительные темы юристов";
      const meta = tableCatalogMap[tableKey];
      if (meta && meta.label) return String(meta.label);
      const raw = TABLE_UNALIASES[tableKey] || tableKey;
      return humanizeKey(raw);
    }, [tableCatalogMap]);

    const statusDesignerRows = useMemo(() => {
      const activeTopic = String(statusDesignerTopicCode || "").trim();
      const rows = tables.statusTransitions.rows || [];
      if (!activeTopic) return rows;
      return rows.filter((row) => String(row.topic_code || "") === activeTopic);
    }, [statusDesignerTopicCode, tables.statusTransitions.rows]);

    const statusDesignerCards = useMemo(() => {
      const rows = statusDesignerRows || [];
      if (!rows.length) return [];

      const orderMap = new Map();
      (tables.statuses.rows || []).forEach((row, index) => {
        const code = String(row?.code || "").trim();
        if (!code) return;
        const sortOrder = Number(row?.sort_order);
        orderMap.set(code, Number.isFinite(sortOrder) ? sortOrder : index);
      });

      const statusMetaMap = new Map();
      (dictionaries.statuses || []).forEach((row, index) => {
        const code = String(row?.code || "").trim();
        if (!code) return;
        statusMetaMap.set(code, {
          name: String(row?.name || code),
          isTerminal: false,
          order: orderMap.get(code) ?? index,
        });
      });
      (tables.statuses.rows || []).forEach((row, index) => {
        const code = String(row?.code || "").trim();
        if (!code) return;
        statusMetaMap.set(code, {
          name: String(row?.name || code),
          isTerminal: Boolean(row?.is_terminal),
          order: orderMap.get(code) ?? index,
        });
      });

      const codeSet = new Set();
      rows.forEach((row) => {
        const fromCode = String(row?.from_status || "").trim();
        const toCode = String(row?.to_status || "").trim();
        if (fromCode) codeSet.add(fromCode);
        if (toCode) codeSet.add(toCode);
      });

      const codes = Array.from(codeSet.values()).sort((a, b) => {
        const aOrder = statusMetaMap.get(a)?.order;
        const bOrder = statusMetaMap.get(b)?.order;
        if (aOrder != null && bOrder != null && aOrder !== bOrder) return aOrder - bOrder;
        if (aOrder != null && bOrder == null) return -1;
        if (aOrder == null && bOrder != null) return 1;
        return String(a).localeCompare(String(b), "ru");
      });

      return codes.map((code) => {
        const outgoing = rows
          .filter((row) => String(row?.from_status || "").trim() === code)
          .sort((a, b) => {
            const aOrder = Number(a?.sort_order || 0);
            const bOrder = Number(b?.sort_order || 0);
            if (aOrder !== bOrder) return aOrder - bOrder;
            return String(a?.to_status || "").localeCompare(String(b?.to_status || ""), "ru");
          });
        const meta = statusMetaMap.get(code) || { name: statusLabel(code), isTerminal: false };
        return {
          code,
          name: String(meta.name || statusLabel(code)),
          isTerminal: Boolean(meta.isTerminal),
          outgoing,
        };
      });
    }, [dictionaries.statuses, statusDesignerRows, tables.statuses.rows]);

    const getRecordFields = useCallback(
      (tableKey) => {
        if (tableKey === "requests") {
          const isNewClientMode = (form) => {
            const value = String(form?.client_id || "").trim();
            return !value || value === NEW_REQUEST_CLIENT_OPTION;
          };
          const fields = [
            { key: "track_number", label: "Номер заявки", type: "text", optional: true, placeholder: "Оставьте пустым для автогенерации" },
            ...(role !== "LAWYER"
              ? [
                  {
                    key: "client_id",
                    label: "Клиент",
                    type: "reference",
                    defaultValue: NEW_REQUEST_CLIENT_OPTION,
                    options: getClientOptions,
                    extraOptions: [{ value: NEW_REQUEST_CLIENT_OPTION, label: "Новый клиент" }],
                    fullRow: true,
                  },
                ]
              : []),
            {
              key: "client_name",
              label: role !== "LAWYER" ? "ФИО нового клиента" : "Клиент",
              type: "text",
              required: true,
              visibleWhen: role === "LAWYER" ? undefined : isNewClientMode,
            },
            {
              key: "client_phone",
              label: role !== "LAWYER" ? "Телефон нового клиента" : "Телефон",
              type: "text",
              required: true,
              visibleWhen: role === "LAWYER" ? undefined : isNewClientMode,
            },
            { key: "topic_code", label: "Тема", type: "reference", optional: true, options: getTopicOptions },
            { key: "status_code", label: "Статус", type: "reference", required: true, options: getStatusOptions },
            { key: "description", label: "Описание", type: "textarea", optional: true },
            { key: "request_cost", label: "Стоимость заявки", type: "number", optional: true },
          ];
          if (role !== "LAWYER") {
            fields.push({ key: "assigned_lawyer_id", label: "Назначенный юрист", type: "reference", optional: true, options: getLawyerOptions });
            fields.push({ key: "effective_rate", label: "Ставка (фикс.)", type: "number", optional: true });
          }
          return fields;
        }
        if (tableKey === "invoices") {
          return [
            { key: "request_track_number", label: "Номер заявки", type: "text", required: true, createOnly: true },
            { key: "invoice_number", label: "Номер счета", type: "text", optional: true, placeholder: "Оставьте пустым для автогенерации" },
            { key: "status", label: "Статус", type: "enum", required: true, options: getInvoiceStatusOptions, defaultValue: "WAITING_PAYMENT" },
            { key: "amount", label: "Сумма", type: "number", required: true },
            { key: "currency", label: "Валюта", type: "text", optional: true, defaultValue: "RUB" },
            { key: "payer_display_name", label: "Плательщик (ФИО / компания)", type: "text", required: true },
            { key: "payer_details", label: "Реквизиты (JSON, шифруется)", type: "json", optional: true, omitIfEmpty: true, placeholder: "{\"inn\":\"...\"}" },
          ];
        }
        if (tableKey === "quotes") {
          return [
            { key: "author", label: "Автор", type: "text", required: true },
            { key: "text", label: "Текст", type: "textarea", required: true },
            { key: "source", label: "Источник", type: "text", optional: true },
            { key: "is_active", label: "Активна", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
          ];
        }
        if (tableKey === "topics") {
          return [
            { key: "code", label: "Код", type: "text", required: true, autoCreate: true },
            { key: "name", label: "Название", type: "text", required: true },
            { key: "enabled", label: "Активна", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
          ];
        }
        if (tableKey === "statuses") {
          return [
            { key: "code", label: "Код", type: "text", required: true },
            { key: "name", label: "Название", type: "text", required: true },
            { key: "status_group_id", label: "Группа", type: "reference", optional: true, options: getStatusGroupOptions },
            { key: "kind", label: "Тип", type: "enum", required: true, options: getStatusKindOptions, defaultValue: "DEFAULT" },
            { key: "invoice_template", label: "Шаблон счета", type: "textarea", optional: true, placeholder: "Доступные поля: {track_number}, {client_name}, {topic_code}, {amount}" },
            { key: "enabled", label: "Активен", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
            { key: "is_terminal", label: "Терминальный", type: "boolean", defaultValue: "false" },
          ];
        }
        if (tableKey === "formFields") {
          return [
            { key: "key", label: "Ключ", type: "text", required: true },
            { key: "label", label: "Метка", type: "text", required: true },
            { key: "type", label: "Тип", type: "enum", required: true, options: getFormFieldTypeOptions },
            { key: "required", label: "Обязательное", type: "boolean", defaultValue: "false" },
            { key: "enabled", label: "Активно", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
            { key: "options", label: "Опции (JSON)", type: "json", optional: true },
          ];
        }
        if (tableKey === "topicRequiredFields") {
          return [
            { key: "topic_code", label: "Тема", type: "reference", required: true, options: getTopicOptions },
            { key: "field_key", label: "Поле формы", type: "reference", required: true, options: getFormFieldKeyOptions },
            { key: "required", label: "Обязательное", type: "boolean", defaultValue: "true" },
            { key: "enabled", label: "Активно", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
          ];
        }
        if (tableKey === "topicDataTemplates") {
          return [
            { key: "topic_code", label: "Тема", type: "reference", required: true, options: getTopicOptions },
            { key: "key", label: "Ключ", type: "text", required: true },
            { key: "label", label: "Метка", type: "text", required: true },
            { key: "value_type", label: "Тип значения", type: "enum", required: true, options: getRequestDataValueTypeOptions, defaultValue: "string" },
            { key: "document_name", label: "Документ", type: "text", optional: true, placeholder: "Например: Договор / Паспорт" },
            { key: "description", label: "Описание", type: "textarea", optional: true },
            { key: "required", label: "Обязательное", type: "boolean", defaultValue: "true" },
            { key: "enabled", label: "Активно", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
          ];
        }
        if (tableKey === "statusTransitions") {
          return [
            { key: "topic_code", label: "Тема", type: "reference", required: true, options: getTopicOptions },
            { key: "from_status", label: "Из статуса", type: "reference", required: true, options: getStatusOptions },
            { key: "to_status", label: "В статус", type: "reference", required: true, options: getStatusOptions },
            { key: "sla_hours", label: "SLA (часы)", type: "number", optional: true },
            {
              key: "required_data_keys",
              label: "Обязательные ключи данных (JSON-массив)",
              type: "json",
              optional: true,
              defaultValue: "[]",
              placeholder: "[\"passport_scan\", \"client_address\"]",
            },
            {
              key: "required_mime_types",
              label: "Обязательные MIME-типы файлов (JSON-массив)",
              type: "json",
              optional: true,
              defaultValue: "[]",
              placeholder: "[\"application/pdf\", \"image/*\"]",
            },
            { key: "enabled", label: "Активен", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
          ];
        }
        if (tableKey === "users") {
          return [
            { key: "name", label: "Имя", type: "text", required: true },
            { key: "email", label: "Email", type: "text", required: true },
            { key: "phone", label: "Телефон", type: "text", optional: true, placeholder: "+7..." },
            { key: "role", label: "Роль", type: "enum", required: true, options: getRoleOptions, defaultValue: "LAWYER" },
            {
              key: "avatar_url",
              label: "URL аватара",
              type: "text",
              optional: true,
              placeholder: "https://... или s3://...",
              uploadScope: "USER_AVATAR",
              accept: "image/*",
            },
            { key: "primary_topic_code", label: "Профиль (тема)", type: "reference", optional: true, options: getTopicOptions },
            { key: "default_rate", label: "Ставка по умолчанию", type: "number", optional: true },
            { key: "salary_percent", label: "Процент зарплаты", type: "number", optional: true },
            { key: "is_active", label: "Активен", type: "boolean", defaultValue: "true" },
            { key: "password", label: "Пароль", type: "password", requiredOnCreate: true, optional: true, omitIfEmpty: true, placeholder: "Введите пароль" },
          ];
        }
        if (tableKey === "userTopics") {
          return [
            { key: "admin_user_id", label: "Юрист", type: "reference", required: true, options: getLawyerOptions },
            { key: "topic_code", label: "Дополнительная тема", type: "reference", required: true, options: getTopicOptions },
          ];
        }
        const meta = tableCatalogMap[tableKey];
        if (!meta || !Array.isArray(meta.columns)) return [];
        return (meta.columns || [])
          .filter((column) => column && column.name && column.editable)
          .map((column) => {
            const key = String(column.name || "");
            const requiredOnCreate = Boolean(column.required_on_create);
            const reference = normalizeReferenceMeta(column.reference);
            return {
              key,
              label: String(column.label || humanizeKey(key)),
              type: reference ? "reference" : metaKindToRecordType(column.kind),
              options: reference ? () => getReferenceOptions(reference) : undefined,
              requiredOnCreate,
              optional: !requiredOnCreate,
            };
          });
      },
      [
        getReferenceOptions,
        tableCatalogMap,
        getFormFieldKeyOptions,
        getFormFieldTypeOptions,
        getInvoiceStatusOptions,
        getClientOptions,
        getLawyerOptions,
        getRoleOptions,
        getStatusGroupOptions,
        getStatusKindOptions,
        getStatusOptions,
        getTopicOptions,
      ]
    );

    const getFieldDef = useCallback(
      (tableKey, fieldName) => {
        return getFilterFields(tableKey).find((field) => field.field === fieldName) || null;
      },
      [getFilterFields]
    );

    const getFieldOptions = useCallback((fieldDef) => {
      if (!fieldDef) return [];
      if (typeof fieldDef.options === "function") return fieldDef.options() || [];
      return [];
    }, []);

    const getFilterValuePreview = useCallback(
      (tableKey, clause) => {
        const fieldDef = getFieldDef(tableKey, clause.field);
        if (!fieldDef) return String(clause.value ?? "");
        if (fieldDef.type === "boolean") return boolFilterLabel(Boolean(clause.value));
        if (fieldDef.type === "reference" || fieldDef.type === "enum") {
          const options = getFieldOptions(fieldDef);
          const found = options.find((option) => String(option.value) === String(clause.value));
          return found ? found.label : String(clause.value ?? "");
        }
        return String(clause.value ?? "");
      },
      [getFieldDef, getFieldOptions]
    );

    const {
      kanbanData,
      kanbanLoading,
      kanbanSortModal,
      kanbanSortApplied,
      loadKanban,
      openKanbanSortModal,
      closeKanbanSortModal,
      updateKanbanSortMode,
      submitKanbanSortModal,
      resetKanbanState,
    } = useKanban({
      api,
      setStatus,
      setTableState,
      tablesRef,
    });

    const { loadTable, loadPrevPage, loadNextPage, loadAllRows, toggleTableSort } = useTableActions({
      api,
      setStatus,
      resolveTableConfig,
      tablesRef,
      setTableState,
      setDictionaries,
      buildUniversalQuery,
    });

    const { loadAvailableTables, loadReferenceRows } = useAdminCatalogLoaders({
      api,
      setStatus,
      setTableState,
      setReferenceRowsMap,
      buildUniversalQuery,
    });

    const loadCurrentConfigTable = useCallback(
      async (resetOffset, tokenOverride, keyOverride) => {
        const currentKey = keyOverride || configActiveKey;
        if (!currentKey) {
          return false;
        }
        return loadTable(currentKey, { resetOffset: Boolean(resetOffset) }, tokenOverride);
      },
      [configActiveKey, loadTable]
    );

    const loadStatusDesignerTopic = useCallback(
      async (topicCode) => {
        const code = String(topicCode || "").trim();
        setStatusDesignerTopicCode(code);
        statusDesignerLoadedTopicRef.current = code;
        if (!code) {
          await loadTable("statusTransitions", { resetOffset: true, filtersOverride: [] });
          return;
        }
        await loadTable("statusTransitions", {
          resetOffset: true,
          filtersOverride: [{ field: "topic_code", op: "=", value: code }],
        });
      },
      [loadTable]
    );

    useEffect(() => {
      if (configActiveKey !== "statusTransitions") {
        statusDesignerLoadedTopicRef.current = "";
        return;
      }
      const topics = dictionaries.topics || [];
      if (!topics.length) {
        setStatusDesignerTopicCode("");
        return;
      }
      const hasSelected = topics.some((item) => String(item?.code || "") === String(statusDesignerTopicCode || ""));
      const nextTopic = String(hasSelected ? statusDesignerTopicCode : topics[0]?.code || "").trim();
      if (!nextTopic) return;
      if (nextTopic !== statusDesignerTopicCode) {
        setStatusDesignerTopicCode(nextTopic);
        return;
      }
      if (statusDesignerLoadedTopicRef.current === nextTopic) return;
      statusDesignerLoadedTopicRef.current = nextTopic;
      loadTable("statusTransitions", {
        resetOffset: true,
        filtersOverride: [{ field: "topic_code", op: "=", value: nextTopic }],
      });
    }, [configActiveKey, dictionaries.topics, loadTable, statusDesignerTopicCode]);

    const loadDashboard = useCallback(
      async (tokenOverride) => {
        setStatus("dashboard", "Загрузка...", "");
        try {
          const data = await api("/api/admin/metrics/overview", {}, tokenOverride);
          const scope = String(data.scope || role || "");
          const cards =
            scope === "LAWYER"
              ? [
                  { label: "Мои заявки", value: data.assigned_total ?? 0 },
                  { label: "Мои активные", value: data.active_assigned_total ?? 0 },
                  { label: "Неназначенные", value: data.unassigned_total ?? 0 },
                  { label: "Мои непрочитанные", value: data.my_unread_notifications_total ?? data.my_unread_updates ?? 0 },
                  { label: "Просрочено SLA", value: data.sla_overdue ?? 0 },
                ]
              : [
                  { label: "Новые", value: data.new ?? 0 },
                  { label: "Назначенные", value: data.assigned_total ?? 0 },
                  { label: "Неназначенные", value: data.unassigned_total ?? 0 },
                  { label: "Просрочено SLA", value: data.sla_overdue ?? 0 },
                  { label: "Мои непрочитанные", value: data.my_unread_notifications_total ?? data.my_unread_updates ?? 0 },
                  { label: "Выручка (мес.)", value: Number(data.month_revenue ?? 0).toFixed(2) },
                  { label: "Расходы (мес.)", value: Number(data.month_expenses ?? 0).toFixed(2) },
                  { label: "Непрочитано юристами", value: data.unread_for_lawyers ?? 0 },
                  { label: "Непрочитано клиентами", value: data.unread_for_clients ?? 0 },
                ];
          const localized = {};
          Object.entries(data.by_status || {}).forEach(([code, count]) => {
            localized[statusLabel(code)] = count;
          });
          setDashboardData({
            scope,
            cards,
            byStatus: localized,
            lawyerLoads: data.lawyer_loads || [],
            myUnreadByEvent: data.my_unread_by_event || {},
            myUnreadTotal: Number(data.my_unread_updates || 0),
            myUnreadNotificationsTotal: Number(data.my_unread_notifications_total || data.my_unread_updates || 0),
            unreadForClients: Number(data.unread_for_clients_notifications_total || data.unread_for_clients || 0),
            unreadForLawyers: Number(data.unread_for_lawyers_notifications_total || data.unread_for_lawyers || 0),
            serviceRequestUnreadTotal: Number(data.service_request_unread_total || 0),
            deadlineAlertTotal: Number(data.deadline_alert_total || 0),
            monthRevenue: Number(data.month_revenue || 0),
            monthExpenses: Number(data.month_expenses || 0),
          });
          setStatus("dashboard", "Данные обновлены", "ok");
        } catch (error) {
          setStatus("dashboard", "Ошибка: " + error.message, "error");
        }
      },
      [api, role, setStatus]
    );

    const loadMeta = useCallback(
      async (tokenOverride) => {
        const entity = (metaEntity || "quotes").trim() || "quotes";
        setStatus("meta", "Загрузка...", "");
        try {
          const data = await api("/api/admin/meta/" + encodeURIComponent(entity), {}, tokenOverride);
          setMetaJson(JSON.stringify(localizeMeta(data), null, 2));
          setStatus("meta", "Метаданные получены", "ok");
        } catch (error) {
          setStatus("meta", "Ошибка: " + error.message, "error");
        }
      },
      [api, metaEntity, setStatus]
    );

    const loadSmsProviderHealth = useCallback(
      async (tokenOverride, options) => {
        const opts = options || {};
        const silent = Boolean(opts.silent);
        const currentRole = String(role || "").toUpperCase();
        const authToken = tokenOverride !== undefined ? tokenOverride : token;
        if (!authToken || currentRole !== "ADMIN") {
          setSmsProviderHealth(null);
          return null;
        }
        if (!silent) setStatus("smsProviderHealth", "Обновляем баланс SMS Aero...", "");
        try {
          const payload = await api("/api/admin/system/sms-provider-health", {}, tokenOverride);
          const enriched = { ...(payload || {}), loaded_at: new Date().toISOString() };
          setSmsProviderHealth(enriched);
          if (!silent) setStatus("smsProviderHealth", "Баланс SMS Aero обновлен", "ok");
          return enriched;
        } catch (error) {
          const fallback = {
            provider: "smsaero",
            status: "error",
            mode: "real",
            can_send: false,
            balance_available: false,
            balance_amount: null,
            balance_currency: "RUB",
            issues: [error.message],
            loaded_at: new Date().toISOString(),
          };
          setSmsProviderHealth(fallback);
          if (!silent) setStatus("smsProviderHealth", "Ошибка: " + error.message, "error");
          return null;
        }
      },
      [api, role, setStatus, token]
    );

    const refreshSection = useCallback(
      async (section, tokenOverride) => {
        if (!(tokenOverride !== undefined ? tokenOverride : token)) return;
        if (section === "dashboard") return loadDashboard(tokenOverride);
        if (section === "kanban") return loadKanban(tokenOverride);
        if (section === "requests") return loadTable("requests", {}, tokenOverride);
        if (section === "serviceRequests") return loadTable("serviceRequests", {}, tokenOverride);
        if (section === "invoices") return loadTable("invoices", {}, tokenOverride);
        if (section === "quotes" && canAccessSection(role, "quotes")) return loadTable("quotes", {}, tokenOverride);
        if (section === "config" && canAccessSection(role, "config")) return loadCurrentConfigTable(false, tokenOverride);
        if (section === "availableTables" && canAccessSection(role, "availableTables")) return loadAvailableTables(tokenOverride);
        if (section === "meta") return loadMeta(tokenOverride);
      },
      [loadAvailableTables, loadCurrentConfigTable, loadDashboard, loadKanban, loadMeta, loadTable, role, token]
    );

    const bootstrapReferenceData = useCallback(
      async (tokenOverride, roleOverride) => {
        setDictionaries((prev) => ({
          ...prev,
          statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name })),
        }));

        if (roleOverride !== "ADMIN") return;

        try {
          const body = buildUniversalQuery([], [{ field: "sort_order", dir: "asc" }], 500, 0);
          const usersBody = buildUniversalQuery([], [{ field: "created_at", dir: "desc" }], 500, 0);
          const [catalogData, topicsData, statusesData, fieldsData, usersData] = await Promise.all([
            api("/api/admin/crud/meta/tables", {}, tokenOverride),
            api("/api/admin/crud/topics/query", { method: "POST", body }, tokenOverride),
            api("/api/admin/crud/statuses/query", { method: "POST", body }, tokenOverride),
            api("/api/admin/crud/form_fields/query", { method: "POST", body }, tokenOverride),
            api("/api/admin/crud/admin_users/query", { method: "POST", body: usersBody }, tokenOverride),
          ]);
          const catalogRows = (catalogData.tables || [])
            .filter((row) => row && row.table)
            .map((row) => {
              const tableName = String(row.table || "");
              const key = TABLE_KEY_ALIASES[tableName] || String(row.key || tableName);
              return { ...row, key, table: tableName };
            });
          setTableCatalog(catalogRows);
          await loadReferenceRows(catalogRows, tokenOverride);

          const statusesMap = new Map(Object.entries(STATUS_LABELS).map(([code, name]) => [code, { code, name }]));
          (statusesData.rows || []).forEach((row) => {
            if (!row.code) return;
            statusesMap.set(row.code, { code: row.code, name: row.name || statusLabel(row.code) });
          });

          const typeSet = new Set(DEFAULT_FORM_FIELD_TYPES);
          (fieldsData.rows || []).forEach((row) => {
            if (row?.type) typeSet.add(row.type);
          });
          const fieldKeys = (fieldsData.rows || [])
            .filter((row) => row && row.key)
            .map((row) => ({ key: row.key, label: row.label || row.key }))
            .sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), "ru"));

          setDictionaries((prev) => ({
            ...prev,
            topics: sortByName((topicsData.rows || []).map((row) => ({ code: row.code, name: row.name || row.code }))),
            statuses: sortByName(Array.from(statusesMap.values())),
            formFieldTypes: Array.from(typeSet.values()).sort((a, b) => String(a).localeCompare(String(b), "ru")),
            formFieldKeys: fieldKeys,
            users: (usersData.rows || []).map((row) => ({
              id: row.id,
              name: row.name || "",
              email: row.email || "",
              phone: row.phone || "",
              role: row.role || "",
              is_active: Boolean(row.is_active),
            })),
          }));
        } catch (_) {
          // Keep defaults when dictionary endpoints are unavailable.
        }
      },
      [api, loadReferenceRows]
    );

    const updateAvailableTableState = useCallback(
      async (tableName, isActive) => {
        const name = String(tableName || "").trim();
        if (!name) return;
        try {
          setStatus("availableTables", "Сохранение...", "");
          await api("/api/admin/crud/meta/available-tables/" + encodeURIComponent(name), {
            method: "PATCH",
            body: { is_active: Boolean(isActive) },
          });
          await Promise.all([loadAvailableTables(), bootstrapReferenceData(token, role)]);
          setStatus("availableTables", "Сохранено", "ok");
        } catch (error) {
          setStatus("availableTables", "Ошибка: " + error.message, "error");
        }
      },
      [api, bootstrapReferenceData, loadAvailableTables, role, setStatus, token]
    );

    const openCreateRecordModal = useCallback(
      (tableKey) => {
        const fields = getRecordFields(tableKey);
        const initial = {};
        fields.forEach((field) => {
          if (field.defaultValue !== undefined) initial[field.key] = String(field.defaultValue);
          else if (field.type === "boolean") initial[field.key] = "false";
          else if (field.type === "json") initial[field.key] = field.optional ? "" : "{}";
          else if ((field.type === "reference" || field.type === "enum") && !field.optional) {
            const options = typeof field.options === "function" ? field.options() : [];
            initial[field.key] = options.length ? String(options[0].value) : "";
          }
          else initial[field.key] = "";
        });
        if (tableKey === "requests" && !initial.status_code) initial.status_code = "NEW";
        setRecordModal({ open: true, tableKey, mode: "create", rowId: null, form: initial });
        setStatus("recordForm", "", "");
      },
      [getRecordFields, setStatus]
    );

    const openCreateStatusTransitionForTopic = useCallback(() => {
      const topicCode = String(statusDesignerTopicCode || "").trim();
      if (!topicCode) {
        setStatus("statusTransitions", "Сначала выберите тему для конструктора", "error");
        return;
      }
      setRecordModal({
        open: true,
        tableKey: "statusTransitions",
        mode: "create",
        rowId: null,
        form: {
          topic_code: topicCode,
          from_status: "",
          to_status: "",
          sla_hours: "",
          required_data_keys: "[]",
          required_mime_types: "[]",
          enabled: "true",
          sort_order: String(Math.max(1, (statusDesignerRows || []).length + 1)),
        },
      });
      setStatus("recordForm", "", "");
    }, [setStatus, statusDesignerRows, statusDesignerTopicCode]);

    const openEditRecordModal = useCallback(
      (tableKey, row) => {
        const fields = getRecordFields(tableKey);
        const nextForm = {};
        fields.forEach((field) => {
          const value = row[field.key];
          if (field.type === "boolean") nextForm[field.key] = value ? "true" : "false";
          else if (field.type === "json") nextForm[field.key] = value == null ? "" : JSON.stringify(value, null, 2);
          else nextForm[field.key] = value == null ? "" : String(value);
        });
        if (tableKey === "requests" && role !== "LAWYER" && !String(nextForm.client_id || "").trim()) {
          nextForm.client_id = NEW_REQUEST_CLIENT_OPTION;
        }
        setRecordModal({ open: true, tableKey, mode: "edit", rowId: row.id, form: nextForm });
        setStatus("recordForm", "", "");
      },
      [getRecordFields, setStatus]
    );

    const closeRecordModal = useCallback(() => {
      setRecordModal({ open: false, tableKey: null, mode: "create", rowId: null, form: {} });
      setStatus("recordForm", "", "");
    }, [setStatus]);

    const updateRecordField = useCallback(
      (field, value) => {
        setRecordModal((prev) => {
          const nextForm = { ...(prev.form || {}), [field]: value };
          if (prev.tableKey === "requests") {
            if (field === "client_id") {
              const selectedId = String(value || "").trim();
              if (!selectedId || selectedId === NEW_REQUEST_CLIENT_OPTION) {
                nextForm.client_id = NEW_REQUEST_CLIENT_OPTION;
                nextForm.client_name = "";
                nextForm.client_phone = "";
              } else if (selectedId) {
                const rows = Array.isArray(referenceRowsMap.clients) ? referenceRowsMap.clients : [];
                const found = rows.find((row) => String(row?.id || "") === selectedId);
                if (found) {
                  nextForm.client_name = String(found.full_name || nextForm.client_name || "");
                  nextForm.client_phone = String(found.phone || nextForm.client_phone || "");
                }
              }
            }
            if (
              (field === "client_name" || field === "client_phone") &&
              String(nextForm.client_id || "").trim() &&
              String(nextForm.client_id || "").trim() !== NEW_REQUEST_CLIENT_OPTION
            ) {
              const selectedId = String(nextForm.client_id || "").trim();
              const rows = Array.isArray(referenceRowsMap.clients) ? referenceRowsMap.clients : [];
              const found = rows.find((row) => String(row?.id || "") === selectedId);
              if (found) {
                const selectedName = String(found.full_name || "");
                const selectedPhone = String(found.phone || "");
                const currentName = String(field === "client_name" ? value : nextForm.client_name || "");
                const currentPhone = String(field === "client_phone" ? value : nextForm.client_phone || "");
                if (currentName !== selectedName || currentPhone !== selectedPhone) {
                  nextForm.client_id = "";
                }
              }
            }
          }
          return { ...prev, form: nextForm };
        });
      },
      [referenceRowsMap.clients]
    );

    const uploadRecordFieldFile = useCallback(
      async (field, file) => {
        if (!recordModal.tableKey || !field || !file) return;
        if (field.uploadScope !== "USER_AVATAR") return;
        if (recordModal.tableKey !== "users") return;
        if (recordModal.mode !== "edit" || !recordModal.rowId) {
          setStatus("recordForm", "Сначала сохраните пользователя, затем загрузите аватар", "error");
          return;
        }
        try {
          setStatus("recordForm", "Загрузка файла...", "");
          const mimeType = String(file.type || "application/octet-stream");
          const initPayload = {
            file_name: file.name,
            mime_type: mimeType,
            size_bytes: file.size,
            scope: "USER_AVATAR",
            user_id: recordModal.rowId,
          };
          const init = await api("/api/admin/uploads/init", { method: "POST", body: initPayload });
          const putResp = await fetch(init.presigned_url, {
            method: "PUT",
            headers: { "Content-Type": mimeType },
            body: file,
          });
          if (!putResp.ok) {
            throw new Error("Не удалось загрузить файл в хранилище");
          }
          const done = await api("/api/admin/uploads/complete", {
            method: "POST",
            body: {
              key: init.key,
              file_name: file.name,
              mime_type: mimeType,
              size_bytes: file.size,
              scope: "USER_AVATAR",
              user_id: recordModal.rowId,
            },
          });
          updateRecordField("avatar_url", String(done.avatar_url || ""));
          setStatus("recordForm", "Аватар загружен", "ok");
        } catch (error) {
          setStatus("recordForm", "Ошибка загрузки: " + error.message, "error");
        }
      },
      [api, recordModal, setStatus, updateRecordField]
    );

    const buildRecordPayload = useCallback(
      (tableKey, form, mode) => {
        const fields = getRecordFields(tableKey);
        const payload = {};
        const isLawyerRequestEdit = tableKey === "requests" && role === "LAWYER";
        const lawyerRequestRestricted = new Set(["assigned_lawyer_id", "effective_rate", "invoice_amount", "paid_at", "paid_by_admin_id"]);
        fields.forEach((field) => {
          if (isLawyerRequestEdit && lawyerRequestRestricted.has(field.key)) return;
          const raw = form[field.key];
          if (field.type === "boolean") {
            payload[field.key] = raw === "true";
            return;
          }
          if (field.type === "number") {
            if (raw === "" || raw == null) {
              if (!field.optional) payload[field.key] = 0;
              return;
            }
            const number = Number(raw);
            if (Number.isNaN(number)) throw new Error("Некорректное число в поле \"" + field.label + "\"");
            payload[field.key] = number;
            return;
          }
          if (field.type === "json") {
            const text = String(raw || "").trim();
            if (!text) {
              if (field.omitIfEmpty) return;
              if (field.optional) payload[field.key] = null;
              else payload[field.key] = {};
              return;
            }
            try {
              payload[field.key] = JSON.parse(text);
            } catch (_) {
              throw new Error("Поле \"" + field.label + "\" должно быть валидным JSON");
            }
            return;
          }

          const value = String(raw || "").trim();
          if (tableKey === "requests" && field.key === "client_id" && value === NEW_REQUEST_CLIENT_OPTION) {
            payload[field.key] = null;
            return;
          }
          if (!value) {
            if (mode === "create" && field.autoCreate) return;
            if (mode === "create" && field.requiredOnCreate) throw new Error("Заполните поле \"" + field.label + "\"");
            if (field.required) throw new Error("Заполните поле \"" + field.label + "\"");
            if (field.omitIfEmpty) return;
            if (tableKey === "requests" && field.key === "track_number") return;
            if (field.optional) payload[field.key] = null;
            return;
          }
          payload[field.key] = value;
        });

        if (tableKey === "requests" && mode === "create" && !payload.extra_fields) payload.extra_fields = {};
        if (tableKey === "invoices" && mode === "edit") delete payload.request_track_number;
        return payload;
      },
      [getRecordFields, role]
    );

    const submitRecordModal = useCallback(
      async (event) => {
        event.preventDefault();
        const tableKey = recordModal.tableKey;
        if (!tableKey) return;
        const endpoints = resolveMutationConfig(tableKey);
        if (!endpoints) return;
        try {
          setStatus("recordForm", "Сохранение...", "");
          const payload = buildRecordPayload(tableKey, recordModal.form || {}, recordModal.mode);
          if (recordModal.mode === "edit" && recordModal.rowId) {
            await api(endpoints.update(recordModal.rowId), { method: "PATCH", body: payload });
          } else {
            await api(endpoints.create, { method: "POST", body: payload });
          }
          setStatus("recordForm", "Сохранено", "ok");
          await loadTable(tableKey, { resetOffset: true });
          await loadReferenceRows(tableCatalog, undefined);
          setTimeout(() => closeRecordModal(), 250);
        } catch (error) {
          setStatus("recordForm", "Ошибка: " + error.message, "error");
        }
      },
      [api, buildRecordPayload, closeRecordModal, loadReferenceRows, loadTable, recordModal, resolveMutationConfig, setStatus, tableCatalog]
    );

    const deleteRecord = useCallback(
      async (tableKey, id) => {
        const endpoints = resolveMutationConfig(tableKey);
        if (!endpoints) return;
        if (!confirm("Удалить запись?")) return;
        try {
          await api(endpoints.delete(id), { method: "DELETE" });
          setStatus(tableKey, "Запись удалена", "ok");
          await loadTable(tableKey, { resetOffset: true });
          await loadReferenceRows(tableCatalog, undefined);
        } catch (error) {
          setStatus(tableKey, "Ошибка удаления: " + error.message, "error");
        }
      },
      [api, loadReferenceRows, loadTable, resolveMutationConfig, setStatus, tableCatalog]
    );

    const claimRequest = useCallback(
      async (requestId) => {
        if (!requestId) return;
        try {
          setStatus("requests", "Назначение заявки...", "");
          setStatus("kanban", "Назначение заявки...", "");
          await api("/api/admin/requests/" + requestId + "/claim", { method: "POST" });
          setStatus("requests", "Заявка взята в работу", "ok");
          setStatus("kanban", "Заявка взята в работу", "ok");
          await Promise.all([loadTable("requests", { resetOffset: true }), loadKanban()]);
        } catch (error) {
          setStatus("requests", "Ошибка назначения: " + error.message, "error");
          setStatus("kanban", "Ошибка назначения: " + error.message, "error");
        }
      },
      [api, loadKanban, loadTable, setStatus]
    );

    const openInvoiceRequest = useCallback(
      (row, event) => {
        if (!row || !row.request_id) return;
        openRequestDetails(row.request_id, event);
      },
      [openRequestDetails]
    );

    const moveRequestFromKanban = useCallback(
      async (row, targetGroup, explicitStatus) => {
        const requestId = String(row?.id || "").trim();
        if (!requestId) return;
        const currentGroup = String(row?.status_group || fallbackStatusGroup(row?.status_code));
        const groupKey = String(targetGroup || "").trim();
        const targetStatusFromSelect = String(explicitStatus || "").trim();
        const assignedLawyerId = String(row?.assigned_lawyer_id || "").trim();

        if (role === "LAWYER" && !assignedLawyerId) {
          setStatus("kanban", "Сначала возьмите заявку в работу", "error");
          return;
        }
        if (
          role === "LAWYER" &&
          assignedLawyerId &&
          String(assignedLawyerId) !== String(userId || "")
        ) {
          setStatus("kanban", "Юрист может менять статус только своих заявок", "error");
          return;
        }

        let targetStatus = targetStatusFromSelect;
        const transitions = Array.isArray(row?.available_transitions) ? row.available_transitions : [];
        if (!targetStatus) {
          if (!groupKey || groupKey === currentGroup) return;
          const candidates = transitions.filter((item) => String(item?.target_group || "") === groupKey);
          if (!candidates.length) {
            setStatus("kanban", "Для этой карточки нет перехода в выбранную колонку", "error");
            return;
          }
          if (candidates.length > 1) {
            await openRequestDetails(requestId, undefined, {
              statusChangePreset: {
                source: "kanban",
                targetGroup: groupKey,
                suggestedStatuses: candidates.map((item) => String(item?.to_status || "")).filter(Boolean),
              },
            });
            setStatus("kanban", "Откройте модальное окно смены статуса и выберите конкретный статус", "ok");
            return;
          }
          targetStatus = String(candidates[0]?.to_status || "").trim();
        }
        if (!targetStatus || targetStatus === String(row?.status_code || "")) return;

        try {
          setStatus("kanban", "Переводим заявку...", "");
          await submitRequestStatusChange({ requestId, statusCode: targetStatus });
          setStatus("kanban", "Статус заявки обновлен", "ok");
          await Promise.all([loadKanban(), loadTable("requests", { resetOffset: true })]);
        } catch (error) {
          setStatus("kanban", "Ошибка перехода: " + error.message, "error");
        }
      },
      [loadKanban, loadTable, openRequestDetails, role, setStatus, submitRequestStatusChange, userId]
    );

    const downloadInvoicePdf = useCallback(
      async (row) => {
        if (!row || !row.id || !token) return;
        try {
          setStatus("invoices", "Формируем PDF...", "");
          const response = await fetch("/api/admin/invoices/" + row.id + "/pdf", {
            headers: { Authorization: "Bearer " + token },
          });
          if (!response.ok) {
            const text = await response.text();
            let payload = {};
            try {
              payload = text ? JSON.parse(text) : {};
            } catch (_) {
              payload = { raw: text };
            }
            const message = payload.detail || payload.error || payload.raw || ("HTTP " + response.status);
            throw new Error(translateApiError(String(message)));
          }
          const blob = await response.blob();
          const fileName = (row.invoice_number || "invoice") + ".pdf";
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          setStatus("invoices", "PDF скачан", "ok");
        } catch (error) {
          setStatus("invoices", "Ошибка скачивания: " + error.message, "error");
        }
      },
      [setStatus, token]
    );

    const resetAdminRoute = useCallback(() => {
      const nextUrl = "/admin.html";
      if (window.location.pathname !== nextUrl || window.location.search) {
        window.history.replaceState(null, "", nextUrl);
      }
    }, []);

    const goBackFromRequestWorkspace = useCallback(() => {
      resetAdminRoute();
      setActiveSection("requests");
      refreshSection("requests");
    }, [refreshSection, resetAdminRoute]);

    const openReassignModal = useCallback(
      (row) => {
        const options = getLawyerOptions();
        if (!options.length) {
          setStatus("reassignForm", "Нет доступных юристов для переназначения", "error");
          return;
        }
        const current = String(row?.assigned_lawyer_id || "");
        const hasCurrent = options.some((option) => String(option.value) === current);
        const fallback = options[0] ? String(options[0].value) : "";
        setReassignModal({
          open: true,
          requestId: row?.id || null,
          trackNumber: row?.track_number || "",
          lawyerId: hasCurrent ? current : fallback,
        });
        setStatus("reassignForm", "", "");
      },
      [getLawyerOptions, setStatus]
    );

    const closeReassignModal = useCallback(() => {
      setReassignModal({ open: false, requestId: null, trackNumber: "", lawyerId: "" });
      setStatus("reassignForm", "", "");
    }, [setStatus]);

    const updateReassignLawyer = useCallback((event) => {
      setReassignModal((prev) => ({ ...prev, lawyerId: event.target.value }));
    }, []);

    const submitReassignModal = useCallback(
      async (event) => {
        event.preventDefault();
        if (!reassignModal.requestId) return;
        const lawyerId = String(reassignModal.lawyerId || "").trim();
        if (!lawyerId) {
          setStatus("reassignForm", "Выберите юриста", "error");
          return;
        }
        try {
          setStatus("reassignForm", "Сохранение...", "");
          await api("/api/admin/requests/" + reassignModal.requestId + "/reassign", {
            method: "POST",
            body: { lawyer_id: lawyerId },
          });
          setStatus("requests", "Заявка переназначена", "ok");
          closeReassignModal();
          await loadTable("requests", { resetOffset: true });
        } catch (error) {
          setStatus("reassignForm", "Ошибка: " + error.message, "error");
        }
      },
      [api, closeReassignModal, loadTable, reassignModal.lawyerId, reassignModal.requestId, setStatus]
    );

    const defaultFilterValue = useCallback(
      (fieldDef) => {
        if (!fieldDef) return "";
        if (fieldDef.type === "boolean") return "true";
        if (fieldDef.type === "reference" || fieldDef.type === "enum") {
          const options = getFieldOptions(fieldDef);
          return options.length ? String(options[0].value) : "";
        }
        return "";
      },
      [getFieldOptions]
    );

    const openFilterModal = useCallback(
      (tableKey) => {
        const fields = getFilterFields(tableKey);
        if (!fields.length) {
          setStatus("filter", "Для таблицы нет доступных полей фильтрации", "error");
          return;
        }
        const firstField = fields[0];
        const firstOp = getOperatorsForType(firstField.type)[0] || "=";
        setFilterModal({
          open: true,
          tableKey,
          field: firstField.field,
          op: firstOp,
          rawValue: defaultFilterValue(firstField),
          editIndex: null,
        });
        setStatus("filter", "", "");
      },
      [defaultFilterValue, getFilterFields, setStatus]
    );

    const openFilterEditModal = useCallback(
      (tableKey, index) => {
        const tableState = tablesRef.current[tableKey] || createTableState();
        const target = (tableState.filters || [])[index];
        if (!target) return;
        const fieldDef = getFieldDef(tableKey, target.field);
        if (!fieldDef) return;
        const allowedOps = getOperatorsForType(fieldDef.type);
        const safeOp = allowedOps.includes(target.op) ? target.op : allowedOps[0] || "=";
        const rawValue = fieldDef.type === "boolean" ? (target.value ? "true" : "false") : String(target.value ?? "");
        setFilterModal({
          open: true,
          tableKey,
          field: fieldDef.field,
          op: safeOp,
          rawValue,
          editIndex: index,
        });
        setStatus("filter", "", "");
      },
      [getFieldDef, setStatus]
    );

    const closeFilterModal = useCallback(() => {
      setFilterModal((prev) => ({ ...prev, open: false, editIndex: null }));
      setStatus("filter", "", "");
    }, [setStatus]);

    const updateFilterField = useCallback(
      (event) => {
        const fieldName = event.target.value;
        const fields = getFilterFields(filterModal.tableKey);
        const fieldDef = fields.find((field) => field.field === fieldName) || null;
        if (!fieldDef) return;
        const defaultOp = getOperatorsForType(fieldDef.type)[0] || "=";
        setFilterModal((prev) => ({
          ...prev,
          field: fieldName,
          op: defaultOp,
          rawValue: defaultFilterValue(fieldDef),
        }));
      },
      [defaultFilterValue, filterModal.tableKey, getFilterFields]
    );

    const updateFilterOp = useCallback((event) => {
      const op = event.target.value;
      setFilterModal((prev) => ({ ...prev, op }));
    }, []);

    const updateFilterValue = useCallback((event) => {
      setFilterModal((prev) => ({ ...prev, rawValue: event.target.value }));
    }, []);

    const { applyFilterModal, clearFiltersFromModal, removeFilterChip } = useTableFilterActions({
      filterModal,
      closeFilterModal,
      getFieldDef,
      loadKanban,
      loadTable,
      setStatus,
      setTableState,
      tablesRef,
    });

    const selectConfigNode = useCallback(
      (tableKey) => {
        resetAdminRoute();
        setConfigActiveKey(tableKey);
        setActiveSection("config");
        loadCurrentConfigTable(false, undefined, tableKey);
      },
      [loadCurrentConfigTable, resetAdminRoute]
    );

    const refreshAll = useCallback(() => {
      refreshSection(activeSection);
    }, [activeSection, refreshSection]);

    const activateSection = useCallback(
      (section) => {
        const nextSection = canAccessSection(role, section) ? section : "dashboard";
        resetAdminRoute();
        setActiveSection(nextSection);
        refreshSection(nextSection);
      },
      [refreshSection, resetAdminRoute, role]
    );

    const applyRequestsQuickFilterPreset = useCallback(
      async (filters, statusMessage) => {
        const nextFilters = Array.isArray(filters) ? filters.filter((item) => item && item.field) : [];
        resetAdminRoute();
        setActiveSection("requests");
        const currentState = tablesRef.current.requests || createTableState();
        setTableState("requests", {
          ...currentState,
          filters: nextFilters,
          offset: 0,
          showAll: false,
        });
        if (statusMessage) setStatus("requests", statusMessage, "");
        await loadTable("requests", { resetOffset: true, filtersOverride: nextFilters });
      },
      [loadTable, resetAdminRoute, setStatus, setTableState, tablesRef]
    );

    const openRequestsWithUnreadAlerts = useCallback(async () => {
      await applyRequestsQuickFilterPreset([{ field: "has_unread_updates", op: "=", value: true }], "Показаны заявки с новыми оповещениями");
    }, [applyRequestsQuickFilterPreset]);

    const openRequestsWithDeadlineAlerts = useCallback(async () => {
      await applyRequestsQuickFilterPreset([{ field: "deadline_alert", op: "=", value: true }], "Показаны заявки с горящими дедлайнами");
    }, [applyRequestsQuickFilterPreset]);

    const applyServiceRequestsQuickFilterPreset = useCallback(
      async (filters, statusMessage) => {
        const nextFilters = Array.isArray(filters) ? filters.filter((item) => item && item.field) : [];
        resetAdminRoute();
        setActiveSection("serviceRequests");
        const currentState = tablesRef.current.serviceRequests || createTableState();
        setTableState("serviceRequests", {
          ...currentState,
          filters: nextFilters,
          offset: 0,
          showAll: false,
        });
        if (statusMessage) setStatus("serviceRequests", statusMessage, "");
        await loadTable("serviceRequests", { resetOffset: true, filtersOverride: nextFilters });
      },
      [loadTable, resetAdminRoute, setStatus, setTableState, tablesRef]
    );

    const openServiceRequestsWithUnreadAlerts = useCallback(async () => {
      if (String(role || "").toUpperCase() === "LAWYER") {
        await applyServiceRequestsQuickFilterPreset(
          [{ field: "lawyer_unread", op: "=", value: true }],
          "Показаны непрочитанные запросы клиента"
        );
        return;
      }
      await applyServiceRequestsQuickFilterPreset(
        [{ field: "admin_unread", op: "=", value: true }],
        "Показаны непрочитанные запросы клиента"
      );
    }, [applyServiceRequestsQuickFilterPreset, role]);

    const markServiceRequestRead = useCallback(
      async (serviceRequestId) => {
        const rowId = String(serviceRequestId || "").trim();
        if (!rowId) return;
        try {
          setStatus("serviceRequests", "Отмечаем как прочитанный...", "");
          await api("/api/admin/requests/service-requests/" + encodeURIComponent(rowId) + "/read", { method: "POST" });
          await Promise.all([loadTable("serviceRequests", { resetOffset: true }), loadDashboard()]);
          await loadTable("requests", { resetOffset: true });
          setStatus("serviceRequests", "Запрос отмечен как прочитанный", "ok");
        } catch (error) {
          setStatus("serviceRequests", "Ошибка: " + error.message, "error");
        }
      },
      [api, loadDashboard, loadTable, setStatus]
    );

    const loadTotpStatus = useCallback(
      async (tokenOverride) => {
        const activeToken = tokenOverride !== undefined ? tokenOverride : token;
        if (!activeToken) return;
        try {
          const data = await api("/api/admin/auth/totp/status", { method: "GET" }, activeToken);
          if (data && typeof data === "object") {
            setTotpStatus({
              mode: String(data.mode || "password_totp_optional"),
              enabled: Boolean(data.enabled),
              required: Boolean(data.required),
              has_backup_codes: Boolean(data.has_backup_codes),
            });
          }
        } catch (_) {}
      },
      [api, token]
    );

    const setupTotp = useCallback(async () => {
      try {
        const setup = await api("/api/admin/auth/totp/setup", { method: "POST", body: {} });
        const secret = String(setup?.secret || "").trim();
        const uri = String(setup?.otpauth_uri || "").trim();
        if (!secret || !uri) throw new Error("Не удалось получить секрет TOTP");
        window.alert(
          "Сканируйте QR/URI в Google Authenticator:\n\n" +
            uri +
            "\n\nИли введите ключ вручную:\n" +
            secret
        );
        const code = String(window.prompt("Введите текущий 6-значный код из Authenticator", "") || "").trim();
        if (!code) return;
        const enabled = await api("/api/admin/auth/totp/enable", { method: "POST", body: { secret, code } });
        const backupCodes = Array.isArray(enabled?.backup_codes) ? enabled.backup_codes : [];
        window.alert(
          "2FA включена.\nСохраните резервные коды (однократно):\n\n" + (backupCodes.length ? backupCodes.join("\n") : "-")
        );
        await loadTotpStatus();
      } catch (error) {
        setStatus("login", "Ошибка настройки 2FA: " + error.message, "error");
      }
    }, [api, loadTotpStatus, setStatus]);

    const regenerateTotpBackupCodes = useCallback(async () => {
      try {
        const code = String(window.prompt("Введите TOTP код (или резервный код) для регенерации", "") || "").trim();
        if (!code) return;
        const payload = /^\d{6}$/.test(code) ? { code } : { backup_code: code };
        const data = await api("/api/admin/auth/totp/backup/regenerate", { method: "POST", body: payload });
        const backupCodes = Array.isArray(data?.backup_codes) ? data.backup_codes : [];
        window.alert("Новые резервные коды:\n\n" + (backupCodes.length ? backupCodes.join("\n") : "-"));
        await loadTotpStatus();
      } catch (error) {
        setStatus("login", "Ошибка регенерации backup-кодов: " + error.message, "error");
      }
    }, [api, loadTotpStatus, setStatus]);

    const disableTotp = useCallback(async () => {
      try {
        const code = String(window.prompt("Введите TOTP код (или резервный код) для отключения 2FA", "") || "").trim();
        if (!code) return;
        const payload = /^\d{6}$/.test(code) ? { code } : { backup_code: code };
        await api("/api/admin/auth/totp/disable", { method: "POST", body: payload });
        setStatus("login", "2FA отключена", "ok");
        await loadTotpStatus();
      } catch (error) {
        setStatus("login", "Ошибка отключения 2FA: " + error.message, "error");
      }
    }, [api, loadTotpStatus, setStatus]);

    const logout = useCallback(() => {
      localStorage.removeItem(LS_TOKEN);
      setToken("");
      setRole("");
      setEmail("");
      setUserId("");
      setRecordModal({ open: false, tableKey: null, mode: "create", rowId: null, form: {} });
      resetRequestWorkspaceState();
      setFilterModal({ open: false, tableKey: null, field: "", op: "=", rawValue: "", editIndex: null });
      resetKanbanState();
      setReassignModal({ open: false, requestId: null, trackNumber: "", lawyerId: "" });
      setDashboardData({
        scope: "",
        cards: [],
        byStatus: {},
        lawyerLoads: [],
        myUnreadByEvent: {},
        myUnreadTotal: 0,
        myUnreadNotificationsTotal: 0,
        unreadForClients: 0,
        unreadForLawyers: 0,
        serviceRequestUnreadTotal: 0,
        deadlineAlertTotal: 0,
        monthRevenue: 0,
        monthExpenses: 0,
      });
      setMetaJson("");
      setConfigActiveKey("");
      setReferencesExpanded(true);
      resetTablesState();
      setDictionaries({
        topics: [],
        statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name })),
        formFieldTypes: [...DEFAULT_FORM_FIELD_TYPES],
        formFieldKeys: [],
        users: [],
      });
      setStatusMap({});
      setSmsProviderHealth(null);
      setTotpStatus({
        mode: "password_totp_optional",
        enabled: false,
        required: false,
        has_backup_codes: false,
      });
      setActiveSection("dashboard");
    }, [resetKanbanState, resetRequestWorkspaceState, resetTablesState]);

    const login = useCallback(
      async (emailInput, passwordInput, totpCodeInput) => {
        try {
          setStatus("login", "Выполняем вход...", "");
          const rawTotp = String(totpCodeInput || "").trim();
          const digitsOnly = rawTotp.replace(/\D+/g, "");
          const loginBody = {
            email: String(emailInput || "").trim(),
            password: passwordInput || "",
            ...(rawTotp
              ? digitsOnly.length === 6
                ? { totp_code: digitsOnly }
                : { backup_code: rawTotp }
              : {}),
          };
          const data = await api(
            "/api/admin/auth/login",
            {
              method: "POST",
              auth: false,
              body: loginBody,
            },
            ""
          );

          const nextToken = data.access_token;
          const payload = decodeJwtPayload(nextToken || "");
          if (!payload || !payload.role || !payload.email) throw new Error("Не удалось прочитать данные токена");

          localStorage.setItem(LS_TOKEN, nextToken);
          setToken(nextToken);
          setRole(payload.role);
          setEmail(payload.email);
          setUserId(String(payload.sub || ""));

          await bootstrapReferenceData(nextToken, payload.role);
          setActiveSection("dashboard");
          await loadDashboard(nextToken);
          await loadTotpStatus(nextToken);

          setStatus("login", "Успешный вход", "ok");
        } catch (error) {
          setStatus("login", "Ошибка входа: " + error.message, "error");
        }
      },
      [api, bootstrapReferenceData, loadDashboard, loadTotpStatus, setStatus]
    );

    useEffect(() => {
      const saved = localStorage.getItem(LS_TOKEN) || "";
      if (!saved) return;
      const payload = decodeJwtPayload(saved);
      if (!payload || !payload.role || !payload.email) {
        localStorage.removeItem(LS_TOKEN);
        return;
      }
      setToken(saved);
      setRole(payload.role);
      setEmail(payload.email);
      setUserId(String(payload.sub || ""));
    }, []);

    useEffect(() => {
      if (!token || !role) return;
      let cancelled = false;
      (async () => {
        await bootstrapReferenceData(token, role);
        if (!cancelled) await loadDashboard(token);
        if (!cancelled) await loadTotpStatus(token);
      })();
      return () => {
        cancelled = true;
      };
    }, [bootstrapReferenceData, loadDashboard, loadTotpStatus, role, token]);

    useEffect(() => {
      if (!token || !role) return;
      if (initialRouteHandledRef.current) return;
      initialRouteHandledRef.current = true;
      if (isRequestWorkspaceRoute && routeInfo.requestId) {
        setActiveSection("requestWorkspace");
        loadRequestModalData(routeInfo.requestId, { showLoading: true });
        resetAdminRoute();
        return;
      }
      if (routeInfo.section) {
        if (canAccessSection(role, routeInfo.section)) {
          setActiveSection(routeInfo.section);
          refreshSection(routeInfo.section, token);
          resetAdminRoute();
        } else {
          setActiveSection("dashboard");
          refreshSection("dashboard", token);
          resetAdminRoute();
        }
      }
    }, [isRequestWorkspaceRoute, loadRequestModalData, refreshSection, resetAdminRoute, role, routeInfo.requestId, routeInfo.section, token]);

    useEffect(() => {
      if (!token) {
        setSmsProviderHealth(null);
        return;
      }
      if (String(role || "").toUpperCase() !== "ADMIN") {
        setSmsProviderHealth(null);
        return;
      }
      if (activeSection !== "config" || configActiveKey !== "otp_sessions") return;
      loadSmsProviderHealth(undefined, { silent: true });
    }, [activeSection, configActiveKey, loadSmsProviderHealth, role, token]);

    useEffect(() => {
      if (!dictionaryTableItems.length) {
        if (configActiveKey) setConfigActiveKey("");
        return;
      }
      const hasCurrent = dictionaryTableItems.some((item) => item.key === configActiveKey);
      if (!hasCurrent) setConfigActiveKey(dictionaryTableItems[0].key);
    }, [configActiveKey, dictionaryTableItems]);

    const anyOverlayOpen = recordModal.open || filterModal.open || reassignModal.open || kanbanSortModal.open;
    useEffect(() => {
      document.body.classList.toggle("modal-open", anyOverlayOpen);
      return () => document.body.classList.remove("modal-open");
    }, [anyOverlayOpen]);

    useEffect(() => {
      const onEsc = (event) => {
        if (event.key !== "Escape") return;
        setRecordModal((prev) => ({ ...prev, open: false }));
        setFilterModal((prev) => ({ ...prev, open: false }));
        closeKanbanSortModal();
        setReassignModal((prev) => ({ ...prev, open: false }));
      };
      document.addEventListener("keydown", onEsc);
      return () => document.removeEventListener("keydown", onEsc);
    }, [closeKanbanSortModal]);

    const menuItems = useMemo(() => {
      return [
        { key: "dashboard", label: "Обзор" },
        { key: "kanban", label: "Канбан" },
        { key: "requests", label: "Заявки" },
        { key: "serviceRequests", label: "Запросы" },
        { key: "invoices", label: "Счета" },
      ];
    }, []);

    const topbarUnreadCount = useMemo(() => {
      const roleCode = String(role || "").toUpperCase();
      if (roleCode === "LAWYER" || roleCode === "ADMIN" || roleCode === "CURATOR") {
        return Number(dashboardData.myUnreadNotificationsTotal || dashboardData.myUnreadTotal || 0);
      }
      return Number(dashboardData.unreadForClients || 0) + Number(dashboardData.unreadForLawyers || 0);
    }, [dashboardData.myUnreadNotificationsTotal, dashboardData.myUnreadTotal, dashboardData.unreadForClients, dashboardData.unreadForLawyers, role]);

    const topbarDeadlineAlertCount = useMemo(() => Number(dashboardData.deadlineAlertTotal || 0), [dashboardData.deadlineAlertTotal]);
    const topbarServiceRequestUnreadCount = useMemo(
      () => Number(dashboardData.serviceRequestUnreadTotal || 0),
      [dashboardData.serviceRequestUnreadTotal]
    );

    const activeFilterFields = useMemo(() => {
      if (!filterModal.tableKey) return [];
      return getFilterFields(filterModal.tableKey);
    }, [filterModal.tableKey, getFilterFields]);

    const filterTableLabel = useMemo(() => getTableLabel(filterModal.tableKey), [filterModal.tableKey, getTableLabel]);

    const recordModalFields = useMemo(() => {
      const all = getRecordFields(recordModal.tableKey);
      if (recordModal.mode !== "create") return all.filter((field) => !field.createOnly);
      return all.filter((field) => !field.autoCreate);
    }, [getRecordFields, recordModal.mode, recordModal.tableKey]);

    const activeConfigTableState = useMemo(() => {
      return tables[configActiveKey] || createTableState();
    }, [configActiveKey, tables]);

    const activeConfigMeta = useMemo(() => tableCatalogMap[configActiveKey] || null, [configActiveKey, tableCatalogMap]);
    const activeConfigActions = useMemo(() => {
      return Array.isArray(activeConfigMeta?.actions) ? activeConfigMeta.actions : [];
    }, [activeConfigMeta]);
    const canCreateInConfig = activeConfigActions.includes("create");
    const canUpdateInConfig = activeConfigActions.includes("update");
    const canDeleteInConfig = activeConfigActions.includes("delete");

    const genericConfigHeaders = useMemo(() => {
      if (!activeConfigMeta || !Array.isArray(activeConfigMeta.columns)) return [];
      const headers = (activeConfigMeta.columns || [])
        .filter((column) => column && column.name)
        .map((column) => {
          const name = String(column.name);
          return {
            key: name,
            label: String(column.label || humanizeKey(name)),
            sortable: Boolean(column.sortable !== false),
            field: name,
          };
        });
      if (canUpdateInConfig || canDeleteInConfig) headers.push({ key: "actions", label: "Действия" });
      return headers;
    }, [activeConfigMeta, canDeleteInConfig, canUpdateInConfig]);

    return (
      <>
        <div className="layout">
          <aside className="sidebar">
            <div className="logo">
              <a href="/">Правовой трекер</a>
            </div>
            <nav className="menu">
              {menuItems.map((item) => (
                <button
                  key={item.key}
                  className={activeSection === item.key ? "active" : ""}
                  data-section={item.key}
                  type="button"
                  onClick={() => activateSection(item.key)}
                >
                  {item.label}
                </button>
              ))}
              {role === "ADMIN" ? (
                <>
                  <button
                    className={activeSection === "config" ? "active" : ""}
                    type="button"
                    onClick={() => {
                      setReferencesExpanded((prev) => !prev);
                      activateSection("config");
                    }}
                  >
                    {"Справочники " + (referencesExpanded ? "▾" : "▸")}
                  </button>
                  {referencesExpanded ? (
                    <div className="menu-tree">
                      {dictionaryTableItems.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={activeSection === "config" && configActiveKey === item.key ? "active" : ""}
                          onClick={() => selectConfigNode(item.key)}
                        >
                          {getTableLabel(item.key)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </nav>
            <div className="auth-box">
              {token && role ? (
                <>
                  Пользователь: <b>{email}</b>
                  <br />
                  Роль: <b>{roleLabel(role)}</b>
                  <br />
                  2FA: <b>{totpStatus.enabled ? "Включена" : "Выключена"}</b>
                </>
              ) : (
                "Не авторизован"
              )}
            </div>
            {token && role ? (
              <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <button className="btn secondary" type="button" onClick={setupTotp}>
                  Настроить 2FA
                </button>
                {totpStatus.enabled ? (
                  <>
                    <button className="btn secondary" type="button" onClick={regenerateTotpBackupCodes}>
                      Backup-коды
                    </button>
                    <button className="btn danger" type="button" onClick={disableTotp}>
                      Отключить 2FA
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button className="btn secondary" type="button" onClick={refreshAll}>
                Обновить
              </button>
              <button className="btn danger" type="button" onClick={logout}>
                Выйти
              </button>
            </div>
          </aside>

          <main className="main">
            <div className="topbar">
              <div>
                <h1>Панель администратора</h1>
                <p className="muted">UniversalQuery, RBAC и аудит действий по ключевым сущностям системы.</p>
              </div>
              <div className="topbar-actions" aria-label="Быстрые уведомления и дедлайны">
                <button
                  type="button"
                  className={
                    "icon-btn topbar-alert-btn" + (topbarServiceRequestUnreadCount > 0 ? " has-alert alert-danger" : "")
                  }
                  data-tooltip={
                    topbarServiceRequestUnreadCount > 0
                      ? "Новые клиентские запросы: " + String(topbarServiceRequestUnreadCount)
                      : "Новых клиентских запросов нет"
                  }
                  aria-label="Показать непрочитанные запросы клиента"
                  onClick={openServiceRequestsWithUnreadAlerts}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
                    <path
                      d="M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v9.8a1.5 1.5 0 0 1-1.5 1.5H9.1l-3.7 3.1c-.98.82-2.4.13-2.4-1.14V6a1.5 1.5 0 0 1 1.5-1.5zm1.7 4.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm5.8 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm5.8 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="topbar-alert-dot" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={
                    "icon-btn topbar-alert-btn" + (topbarDeadlineAlertCount > 0 ? " has-alert alert-danger" : "")
                  }
                  data-tooltip={
                    topbarDeadlineAlertCount > 0
                      ? "Горящие дедлайны: " + String(topbarDeadlineAlertCount)
                      : "Горящих дедлайнов нет"
                  }
                  aria-label="Показать заявки с горящими дедлайнами"
                  onClick={openRequestsWithDeadlineAlerts}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
                    <path
                      d="M12 3a1.6 1.6 0 0 1 1.42.86l7.14 13.7A1.6 1.6 0 0 1 19.14 20H4.86a1.6 1.6 0 0 1-1.42-2.44l7.14-13.7A1.6 1.6 0 0 1 12 3zm0 4.2a1 1 0 0 0-1 1v5.2a1 1 0 1 0 2 0V8.2a1 1 0 0 0-1-1zm0 9.4a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="topbar-alert-dot" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={
                    "icon-btn topbar-alert-btn" + (topbarUnreadCount > 0 ? " has-alert alert-success" : "")
                  }
                  data-tooltip={
                    topbarUnreadCount > 0
                      ? "Новые оповещения по заявкам: " + String(topbarUnreadCount)
                      : "Новых оповещений нет"
                  }
                  aria-label="Показать заявки с новыми оповещениями"
                  onClick={openRequestsWithUnreadAlerts}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
                    <path
                      d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11zm2 .5v.32l6 4.44 6-4.44V7a.5.5 0 0 0-.5-.5h-11A.5.5 0 0 0 6 7zm12 2.8-5.4 4a1 1 0 0 1-1.2 0L6 9.8v7.7c0 .28.22.5.5.5h11a.5.5 0 0 0 .5-.5V9.8z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="topbar-alert-dot" aria-hidden="true" />
                </button>
              </div>
            </div>

            <Section active={activeSection === "dashboard"} id="section-dashboard">
              <DashboardSection
                dashboardData={dashboardData}
                token={token}
                status={getStatus("dashboard")}
                apiCall={api}
                onOpenRequest={openRequestDetails}
                DataTableComponent={DataTable}
                StatusLineComponent={StatusLine}
                UserAvatarComponent={UserAvatar}
              />
            </Section>

            <Section active={activeSection === "kanban"} id="section-kanban">
              <KanbanBoard
                loading={kanbanLoading}
                columns={kanbanData.columns}
                rows={kanbanData.rows}
                role={role}
                actorId={userId}
                onRefresh={() => loadKanban()}
                filters={tables.kanban.filters}
                onOpenFilter={() => openFilterModal("kanban")}
                onRemoveFilter={(index) => removeFilterChip("kanban", index)}
                onEditFilter={(index) => openFilterEditModal("kanban", index)}
                getFilterChipLabel={(clause) => {
                  const fieldDef = getFieldDef("kanban", clause.field);
                  return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("kanban", clause);
                }}
                onOpenSort={openKanbanSortModal}
                sortActive={kanbanSortApplied}
                onOpenRequest={openRequestDetails}
                onClaimRequest={claimRequest}
                onMoveRequest={moveRequestFromKanban}
                status={getStatus("kanban")}
                FilterToolbarComponent={FilterToolbar}
                StatusLineComponent={StatusLine}
              />
            </Section>

            <Section active={activeSection === "requests"} id="section-requests">
              <RequestsSection
                role={role}
                tables={tables}
                status={getStatus("requests")}
                getFieldDef={getFieldDef}
                getFilterValuePreview={getFilterValuePreview}
                resolveReferenceLabel={resolveReferenceLabel}
                onRefresh={() => loadTable("requests", { resetOffset: true })}
                onCreate={() => openCreateRecordModal("requests")}
                onOpenFilter={() => openFilterModal("requests")}
                onRemoveFilter={(index) => removeFilterChip("requests", index)}
                onEditFilter={(index) => openFilterEditModal("requests", index)}
                onSort={(field) => toggleTableSort("requests", field)}
                onPrev={() => loadPrevPage("requests")}
                onNext={() => loadNextPage("requests")}
                onLoadAll={() => loadAllRows("requests")}
                onClaimRequest={claimRequest}
                onOpenReassign={openReassignModal}
                onOpenRequest={openRequestDetails}
                onEditRecord={(row) => openEditRecordModal("requests", row)}
                onDeleteRecord={(id) => deleteRecord("requests", id)}
                FilterToolbarComponent={FilterToolbar}
                DataTableComponent={DataTable}
                TablePagerComponent={TablePager}
                StatusLineComponent={StatusLine}
                IconButtonComponent={IconButton}
              />
            </Section>

            <Section active={activeSection === "serviceRequests"} id="section-service-requests">
              <ServiceRequestsSection
                role={role}
                tables={tables}
                status={getStatus("serviceRequests")}
                getFieldDef={getFieldDef}
                getFilterValuePreview={getFilterValuePreview}
                onRefresh={() => loadTable("serviceRequests", { resetOffset: true })}
                onOpenFilter={() => openFilterModal("serviceRequests")}
                onRemoveFilter={(index) => removeFilterChip("serviceRequests", index)}
                onEditFilter={(index) => openFilterEditModal("serviceRequests", index)}
                onSort={(field) => toggleTableSort("serviceRequests", field)}
                onPrev={() => loadPrevPage("serviceRequests")}
                onNext={() => loadNextPage("serviceRequests")}
                onLoadAll={() => loadAllRows("serviceRequests")}
                onOpenRequest={openRequestDetails}
                onMarkRead={markServiceRequestRead}
                onEditRecord={(row) => openEditRecordModal("serviceRequests", row)}
                onDeleteRecord={(id) => deleteRecord("serviceRequests", id)}
                FilterToolbarComponent={FilterToolbar}
                DataTableComponent={DataTable}
                TablePagerComponent={TablePager}
                StatusLineComponent={StatusLine}
                IconButtonComponent={IconButton}
              />
            </Section>

            <Section active={activeSection === "requestWorkspace"} id="section-request-workspace">
              <div className="section-head">
                <div>
                  <h2>{requestModal.trackNumber ? "Карточка заявки " + requestModal.trackNumber : "Карточка заявки"}</h2>
                </div>
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                  <button className="icon-btn workspace-head-icon" type="button" data-tooltip="Назад" aria-label="Назад" onClick={goBackFromRequestWorkspace}>
                    <span className="workspace-head-icon-glyph">↩</span>
                  </button>
                  <button
                    className="icon-btn workspace-head-icon"
                    type="button"
                    data-tooltip="Обновить"
                    aria-label="Обновить"
                    onClick={refreshRequestModal}
                    disabled={requestModal.loading || requestModal.fileUploading}
                  >
                    <span className="workspace-head-icon-glyph">↻</span>
                  </button>
                </div>
              </div>
              <RequestWorkspace
                viewerRole={role}
                viewerUserId={userId}
                loading={requestModal.loading}
                trackNumber={requestModal.trackNumber}
                requestData={requestModal.requestData}
                financeSummary={requestModal.financeSummary}
                statusRouteNodes={requestModal.statusRouteNodes}
                statusHistory={requestModal.statusHistory || []}
                availableStatuses={requestModal.availableStatuses || []}
                currentImportantDateAt={requestModal.currentImportantDateAt || ""}
                pendingStatusChangePreset={requestModal.pendingStatusChangePreset}
                messages={requestModal.messages || []}
                attachments={requestModal.attachments || []}
                messageDraft={requestModal.messageDraft || ""}
                selectedFiles={requestModal.selectedFiles || []}
                fileUploading={Boolean(requestModal.fileUploading)}
                status={getStatus("requestModal")}
                onMessageChange={updateRequestModalMessageDraft}
                onSendMessage={submitRequestModalMessage}
                onFilesSelect={appendRequestModalFiles}
                onRemoveSelectedFile={removeRequestModalFile}
                onClearSelectedFiles={clearRequestModalFiles}
                onLoadRequestDataTemplates={loadRequestDataTemplates}
                onLoadRequestDataBatch={loadRequestDataBatch}
                onLoadRequestDataTemplateDetails={loadRequestDataTemplateDetails}
                onSaveRequestDataTemplate={saveRequestDataTemplate}
                onSaveRequestDataBatch={saveRequestDataBatch}
                onChangeStatus={submitRequestStatusChange}
                onConsumePendingStatusChangePreset={clearPendingStatusChangePreset}
                onLiveProbe={probeRequestLive}
                onTypingSignal={setRequestTyping}
                AttachmentPreviewModalComponent={AttachmentPreviewModal}
                StatusLineComponent={StatusLine}
              />
            </Section>

            <Section active={activeSection === "invoices"} id="section-invoices">
              <InvoicesSection
                role={role}
                tables={tables}
                status={getStatus("invoices")}
                getFieldDef={getFieldDef}
                getFilterValuePreview={getFilterValuePreview}
                onRefresh={() => loadTable("invoices", { resetOffset: true })}
                onCreate={() => openCreateRecordModal("invoices")}
                onOpenFilter={() => openFilterModal("invoices")}
                onRemoveFilter={(index) => removeFilterChip("invoices", index)}
                onEditFilter={(index) => openFilterEditModal("invoices", index)}
                onSort={(field) => toggleTableSort("invoices", field)}
                onPrev={() => loadPrevPage("invoices")}
                onNext={() => loadNextPage("invoices")}
                onLoadAll={() => loadAllRows("invoices")}
                onOpenRequest={openInvoiceRequest}
                onDownloadPdf={downloadInvoicePdf}
                onEditRecord={(row) => openEditRecordModal("invoices", row)}
                onDeleteRecord={(id) => deleteRecord("invoices", id)}
                FilterToolbarComponent={FilterToolbar}
                DataTableComponent={DataTable}
                TablePagerComponent={TablePager}
                StatusLineComponent={StatusLine}
                IconButtonComponent={IconButton}
              />
            </Section>

            <Section active={activeSection === "quotes"} id="section-quotes">
              <QuotesSection
                tables={tables}
                status={getStatus("quotes")}
                getFieldDef={getFieldDef}
                getFilterValuePreview={getFilterValuePreview}
                onRefresh={() => loadTable("quotes", { resetOffset: true })}
                onCreate={() => openCreateRecordModal("quotes")}
                onOpenFilter={() => openFilterModal("quotes")}
                onRemoveFilter={(index) => removeFilterChip("quotes", index)}
                onEditFilter={(index) => openFilterEditModal("quotes", index)}
                onSort={(field) => toggleTableSort("quotes", field)}
                onPrev={() => loadPrevPage("quotes")}
                onNext={() => loadNextPage("quotes")}
                onLoadAll={() => loadAllRows("quotes")}
                onEditRecord={(row) => openEditRecordModal("quotes", row)}
                onDeleteRecord={(id) => deleteRecord("quotes", id)}
                FilterToolbarComponent={FilterToolbar}
                DataTableComponent={DataTable}
                TablePagerComponent={TablePager}
                StatusLineComponent={StatusLine}
                IconButtonComponent={IconButton}
              />
            </Section>
            <Section active={activeSection === "config"} id="section-config">
              <ConfigSection
                token={token}
                tables={tables}
                dictionaries={dictionaries}
                configActiveKey={configActiveKey}
                activeConfigTableState={activeConfigTableState}
                activeConfigMeta={activeConfigMeta}
                genericConfigHeaders={genericConfigHeaders}
                canCreateInConfig={canCreateInConfig}
                canUpdateInConfig={canUpdateInConfig}
                canDeleteInConfig={canDeleteInConfig}
                statusDesignerTopicCode={statusDesignerTopicCode}
                statusDesignerCards={statusDesignerCards}
                getTableLabel={getTableLabel}
                getFieldDef={getFieldDef}
                getFilterValuePreview={getFilterValuePreview}
                resolveReferenceLabel={resolveReferenceLabel}
                resolveTableConfig={resolveTableConfig}
                getStatus={getStatus}
                loadCurrentConfigTable={loadCurrentConfigTable}
                onRefreshSmsProviderHealth={() => loadSmsProviderHealth(undefined, { silent: false })}
                smsProviderHealth={smsProviderHealth}
                openCreateRecordModal={openCreateRecordModal}
                openFilterModal={openFilterModal}
                removeFilterChip={removeFilterChip}
                openFilterEditModal={openFilterEditModal}
                toggleTableSort={toggleTableSort}
                openEditRecordModal={openEditRecordModal}
                deleteRecord={deleteRecord}
                loadStatusDesignerTopic={loadStatusDesignerTopic}
                openCreateStatusTransitionForTopic={openCreateStatusTransitionForTopic}
                loadPrevPage={loadPrevPage}
                loadNextPage={loadNextPage}
                loadAllRows={loadAllRows}
                FilterToolbarComponent={FilterToolbar}
                DataTableComponent={DataTable}
                TablePagerComponent={TablePager}
                StatusLineComponent={StatusLine}
                IconButtonComponent={IconButton}
                UserAvatarComponent={UserAvatar}
              />
            </Section>
            <Section active={activeSection === "availableTables"} id="section-available-tables">
              <AvailableTablesSection
                tables={tables}
                status={getStatus("availableTables")}
                onRefresh={() => loadAvailableTables()}
                onToggleActive={updateAvailableTableState}
                DataTableComponent={DataTable}
                StatusLineComponent={StatusLine}
                IconButtonComponent={IconButton}
              />
            </Section>
          </main>
        </div>

        <RecordModal
          open={recordModal.open}
          title={(recordModal.mode === "edit" ? "Редактирование • " : "Создание • ") + getTableLabel(recordModal.tableKey)}
          fields={recordModalFields}
          form={recordModal.form || {}}
          status={getStatus("recordForm")}
          onClose={closeRecordModal}
          onChange={updateRecordField}
          onUploadField={uploadRecordFieldFile}
          onSubmit={submitRecordModal}
        />

        <FilterModal
          open={filterModal.open}
          tableLabel={filterTableLabel}
          fields={activeFilterFields}
          draft={filterModal}
          status={getStatus("filter")}
          onClose={closeFilterModal}
          onFieldChange={updateFilterField}
          onOpChange={updateFilterOp}
          onValueChange={updateFilterValue}
          onSubmit={applyFilterModal}
          onClear={clearFiltersFromModal}
          getOperators={getOperatorsForType}
          getFieldOptions={getFieldOptions}
        />

        <KanbanSortModal
          open={kanbanSortModal.open}
          value={kanbanSortModal.value}
          status={getStatus("kanbanSort")}
          onChange={updateKanbanSortMode}
          onClose={closeKanbanSortModal}
          onSubmit={submitKanbanSortModal}
        />

        <ReassignModal
          open={reassignModal.open}
          status={getStatus("reassignForm")}
          options={getLawyerOptions()}
          value={reassignModal.lawyerId}
          onChange={updateReassignLawyer}
          onClose={closeReassignModal}
          onSubmit={submitReassignModal}
          trackNumber={reassignModal.trackNumber}
        />

        {!token || !role ? <LoginScreen onSubmit={login} status={getStatus("login")} /> : null}
        <GlobalTooltipLayer />
      </>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("admin-root"));
  root.render(<App />);
})();
