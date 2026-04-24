import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, supplierPOApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Empty, Loading, fmtN, ActionTypeBadge, HealthBadge } from '../components/ui';
import { useSelection } from '../components/ui/useSelection';
import { exportToCSV } from '../components/ui/exportUtils';
import toast from 'react-hot-toast';

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
  { key: 'link',          label: 'Link' },
  { key: 'sku',           label: 'SKU',         always: true },
  { key: 'title',         label: 'Title',        always: true },
  { key: 'ean',           label: 'EAN' },
  { key: 'asin',          label: 'ASIN' },
  { key: 'supplier',      label: 'Supplier' },
  { key: 'category',      label: 'Category' },
  { key: 'whInv',         label: 'WH Inv' },
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
  { key: 'totalInv',      label: 'Total Inv' },
  { key: 'totalDRR',      label: 'Total DRR' },
  { key: 'whDOC',         label: 'WH DOC' },
  { key: 'amzDOC',        label: 'AMZ DOC' },
  { key: 'flkDOC',        label: 'FLK DOC' },
  { key: 'zptDOC',        label: 'ZPT DOC' },
  { key: 'blkDOC',        label: 'BLK DOC' },
  { key: 'companyDOC',    label: 'Co. DOC',      always: true },
  { key: 'health',        label: 'Health',        always: true },
  { key: 'suggestQty',    label: 'Suggest Qty' },
  { key: 'finalQty',      label: 'Final Qty',     always: true },
  { key: 'actionType',    label: 'Action Type',   always: true },
  { key: 'actionDetails', label: 'Action Details' }
];

const DEFAULT_VISIBLE = new Set([
  'link','sku','title','supplier','category','whInv',
  'amzInv','flkInv','zptInv','blkInv','openPO','mfgQty',
  'amzDRR','flkDRR','zptDRR','blkDRR',
  'whDOC','amzDOC','flkDOC','zptDOC','blkDOC',
  'totalInv','totalDRR','companyDOC','health',
  'suggestQty','finalQty','actionType','actionDetails'
]);

