import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, supplierPOApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Empty, Loading, fmtN } from '../components/ui';
import { useSelection } from '../components/ui/useSelection';
import { exportToCSV } from '../components/ui/exportUtils';
import toast from 'react-hot-toast';

const fmtDoc = (v) => (v!==null&&v!==undefined&&isFinite(v))?(Math.round(v*10)/10)+'d':'—';
const fmtDRR = (v) => v?parseFloat(v).toFixed(2).replace(/\.?0+$/,''):'—';
const docColor = (v) => !v&&v!==0?'var(--muted)':v<7?'var(--red)':v<15?'var(--orange)':v<30?'var(--yellow)':'var(--green)';

const PO_STATUS_LABELS = {
  draft:              { cls:'badge-gray',      label:'—' },
  admin_approved:     { cls:'badge-po',        label:'🟡 Final Qty Set' },
  supplier_confirmed: { cls:'badge-confirmed', label:'🔵 Confirmed' },
  shipped:            { cls:'badge-transit',   label:'🔵 Shipped' },
  delivered:          { cls:'badge-ok',        label:'✅ Delivered' },
  rejected:           { cls:'badge-rejected',  label:'❌ Rejected' }
};

const ALL_COLS = [
  { key:'link',          label:'Link' },
  { key:'sku',           label:'SKU',         always:true },
  { key:'title',         label:'Title',        always:true },
  { key:'category',      label:'Category' },
  { key:'whInv',         label:'WH Inv' },
  { key:'whDOC',         label:'WH DOC' },
  { key:'companyDOC',    label:'Co. DOC',      always:true },
  { key:'totalDRR',      label:'DRR/day' },
  { key:'suggestQty',    label:'Suggest Qty' },
  { key:'finalQty',      label:'Final Qty (Admin)', always:true },
  { key:'confirmType',   label:'Confirm Type',  always:true },
  { key:'confirmedQty',  label:'Confirmed Qty', always:true },
  { key:'shippedQty',    label:'Shipped Qty',   always:true },
  { key:'deliveredQty',  label:'Delivered Qty' },
  { key:'poStatus',      label:'PO Status',     always:true },
  { key:'action',        label:'Action Required', always:true }
];
const DEFAULT_VISIBLE = new Set(['link','sku','title','category','whInv','whDOC','companyDOC','totalDRR','suggestQty','finalQty','confirmType','confirmedQty','shippedQty','deliveredQty','poStatus','action']);

