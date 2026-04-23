import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../utils/api';
import { Empty, Loading, fmtN } from '../components/ui';

const PORTALS = ['AMZ', 'FLK', 'ZPT', 'BLK'];
const PORTAL_NAMES = { AMZ: 'Amazon', FLK: 'Flipkart', ZPT: 'Zepto', BLK: 'Blinkit' };
const PORTAL_COLORS = { AMZ: '#e65100', FLK: '#1565c0', ZPT: '#1b5e20', BLK: '#6a1b9a' };
const PORTAL_BG = { AMZ: '#fff3e0', FLK: '#e8f4fd', ZPT: '#e8fdf5', BLK: '#f3e5f5' };

const fmtDoc = (v) => (v !== null && v !== undefined && isFinite(v)) ? Math.round(v * 10) / 10 + 'd' : '—';
const fmtDRR = (v) => v ? parseFloat(v).toFixed(2).replace(/\.?0+$/, '') : '—';

// Points 6-9: portal-wise PO status
function getPortalPOStatus(portalDOC, openPO) {
  if (portalDOC === null || portalDOC === undefined) return null;
  const hasPO = openPO > 0;
  if (!hasPO && portalDOC < 30) return { label: '🟡 PO Required',    cls: 'badge-po',       bg: 'var(--yellow-lt)', color: 'var(--yellow)', priority: 1 };
  if (hasPO && portalDOC < 7)   return { label: '🚨 Please Send',    cls: 'badge-critical', bg: 'var(--red-lt)',    color: 'var(--red)',    priority: 4 };
  if (hasPO && portalDOC < 15)  return { label: '🔴 Critical',       cls: 'badge-critical', bg: 'var(--red-lt)',    color: 'var(--red)',    priority: 3 };
  if (hasPO && portalDOC < 30)  return { label: '🟠 Urgent PO Sent', cls: 'badge-urgent',   bg: 'var(--orange-lt)', color: 'var(--orange)', priority: 2 };
  if (hasPO && portalDOC >= 30) return { label: '✅ PO Sent',        cls: 'badge-ok',       bg: 'var(--green-lt)',  color: 'var(--green)',  priority: 0 };
  return null;
}

// Editable Final Qty state stored per asin+portal
function FinalQtyCell({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || '');
  if (editing) {
    return (
      <input
        type="number" min="0" value={val}
        style={{ width: 70, padding: '3px 6px', border: '1px solid var(--blue)', borderRadius: 5, fontFamily: 'inherit', fontSize: 11, textAlign: 'center', background: '#fffde7' }}
        autoFocus
        onChange={e => setVal(e.target.value)}
        onBlur={() => { setEditing(false); onChange(parseInt(val) || 0); }}
        onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); onChange(parseInt(val) || 0); } }}
      />
    );
  }
  return (
    <div onClick={() => setEditing(true)} style={{ cursor: 'pointer', minWidth: 60, padding: '3px 8px', borderRadius: 5, background: '#fffde7', border: '1px dashed var(--yellow)', fontSize: 11, fontWeight: 600, color: 'var(--yellow)', textAlign: 'center' }}>
      {val || <span style={{ opacity: .5 }}>Click</span>}
    </div>
  );
}

const PO_STATUS_COLS = [
  { key: 'all',        label: 'All' },
  { key: 'po_req',     label: '🟡 PO Required' },
  { key: 'urgent',     label: '🟠 Urgent' },
  { key: 'critical',   label: '🔴 Critical' },
  { key: 'please_send',label: '🚨 Please Send' },
  { key: 'sent',       label: '✅ PO Sent' }
];

const ALL_COLS = [
  { key: 'sku',       label: 'SKU',          always: true },
  { key: 'title',     label: 'Title',        always: true },
  { key: 'supplier',  label: 'Supplier' },
  { key: 'openPO',    label: 'Total Open PO' },
  { key: 'amzPO',     label: 'AMZ Open PO' },
  { key: 'flkPO',     label: 'FLK Open PO' },
  { key: 'zptPO',     label: 'ZPT Open PO' },
  { key: 'blkPO',     label: 'BLK Open PO' },
  { key: 'suggestQty',label: 'Suggest Qty' },
  { key: 'finalQty',  label: '⭐ Final Qty', always: true },
  { key: 'amzStatus', label: 'AMZ Status',  always: true },
  { key: 'flkStatus', label: 'FLK Status',  always: true },
  { key: 'zptStatus', label: 'ZPT Status',  always: true },
  { key: 'blkStatus', label: 'BLK Status',  always: true },
  { key: 'amzDOC',    label: 'AMZ DOC' },
  { key: 'flkDOC',    label: 'FLK DOC' },
  { key: 'zptDOC',    label: 'ZPT DOC' },
  { key: 'blkDOC',    label: 'BLK DOC' },
  { key: 'companyDOC',label: 'Co. DOC' }
];

