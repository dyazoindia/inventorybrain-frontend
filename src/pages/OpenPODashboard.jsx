import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portalPOApi, inventoryApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Empty, Loading, fmtN } from '../components/ui';
import { useSelection } from '../components/ui/useSelection';
import { exportToCSV } from '../components/ui/exportUtils';
import toast from 'react-hot-toast';

const PORTALS = ['AMZ','FLK','ZPT','BLK'];
const PORTAL_NAMES   = { AMZ:'Amazon', FLK:'Flipkart', ZPT:'Zepto', BLK:'Blinkit' };
const PORTAL_COLORS  = { AMZ:'#e65100', FLK:'#1565c0', ZPT:'#1b5e20', BLK:'#6a1b9a' };
const PORTAL_BG      = { AMZ:'#fff3e0', FLK:'#e8f4fd', ZPT:'#e8fdf5', BLK:'#f3e5f5' };

const fmtDoc = (v) => (v !== null && v !== undefined && isFinite(v)) ? (Math.round(v*10)/10)+'d' : '—';
const docCol = (v) => !v&&v!==0?'var(--muted)':v<7?'var(--red)':v<15?'var(--orange)':v<30?'var(--yellow)':'var(--green)';

function StatusBadge({ status }) {
  const m = {
    open:             { cls:'badge-po',       label:'🟡 Open' },
    partially_shipped:{ cls:'badge-urgent',   label:'🟠 Part. Shipped' },
    fully_shipped:    { cls:'badge-transit',  label:'🔵 Shipped' },
    delivered:        { cls:'badge-delivered',label:'✅ Delivered' }
  };
  const { cls, label } = m[status] || m.open;
  return <span className={`badge ${cls}`}>{label}</span>;
}

function EditableQtyCell({ value, onSave, label, disabled }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || 0);
  if (disabled) return <span style={{ color:'var(--muted)',fontSize:12 }}>—</span>;
  if (!editing) return (
    <div onClick={() => setEditing(true)} style={{ cursor:'pointer', padding:'3px 8px', borderRadius:5, background:'var(--bg3)', border:'1px dashed var(--border2)', fontSize:12, fontWeight:500, color:'var(--text)', minWidth:50, textAlign:'center' }}>
      {value ?? <span style={{ opacity:.5 }}>{label}</span>}
    </div>
  );
  return (
    <div style={{ display:'flex', gap:4 }}>
      <input type="number" min="0" value={val} autoFocus onChange={e=>setVal(e.target.value)}
        style={{ width:65, padding:'3px 6px', border:'1px solid var(--blue)', borderRadius:5, fontFamily:'inherit', fontSize:12, textAlign:'center' }}
        onKeyDown={e=>{ if(e.key==='Enter'){setEditing(false);onSave(parseInt(val)||0);} if(e.key==='Escape')setEditing(false); }} />
      <button className="btn btn-success btn-xs" onClick={()=>{setEditing(false);onSave(parseInt(val)||0);}}>✓</button>
      <button className="btn btn-ghost btn-xs" onClick={()=>setEditing(false)}>✕</button>
    </div>
  );
}