export default function ChinaDashboard() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [fAction, setFAction] = useState('all');
  const [visible, setVisible] = useState(DEFAULT_VISIBLE);
  const [showCols, setShowCols] = useState(false);
  const [confirmInputs, setConfirmInputs] = useState({}); // { poId: { type, qty } }
  const [shipInputs, setShipInputs] = useState({});       // { poId: qty }

  const { data: invData, isLoading } = useQuery({
    queryKey: ['inventory-china'],
    queryFn: () => inventoryApi.getLatest({ supplier:'CHINA' }).then(r => r.data)
  });

  const { data: poData } = useQuery({
    queryKey: ['pos-china'],
    queryFn: () => supplierPOApi.list({ supplier:'CHINA' }).then(r => r.data)
  });

  const confirmMut = useMutation({
    mutationFn: ({ id, poConfirmType, confirmedQty }) => supplierPOApi.confirm(id, { poConfirmType, confirmedQty }),
    onSuccess: () => { toast.success('PO Confirmed!'); qc.invalidateQueries(['pos-china']); },
    onError: err => toast.error(err.response?.data?.error||'Failed')
  });

  const shipMut = useMutation({
    mutationFn: ({ id, shippedQty }) => supplierPOApi.ship(id, { shippedQty }),
    onSuccess: () => { toast.success('Shipment recorded!'); qc.invalidateQueries(['pos-china']); },
    onError: err => toast.error(err.response?.data?.error||'Failed')
  });

  const deliverMut = useMutation({
    mutationFn: ({ id, deliveredQty }) => supplierPOApi.deliver(id, { deliveredQty }),
    onSuccess: () => { toast.success('Marked delivered!'); qc.invalidateQueries(['pos-china']); },
    onError: err => toast.error(err.response?.data?.error||'Failed')
  });

  const allRows = invData?.rows || [];
  const poMap = useMemo(() => {
    const m = {};
    (poData?.purchaseOrders||[]).forEach(po=>{ m[po.asin]=po; });
    return m;
  }, [poData]);

  const rows = useMemo(() => {
    let r = allRows;
    if (search) { const q=search.toLowerCase(); r=r.filter(x=>x.sku?.toLowerCase().includes(q)||x.asin?.toLowerCase().includes(q)||x.ean?.toLowerCase().includes(q)); }
    if (fAction==='need_po')   r=r.filter(x=>x.actionType==='supplier_po_required');
    if (fAction==='inprogress')r=r.filter(x=>x.actionType==='supplier_po_inprogress');
    if (fAction==='no_action') r=r.filter(x=>x.actionType==='no_action');
    return r;
  }, [allRows, search, fAction]);

  const { selected, toggle, toggleAll, clear, isAllSelected, isSomeSelected, selectedRows, count } = useSelection(rows);

  const needPO     = allRows.filter(r=>r.actionType==='supplier_po_required').length;
  const inProgress = allRows.filter(r=>r.actionType==='supplier_po_inprogress').length;
  const noAction   = allRows.filter(r=>r.actionType==='no_action').length;

  const toggleCol = (key) => {
    const col = ALL_COLS.find(c=>c.key===key);
    if (col?.always) return;
    const next = new Set(visible);
    next.has(key)?next.delete(key):next.add(key);
    setVisible(next);
  };

  const doExport = () => {
    const visCols = ALL_COLS.filter(c=>visible.has(c.key));
    const exportRows = count>0?selectedRows:rows;
    exportToCSV(exportRows, visCols.map(c=>({
      key:c.key, label:c.label,
      getValue: r => {
        const po=poMap[r.asin];
        switch(c.key){
          case 'link': return r.productLink||'';
          case 'whDOC': return fmtDoc(r.whDOC);
          case 'companyDOC': return fmtDoc(r.companyDOC);
          case 'totalDRR': return fmtDRR(r.totalDRR);
          case 'finalQty': return po?.finalQty||'';
          case 'confirmType': return po?.poConfirmType||'';
          case 'confirmedQty': return po?.confirmedQty||'';
          case 'shippedQty': return po?.shippedQty||'';
          case 'deliveredQty': return po?.deliveredQty||'';
          case 'poStatus': return po?.status||'no_po';
          case 'action': return r.actionType||'';
          default: return r[c.key]??'';
        }
      }
    })), 'china_supplier');
  };

  if (isLoading) return <Loading text="Loading China SKUs…" />;

  return (
    <div>
      <div className="hero hero-china" style={{ marginBottom:16 }}>
        <h2>🏭 China Supplier Dashboard</h2>
        <p>{allRows.length} SKUs · {needPO} need PO · {inProgress} in progress · {noAction} OK</p>
      </div>

      {/* Summary chips */}
      <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:16 }}>
        {[
          { key:'all',        label:'📋 All',               count:allRows.length, color:'var(--text)',   bg:'var(--bg3)' },
          { key:'need_po',    label:'🔴 Supplier PO Required', count:needPO,       color:'var(--red)',   bg:'var(--red-lt)' },
          { key:'inprogress', label:'🔵 PO In Progress',     count:inProgress,    color:'var(--blue)',  bg:'var(--blue-lt)' },
          { key:'no_action',  label:'✅ No Action',          count:noAction,      color:'var(--green)', bg:'var(--green-lt)' }
        ].map(a => (
          <div key={a.key} onClick={()=>setFAction(a.key)}
            style={{ padding:'7px 14px',borderRadius:20,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',gap:6,
              background:fAction===a.key?a.color:a.bg, color:fAction===a.key?'#fff':a.color,
              border:`1px solid ${a.color}`, fontWeight:fAction===a.key?700:500, transition:'all .13s' }}>
            <span style={{ fontWeight:700,fontSize:15 }}>{a.count}</span>{a.label}
          </div>
        ))}
      </div>

      {/* Info box */}
      <div className="info-box" style={{ marginBottom:14 }}>
        📋 <strong>Logic:</strong> WH DOC &lt;60 = flag | Co. DOC &lt;120 = Need PO | Co. DOC &gt;120 + WH &lt;60 = No Need
        &nbsp;|&nbsp; <strong>PO Flow:</strong> Admin sets Final Qty → Supplier Confirms → Supplier Ships → Admin Delivers
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12 }}>
        <div className="sec" style={{ marginBottom:0 }}>China SKU Table <small>({rows.length})</small></div>
        <div style={{ marginLeft:'auto',display:'flex',gap:8 }}>
          {count>0&&<button className="btn btn-success btn-sm" onClick={doExport}>⬇ Export ({count})</button>}
          <button className="btn btn-ghost" onClick={doExport}>⬇ Export All</button>
          <button className="btn btn-ghost" onClick={()=>setShowCols(!showCols)}>⚙ Columns</button>
          <input className="filter-input" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} style={{ width:180 }} />
        </div>
      </div>

      {/* Column picker */}
      {showCols && (
        <div style={{ background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:14,marginBottom:14,display:'flex',flexWrap:'wrap',gap:8 }}>
          {ALL_COLS.map(col=>(
            <label key={col.key} style={{ display:'flex',alignItems:'center',gap:5,fontSize:12,cursor:col.always?'not-allowed':'pointer',opacity:col.always?.6:1 }}>
              <input type="checkbox" checked={visible.has(col.key)} onChange={()=>toggleCol(col.key)} disabled={col.always} />{col.label}
            </label>
          ))}
          <button className="btn btn-ghost btn-xs" onClick={()=>setVisible(new Set(ALL_COLS.map(c=>c.key)))}>All</button>
          <button className="btn btn-ghost btn-xs" onClick={()=>setVisible(DEFAULT_VISIBLE)}>Reset</button>
        </div>
      )}

      {/* Selection bar */}
      {count>0&&(
        <div style={{ display:'flex',alignItems:'center',gap:10,background:'var(--blue-lt)',border:'1px solid rgba(59,111,245,.2)',borderRadius:8,padding:'8px 14px',marginBottom:10 }}>
          <span style={{ fontSize:12,color:'var(--blue)',fontWeight:500 }}>{count} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={clear}>✕</button>
          <button className="btn btn-success btn-sm" onClick={doExport}>⬇ Export</button>
        </div>
      )}

      {!rows.length ? <Empty icon="🏭" title="No China SKUs match filter" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width:32 }}>
                  <input type="checkbox" checked={isAllSelected} ref={el=>{if(el)el.indeterminate=isSomeSelected;}} onChange={e=>toggleAll(e.target.checked)} />
                </th>
                {ALL_COLS.filter(c=>visible.has(c.key)).map(c=>(
                  <th key={c.key} style={c.key==='finalQty'?{background:'#fffde7',color:'var(--yellow)',fontWeight:700}:{}}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>{
                const po=poMap[r.asin];
                const poStatus=PO_STATUS_LABELS[po?.status||'draft'];
                const confirmInput=confirmInputs[po?._id]||{type:'full',qty:po?.finalQty||0};
                const shipInput=shipInputs[po?._id]||'';
                return (
                  <tr key={r.asin} style={{ background:selected.has(r.asin)?'var(--blue-lt)':'' }}>
                    <td><input type="checkbox" checked={selected.has(r.asin)} onChange={()=>toggle(r.asin)} /></td>
                    {visible.has('link')         && <td>{r.productLink?<a className="link-btn" href={r.productLink} target="_blank" rel="noreferrer">↗</a>:'—'}</td>}
                    {visible.has('sku')          && <td style={{ fontWeight:500 }}>{r.sku||'—'}</td>}
                    {visible.has('title')        && <td style={{ maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',fontSize:11 }}>{r.title||'—'}</td>}
                    {visible.has('category')     && <td style={{ fontSize:11,color:'var(--muted)' }}>{r.category||'—'}</td>}
                    {visible.has('whInv')        && <td style={{ fontWeight:500,color:r.whInv===0?'var(--red)':'var(--text)' }}>{fmtN(r.whInv)}{r.whInv===0?<span style={{ fontSize:9,marginLeft:3,color:'var(--red)' }}>EMPTY</span>:''}</td>}
                    {visible.has('whDOC')        && <td><span style={{ fontWeight:600,color:docColor(r.whDOC) }}>{fmtDoc(r.whDOC)}</span></td>}
                    {visible.has('companyDOC')   && <td><span style={{ fontWeight:700,color:docColor(r.companyDOC) }}>{fmtDoc(r.companyDOC)}</span></td>}
                    {visible.has('totalDRR')     && <td>{fmtDRR(r.totalDRR)}</td>}
                    {visible.has('suggestQty')   && <td style={{ color:'var(--blue)',fontWeight:600 }}>{r.suggestQty>0?fmtN(r.suggestQty):'—'}</td>}

                    {/* Final Qty — Admin only editable, shown to supplier */}
                    {visible.has('finalQty')     && (
                      <td style={{ background:'#fffde7' }}>
                        <span style={{ fontWeight:700,color:po?.finalQty?'var(--green)':'var(--muted)',fontSize:13 }}>
                          {po?.finalQty?fmtN(po.finalQty):'—'}
                        </span>
                      </td>
                    )}

                    {/* Confirm Type — supplier action */}
                    {visible.has('confirmType')  && (
                      <td>
                        {po?.status==='admin_approved' && !isAdmin ? (
                          <select className="filter-select" style={{ fontSize:11,padding:'3px 6px' }}
                            value={confirmInput.type}
                            onChange={e=>setConfirmInputs(p=>({...p,[po._id]:{...confirmInput,type:e.target.value,qty:e.target.value==='full'?po.finalQty:confirmInput.qty}}))}>
                            <option value="full">Full ({fmtN(po.finalQty)})</option>
                            <option value="custom">Custom Qty</option>
                          </select>
                        ) : <span style={{ fontSize:11,color:'var(--muted)' }}>{po?.poConfirmType||'—'}</span>}
                      </td>
                    )}

                    {/* Confirmed Qty */}
                    {visible.has('confirmedQty') && (
                      <td>
                        {po?.status==='admin_approved' && !isAdmin ? (
                          <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
                            {confirmInput.type==='custom'&&(
                              <input type="number" min="0" max={po.finalQty} value={confirmInput.qty}
                                onChange={e=>setConfirmInputs(p=>({...p,[po._id]:{...confirmInput,qty:e.target.value}}))}
                                style={{ width:70,padding:'3px 6px',border:'1px solid var(--border)',borderRadius:5,fontFamily:'inherit',fontSize:12,textAlign:'center' }} />
                            )}
                            <button className="btn btn-primary btn-xs"
                              onClick={()=>confirmMut.mutate({id:po._id,poConfirmType:confirmInput.type,confirmedQty:parseInt(confirmInput.qty)||po.finalQty})}
                              disabled={confirmMut.isPending}>Confirm PO</button>
                          </div>
                        ) : <span style={{ fontWeight:600,color:'var(--blue)' }}>{po?.confirmedQty?fmtN(po.confirmedQty):'—'}</span>}
                      </td>
                    )}

                    {/* Shipped Qty */}
                    {visible.has('shippedQty') && (
                      <td>
                        {po?.status==='supplier_confirmed' && !isAdmin ? (
                          <div style={{ display:'flex',gap:4 }}>
                            <input type="number" min="0" max={po.confirmedQty} value={shipInput}
                              onChange={e=>setShipInputs(p=>({...p,[po._id]:e.target.value}))}
                              placeholder={po.confirmedQty} style={{ width:70,padding:'3px 6px',border:'1px solid var(--border)',borderRadius:5,fontFamily:'inherit',fontSize:12,textAlign:'center' }} />
                            <button className="btn btn-success btn-xs"
                              onClick={()=>shipMut.mutate({id:po._id,shippedQty:parseInt(shipInput)||po.confirmedQty})}
                              disabled={shipMut.isPending}>Ship</button>
                          </div>
                        ) : <span style={{ fontWeight:600,color:'var(--teal)' }}>{po?.shippedQty?fmtN(po.shippedQty):'—'}</span>}
                      </td>
                    )}

                    {/* Delivered — admin only */}
                    {visible.has('deliveredQty') && (
                      <td>
                        {isAdmin && po?.status==='shipped' ? (
                          <button className="btn btn-success btn-sm" onClick={()=>deliverMut.mutate({id:po._id,deliveredQty:po.shippedQty})} disabled={deliverMut.isPending}>
                            ✓ Deliver ({fmtN(po.shippedQty)})
                          </button>
                        ) : <span style={{ color:'var(--green)',fontWeight:po?.deliveredQty?600:400 }}>{po?.deliveredQty?fmtN(po.deliveredQty):'—'}</span>}
                      </td>
                    )}

                    {/* PO Status */}
                    {visible.has('poStatus') && (
                      <td><span className={`badge ${poStatus.cls}`}>{poStatus.label}</span></td>
                    )}

                    {/* Action Required */}
                    {visible.has('action') && (
                      <td>
                        <span className={r.actionType==='supplier_po_required'?'action-need':r.actionType==='supplier_po_inprogress'?'badge badge-confirmed':'action-ok'}>
                          {r.actionType==='supplier_po_required'?'🔴 Order from China':r.actionType==='supplier_po_inprogress'?'🔵 PO In Progress':'✅ No Action'}
                        </span>
                      </td>
                    )}
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
