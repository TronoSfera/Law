export function MetaSection({ metaEntity, metaJson, status, onEntityChange, onLoad, StatusLineComponent }) {
  const StatusLine = StatusLineComponent;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Схема метаданных</h2>
          <p className="muted">Поля сущностей для meta-driven форм.</p>
        </div>
      </div>
      <div className="filters" style={{ gridTemplateColumns: "1fr auto" }}>
        <div className="field">
          <label htmlFor="meta-entity">Сущность</label>
          <input id="meta-entity" value={metaEntity} placeholder="quotes" onChange={onEntityChange} />
        </div>
        <div style={{ display: "flex", alignItems: "end" }}>
          <button className="btn secondary" type="button" onClick={onLoad}>
            Загрузить
          </button>
        </div>
      </div>
      <div className="json">{metaJson}</div>
      <StatusLine status={status} />
    </>
  );
}

export default MetaSection;