export default function OpenPODashboard() {
  const { isAdmin, user } = useAuth();
  const isOps = user?.role === 'operations';
  const qc = useQueryClient();
  const [activePortal, setActivePortal] = useState('AMZ');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPO, setNewPO] = useState({ asin:'', openPOQty:'', poReference:'', notes:'' });

  // Fetch portal POs for active portal
  const { data: poData, isLoading } = useQuery({
    queryKey: ['portal-po', activePortal],
    queryFn: () => portalPOApi.list({ portal: activePortal }).then(r => r.data)
  });

  // Fetch inventory for WH stock display
  const { data: invData } = useQuery({
    queryKey: ['inventory-all'],
    queryFn: () => inventoryApi.getLatest().then(r => r.data)
  });

  // Fetch summary for all portals
  const { data: summaryData } = useQuery({
    queryKey: ['portal-po-summary'],
    queryFn: () => portalPOApi.summary().then(r => r.data)
  });

  const shipMut = useMutation({
    mutationFn: ({ id, shippedQty }) => portalPOApi.ship(id, { shippedQty }),
    onSuccess: () => { toast.success('Shipped qty updated'); qc.invalidateQueries(['portal-po']); qc.invalidateQueries(['portal-po-summary']); },
    onError: err => toast.error(err.response?.data?.error || 'Failed')
  });

  const deliverMut = useMutation({
    mutationFn: ({ id, deliveredQty }) => portalPOApi.deliver(id, { deliveredQty }),
    onSuccess: () => { toast.success('Marked as delivered'); qc.invalidateQueries(['portal-po']); qc.invalidateQueries(['portal-po-summary']); },
    onError: err => toast.error(err.response?.data?.error || 'Failed')
  });

  const createMut = useMutation({
    mutationFn: (data) => portalPOApi.create(data),
    onSuccess: () => { toast.success('Portal PO created!'); qc.invalidateQueries(['portal-po']); qc.invalidateQueries(['portal-po-summary']); setShowAddModal(false); setNewPO({ asin:'',openPOQty:'',poReference:'',notes:'' }); },
    onError: err => toast.error(err.response?.data?.error || 'Failed')
  });

  const allPOs = poData?.portalPOs || [];

  // Build WH inventory map
  const whMap = useMemo(() => {
    const m = {};
    (invData?.rows || []).forEach(r => { m[r.asin] = r.whInv; });
    return m;
  }, [invData]);

  // Build portal summary map
  const summaryMap = useMemo(() => {
    const m = {};
    (summaryData?.summary || []).forEach(s => {
      const p = s._id.portal;
      if (!m[p]) m[p] = { open:0, partially_shipped:0, fully_shipped:0, delivered:0, totalOpen:0, totalPending:0 };
      m[p][s._id.status] = (m[p][s._id.status] || 0) + s.count;
      m[p].totalOpen    += s.totalOpen || 0;
      m[p].totalPending += Math.max(0, s.totalPending || 0);
    });
    return m;
  }, [summaryData]);

  // Filter
  const rows = useMemo(() => {
    let r = allPOs;
    if (statusFilter !== 'all') r = r.filter(x => x.status === statusFilter);
    if (search) { const q = search.toLowerCase(); r = r.filter(x => x.sku?.toLowerCase().includes(q)||x.asin?.toLowerCase().includes(q)||x.title?.toLowerCase().includes(q)); }
    return r;
  }, [allPOs, statusFilter, search]);

  const { selected, toggle, toggleAll, clear, isAllSelected, isSomeSelected, selectedRows, count } = useSelection(rows, '_id');

  const doExport = () => {
    const cols = [
      { key:'sku', label:'SKU' }, { key:'title', label:'Title' }, { key:'portal', label:'Portal' },
      { key:'openPOQty', label:'Open PO Qty' }, { key:'shippedQty', label:'Shipped Qty' },
      { key:'pendingQty', label:'Pending Qty', getValue: r => Math.max(0,(r.openPOQty||0)-(r.shippedQty||0)) },
      { key:'deliveredQty', label:'Delivered Qty' }, { key:'status', label:'Status' },
      { key:'whInv', label:'WH Inv', getValue: r => whMap[r.asin] ?? '' }
    ];
    exportToCSV(count>0?selectedRows:rows, cols, `portal_po_${activePortal}`);
  };

  if (isLoading) return <Loading text="Loading PO data…" />;

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div className="sec" style={{ marginBottom:0 }}>Open PO Dashboard <small>— Platform Orders</small></div>
        <div style={{ display:'flex', gap:8 }}>
          {(isAdmin||isOps) && <button className="btn btn-primary btn-sm" onClick={()=>setShowAddModal(true)}>+ Add Portal PO</button>}
          <button className="btn btn-ghost" onClick={doExport}>⬇ Export {count>0?`(${count})`:'All'}</button>
        </div>
      </div>

      {/* Portal Tabs */}
      <div style={{ display:'flex', gap:0, marginBottom:16, borderRadius:10, overflow:'hidden', border:'1px solid var(--border)', width:'fit-content' }}>
        {PORTALS.map(p => {
          const sm = summaryMap[p] || {};
          const active = activePortal === p;
          return (
            <button key={p} onClick={() => setActivePortal(p)}
              style={{ padding:'10px 18px', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:active?700:500,
                background: active ? PORTAL_COLORS[p] : PORTAL_BG[p],
                color: active ? '#fff' : PORTAL_COLORS[p],
                borderRight: p !== 'BLK' ? `1px solid ${PORTAL_COLORS[p]}30` : 'none',
                transition:'all .15s' }}>
              {PORTAL_NAMES[p]}
              {sm.open > 0 && <span style={{ marginLeft:6, background: active?'rgba(255,255,255,.25)':'rgba(0,0,0,.1)', borderRadius:10, padding:'1px 6px', fontSize:10 }}>{sm.open}</span>}
            </button>
          );
        })}
      </div>

      {/* Portal Summary Cards */}
      {(() => {
        const sm = summaryMap[activePortal] || {};
        const total = Object.values(sm).reduce((a,b)=>typeof b==='number'?a+b:a, 0);
        return (
          <div className="kgrid" style={{ marginBottom:16 }}>
            {[
              { label:'Open Orders', val:sm.open||0, color:PORTAL_COLORS[activePortal], filter:'open' },
              { label:'Partly Shipped', val:sm.partially_shipped||0, color:'var(--orange)', filter:'partially_shipped' },
              { label:'Fully Shipped', val:sm.fully_shipped||0, color:'var(--teal)', filter:'fully_shipped' },
              { label:'Delivered', val:sm.delivered||0, color:'var(--green)', filter:'delivered' },
              { label:'Total Open PO Qty', val:fmtN(sm.totalOpen||0), color:'var(--blue)', filter:null },
              { label:'Pending Dispatch', val:fmtN(Math.max(0,sm.totalPending||0)), color:'var(--red)', filter:null }
            ].map(c => (
              <div key={c.label} className="kcard" style={{ cursor:c.filter?'pointer':'default' }}
                onClick={() => c.filter && setStatusFilter(statusFilter===c.filter?'all':c.filter)}>
                <div className="kbar" style={{ background:c.color }} />
                <div className="klbl">{c.label}</div>
                <div className="kval" style={{ color:c.color }}>{c.val}</div>
                {c.filter && <div style={{ fontSize:10,color:'var(--blue)',marginTop:4 }}>Click to filter →</div>}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Info box */}
      <div className="info-box" style={{ marginBottom:14 }}>
        📦 <strong>Portal PO Logic:</strong> Open PO = Platform generated demand | Pending = Open PO − Shipped | Ops team updates Shipped Qty | Admin marks Delivered
      </div>

      {/* Filters */}
      <div className="filter-row" style={{ marginBottom:12 }}>
        <input className="filter-input" placeholder="Search SKU / ASIN…" value={search} onChange={e=>setSearch(e.target.value)} />
        <div style={{ display:'flex', gap:4 }}>
          {['all','open','partially_shipped','fully_shipped','delivered'].map(s => (
            <button key={s} className={`btn btn-sm ${statusFilter===s?'btn-primary':'btn-ghost'}`}
              onClick={() => setStatusFilter(s)}>
              {s==='all'?'All':s==='partially_shipped'?'Part. Shipped':s==='fully_shipped'?'Shipped':s.charAt(0).toUpperCase()+s.slice(1)}
            </button>
          ))}
        </div>
        <span className="filter-count" style={{ marginLeft:'auto' }}>{rows.length} rows</span>
      </div>

      {/* Selection bar */}
      {count > 0 && (
        <div style={{ display:'flex',alignItems:'center',gap:10,background:'var(--blue-lt)',border:'1px solid rgba(59,111,245,.2)',borderRadius:8,padding:'8px 14px',marginBottom:10 }}>
          <span style={{ fontSize:12,color:'var(--blue)',fontWeight:500 }}>{count} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={clear}>✕</button>
          <button className="btn btn-success btn-sm" onClick={doExport}>⬇ Export</button>
        </div>
      )}

      {!rows.length ? (
        <Empty icon="📦" title={`No ${PORTAL_NAMES[activePortal]} POs found`}
          desc={isAdmin||isOps ? 'Add portal POs using the + button above.' : 'No open POs for this portal yet.'} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width:32 }}>
                  <input type="checkbox" checked={isAllSelected} ref={el=>{if(el)el.indeterminate=isSomeSelected;}}
                    onChange={e=>toggleAll(e.target.checked)} />
                </th>
                <th>SKU</th>
                <th style={{ minWidth:150 }}>Title</th>
                <th>WH Inv</th>
                <th style={{ background:PORTAL_BG[activePortal],color:PORTAL_COLORS[activePortal] }}>Open PO Qty</th>
                <th style={{ background:'#fffde7',color:'var(--yellow)' }}>Shipped Qty</th>
                <th style={{ background:'var(--red-lt)',color:'var(--red)' }}>Pending Qty</th>
                <th>Delivered Qty</th>
                <th>Status</th>
                <th>PO Ref</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const pendingQty = Math.max(0, (r.openPOQty||0) - (r.shippedQty||0));
                const whInv = whMap[r.asin] ?? r.warehouseInvAtCreation ?? 0;
                return (
                  <tr key={r._id} style={{ background:selected.has(r._id)?'var(--blue-lt)':'' }}>
                    <td><input type="checkbox" checked={selected.has(r._id)} onChange={()=>toggle(r._id)} /></td>
                    <td style={{ fontWeight:500 }}>{r.sku||r.asin}</td>
                    <td style={{ maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',fontSize:11 }}>{r.title||'—'}</td>
                    <td style={{ fontWeight:500,color:whInv<20?'var(--red)':'var(--text)' }}>{fmtN(whInv)}</td>
                    <td style={{ fontWeight:700,color:PORTAL_COLORS[activePortal] }}>{fmtN(r.openPOQty)}</td>
                    <td style={{ background:'#fffde7' }}>
                      {(isAdmin||isOps) && r.status!=='delivered' ? (
                        <EditableQtyCell value={r.shippedQty} label="Enter" onSave={v=>shipMut.mutate({id:r._id,shippedQty:v})} />
                      ) : <span style={{ fontWeight:600,color:'var(--teal)' }}>{fmtN(r.shippedQty||0)}</span>}
                    </td>
                    <td style={{ fontWeight:700,color:pendingQty>0?'var(--red)':'var(--green)' }}>
                      {fmtN(pendingQty)}
                    </td>
                    <td style={{ color:'var(--green)',fontWeight:r.deliveredQty>0?600:400 }}>{fmtN(r.deliveredQty||0)}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td style={{ fontSize:11,color:'var(--muted)' }}>{r.poReference||'—'}</td>
                    {isAdmin && (
                      <td>
                        {r.status==='fully_shipped' && (
                          <button className="btn btn-success btn-xs" onClick={()=>deliverMut.mutate({id:r._id,deliveredQty:r.shippedQty})}>✓ Deliver</button>
                        )}
                        {r.status==='delivered' && <span style={{ fontSize:10,color:'var(--muted)' }}>Done</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Portal PO Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Add {PORTAL_NAMES[activePortal]} Platform PO</div>
              <button className="modal-close" onClick={()=>setShowAddModal(false)}>×</button>
            </div>
            <div className="info-box" style={{ marginBottom:14 }}>
              This is a <strong>platform PO</strong> — {PORTAL_NAMES[activePortal]} has sent us a purchase order that we need to fulfill from our warehouse.
            </div>
            <div className="form-group">
              <label className="form-label">ASIN</label>
              <input className="form-input" placeholder="B09XXXXX" value={newPO.asin} onChange={e=>setNewPO({...newPO,asin:e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Open PO Qty (ordered by {PORTAL_NAMES[activePortal]})</label>
              <input className="form-input" type="number" min="0" placeholder="e.g. 100" value={newPO.openPOQty} onChange={e=>setNewPO({...newPO,openPOQty:e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">PO Reference (optional)</label>
              <input className="form-input" placeholder="AMZ-PO-2024-XXX" value={newPO.poReference} onChange={e=>setNewPO({...newPO,poReference:e.target.value})} />
            </div>
            <div className="form-group" style={{ marginBottom:20 }}>
              <label className="form-label">Notes</label>
              <input className="form-input" placeholder="Optional notes" value={newPO.notes} onChange={e=>setNewPO({...newPO,notes:e.target.value})} />
            </div>
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={()=>setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={createMut.isPending}
                onClick={()=>createMut.mutate({ ...newPO, portal:activePortal, openPOQty:parseInt(newPO.openPOQty)||0 })}>
                {createMut.isPending?'Creating…':'Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