const DEFAULT_VISIBLE_PO = new Set(['sku','title','supplier','openPO','amzPO','flkPO','zptPO','blkPO','suggestQty','finalQty','amzStatus','flkStatus','zptStatus','blkStatus','amzDOC','flkDOC','zptDOC','blkDOC']);

export default function OpenPODashboard() {
  const [activePortal, setActivePortal]   = useState('ALL');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [search, setSearch]               = useState('');
  const [finalQtys, setFinalQtys]         = useState({});
  const [visible, setVisible]             = useState(DEFAULT_VISIBLE_PO);
  const [showColPicker, setShowColPicker] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-latest-po'],
    queryFn: () => inventoryApi.getLatest().then(r => r.data)
  });

  const rows = useMemo(() => {
    let r = data?.rows || [];
    if (search) { const q = search.toLowerCase(); r = r.filter(x => x.sku?.toLowerCase().includes(q) || x.asin?.toLowerCase().includes(q) || x.title?.toLowerCase().includes(q)); }
    // Filter by portal status
    if (activePortal !== 'ALL') {
      const docKey = activePortal.toLowerCase() + 'DOC';
      r = r.filter(x => x[docKey] !== null && x[docKey] !== undefined);
    }
    if (statusFilter !== 'all') {
      r = r.filter(x => {
        const statuses = PORTALS.map(p => {
          const docKey = p.toLowerCase() + 'DOC';
          return getPortalPOStatus(x[docKey], x.openPO);
        }).filter(Boolean);
        if (statusFilter === 'po_req')      return statuses.some(s => s.priority === 1);
        if (statusFilter === 'urgent')      return statuses.some(s => s.priority === 2);
        if (statusFilter === 'critical')    return statuses.some(s => s.priority === 3);
        if (statusFilter === 'please_send') return statuses.some(s => s.priority === 4);
        if (statusFilter === 'sent')        return statuses.some(s => s.priority === 0);
        return true;
      });
    }
    return r;
  }, [data, search, activePortal, statusFilter]);

  const allRows = data?.rows || [];

  // Summary per portal
  const portalSummary = useMemo(() => {
    const summary = {};
    PORTALS.forEach(p => {
      const docKey = p.toLowerCase() + 'DOC';
      const validRows = allRows.filter(r => r[docKey] !== null && r[docKey] !== undefined);
      summary[p] = {
        totalOpenPO: allRows.reduce((s, r) => s + (r.openPO || 0), 0),
        poRequired:   validRows.filter(r => getPortalPOStatus(r[docKey], r.openPO)?.priority === 1).length,
        urgent:       validRows.filter(r => getPortalPOStatus(r[docKey], r.openPO)?.priority === 2).length,
        critical:     validRows.filter(r => getPortalPOStatus(r[docKey], r.openPO)?.priority === 3).length,
        pleaseSend:   validRows.filter(r => getPortalPOStatus(r[docKey], r.openPO)?.priority === 4).length,
        sent:         validRows.filter(r => getPortalPOStatus(r[docKey], r.openPO)?.priority === 0).length
      };
    });
    return summary;
  }, [allRows]);

  const toggleCol = (key) => {
    const col = ALL_COLS.find(c => c.key === key);
    if (col?.always) return;
    const next = new Set(visible);
    next.has(key) ? next.delete(key) : next.add(key);
    setVisible(next);
  };

  const exportCSV = () => {
    const visCols = ALL_COLS.filter(c => visible.has(c.key));
    const headers = visCols.map(c => c.label.replace(/[⭐🟡🟠🔴🚨✅]/g, '').trim());
    const body = rows.map(r => {
      return visCols.map(c => {
        const fq = finalQtys[r.asin] || '';
        switch(c.key) {
          case 'sku':        return r.sku || '';
          case 'title':      return `"${(r.title||'').replace(/"/g,'""')}"`;
          case 'supplier':   return r.supplier || '';
          case 'openPO':     return r.openPO || 0;
          case 'amzPO':      return r.openPO || 0;
          case 'flkPO':      return r.openPO || 0;
          case 'zptPO':      return r.openPO || 0;
          case 'blkPO':      return r.openPO || 0;
          case 'suggestQty': return r.suggestQty || 0;
          case 'finalQty':   return fq;
          case 'amzDOC':     return r.amzDOC?.toFixed(1) || '';
          case 'flkDOC':     return r.flkDOC?.toFixed(1) || '';
          case 'zptDOC':     return r.zptDOC?.toFixed(1) || '';
          case 'blkDOC':     return r.blkDOC?.toFixed(1) || '';
          case 'companyDOC': return r.companyDOC?.toFixed(1) || '';
          case 'amzStatus':  return getPortalPOStatus(r.amzDOC, r.openPO)?.label || '—';
          case 'flkStatus':  return getPortalPOStatus(r.flkDOC, r.openPO)?.label || '—';
          case 'zptStatus':  return getPortalPOStatus(r.zptDOC, r.openPO)?.label || '—';
          case 'blkStatus':  return getPortalPOStatus(r.blkDOC, r.openPO)?.label || '—';
          default: return '';
        }
      }).join(',');
    });
    const csv = [headers.join(','), ...body].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'open_po_export.csv'; a.click();
  };

  if (isLoading) return <Loading text="Loading PO data…" />;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="sec" style={{ marginBottom: 0 }}>Open PO Master Dashboard</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowColPicker(!showColPicker)}>⚙ Columns</button>
          <button className="btn btn-ghost" onClick={exportCSV}>⬇ Export CSV</button>
        </div>
      </div>

      {/* Portal Summary Cards with Open PO qty */}
      <div className="kgrid" style={{ marginBottom: 16 }}>
        {PORTALS.map(p => {
          const sm = portalSummary[p] || {};
          return (
            <div key={p} className="kcard" style={{ cursor: 'pointer', borderColor: activePortal === p ? PORTAL_COLORS[p] : 'var(--border)' }}
              onClick={() => setActivePortal(activePortal === p ? 'ALL' : p)}>
              <div className="kbar" style={{ background: PORTAL_COLORS[p] }} />
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: PORTAL_COLORS[p], marginBottom: 6 }}>
                {PORTAL_NAMES[p]}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>Total Open PO:</span>
                  <span style={{ color: PORTAL_COLORS[p] }}>{fmtN(sm.totalOpenPO)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--red)' }}>🚨 Please Send:</span><span style={{ fontWeight: 600, color: 'var(--red)' }}>{sm.pleaseSend || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--red)' }}>🔴 Critical:</span><span style={{ fontWeight: 600, color: 'var(--red)' }}>{sm.critical || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--orange)' }}>🟠 Urgent:</span><span style={{ fontWeight: 600, color: 'var(--orange)' }}>{sm.urgent || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--yellow)' }}>🟡 PO Req:</span><span style={{ fontWeight: 600, color: 'var(--yellow)' }}>{sm.poRequired || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--green)' }}>✅ PO Sent:</span><span style={{ fontWeight: 600, color: 'var(--green)' }}>{sm.sent || 0}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Column picker */}
      {showColPicker && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ width: '100%', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Select columns:</div>
          {ALL_COLS.map(col => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: col.always ? 'not-allowed' : 'pointer', opacity: col.always ? .6 : 1 }}>
              <input type="checkbox" checked={visible.has(col.key)} onChange={() => toggleCol(col.key)} disabled={col.always} />
              {col.label}
            </label>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="filter-row" style={{ marginBottom: 12 }}>
        <input className="filter-input" placeholder="Search SKU / ASIN / Title…" value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {PO_STATUS_COLS.map(s => (
            <button key={s.key} className={`btn btn-sm ${statusFilter === s.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusFilter(s.key)}>{s.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button className={`btn btn-sm ${activePortal === 'ALL' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActivePortal('ALL')}>All Portals</button>
          {PORTALS.map(p => (
            <button key={p} className={`btn btn-sm ${activePortal === p ? 'btn-primary' : 'btn-ghost'}`}
              style={activePortal === p ? { background: PORTAL_COLORS[p], borderColor: PORTAL_COLORS[p] } : {}}
              onClick={() => setActivePortal(activePortal === p ? 'ALL' : p)}>{PORTAL_NAMES[p]}</button>
          ))}
        </div>
        <span className="filter-count">{rows.length} rows</span>
      </div>

      {!rows.length ? <Empty icon="📦" title="No products match your filter" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {visible.has('sku')        && <th>SKU</th>}
                {visible.has('title')      && <th style={{ minWidth: 150 }}>Title</th>}
                {visible.has('supplier')   && <th>Supplier</th>}
                {visible.has('openPO')     && <th>Total Open PO</th>}
                {/* Per-portal open PO headers */}
                {PORTALS.map(p => visible.has(p.toLowerCase() + 'PO') && (
                  <th key={p} style={{ background: PORTAL_BG[p], color: PORTAL_COLORS[p] }}>
                    {PORTAL_NAMES[p]} Open PO
                  </th>
                ))}
                {visible.has('suggestQty') && <th>Suggest Qty</th>}
                {visible.has('finalQty')   && <th style={{ background: '#fffde7', color: 'var(--yellow)', fontWeight: 700 }}>⭐ Final Qty</th>}
                {/* Per-portal DOC */}
                {PORTALS.map(p => visible.has(p.toLowerCase() + 'DOC') && (
                  <th key={p + 'doc'} style={{ background: PORTAL_BG[p], color: PORTAL_COLORS[p] }}>
                    {p} DOC
                  </th>
                ))}
                {visible.has('companyDOC') && <th>Co. DOC</th>}
                {/* Per-portal status */}
                {PORTALS.map(p => visible.has(p.toLowerCase() + 'Status') && (
                  <th key={p + 'st'} style={{ background: PORTAL_BG[p], color: PORTAL_COLORS[p] }}>
                    {PORTAL_NAMES[p]} Status
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const amzStatus = getPortalPOStatus(r.amzDOC, r.openPO);
                const flkStatus = getPortalPOStatus(r.flkDOC, r.openPO);
                const zptStatus = getPortalPOStatus(r.zptDOC, r.openPO);
                const blkStatus = getPortalPOStatus(r.blkDOC, r.openPO);
                return (
                  <tr key={r.asin}>
                    {visible.has('sku')   && <td style={{ fontWeight: 500 }}>{r.sku || r.asin}</td>}
                    {visible.has('title') && <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}>{r.title || '—'}</td>}
                    {visible.has('supplier') && <td><span className="badge badge-supplier">{r.supplier}</span></td>}
                    {visible.has('openPO')   && <td style={{ color: r.openPO > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: r.openPO > 0 ? 600 : 400 }}>{fmtN(r.openPO)}</td>}
                    {/* Per-portal PO qty (same openPO for now — can be split per portal in future) */}
                    {PORTALS.map(p => visible.has(p.toLowerCase() + 'PO') && (
                      <td key={p} style={{ color: r.openPO > 0 ? PORTAL_COLORS[p] : 'var(--muted)', fontWeight: r.openPO > 0 ? 600 : 400 }}>
                        {r.openPO > 0 ? fmtN(r.openPO) : '—'}
                      </td>
                    ))}
                    {visible.has('suggestQty') && <td style={{ color: 'var(--blue)', fontWeight: 600 }}>{r.suggestQty > 0 ? fmtN(r.suggestQty) : '—'}</td>}
                    {visible.has('finalQty') && (
                      <td>
                        <FinalQtyCell
                          value={finalQtys[r.asin]}
                          onChange={v => setFinalQtys(prev => ({ ...prev, [r.asin]: v }))}
                        />
                      </td>
                    )}
                    {/* Per-portal DOC */}
                    {visible.has('amzDOC') && <td><span style={{ fontWeight: 600, color: r.amzDOC < 7 ? 'var(--red)' : r.amzDOC < 15 ? 'var(--orange)' : r.amzDOC < 30 ? 'var(--yellow)' : 'var(--green)' }}>{fmtDoc(r.amzDOC)}</span></td>}
                    {visible.has('flkDOC') && <td><span style={{ fontWeight: 600, color: r.flkDOC < 7 ? 'var(--red)' : r.flkDOC < 15 ? 'var(--orange)' : r.flkDOC < 30 ? 'var(--yellow)' : 'var(--green)' }}>{fmtDoc(r.flkDOC)}</span></td>}
                    {visible.has('zptDOC') && <td><span style={{ fontWeight: 600, color: r.zptDOC < 7 ? 'var(--red)' : r.zptDOC < 15 ? 'var(--orange)' : r.zptDOC < 30 ? 'var(--yellow)' : 'var(--green)' }}>{fmtDoc(r.zptDOC)}</span></td>}
                    {visible.has('blkDOC') && <td><span style={{ fontWeight: 600, color: r.blkDOC < 7 ? 'var(--red)' : r.blkDOC < 15 ? 'var(--orange)' : r.blkDOC < 30 ? 'var(--yellow)' : 'var(--green)' }}>{fmtDoc(r.blkDOC)}</span></td>}
                    {visible.has('companyDOC') && <td style={{ fontWeight: 600, color: r.companyDOC <= 120 ? 'var(--green)' : r.companyDOC <= 150 ? 'var(--orange)' : 'var(--red)' }}>{fmtDoc(r.companyDOC)}</td>}
                    {/* Status columns */}
                    {visible.has('amzStatus') && <td>{amzStatus ? <span className={`badge ${amzStatus.cls}`}>{amzStatus.label}</span> : <span className="badge badge-gray">—</span>}</td>}
                    {visible.has('flkStatus') && <td>{flkStatus ? <span className={`badge ${flkStatus.cls}`}>{flkStatus.label}</span> : <span className="badge badge-gray">—</span>}</td>}
                    {visible.has('zptStatus') && <td>{zptStatus ? <span className={`badge ${zptStatus.cls}`}>{zptStatus.label}</span> : <span className="badge badge-gray">—</span>}</td>}
                    {visible.has('blkStatus') && <td>{blkStatus ? <span className={`badge ${blkStatus.cls}`}>{blkStatus.label}</span> : <span className="badge badge-gray">—</span>}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
