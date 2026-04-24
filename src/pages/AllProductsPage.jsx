import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../utils/api';
import { Empty, Loading, fmtN, ActionTypeBadge, HealthBadge } from '../components/ui';

const fmtDRR = (v) => v ? parseFloat(v).toFixed(2).replace(/\.?0+$/, '') : '—';
const fmtDoc = (v) => (v !== null && v !== undefined && isFinite(v)) ? (Math.round(v * 10) / 10) + 'd' : '—';
const docColor = (v) => {
  if (!v && v !== 0) return 'var(--muted)';
  if (v < 7)    return 'var(--red)';
  if (v < 15)   return 'var(--orange)';
  if (v < 30)   return 'var(--yellow)';
  if (v <= 120) return 'var(--green)';
  if (v <= 150) return 'var(--orange)';
  return 'var(--red)';
};

const ALL_COLUMNS = [
  { key: 'link',          label: 'Link',               always: true },
  { key: 'sku',           label: 'SKU',                always: true },
  { key: 'title',         label: 'Title',              always: true },
  { key: 'ean',           label: 'EAN' },
  { key: 'asin',          label: 'ASIN' },
  { key: 'supplier',      label: 'Supplier' },
  { key: 'category',      label: 'Category' },
  { key: 'whInv',         label: 'WH Inventory' },
  { key: 'amzInv',        label: 'AMZ Inv' },
  { key: 'flkInv',        label: 'FLK Inv' },
  { key: 'zptInv',        label: 'ZPT Inv' },
  { key: 'blkInv',        label: 'BLK Inv' },
  { key: 'amzDRR',        label: 'AMZ DRR' },
  { key: 'flkDRR',        label: 'FLK DRR' },
  { key: 'zptDRR',        label: 'ZPT DRR' },
  { key: 'blkDRR',        label: 'BLK DRR' },
  { key: 'openPO',        label: 'Open PO' },
  { key: 'mfgQty',        label: 'Mfg Qty' },
  { key: 'inTransit',     label: 'In Transit' },
  { key: 'totalInv',      label: 'Total Inv' },
  { key: 'totalDRR',      label: 'Total DRR' },
  { key: 'whDOC',         label: 'WH DOC' },
  { key: 'amzDOC',        label: 'AMZ DOC' },
  { key: 'flkDOC',        label: 'FLK DOC' },
  { key: 'zptDOC',        label: 'ZPT DOC' },
  { key: 'blkDOC',        label: 'BLK DOC' },
  { key: 'companyDOC',    label: 'Company DOC',        always: true },
  { key: 'health',        label: 'Health',             always: true },
  { key: 'suggestQty',    label: 'Suggest Qty' },
  { key: 'actionType',    label: 'Action Type',        always: true },
  { key: 'actionDetails', label: 'Action Details' }
];

const DEFAULT_VISIBLE = new Set([
  'link','sku','title','supplier','category','whInv',
  'amzInv','flkInv','zptInv','blkInv',
  'amzDRR','flkDRR','zptDRR','blkDRR',
  'openPO','mfgQty','totalInv','totalDRR',
  'whDOC','amzDOC','flkDOC','zptDOC','blkDOC',
  'companyDOC','health','suggestQty','actionType','actionDetails'
]);

