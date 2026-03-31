const { useEffect, useMemo, useRef, useState } = React;

export function DropdownField({
  id,
  value,
  onChange,
  options,
  placeholder = "Выберите значение",
  disabled = false,
  className = "",
  ariaLabel = "",
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const normalizedOptions = useMemo(
    () =>
      (Array.isArray(options) ? options : []).map((option) => ({
        value: String(option?.value ?? ""),
        label: String(option?.label ?? option?.value ?? ""),
        disabled: Boolean(option?.disabled),
      })),
    [options]
  );
  const currentValue = String(value ?? "");
  const currentOption = normalizedOptions.find((option) => option.value === currentValue) || null;

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  return (
    <div className={"dropdown-field" + (open ? " open" : "") + (disabled ? " disabled" : "") + (className ? " " + className : "")} ref={rootRef}>
      <button
        id={id}
        type="button"
        className="dropdown-field-trigger"
        aria-label={ariaLabel || placeholder}
        aria-haspopup="listbox"
        aria-expanded={open ? "true" : "false"}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={"dropdown-field-label" + (currentOption ? "" : " placeholder")}>
          {currentOption ? currentOption.label : placeholder}
        </span>
        <svg className="dropdown-field-caret" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" focusable="false">
          <path d="M3.2 4.8a.75.75 0 0 1 1.06 0L7 7.54 9.74 4.8a.75.75 0 1 1 1.06 1.06L7.53 9.13a.75.75 0 0 1-1.06 0L3.2 5.86a.75.75 0 0 1 0-1.06Z" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div className="dropdown-field-menu" role="listbox" aria-labelledby={id}>
          {normalizedOptions.length ? (
            normalizedOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                className={"dropdown-field-option" + (option.value === currentValue ? " selected" : "")}
                aria-selected={option.value === currentValue ? "true" : "false"}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  setOpen(false);
                  if (typeof onChange === "function") onChange(option.value);
                }}
              >
                {option.label}
              </button>
            ))
          ) : (
            <div className="dropdown-field-empty">Нет доступных значений</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