export default function AllProductsPage({ initialFilter, initialSupplier, initialCategory }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const [search,    setSearch]    = useState('');
  const [fSupplier, setFSupplier] = useState(initialSupplier || 'all');
  const [fCategory, setFCategory] = useState(initialCategory || 'all');
  const [fAlert,    setFAlert]    = useState(initialFilter   || 'all');
  const [fAction,   setFAction]   = useState('all');
  const [visible,   setVisible]   = useState(DEFAULT_VISIBLE);
  const [showCols,  setShowCols]  = useState(false);
  const [editQtys,  setEditQtys]  = useState({});  // { asin: val }
  const [editingAsin, setEditingAsin] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-all'],
    queryFn: () => inventoryApi.getLatest().then(r => r.data)
  });

  const { data: poData } = useQuery({
    queryKey: ['pos-all-products'],
    queryFn: () => supplierPOApi.list().then(r => r.data)
  });

  const setFinalQtyMut = useMutation({
    mutationFn: (data) => supplierPOApi.setFinalQty(data),
    onSuccess: () => { toast.success('Final Qty saved!'); qc.invalidateQueries(['pos-all-products']); setEditingAsin(null); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to save')
  });

  const allRows = data?.rows || [];

  // Build PO map for Final Qty display
  const poMap = useMemo(() => {
    const m = {};
    (poData?.purchaseOrders || []).forEach(po => { m[po.asin] = po; });
    return m;
  }, [poData]);

  // FIXED: proper filtering — all conditions AND-ed together
  const rows = useMemo(() => {
    let r = allRows;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(x =>
        x.asin?.toLowerCase().includes(q) ||
        x.sku?.toLowerCase().includes(q)  ||
        x.title?.toLowerCase().includes(q)||
        x.ean?.toLowerCase().includes(q)
      );
    }
    // FIX: Apply supplier AND category filters together (not OR)
    if (fSupplier !== 'all') r = r.filter(x => x.supplier === fSupplier);
    if (fCategory !== 'all') r = r.filter(x => x.category === fCategory);
    if (fAction   !== 'all') r = r.filter(x => x.actionType === fAction);

    // DOC/Alert filter
    if (fAlert === 'critical')   r = r.filter(x => x.companyDOC !== null && x.companyDOC < 7);
    else if (fAlert === 'urgent')r = r.filter(x => x.companyDOC !== null && x.companyDOC >= 7 && x.companyDOC < 15);
    else if (fAlert === 'po')    r = r.filter(x => x.companyDOC !== null && x.companyDOC >= 15 && x.companyDOC < 30);
    else if (fAlert === 'low')   r = r.filter(x => x.companyDOC !== null && x.companyDOC < 30);
    else if (fAlert === 'dead')  r = r.filter(x => x.companyDOC !== null && x.companyDOC > 180);
    else if (fAlert === 'over')  r = r.filter(x => x.companyDOC !== null && x.companyDOC > 120);
    return r;
  }, [allRows, search, fSupplier, fCategory, fAlert, fAction]);

  // FIXED: action counts computed from allRows (not filtered)
  const actionCounts = useMemo(() => ({
    supplier_po_required:   allRows.filter(r => r.actionType === 'supplier_po_required').length,
    supplier_po_inprogress: allRows.filter(r => r.actionType === 'supplier_po_inprogress').length,
    platform_po_incoming:   allRows.filter(r => r.actionType === 'platform_po_incoming').length,
    no_action:              allRows.filter(r => r.actionType === 'no_action').length
  }), [allRows]);

  const suppliers  = useMemo(() => [...new Set(allRows.map(r => r.supplier).filter(Boolean))].sort(), [allRows]);
  const categories = useMemo(() => {
    // If supplier filter active, only show categories for that supplier
    const base = fSupplier !== 'all' ? allRows.filter(r => r.supplier === fSupplier) : allRows;
    return [...new Set(base.map(r => r.category).filter(Boolean))].sort();
  }, [allRows, fSupplier]);

  const { selected, toggle, toggleAll, clear, isAllSelected, isSomeSelected, selectedRows, count } = useSelection(rows);

  const toggleCol = (key) => {
    const col = ALL_COLUMNS.find(c => c.key === key);
    if (col?.always) return;
    const next = new Set(visible);
    next.has(key) ? next.delete(key) : next.add(key);
    setVisible(next);
  };

  const doExport = useCallback((exportRows) => {
    const visCols = ALL_COLUMNS.filter(c => visible.has(c.key));
    exportToCSV(exportRows, visCols.map(c => ({
      key: c.key, label: c.label,
      getValue: (r) => {
        const po = poMap[r.asin];
        switch(c.key) {
          case 'link': return r.productLink || '';
          case 'ean':  return r.ean || '';
          case 'asin': return r.asin || '';
          case 'sku':  return r.sku || '';
          case 'title': return r.title || '';
          case 'supplier': return r.supplier || '';
          case 'category': return r.category || '';
          case 'amzDRR': case 'flkDRR': case 'zptDRR': case 'blkDRR': case 'totalDRR': return fmtDRR(r[c.key]);
          case 'whDOC': case 'amzDOC': case 'flkDOC': case 'zptDOC': case 'blkDOC': case 'companyDOC': return r[c.key] !== null ? (Math.round(r[c.key]*10)/10) : '';
          case 'health': return r.healthStatus || '';
          case 'actionType': return r.actionType || '';
          case 'actionDetails': return r.actionDetails || '';
          case 'finalQty': return po?.finalQty || '';
          default: return r[c.key] ?? '';
        }
      }
    })), `inventory_${fSupplier !== 'all' ? fSupplier + '_' : ''}export`);
  }, [visible, poMap, fSupplier]);

  const saveFinalQty = (asin) => {
    const qty = parseInt(editQtys[asin]);
    if (isNaN(qty) || qty < 0) { toast.error('Enter a valid quantity'); return; }
    const row = allRows.find(r => r.asin === asin);
    setFinalQtyMut.mutate({ asin, finalQty: qty });
  };

  if (isLoading) return <Loading text="Loading products…" />;

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div className="sec" style={{ marginBottom:0 }}>
          All Products <small>({rows.length} of {allRows.length} SKUs)</small>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {count > 0 && (
            <button className="btn btn-success btn-sm" onClick={() => doExport(selectedRows)}>
              ⬇ Export Selected ({count})
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => doExport(rows)}>⬇ Export All</button>
          <button className="btn btn-ghost" onClick={() => setShowCols(!showCols)}>⚙ Columns</button>
        </div>
      </div>

      {/* Action Type Summary Chips — FIXED counts from allRows */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
        {[
          { key:'all',                    label:'📋 All',                    count:allRows.length,                       color:'var(--text)',   bg:'var(--bg3)',        border:'var(--border)' },
          { key:'supplier_po_required',   label:'🔴 Supplier PO Required',   count:actionCounts.supplier_po_required,   color:'var(--red)',    bg:'var(--red-lt)',     border:'rgba(220,38,38,.3)' },
          { key:'supplier_po_inprogress', label:'🔵 Supplier PO In Progress',count:actionCounts.supplier_po_inprogress, color:'var(--blue)',   bg:'var(--blue-lt)',    border:'rgba(59,111,245,.3)' },
          { key:'platform_po_incoming',   label:'🟣 Platform PO Incoming',   count:actionCounts.platform_po_incoming,   color:'var(--purple)', bg:'var(--purple-lt)', border:'rgba(124,92,191,.3)' },
          { key:'no_action',              label:'✅ No Action',              count:actionCounts.no_action,              color:'var(--green)',  bg:'var(--green-lt)',   border:'rgba(22,163,74,.3)' }
        ].map(a => (
          <div key={a.key} onClick={() => setFAction(a.key)}
            style={{ padding:'7px 14px', borderRadius:20, fontSize:12, cursor:'pointer',
              display:'flex', alignItems:'center', gap:6,
              background: fAction === a.key ? a.color : a.bg,
              color: fAction === a.key ? '#fff' : a.color,
              border:`1px solid ${a.border}`,
              fontWeight: fAction === a.key ? 700 : 500, transition:'all .13s' }}>
            <span style={{ fontWeight:700, fontSize:15 }}>{a.count}</span> {a.label}
          </div>
        ))}
      </div>

      {/* Column picker */}
      {showCols && (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:14, marginBottom:14, display:'flex', flexWrap:'wrap', gap:8 }}>
          <div style={{ width:'100%', fontWeight:600, fontSize:12, marginBottom:4 }}>Toggle columns:</div>
          {ALL_COLUMNS.map(col => (
            <label key={col.key} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, cursor:col.always?'not-allowed':'pointer', opacity:col.always?.6:1 }}>
              <input type="checkbox" checked={visible.has(col.key)} onChange={() => toggleCol(col.key)} disabled={col.always} />
              {col.label}
            </label>
          ))}
          <button className="btn btn-ghost btn-xs" onClick={() => setVisible(new Set(ALL_COLUMNS.map(c=>c.key)))}>All</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setVisible(DEFAULT_VISIBLE)}>Reset</button>
        </div>
      )}

      {/* Filters */}
      <div className="filter-row" style={{ marginBottom:12 }}>
        <input className="filter-input" placeholder="Search SKU / ASIN / EAN / Title…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ width:220 }} />

        <select className="filter-select" value={fSupplier}
          onChange={e => { setFSupplier(e.target.value); setFCategory('all'); }}>
          <option value="all">All Suppliers</option>
          {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select className="filter-select" value={fCategory} onChange={e => setFCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select className="filter-select" value={fAlert} onChange={e => setFAlert(e.target.value)}>
          <option value="all">All DOC Levels</option>
          <option value="critical">🔴 Critical &lt;7d</option>
          <option value="urgent">🟠 Urgent 7–14d</option>
          <option value="po">🟡 PO Required 15–29d</option>
          <option value="low">All Low &lt;30d</option>
          <option value="dead">Dead &gt;180d</option>
          <option value="over">Overstock &gt;120d</option>
        </select>

        {(search||fSupplier!=='all'||fCategory!=='all'||fAlert!=='all'||fAction!=='all') && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFSupplier('all'); setFCategory('all'); setFAlert('all'); setFAction('all'); }}>✕ Clear</button>
        )}
        <span className="filter-count" style={{ marginLeft:'auto' }}>{rows.length} rows shown</span>
      </div>

      {/* Selection bar */}
      {count > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--blue-lt)', border:'1px solid rgba(59,111,245,.2)', borderRadius:8, padding:'8px 14px', marginBottom:10 }}>
          <span style={{ fontSize:12, color:'var(--blue)', fontWeight:500 }}>{count} row{count!==1?'s':''} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={clear}>✕ Clear</button>
          <button className="btn btn-success btn-sm" onClick={() => doExport(selectedRows)}>⬇ Export Selected</button>
        </div>
      )}

      {!rows.length
        ? <Empty icon="🔍" title="No products found" desc="Try clearing filters." />
        : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width:32 }}>
                    <input type="checkbox" checked={isAllSelected} ref={el => { if(el) el.indeterminate=isSomeSelected; }}
                      onChange={e => toggleAll(e.target.checked)} style={{ cursor:'pointer' }} />
                  </th>
                  {ALL_COLUMNS.filter(c => visible.has(c.key)).map(c => (
                    <th key={c.key} style={c.key==='finalQty'?{background:'#fffde7',color:'var(--yellow)',fontWeight:700}:{}}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const po = poMap[r.asin];
                  const isEditing = editingAsin === r.asin;
                  const fq = editQtys[r.asin] !== undefined ? editQtys[r.asin] : (po?.finalQty ?? '');
                  return (
                    <tr key={r.asin} style={{ background: selected.has(r.asin) ? 'var(--blue-lt)' : '' }}>
                      <td>
                        <input type="checkbox" checked={selected.has(r.asin)} onChange={() => toggle(r.asin)} style={{ cursor:'pointer' }} />
                      </td>
                      {visible.has('link')       && <td>{r.productLink?<a className="link-btn" href={r.productLink} target="_blank" rel="noreferrer">↗</a>:'—'}</td>}
                      {visible.has('sku')        && <td style={{ fontWeight:500 }}>{r.sku||'—'}</td>}
                      {visible.has('title')      && <td style={{ maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', fontSize:11 }}>{r.productLink?<a href={r.productLink} target="_blank" rel="noreferrer" style={{ color:'var(--blue)',textDecoration:'none' }}>{r.title||'—'}</a>:r.title||'—'}</td>}
                      {visible.has('ean')        && <td style={{ fontSize:10,color:'var(--subtle)',fontFamily:'monospace' }}>{r.ean||'—'}</td>}
                      {visible.has('asin')       && <td style={{ fontSize:10,color:'var(--muted)',fontFamily:'monospace' }}>{r.asin}</td>}
                      {visible.has('supplier')   && <td><span className="badge badge-supplier">{r.supplier||'—'}</span></td>}
                      {visible.has('category')   && <td style={{ fontSize:11,color:'var(--muted)' }}>{r.category||'—'}</td>}
                      {visible.has('whInv')      && <td style={{ fontWeight:r.whInv===0?700:500, color:r.whInv===0?'var(--red)':'var(--text)' }}>{fmtN(r.whInv)}{r.whInv===0?<span style={{ fontSize:9,marginLeft:3,color:'var(--red)' }}>EMPTY</span>:''}</td>}
                      {visible.has('amzInv')     && <td>{fmtN(r.amzInv)}</td>}
                      {visible.has('flkInv')     && <td>{fmtN(r.flkInv)}</td>}
                      {visible.has('zptInv')     && <td>{fmtN(r.zptInv)}</td>}
                      {visible.has('blkInv')     && <td>{fmtN(r.blkInv)}</td>}
                      {visible.has('amzDRR')     && <td>{fmtDRR(r.amzDRR)}</td>}
                      {visible.has('flkDRR')     && <td>{fmtDRR(r.flkDRR)}</td>}
                      {visible.has('zptDRR')     && <td>{fmtDRR(r.zptDRR)}</td>}
                      {visible.has('blkDRR')     && <td>{fmtDRR(r.blkDRR)}</td>}
                      {visible.has('openPO')     && <td style={{ color:r.openPO>0?'var(--green)':'var(--muted)',fontWeight:r.openPO>0?600:400 }}>{fmtN(r.openPO)}</td>}
                      {visible.has('mfgQty')     && <td>{fmtN(r.mfgQty)}</td>}
                      {visible.has('totalInv')   && <td style={{ fontWeight:500 }}>{fmtN(r.totalInv)}</td>}
                      {visible.has('totalDRR')   && <td>{fmtDRR(r.totalDRR)}</td>}
                      {visible.has('whDOC')      && <td><span style={{ fontWeight:600,color:docColor(r.whDOC) }}>{fmtDoc(r.whDOC)}</span></td>}
                      {visible.has('amzDOC')     && <td><span style={{ fontWeight:600,color:docColor(r.amzDOC) }}>{fmtDoc(r.amzDOC)}</span></td>}
                      {visible.has('flkDOC')     && <td><span style={{ fontWeight:600,color:docColor(r.flkDOC) }}>{fmtDoc(r.flkDOC)}</span></td>}
                      {visible.has('zptDOC')     && <td><span style={{ fontWeight:600,color:docColor(r.zptDOC) }}>{fmtDoc(r.zptDOC)}</span></td>}
                      {visible.has('blkDOC')     && <td><span style={{ fontWeight:600,color:docColor(r.blkDOC) }}>{fmtDoc(r.blkDOC)}</span></td>}
                      {visible.has('companyDOC') && <td><span style={{ fontWeight:700,color:docColor(r.companyDOC) }}>{fmtDoc(r.companyDOC)}</span></td>}
                      {visible.has('health')     && <td><HealthBadge status={r.healthStatus} /></td>}
                      {visible.has('suggestQty') && <td style={{ color:'var(--blue)',fontWeight:600 }}>{r.suggestQty>0?fmtN(r.suggestQty):'—'}</td>}
                      {visible.has('finalQty')   && (
                        <td style={{ background:'#fffde7' }}>
                          {isAdmin ? (
                            isEditing ? (
                              <div style={{ display:'flex', gap:4 }}>
                                <input type="number" min="0" value={fq}
                                  onChange={e => setEditQtys(p => ({...p,[r.asin]:e.target.value}))}
                                  style={{ width:70, padding:'3px 6px', border:'1px solid var(--blue)', borderRadius:5, fontFamily:'inherit', fontSize:12, textAlign:'center' }}
                                  autoFocus onKeyDown={e=>{ if(e.key==='Enter')saveFinalQty(r.asin); if(e.key==='Escape')setEditingAsin(null); }} />
                                <button className="btn btn-success btn-xs" onClick={()=>saveFinalQty(r.asin)}>✓</button>
                                <button className="btn btn-ghost btn-xs" onClick={()=>setEditingAsin(null)}>✕</button>
                              </div>
                            ) : (
                              <div onClick={() => { setEditingAsin(r.asin); setEditQtys(p=>({...p,[r.asin]:po?.finalQty||''})); }}
                                style={{ cursor:'pointer', minWidth:60, padding:'3px 8px', borderRadius:5, background:po?.finalQty?'var(--green-lt)':'#fffde7', border:`1px dashed ${po?.finalQty?'var(--green)':'var(--yellow)'}`, fontSize:12, fontWeight:600, color:po?.finalQty?'var(--green)':'var(--yellow)', textAlign:'center' }}>
                                {po?.finalQty ? fmtN(po.finalQty) : <span style={{ opacity:.5 }}>Set Qty</span>}
                              </div>
                            )
                          ) : (
                            <span style={{ fontSize:12, fontWeight:600, color:po?.finalQty?'var(--green)':'var(--muted)' }}>
                              {po?.finalQty ? fmtN(po.finalQty) : '—'}
                            </span>
                          )}
                        </td>
                      )}
                      {visible.has('actionType')    && <td><ActionTypeBadge actionType={r.actionType} /></td>}
                      {visible.has('actionDetails') && <td style={{ fontSize:10,color:'var(--muted)',maxWidth:160,whiteSpace:'normal',lineHeight:1.4 }}>{r.actionDetails||'—'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  );
}
