import { DropdownField } from "./DropdownField.jsx";
import { resolveAvatarSrc, roleLabel } from "./utils.js";

const { useEffect, useRef, useState } = React;

export function RecordModal({
  open,
  title,
  tableKey,
  mode,
  fields,
  form,
  status,
  accessToken,
  onClose,
  onChange,
  onSubmit,
  onUploadField,
  OverlayComponent,
  IconButtonComponent,
  UserAvatarComponent,
  StatusLineComponent,
}) {
  const Overlay = OverlayComponent;
  const IconButton = IconButtonComponent;
  const UserAvatar = UserAvatarComponent;
  const StatusLine = StatusLineComponent;
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [userEditing, setUserEditing] = useState(false);
  const avatarUploadRef = useRef(null);
  const visibleFields = (fields || []).filter((field) => {
    if (typeof field.visibleWhen !== "function") return true;
    try {
      return Boolean(field.visibleWhen(form || {}));
    } catch (_) {
      return true;
    }
  });
  const isUserModal = tableKey === "users";
  const avatarField = isUserModal ? visibleFields.find((field) => field.key === "avatar_url") : null;
  const topicField = isUserModal ? visibleFields.find((field) => field.key === "primary_topic_code") : null;
  const formFields = isUserModal ? visibleFields.filter((field) => field.key !== "avatar_url") : visibleFields;
  const fieldMap = new Map(visibleFields.map((field) => [field.key, field]));
  const avatarValue = String(form?.avatar_url || "").trim();
  const userName = String(form?.name || "").trim();
  const userEmail = String(form?.email || "").trim();
  const userPhone = String(form?.phone || "").trim();
  const userRole = roleLabel(form?.role);
  const topicOptions = topicField && typeof topicField.options === "function" ? topicField.options(form || {}) : [];
  const currentTopicValue = String(form?.primary_topic_code || "").trim();
  const userTopic =
    (topicOptions.find((option) => String(option?.value || "") === currentTopicValue)?.label || currentTopicValue || "").trim() ||
    "Профиль не указан";
  const defaultRate = String(form?.default_rate || "").trim();
  const salaryPercent = String(form?.salary_percent || "").trim();
  const userActiveRaw = String(form?.is_active ?? "");
  const activeLabel = userActiveRaw === "false" ? "Неактивен" : userActiveRaw === "true" || !userActiveRaw ? "Активен" : "Статус не задан";
  const avatarPreviewSrc = avatarValue ? resolveAvatarSrc(avatarValue, accessToken, 512) : "";
  const statusTone = userActiveRaw === "false" ? "danger" : userActiveRaw === "true" || !userActiveRaw ? "success" : "warn";
  const isCreateMode = isUserModal && mode === "create";

  useEffect(() => {
    if (!isUserModal) {
      setUserEditing(false);
      setAvatarPreviewOpen(false);
      return;
    }
    setUserEditing(isCreateMode);
    setAvatarPreviewOpen(false);
  }, [isCreateMode, isUserModal, open, tableKey]);

  if (!open) return null;

  const renderField = (field) => {
    const value = form[field.key] ?? "";
    const options = typeof field.options === "function" ? field.options(form || {}) : [];
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
        <DropdownField
          id={id}
          value={value}
          onChange={(nextValue) => onChange(field.key, nextValue)}
          options={[
            { value: "true", label: "Да" },
            { value: "false", label: "Нет" },
          ]}
          disabled={disabled}
          placeholder="Выберите значение"
        />
      );
    }
    if (field.type === "reference" || field.type === "enum") {
      const extraOptions = Array.isArray(field.extraOptions) ? field.extraOptions : [];
      const hasCurrentValue =
        String(value || "").trim() !== "" &&
        [...extraOptions, ...options].some((option) => String(option?.value || "") === String(value));
      const selectOptions = [];
      if (field.optional) selectOptions.push({ value: "", label: "-" });
      if (!hasCurrentValue && String(value || "").trim() !== "") selectOptions.push({ value: String(value), label: String(value) });
      extraOptions.forEach((option) => selectOptions.push({ value: String(option.value), label: option.label }));
      options.forEach((option) => selectOptions.push({ value: String(option.value), label: option.label }));
      return (
        <DropdownField
          id={id}
          value={value}
          onChange={(nextValue) => onChange(field.key, nextValue)}
          options={selectOptions}
          disabled={disabled}
          placeholder={field.optional ? "-" : field.placeholder || "Выберите значение"}
        />
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

  const renderUserCard = (fieldKey) => {
    const field = fieldMap.get(fieldKey);
    if (!field) return null;
    const value = form[fieldKey] ?? "";
    const isPassword = fieldKey === "password";
    const inEdit = isCreateMode || userEditing;
    let content = null;

    if (inEdit) {
      content = renderField(field);
    } else if (isPassword) {
      content = <span className="record-user-card-value muted">Пароль скрыт</span>;
    } else {
      let displayValue = value;
      if (fieldKey === "role") displayValue = userRole || "Не указана";
      if (fieldKey === "is_active") displayValue = activeLabel;
      if (fieldKey === "primary_topic_code") displayValue = userTopic;
      if (fieldKey === "default_rate") displayValue = defaultRate || "—";
      if (fieldKey === "salary_percent") displayValue = salaryPercent || "—";
      content = <span className="record-user-card-value">{String(displayValue || "Не указано")}</span>;
    }

    return (
      <div className="record-user-card" key={fieldKey}>
        <span className="record-user-card-label">{field.label}</span>
        {content}
      </div>
    );
  };

  const renderUserRateCard = () => {
    const inEdit = isCreateMode || userEditing;
    if (inEdit) {
      return (
        <div className="record-user-card" key="rate-combo">
          <span className="record-user-card-label">Ставка / % зарплаты</span>
          <div className="record-user-rate-grid">
            {fieldMap.get("default_rate") ? renderField(fieldMap.get("default_rate")) : null}
            {fieldMap.get("salary_percent") ? renderField(fieldMap.get("salary_percent")) : null}
          </div>
        </div>
      );
    }
    return (
      <div className="record-user-summary-item" key="rate-combo-view">
        <span className="record-user-summary-label">Ставка / % зарплаты</span>
        <span className="record-user-summary-value">{defaultRate || "—"} / {salaryPercent || "—"}</span>
      </div>
    );
  };

  return (
    <Overlay open={open} id="record-overlay" onClose={(event) => event.target.id === "record-overlay" && onClose()}>
      <div className={"modal" + (isUserModal ? " record-user-modal" : "")} style={{ width: isUserModal ? "min(920px, 100%)" : "min(760px, 100%)" }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            <p className="muted" style={{ marginTop: "0.35rem" }}>
              {isUserModal ? (isCreateMode ? "Создание профиля пользователя." : userEditing ? "Редактирование профиля пользователя." : "Просмотр профиля пользователя.") : "Создание и редактирование записи."}
            </p>
          </div>
          <div className="modal-head-actions">
            {isUserModal && !isCreateMode ? (
              userEditing ? (
                <>
                  <button className="icon-btn" type="submit" form="record-modal-form" data-tooltip="Сохранить" aria-label="Сохранить">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                      <path d="M5 4h11.59a2 2 0 0 1 1.41.59l1.41 1.41A2 2 0 0 1 20 7.41V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Zm1 2v13h12V8.24L15.76 6H15v4a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V6H6Zm4 0v3h3V6h-3Z" fill="currentColor" />
                    </svg>
                  </button>
                  <button className="icon-btn" type="button" onClick={onClose} data-tooltip="Закрыть" aria-label="Закрыть">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                      <path d="M6.7 6.7a1 1 0 0 1 1.4 0L12 10.58l3.9-3.88a1 1 0 1 1 1.4 1.42L13.42 12l3.88 3.9a1 1 0 1 1-1.42 1.4L12 13.42l-3.9 3.88a1 1 0 0 1-1.4-1.42L10.58 12 6.7 8.1a1 1 0 0 1 0-1.4Z" fill="currentColor" />
                    </svg>
                  </button>
                </>
              ) : (
                <button className="icon-btn" type="button" onClick={() => setUserEditing(true)} data-tooltip="Редактировать" aria-label="Редактировать">
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                    <path d="M15.86 3.49a2 2 0 0 1 2.83 0l1.82 1.82a2 2 0 0 1 0 2.83l-9.9 9.9a1 1 0 0 1-.45.26l-4 1a1 1 0 0 1-1.21-1.21l1-4a1 1 0 0 1 .26-.45l9.9-9.9Zm1.41 1.42-9.67 9.67-.54 2.16 2.16-.54 9.67-9.67-1.62-1.62Z" fill="currentColor" />
                  </svg>
                </button>
              )
            ) : null}
            <button className="close" type="button" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <form className={"stack" + (isUserModal ? " record-user-scroll" : "")} id="record-modal-form" onSubmit={onSubmit}>
          {isUserModal ? (
            <div className="record-user-top">
              <div className="record-user-avatar-area">
                <button
                  type="button"
                  className={"record-user-avatar-shell" + (avatarPreviewSrc ? " interactive" : "")}
                  onClick={() => {
                    if (avatarPreviewSrc) setAvatarPreviewOpen(true);
                  }}
                  disabled={!avatarPreviewSrc}
                  aria-label={avatarPreviewSrc ? "Открыть аватар крупно" : "Аватар не загружен"}
                >
                  <UserAvatar name={userName} email={userEmail} avatarUrl={avatarValue} accessToken={accessToken} size={148} />
                </button>
                {avatarField && (isCreateMode || userEditing) ? (
                  <>
                    <input
                      ref={avatarUploadRef}
                      type="file"
                      accept={avatarField.accept || "image/*"}
                      style={{ display: "none" }}
                      onChange={(event) => {
                        const file = event.target.files && event.target.files[0];
                        if (file && onUploadField) onUploadField(avatarField, file);
                        event.target.value = "";
                      }}
                    />
                    <div className="record-user-avatar-toolbar">
                      <IconButton
                        icon={
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                            <path d="M12 5a1 1 0 0 1 1 1v6.17l2.59-2.58a1 1 0 1 1 1.41 1.42l-4.29 4.29a1 1 0 0 1-1.42 0L7 11.01a1 1 0 1 1 1.41-1.42L11 12.17V6a1 1 0 0 1 1-1Zm-7 12a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" fill="currentColor" />
                          </svg>
                        }
                        tooltip="Загрузить аватар"
                        onClick={() => avatarUploadRef.current?.click()}
                      />
                      <IconButton
                        icon={
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                            <path d="M6.7 6.7a1 1 0 0 1 1.4 0L12 10.58l3.9-3.88a1 1 0 1 1 1.4 1.42L13.42 12l3.88 3.9a1 1 0 1 1-1.42 1.4L12 13.42l-3.9 3.88a1 1 0 0 1-1.4-1.42L10.58 12 6.7 8.1a1 1 0 0 1 0-1.4Z" fill="currentColor" />
                          </svg>
                        }
                        tooltip="Сбросить аватар"
                        onClick={() => {
                          onChange(avatarField.key, "");
                          setAvatarPreviewOpen(false);
                        }}
                        disabled={!avatarValue}
                      />
                    </div>
                  </>
                ) : null}
              </div>
              <div className="record-user-summary">
                <div className="record-user-summary-head">
                  {isCreateMode || userEditing ? renderUserCard("name") : <h4>{userName || "Новый пользователь"}</h4>}
                  {isCreateMode || userEditing ? (
                    <div className="record-user-summary-edit-meta">
                      {renderUserCard("role")}
                      {renderUserCard("is_active")}
                    </div>
                  ) : (
                    <div className="record-user-summary-badges">
                      <span className="record-user-badge">{userRole || "Роль не выбрана"}</span>
                      <span className={"record-user-badge status-" + statusTone}>{activeLabel}</span>
                    </div>
                  )}
                </div>
                <div className="record-user-summary-grid">
                  {isCreateMode || userEditing ? (
                    <>
                      {renderUserCard("email")}
                      {renderUserCard("phone")}
                      {renderUserCard("primary_topic_code")}
                      {renderUserRateCard()}
                      {renderUserCard("password")}
                    </>
                  ) : (
                    <>
                      <div className="record-user-summary-item">
                        <span className="record-user-summary-label">Email</span>
                        <span className="record-user-summary-value">{userEmail || "Не указан"}</span>
                      </div>
                      <div className="record-user-summary-item">
                        <span className="record-user-summary-label">Телефон</span>
                        <span className="record-user-summary-value">{userPhone || "Не указан"}</span>
                      </div>
                      <div className="record-user-summary-item">
                        <span className="record-user-summary-label">Профиль</span>
                        <span className="record-user-summary-value">{userTopic}</span>
                      </div>
                      {renderUserRateCard()}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          {!isUserModal ? (
            <div className="filters" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
              {formFields.map((field) => (
                <div className="field" key={field.key} style={field.fullRow ? { gridColumn: "1 / -1" } : undefined}>
                  <label htmlFor={"record-field-" + field.key}>{field.label}</label>
                  {renderField(field)}
                </div>
              ))}
            </div>
          ) : null}
          {isUserModal && isCreateMode ? (
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button className="btn" type="submit">
                Сохранить
              </button>
              <button className="btn secondary" type="button" onClick={onClose}>
                Отмена
              </button>
            </div>
          ) : null}
          {!isUserModal ? (
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button className="btn" type="submit">
                Сохранить
              </button>
              <button className="btn secondary" type="button" onClick={onClose}>
                Отмена
              </button>
            </div>
          ) : null}
          <StatusLine status={status} />
        </form>
      </div>
      {isUserModal ? (
        <Overlay open={avatarPreviewOpen} id="record-avatar-preview-overlay" onClose={() => setAvatarPreviewOpen(false)}>
          <div className="modal record-avatar-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>{userName || "Аватар пользователя"}</h3>
                <p className="muted" style={{ marginTop: "0.35rem" }}>
                  Простомотр изображения.
                </p>
              </div>
              <button className="close" type="button" onClick={() => setAvatarPreviewOpen(false)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="record-avatar-preview-body">
              {avatarPreviewSrc ? (
                <img className="record-avatar-preview-image" src={avatarPreviewSrc} alt={userName || userEmail || "avatar"} />
              ) : (
                <div className="record-avatar-preview-empty">
                  <UserAvatar name={userName} email={userEmail} avatarUrl="" accessToken={accessToken} size={128} />
                  <span>Аватар еще не загружен</span>
                </div>
              )}
            </div>
          </div>
        </Overlay>
      ) : null}
    </Overlay>
  );
}
