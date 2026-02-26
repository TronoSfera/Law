import { fmtAmount, fmtDate, statusLabel } from "../../shared/utils.js";

export function DashboardSection({
  dashboardData,
  token,
  status,
  apiCall,
  onOpenRequest,
  DataTableComponent,
  StatusLineComponent,
  UserAvatarComponent,
}) {
  const { useMemo, useState } = React;
  const DataTable = DataTableComponent;
  const StatusLine = StatusLineComponent;
  const UserAvatar = UserAvatarComponent;

  const [lawyerModal, setLawyerModal] = useState({
    open: false,
    loading: false,
    error: "",
    lawyer: null,
    rows: [],
    totals: { amount: 0, salary: 0 },
  });

  const statusCards = useMemo(() => {
    return Object.entries(dashboardData?.byStatus || {})
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), "ru"));
  }, [dashboardData?.byStatus]);

  const fmtThousandsCompact = (value) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return "0";
    return new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(amount / 1000);
  };

  const openLawyerModal = async (lawyerRow) => {
    if (!lawyerRow?.lawyer_id || typeof apiCall !== "function") return;
    setLawyerModal({
      open: true,
      loading: true,
      error: "",
      lawyer: lawyerRow,
      rows: [],
      totals: { amount: 0, salary: 0 },
    });
    try {
      const data = await apiCall("/api/admin/metrics/lawyers/" + encodeURIComponent(String(lawyerRow.lawyer_id)) + "/active-requests");
      setLawyerModal((prev) => ({
        ...prev,
        loading: false,
        error: "",
        rows: Array.isArray(data?.rows) ? data.rows : [],
        totals: {
          amount: Number(data?.totals?.amount || 0),
          salary: Number(data?.totals?.salary || 0),
        },
      }));
    } catch (error) {
      setLawyerModal((prev) => ({ ...prev, loading: false, error: error.message || "Ошибка загрузки" }));
    }
  };

  const closeLawyerModal = () => {
    setLawyerModal({ open: false, loading: false, error: "", lawyer: null, rows: [], totals: { amount: 0, salary: 0 } });
  };

  const lawyerCards = Array.isArray(dashboardData?.lawyerLoads) ? dashboardData.lawyerLoads : [];

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Обзор метрик</h2>
          <p className="muted">Состояние заявок, финансы месяца и загрузка юристов.</p>
        </div>
      </div>

      <div className="cards">
        {(dashboardData?.cards || []).map((card) => (
          <div className="card" key={card.label}>
            <p>{card.label}</p>
            <b>{card.value}</b>
          </div>
        ))}
      </div>

      {statusCards.length ? (
        <div style={{ marginTop: "0.8rem" }}>
          <div className="section-head" style={{ marginBottom: "0.5rem" }}>
            <div>
              <h3 style={{ margin: 0 }}>Статусы заявок</h3>
              <p className="muted" style={{ marginTop: "0.2rem" }}>Текущая раскладка по всем статусам.</p>
            </div>
          </div>
          <div className="cards">
            {statusCards.map((card) => (
              <div className="card" key={"status-" + card.label}>
                <p>{card.label}</p>
                <b>{String(card.value ?? 0)}</b>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {dashboardData?.scope === "LAWYER" ? (
        <div className="json" style={{ marginTop: "0.5rem" }}>
          {JSON.stringify(dashboardData?.myUnreadByEvent || {}, null, 2)}
        </div>
      ) : null}

      <div style={{ marginTop: "0.9rem" }}>
        <h3 style={{ margin: "0 0 0.55rem" }}>Загрузка юристов</h3>
        <div className="lawyer-dashboard-grid">
          {lawyerCards.length ? (
            lawyerCards.map((row) => (
              <button
                key={row.lawyer_id}
                type="button"
                className="lawyer-dashboard-card"
                onClick={() => openLawyerModal(row)}
                title="Открыть детали юриста"
              >
                <div className="lawyer-dashboard-left">
                  <div className="lawyer-dashboard-avatar">
                    <UserAvatar name={row.name} email={row.email} avatarUrl={row.avatar_url} accessToken={token} size={72} />
                  </div>
                  <b className="lawyer-dashboard-name">{row.name || row.email || "-"}</b>
                  <span className="lawyer-dashboard-topic">{row.primary_topic_code || "Тема не указана"}</span>
                </div>
                <div className="lawyer-dashboard-right">
                  <div className="lawyer-metric-pair"><span>В работе</span><b>{String(row.active_load ?? 0)}</b></div>
                  <div className="lawyer-metric-pair"><span>Новые</span><b>{String(row.monthly_assigned_count ?? 0)}</b></div>
                  <div className="lawyer-metric-pair"><span>Закрыто</span><b>{String(row.monthly_completed_count ?? 0)}</b></div>
                  <div className="lawyer-metric-pair"><span>Сумма, тыс.</span><b>{fmtThousandsCompact(row.monthly_paid_gross)}</b></div>
                  <div className="lawyer-metric-pair"><span>ЗП, тыс.</span><b>{fmtThousandsCompact(row.monthly_salary)}</b></div>
                </div>
              </button>
            ))
          ) : (
            <div className="card">
              <p>Юристы</p>
              <b>Нет данных</b>
            </div>
          )}
        </div>
      </div>

      <StatusLine status={status} />

      <div className={"overlay" + (lawyerModal.open ? " open" : "")} onClick={closeLawyerModal}>
        <div className="modal lawyer-dashboard-modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>{lawyerModal.lawyer ? "Юрист: " + (lawyerModal.lawyer.name || lawyerModal.lawyer.email || "-") : "Юрист"}</h3>
              {lawyerModal.lawyer ? (
                <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                  {(lawyerModal.lawyer.primary_topic_code || "Тема не указана") + " • " + (lawyerModal.lawyer.email || "")}
                </p>
              ) : null}
            </div>
            <button className="close" type="button" onClick={closeLawyerModal} aria-label="Закрыть">
              ×
            </button>
          </div>

          {lawyerModal.lawyer ? (
            <div className="lawyer-dashboard-modal-summary">
              <div className="lawyer-dashboard-modal-avatar">
                <UserAvatar
                  name={lawyerModal.lawyer.name}
                  email={lawyerModal.lawyer.email}
                  avatarUrl={lawyerModal.lawyer.avatar_url}
                  accessToken={token}
                  size={84}
                />
              </div>
              <div className="lawyer-dashboard-modal-metrics">
                <div className="lawyer-metric-pair"><span>В работе</span><b>{String(lawyerModal.lawyer.active_load ?? 0)}</b></div>
                <div className="lawyer-metric-pair"><span>Новые</span><b>{String(lawyerModal.lawyer.monthly_assigned_count ?? 0)}</b></div>
                <div className="lawyer-metric-pair"><span>Завершенные</span><b>{String(lawyerModal.lawyer.monthly_completed_count ?? 0)}</b></div>
                <div className="lawyer-metric-pair"><span>Сумма</span><b>{fmtAmount(lawyerModal.lawyer.monthly_paid_gross)}</b></div>
                <div className="lawyer-metric-pair"><span>Зарплата</span><b>{fmtAmount(lawyerModal.lawyer.monthly_salary)}</b></div>
              </div>
            </div>
          ) : null}

          <div className="lawyer-dashboard-modal-scroll">
            {lawyerModal.loading ? <p className="muted">Загрузка активных заявок...</p> : null}
            {lawyerModal.error ? <p className="status error">{lawyerModal.error}</p> : null}
            {!lawyerModal.loading ? (
              <>
                <div className="lawyer-dashboard-modal-table-area">
                  <DataTable
                    headers={[
                      { key: "track_number", label: "Номер" },
                      { key: "status_code", label: "Статус" },
                      { key: "client_name", label: "Клиент" },
                      { key: "created_at", label: "Создана" },
                      { key: "invoice_amount", label: "Сумма по заявке" },
                      { key: "month_paid_amount", label: "Оплаты" },
                      { key: "month_salary_amount", label: "Зарплата" },
                    ]}
                    rows={lawyerModal.rows || []}
                    emptyColspan={7}
                    renderRow={(row) => (
                      <tr key={row.id}>
                        <td>
                          <button
                            type="button"
                            className="request-track-link"
                            onClick={(event) => {
                              if (typeof onOpenRequest === "function") onOpenRequest(row.id, event);
                              closeLawyerModal();
                            }}
                            title="Открыть заявку"
                          >
                            <code>{row.track_number || "-"}</code>
                          </button>
                        </td>
                        <td>{statusLabel(row.status_code)}</td>
                        <td>{row.client_name || "-"}</td>
                        <td>{fmtDate(row.created_at)}</td>
                        <td>{fmtAmount(row.invoice_amount)}</td>
                        <td>{fmtAmount(row.month_paid_amount)}</td>
                        <td>{fmtAmount(row.month_salary_amount)}</td>
                      </tr>
                    )}
                  />
                </div>
              </>
            ) : null}
          </div>
          {!lawyerModal.loading ? (
            <div className="lawyer-dashboard-modal-footer">
              <div className="lawyer-dashboard-total-chip">Активных: <b>{String((lawyerModal.rows || []).length)}</b></div>
              <div className="lawyer-dashboard-total-chip">Оплаты: <b>{fmtAmount(lawyerModal.totals.amount)}</b></div>
              <div className="lawyer-dashboard-total-chip">Зарплата: <b>{fmtAmount(lawyerModal.totals.salary)}</b></div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default DashboardSection;