export default function AllProductsPage({ initialFilter }) {
  const [search,    setSearch]    = useState('');
  const [fSupplier, setFSupplier] = useState('all');
  const [fCategory, setFCategory] = useState('all');
  const [fAlert,    setFAlert]    = useState(initialFilter || 'all');
  const [fAction,   setFAction]   = useState('all');
  const [visible,   setVisible]   = useState(DEFAULT_VISIBLE);
  const [showColPicker, setShowColPicker] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-all'],
    queryFn: () => inventoryApi.getLatest().then(r => r.data)
  });

  const allRows = data?.rows || [];

  const rows = useMemo(() => {
    let r = allRows;
    if (search) { const q = search.toLowerCase(); r = r.filter(x => x.asin?.toLowerCase().includes(q)||x.sku?.toLowerCase().includes(q)||x.title?.toLowerCase().includes(q)||x.ean?.toLowerCase().includes(q)); }
    if (fSupplier !== 'all') r = r.filter(x => x.supplier === fSupplier);
    if (fCategory !== 'all') r = r.filter(x => x.category === fCategory);
    if (fAction   !== 'all') r = r.filter(x => x.actionType === fAction);
    if (fAlert === 'critical')    r = r.filter(x => x.companyDOC !== null && x.companyDOC < 7);
    else if (fAlert === 'urgent') r = r.filter(x => x.companyDOC !== null && x.companyDOC >= 7 && x.companyDOC < 15);
    else if (fAlert === 'po')     r = r.filter(x => x.companyDOC !== null && x.companyDOC >= 15 && x.companyDOC < 30);
    else if (fAlert === 'low')    r = r.filter(x => x.companyDOC !== null && x.companyDOC < 30);
    else if (fAlert === 'dead')   r = r.filter(x => x.companyDOC !== null && x.companyDOC > 180);
    else if (fAlert === 'over')   r = r.filter(x => x.companyDOC !== null && x.companyDOC > 120);
    return r;
  }, [allRows, search, fSupplier, fCategory, fAlert, fAction]);

  const suppliers  = useMemo(() => [...new Set(allRows.map(r => r.supplier).filter(Boolean))].sort(), [allRows]);
  const categories = useMemo(() => [...new Set(allRows.map(r => r.category).filter(Boolean))].sort(), [allRows]);

  const toggleCol = (key) => {
    const col = ALL_COLUMNS.find(c => c.key === key);
    if (col?.always) return;
    const next = new Set(visible);
    next.has(key) ? next.delete(key) : next.add(key);
    setVisible(next);
  };

  const exportCSV = () => {
    const visCols = ALL_COLUMNS.filter(c => visible.has(c.key));
    const headers = visCols.map(c => c.label);
    const body = rows.map(r => visCols.map(c => {
      const v = r[c.key];
      if (c.key === 'title') return `"${(v||'').replace(/"/g,'""')}"`;
      if (['amzDRR','flkDRR','zptDRR','blkDRR','totalDRR'].includes(c.key)) return fmtDRR(v);
      if (c.key.endsWith('DOC')) return v !== null ? (Math.round(v*10)/10) : '';
      if (c.key === 'health') return r.healthStatus || '';
      if (c.key === 'actionType') return v || '';
      if (c.key === 'actionDetails') return `"${(r.actionDetails||'').replace(/"/g,'""')}"`;
      return v ?? '';
    }).join(','));
    const csv = [headers.join(','), ...body].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'inventory_export.csv'; a.click();
  };

  // Summary counts
  const actionCounts = useMemo(() => ({
    supplier_po_required:   allRows.filter(r => r.actionType === 'supplier_po_required').length,
    supplier_po_inprogress: allRows.filter(r => r.actionType === 'supplier_po_inprogress').length,
    platform_po_incoming:   allRows.filter(r => r.actionType === 'platform_po_incoming').length,
    no_action:              allRows.filter(r => r.actionType === 'no_action').length
  }), [allRows]);

  if (isLoading) return <Loading text="Loading products…" />;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="sec" style={{ marginBottom: 0 }}>All Products <small>({rows.length} of {allRows.length} SKUs)</small></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowColPicker(!showColPicker)}>⚙ Columns</button>
          <button className="btn btn-ghost" onClick={exportCSV}>⬇ Export CSV</button>
        </div>
      </div>

      {/* Action Type Summary Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'all',                    label: '📋 All',                   count: allRows.length,                       color: 'var(--text)',    bg: 'var(--bg3)' },
          { key: 'supplier_po_required',   label: '🔴 Supplier PO Required',  count: actionCounts.supplier_po_required,    color: 'var(--red)',     bg: 'var(--red-lt)' },
          { key: 'supplier_po_inprogress', label: '🔵 Supplier PO In Progress',count: actionCounts.supplier_po_inprogress, color: 'var(--blue)',    bg: 'var(--blue-lt)' },
          { key: 'platform_po_incoming',   label: '🟣 Platform PO Incoming',  count: actionCounts.platform_po_incoming,   color: 'var(--purple)',  bg: 'var(--purple-lt)' },
          { key: 'no_action',              label: '✅ No Action',             count: actionCounts.no_action,              color: 'var(--green)',   bg: 'var(--green-lt)' }
        ].map(a => (
          <div key={a.key} onClick={() => setFAction(a.key)}
            style={{ padding: '7px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              background: fAction === a.key ? a.color : a.bg, color: fAction === a.key ? '#fff' : a.color,
              border: `1px solid ${a.color}`, fontWeight: fAction === a.key ? 700 : 500, transition: 'all .13s' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{a.count}</span> {a.label}
          </div>
        ))}
      </div>

      {/* Column picker */}
      {showColPicker && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ width: '100%', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Toggle columns:</div>
          {ALL_COLUMNS.map(col => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: col.always ? 'not-allowed' : 'pointer', opacity: col.always ? .6 : 1 }}>
              <input type="checkbox" checked={visible.has(col.key)} onChange={() => toggleCol(col.key)} disabled={col.always} />
              {col.label}
            </label>
          ))}
          <button className="btn btn-ghost btn-xs" onClick={() => setVisible(new Set(ALL_COLUMNS.map(c => c.key)))}>All</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setVisible(DEFAULT_VISIBLE)}>Reset</button>
        </div>
      )}

      {/* Filters */}
      <div className="filter-row" style={{ marginBottom: 12 }}>
        <input className="filter-input" placeholder="Search SKU / ASIN / EAN / Title…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220 }} />
        <select className="filter-select" value={fSupplier} onChange={e => setFSupplier(e.target.value)}>
          <option value="all">All Suppliers</option>
          {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={fCategory} onChange={e => setFCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={fAlert} onChange={e => setFAlert(e.target.value)}>
          <option value="all">All DOC Levels</option>
          <option value="critical">Critical &lt;7d</option>
          <option value="urgent">Urgent 7–14d</option>
          <option value="po">PO Required 15–29d</option>
          <option value="low">All Low &lt;30d</option>
          <option value="dead">Dead &gt;180d</option>
          <option value="over">Overstock &gt;120d</option>
        </select>
        {(search||fSupplier!=='all'||fCategory!=='all'||fAlert!=='all'||fAction!=='all') && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFSupplier('all'); setFCategory('all'); setFAlert('all'); setFAction('all'); }}>✕ Clear</button>
        )}
        <span className="filter-count" style={{ marginLeft: 'auto' }}>{rows.length} rows</span>
      </div>

      {!rows.length ? <Empty icon="🔍" title="No products found" desc="Try clearing filters." /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{ALL_COLUMNS.filter(c => visible.has(c.key)).map(c => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.asin}>
                  {visible.has('link')          && <td>{r.productLink ? <a className="link-btn" href={r.productLink} target="_blank" rel="noreferrer">↗</a> : '—'}</td>}
                  {visible.has('sku')           && <td style={{ fontWeight:500 }}>{r.sku||'—'}</td>}
                  {visible.has('title')         && <td style={{ maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', fontSize:11 }}>{r.productLink?<a href={r.productLink} target="_blank" rel="noreferrer" style={{ color:'var(--blue)',textDecoration:'none' }}>{r.title||'—'}</a>:r.title||'—'}</td>}
                  {visible.has('ean')           && <td style={{ fontSize:10,color:'var(--subtle)',fontFamily:'monospace' }}>{r.ean||'—'}</td>}
                  {visible.has('asin')          && <td style={{ fontSize:10,color:'var(--muted)',fontFamily:'monospace' }}>{r.asin}</td>}
                  {visible.has('supplier')      && <td><span className="badge badge-supplier">{r.supplier||'—'}</span></td>}
                  {visible.has('category')      && <td style={{ fontSize:11,color:'var(--muted)' }}>{r.category||'—'}</td>}
                  {visible.has('whInv')         && <td style={{ fontWeight:r.whInv===0?700:500, color:r.whInv===0?'var(--red)':'var(--text)' }}>{fmtN(r.whInv)}{r.whInv===0?<span style={{ fontSize:9,marginLeft:4,color:'var(--red)' }}>EMPTY</span>:''}</td>}
                  {visible.has('amzInv')        && <td>{fmtN(r.amzInv)}</td>}
                  {visible.has('flkInv')        && <td>{fmtN(r.flkInv)}</td>}
                  {visible.has('zptInv')        && <td>{fmtN(r.zptInv)}</td>}
                  {visible.has('blkInv')        && <td>{fmtN(r.blkInv)}</td>}
                  {visible.has('amzDRR')        && <td>{fmtDRR(r.amzDRR)}</td>}
                  {visible.has('flkDRR')        && <td>{fmtDRR(r.flkDRR)}</td>}
                  {visible.has('zptDRR')        && <td>{fmtDRR(r.zptDRR)}</td>}
                  {visible.has('blkDRR')        && <td>{fmtDRR(r.blkDRR)}</td>}
                  {visible.has('openPO')        && <td style={{ color:r.openPO>0?'var(--green)':'var(--muted)',fontWeight:r.openPO>0?600:400 }}>{fmtN(r.openPO)}</td>}
                  {visible.has('mfgQty')        && <td style={{ color:r.mfgQty>0?'var(--teal)':'var(--muted)' }}>{fmtN(r.mfgQty)}</td>}
                  {visible.has('inTransit')     && <td style={{ color:r.inTransit>0?'var(--blue)':'var(--muted)' }}>{fmtN(r.inTransit||0)}</td>}
                  {visible.has('totalInv')      && <td style={{ fontWeight:500 }}>{fmtN(r.totalInv)}</td>}
                  {visible.has('totalDRR')      && <td>{fmtDRR(r.totalDRR)}</td>}
                  {visible.has('whDOC')         && <td><span style={{ fontWeight:600,color:docColor(r.whDOC) }}>{fmtDoc(r.whDOC)}</span></td>}
                  {visible.has('amzDOC')        && <td><span style={{ fontWeight:600,color:docColor(r.amzDOC) }}>{fmtDoc(r.amzDOC)}</span></td>}
                  {visible.has('flkDOC')        && <td><span style={{ fontWeight:600,color:docColor(r.flkDOC) }}>{fmtDoc(r.flkDOC)}</span></td>}
                  {visible.has('zptDOC')        && <td><span style={{ fontWeight:600,color:docColor(r.zptDOC) }}>{fmtDoc(r.zptDOC)}</span></td>}
                  {visible.has('blkDOC')        && <td><span style={{ fontWeight:600,color:docColor(r.blkDOC) }}>{fmtDoc(r.blkDOC)}</span></td>}
                  {visible.has('companyDOC')    && <td><span style={{ fontWeight:700,color:docColor(r.companyDOC) }}>{fmtDoc(r.companyDOC)}</span></td>}
                  {visible.has('health')        && <td><HealthBadge status={r.healthStatus} /></td>}
                  {visible.has('suggestQty')    && <td style={{ color:'var(--blue)',fontWeight:600 }}>{r.suggestQty>0?fmtN(r.suggestQty):'—'}</td>}
                  {visible.has('actionType')    && <td><ActionTypeBadge actionType={r.actionType} /></td>}
                  {visible.has('actionDetails') && <td style={{ fontSize:10,color:'var(--muted)',maxWidth:180,whiteSpace:'normal',lineHeight:1.4 }}>{r.actionDetails||'—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
