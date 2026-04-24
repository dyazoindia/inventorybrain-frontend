// Shared UI components

const fmtDoc = (v) => (v !== null && v !== undefined && isFinite(v)) ? (Math.round(v * 10) / 10) + 'd' : '—';
const fmtDRR = (v) => v ? parseFloat(v).toFixed(2).replace(/\.?0+$/, '') : '—';

export { fmtDoc, fmtDRR };

export function DocCell({ value }) {
  if (value === null || value === undefined || !isFinite(value)) return <span style={{ color: 'var(--muted)' }}>—</span>;
  const v = fmtDoc(value);
  const color = value < 7 ? 'var(--red)' : value < 15 ? 'var(--orange)' : value < 30 ? 'var(--yellow)' : 'var(--green)';
  return <span style={{ fontWeight: 600, color }}>{v}</span>;
}

export function HealthBadge({ status }) {
  const map = {
    healthy:       { cls: 'badge-healthy', label: '✅ Healthy' },
    unhealthy:     { cls: 'badge-slow',    label: '⚠ Unhealthy' },
    very_unhealthy:{ cls: 'badge-over',    label: '🔴 Very Unhealthy' },
    dead_inventory:{ cls: 'badge-dead',    label: '💀 Dead Inventory' },
    unknown:       { cls: 'badge-gray',    label: 'N/A' }
  };
  const { cls, label } = map[status] || map.unknown;
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function AlertBadge({ level }) {
  const map = {
    critical:    { cls: 'badge-critical', label: '🔴 Critical' },
    urgent:      { cls: 'badge-urgent',   label: '🟠 Urgent' },
    po_required: { cls: 'badge-po',       label: '🟡 PO Required' },
    ok:          { cls: 'badge-ok',       label: '✅ OK' },
    none:        { cls: 'badge-gray',     label: '—' }
  };
  const { cls, label } = map[level] || map.none;
  return <span className={`badge ${cls}`}>{label}</span>;
}

// NEW: Action Type Badge — clear business meaning
export function ActionTypeBadge({ actionType, actionDetails }) {
  const map = {
    supplier_po_required:  { cls: 'badge-critical', label: '🔴 Supplier PO Required',   color: 'var(--red)' },
    supplier_po_inprogress:{ cls: 'badge-confirmed', label: '🔵 Supplier PO In Progress', color: 'var(--blue)' },
    platform_po_incoming:  { cls: 'badge-supplier',  label: '🟣 Platform PO Incoming',   color: 'var(--purple)' },
    no_action:             { cls: 'badge-ok',         label: '✅ No Action Needed',        color: 'var(--green)' }
  };
  const { cls, label } = map[actionType] || map.no_action;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className={`badge ${cls}`} style={{ whiteSpace: 'nowrap' }}>{label}</span>
      {actionDetails && <span style={{ fontSize: 9, color: 'var(--muted)', lineHeight: 1.3, maxWidth: 160, whiteSpace: 'normal' }}>{actionDetails}</span>}
    </div>
  );
}

// Legacy — kept for China/MD dashboards
export function ActionBadge({ action }) {
  const map = {
    need_po:        { cls: 'action-need', label: '⚡ Need PO' },
    no_need:        { cls: 'action-ok',   label: '✓ No Need' },
    stock_ok:       { cls: 'action-ok',   label: '✓ Stock OK' },
    overstock_stop: { cls: 'action-stop', label: '⛔ Stop Purchase' },
    liquidate:      { cls: 'action-stop', label: '🔻 Liquidate' },
    monitor:        { cls: 'badge badge-gray', label: 'Monitor' },
    none:           { cls: 'badge badge-gray', label: '—' }
  };
  const { cls, label } = map[action] || map.none;
  return <span className={cls}>{label}</span>;
}

export function POStatusBadge({ status }) {
  const map = {
    system_suggested:  { cls: 'badge-suggested', label: 'Suggested' },
    supplier_confirmed:{ cls: 'badge-confirmed',  label: 'Confirmed' },
    admin_approved:    { cls: 'badge-approved',   label: 'Approved' },
    in_production:     { cls: 'badge-po',         label: 'In Production' },
    in_transit:        { cls: 'badge-transit',    label: 'In Transit' },
    delivered:         { cls: 'badge-delivered',  label: 'Delivered' },
    rejected:          { cls: 'badge-rejected',   label: 'Rejected' }
  };
  const { cls, label } = map[status] || { cls: 'badge-gray', label: status };
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function SupplierBadge({ supplier }) {
  return <span className="badge badge-supplier">{supplier}</span>;
}

export function KPICard({ label, value, sub, barColor, onClick }) {
  return (
    <div className={`kcard${onClick ? ' clickable' : ''}`} onClick={onClick} style={onClick ? { cursor: 'pointer' } : {}}>
      {barColor && <div className="kbar" style={{ background: barColor }} />}
      <div className="klbl">{label}</div>
      <div className="kval">{value}</div>
      {sub && <div className="ksub">{sub}</div>}
    </div>
  );
}

export function Empty({ icon = '📋', title, desc }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {desc && <p style={{ fontSize: 12, marginTop: 5 }}>{desc}</p>}
    </div>
  );
}

export function Loading({ text = 'Loading…' }) {
  return <div className="loading-center"><span className="spinner" />{text}</div>;
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function POFlowBar({ currentStatus }) {
  const steps = [
    { key: 'system_suggested',   label: 'Suggested' },
    { key: 'supplier_confirmed', label: 'Confirmed' },
    { key: 'admin_approved',     label: 'Approved' },
    { key: 'in_production',      label: 'Production' },
    { key: 'in_transit',         label: 'In Transit' },
    { key: 'delivered',          label: 'Delivered' }
  ];
  const idx = steps.findIndex(s => s.key === currentStatus);
  return (
    <div className="po-flow">
      {steps.map((s, i) => {
        const cls = i < idx ? 'done' : i === idx ? 'active' : '';
        return (
          <div key={s.key} className={`po-step ${cls}`}>
            <span className="step-num">{i < idx ? '✓' : i + 1}</span>
            {s.label}
          </div>
        );
      })}
    </div>
  );
}

export const fmtN = (v) => (parseFloat(v) || 0).toLocaleString('en-IN');
