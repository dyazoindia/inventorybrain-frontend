import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, supplierPOApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Empty, Loading, fmtN } from '../components/ui';
import { useSelection } from '../components/ui/useSelection';
import { exportToCSV } from '../components/ui/exportUtils';
import toast from 'react-hot-toast';

var fDoc = function(v) { return (v!==null&&v!==undefined&&isFinite(v))?(Math.round(v*10)/10)+'d':'-'; };
var fDRR = function(v) { return v?parseFloat(v).toFixed(2).replace(/\.?0+$/,''):'-'; };
var dCol = function(v) {
  if (!v&&v!==0) return 'var(--muted)';
  if (v<7) return 'var(--red)';
  if (v<15) return 'var(--orange)';
  if (v<30) return 'var(--yellow)';
  return 'var(--green)';
};

var CFG = {
  CHINA:{ label:'China Supplier', icon:'🏭', color:'#7c3aed', heroClass:'hero-china', docT:120, whT:60, targetDOC:120 },
  MD:   { label:'MD Supplier',    icon:'🏢', color:'#ea580c', heroClass:'hero-md',    docT:60,  whT:30, targetDOC:60  }
};

var TABS = [
  { key:'all',           label:'All SKUs',      color:'#3b6ff5' },
  { key:'need_po',       label:'Need PO',       color:'#dc2626' },
  { key:'manufacturing', label:'Manufacturing', color:'#7c3aed' },
  { key:'shipped',       label:'In Transit',    color:'#0891b2' },
  { key:'delivered',     label:'Delivered',     color:'#16a34a' },
  { key:'no_action',     label:'No Action',     color:'#6b7280' }
];

var PO_BADGE = {
  draft:              { cls:'badge-gray',      label:'No PO' },
  admin_approved:     { cls:'badge-po',        label:'Final Qty Set' },
  supplier_confirmed: { cls:'badge-confirmed', label:'In Manufacturing' },
  shipped:            { cls:'badge-transit',   label:'In Transit' },
  delivered:          { cls:'badge-ok',        label:'Delivered' },
  rejected:           { cls:'badge-rejected',  label:'Rejected' }
};

export default function SupplierDashboard({ supplier }) {
  var cfg = CFG[supplier] || { label:supplier+' Supplier', icon:'🏪', color:'#3b6ff5', heroClass:'hero-china', docT:60, whT:30, targetDOC:60 };
  var auth = useAuth();
  var isAdmin = auth.isAdmin;
  var qc = useQueryClient();

  var [tab, setTab]   = useState('all');
  var [q, setQ]       = useState('');
  var [ci, setCi]     = useState({});
  var [si, setSi]     = useState({});

  var invQ = useQuery({ queryKey:['inv-'+supplier], queryFn:function(){return inventoryApi.getLatest({supplier:supplier}).then(function(r){return r.data;});} });
  var poQ  = useQuery({ queryKey:['po-'+supplier],  queryFn:function(){return supplierPOApi.list({supplier:supplier}).then(function(r){return r.data;});} });

  var confirmMut = useMutation({
    mutationFn:function(d){return supplierPOApi.confirm(d.id,{poConfirmType:d.type,confirmedQty:d.qty});},
    onSuccess:function(data){
      toast.success(data.data.message||'Confirmed! Qty moved to Manufacturing.');
      qc.invalidateQueries(['po-'+supplier]); qc.invalidateQueries(['inv-'+supplier]); qc.invalidateQueries(['inventory-all']);
    },
    onError:function(e){toast.error(e.response&&e.response.data?e.response.data.error:'Failed');}
  });

  var shipMut = useMutation({
    mutationFn:function(d){return supplierPOApi.ship(d.id,{shippedQty:d.qty});},
    onSuccess:function(data){
      toast.success(data.data.message||'Shipped! Now In Transit.');
      qc.invalidateQueries(['po-'+supplier]); qc.invalidateQueries(['inv-'+supplier]);
    },
    onError:function(){toast.error('Failed');}
  });

  var deliverMut = useMutation({
    mutationFn:function(d){return supplierPOApi.deliver(d.id,{deliveredQty:d.qty});},
    onSuccess:function(data){
      toast.success(data.data.message||'Delivered! Warehouse inventory updated automatically.');
      qc.invalidateQueries(['po-'+supplier]); qc.invalidateQueries(['inv-'+supplier]);
      qc.invalidateQueries(['inventory-all']); qc.invalidateQueries(['dashboard-latest']);
    },
    onError:function(){toast.error('Failed');}
  });

  var allRows = invQ.data&&invQ.data.rows ? invQ.data.rows : [];
  var poList  = poQ.data&&poQ.data.purchaseOrders ? poQ.data.purchaseOrders : [];

  var poMap = useMemo(function(){
    var m={};
    poList.forEach(function(po){m[po.asin]=po;});
    return m;
  },[poList]);

  var counts = useMemo(function(){
    return {
      all:           allRows.length,
      need_po:       allRows.filter(function(r){return r.actionType==='supplier_po_required';}).length,
      manufacturing: poList.filter(function(p){return p.status==='supplier_confirmed';}).length,
      shipped:       poList.filter(function(p){return p.status==='shipped';}).length,
      delivered:     poList.filter(function(p){return p.status==='delivered';}).length,
      no_action:     allRows.filter(function(r){return r.actionType==='no_action';}).length
    };
  },[allRows,poList]);

  var rows = useMemo(function(){
    var r=allRows;
    if (q){var lq=q.toLowerCase(); r=r.filter(function(x){return (x.sku&&x.sku.toLowerCase().indexOf(lq)>=0)||(x.asin&&x.asin.toLowerCase().indexOf(lq)>=0)||(x.title&&x.title.toLowerCase().indexOf(lq)>=0);});}
    if (tab==='need_po')       return r.filter(function(x){return x.actionType==='supplier_po_required';});
    if (tab==='manufacturing') return r.filter(function(x){var p=poMap[x.asin];return p&&p.status==='supplier_confirmed';});
    if (tab==='shipped')       return r.filter(function(x){var p=poMap[x.asin];return p&&p.status==='shipped';});
    if (tab==='delivered')     return r.filter(function(x){var p=poMap[x.asin];return p&&p.status==='delivered';});
    if (tab==='no_action')     return r.filter(function(x){return x.actionType==='no_action';});
    return r;
  },[allRows,poMap,tab,q]);

  var sel = useSelection(rows);

  if (invQ.isLoading) return <Loading text={'Loading '+cfg.label+'...'} />;

  var baseTh = (
    <>
      <th>SKU</th>
      <th style={{minWidth:140}}>Title</th>
      <th>Category</th>
      <th>WH Inv</th>
      <th>WH DOC</th>
      <th>Co. DOC</th>
      <th>DRR</th>
    </>
  );

  function renderRow(r) {
    var po    = poMap[r.asin];
    var pid   = po ? po._id.toString() : r.asin;
    var cInp  = ci[pid] || { type:'full', qty:po?po.finalQty||0:0 };
    var sInp  = si[pid]  || '';
    var pst   = PO_BADGE[po?po.status:'draft'] || PO_BADGE.draft;
    var bg    = sel.selected.has(r.asin) ? 'var(--blue-lt)' : '';

    var baseTd = (
      <>
        <td style={{fontWeight:500}}>{r.sku||r.asin}</td>
        <td style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',fontSize:11}}>{r.title||'-'}</td>
        <td style={{fontSize:11,color:'var(--muted)'}}>{r.category||'-'}</td>
        <td style={{fontWeight:500,color:r.whInv===0?'var(--red)':'var(--text)'}}>{fmtN(r.whInv)}{r.whInv===0&&<span style={{fontSize:9,marginLeft:3,color:'var(--red)'}}>EMPTY</span>}</td>
        <td><span style={{fontWeight:600,color:dCol(r.whDOC)}}>{fDoc(r.whDOC)}</span></td>
        <td><span style={{fontWeight:700,color:dCol(r.companyDOC)}}>{fDoc(r.companyDOC)}</span></td>
        <td>{fDRR(r.totalDRR)}</td>
      </>
    );

    // NEED PO tab
    if (tab==='need_po') return (
      <tr key={r.asin} style={{background:bg}}>
        <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function(){sel.toggle(r.asin);}}/></td>
        {baseTd}
        <td style={{color:'var(--blue)',fontWeight:600}}>{r.suggestQty>0?fmtN(r.suggestQty):'-'}</td>
        <td style={{background:'#fffde7',fontWeight:700,color:po&&po.finalQty?'var(--green)':'var(--muted)',textAlign:'center'}}>
          {po&&po.finalQty?fmtN(po.finalQty):'Waiting Admin'}
        </td>
        <td>
          {po&&po.status==='admin_approved'&&!isAdmin?(
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <select className="filter-select" style={{fontSize:11,padding:'3px 6px'}} value={cInp.type}
                onChange={function(e){var n={};n[pid]={type:e.target.value,qty:e.target.value==='full'?po.finalQty:cInp.qty};setCi(Object.assign({},ci,n));}}>
                <option value="full">Full ({fmtN(po.finalQty)})</option>
                <option value="custom">Custom Qty</option>
              </select>
              {cInp.type==='custom'&&<input type="number" min="0" max={po.finalQty} value={cInp.qty}
                onChange={function(e){var n={};n[pid]={type:cInp.type,qty:e.target.value};setCi(Object.assign({},ci,n));}}
                style={{width:70,padding:'3px 6px',border:'1px solid var(--border)',borderRadius:5,fontSize:12,textAlign:'center'}}/>}
              <button className="btn btn-primary btn-xs" disabled={confirmMut.isPending}
                onClick={function(){confirmMut.mutate({id:po._id,type:cInp.type,qty:parseInt(cInp.qty)||po.finalQty});}}>
                Confirm PO
              </button>
            </div>
          ):<span className={'badge '+pst.cls}>{pst.label}</span>}
        </td>
      </tr>
    );

    // MANUFACTURING tab
    if (tab==='manufacturing') return (
      <tr key={r.asin} style={{background:bg}}>
        <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function(){sel.toggle(r.asin);}}/></td>
        {baseTd}
        <td style={{background:'#fffde7',fontWeight:700,color:'var(--green)',textAlign:'center'}}>{po?fmtN(po.finalQty):'-'}</td>
        <td style={{background:'#e0f2fe',fontWeight:700,color:'#0891b2',textAlign:'center'}}>{po?fmtN(po.confirmedQty):'-'}</td>
        <td>
          {po&&po.status==='supplier_confirmed'&&!isAdmin?(
            <div style={{display:'flex',gap:4}}>
              <input type="number" min="0" max={po.confirmedQty} value={sInp} placeholder={po.confirmedQty}
                onChange={function(e){var n={};n[pid]=e.target.value;setSi(Object.assign({},si,n));}}
                style={{width:70,padding:'3px 6px',border:'1px solid var(--border)',borderRadius:5,fontSize:12,textAlign:'center'}}/>
              <button className="btn btn-success btn-xs" disabled={shipMut.isPending}
                onClick={function(){shipMut.mutate({id:po._id,qty:parseInt(sInp)||po.confirmedQty});}}>Ship</button>
            </div>
          ):<span className="badge badge-confirmed">In Mfg</span>}
        </td>
      </tr>
    );

    // SHIPPED/IN TRANSIT tab
    if (tab==='shipped') return (
      <tr key={r.asin} style={{background:bg}}>
        <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function(){sel.toggle(r.asin);}}/></td>
        {baseTd}
        <td style={{background:'#e0f2fe',color:'#0891b2',fontWeight:600,textAlign:'center'}}>{po?fmtN(po.confirmedQty):'-'}</td>
        <td style={{background:'#fef3c7',fontWeight:700,color:'#d97706',textAlign:'center'}}>{po?fmtN(po.shippedQty):'-'}</td>
        {isAdmin&&<td>
          {po&&po.status==='shipped'?(
            <button className="btn btn-success btn-sm" disabled={deliverMut.isPending}
              onClick={function(){deliverMut.mutate({id:po._id,qty:po.shippedQty});}}>
              Deliver {fmtN(po.shippedQty)} to WH
            </button>
          ):<span style={{fontSize:10,color:'var(--muted)'}}>Awaiting</span>}
        </td>}
      </tr>
    );

    // DELIVERED tab
    if (tab==='delivered') return (
      <tr key={r.asin} style={{background:bg,opacity:0.85}}>
        <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function(){sel.toggle(r.asin);}}/></td>
        {baseTd}
        <td style={{color:'var(--muted)'}}>{po?fmtN(po.finalQty):'-'}</td>
        <td style={{color:'var(--muted)'}}>{po?fmtN(po.confirmedQty):'-'}</td>
        <td style={{color:'var(--muted)'}}>{po?fmtN(po.shippedQty):'-'}</td>
        <td style={{background:'#dcfce7',fontWeight:700,color:'var(--green)',textAlign:'center'}}>{po?fmtN(po.deliveredQty):'-'}</td>
        <td><span className="badge badge-ok">Delivered to WH</span></td>
      </tr>
    );

    // NO ACTION tab
    if (tab==='no_action') return (
      <tr key={r.asin} style={{background:bg}}>
        <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function(){sel.toggle(r.asin);}}/></td>
        {baseTd}
        <td><span className="action-ok">No Action</span></td>
      </tr>
    );

    // ALL tab
    var badge = PO_BADGE[po?po.status:'draft']||PO_BADGE.draft;
    return (
      <tr key={r.asin} style={{background:bg}}>
        <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function(){sel.toggle(r.asin);}}/></td>
        {baseTd}
        <td style={{color:r.suggestQty>0?'var(--blue)':'var(--muted)',fontWeight:r.suggestQty>0?600:400}}>{r.suggestQty>0?fmtN(r.suggestQty):'-'}</td>
        <td style={{background:'#fffde7',fontWeight:700,color:po&&po.finalQty?'var(--green)':'var(--muted)',textAlign:'center'}}>{po&&po.finalQty?fmtN(po.finalQty):'-'}</td>
        <td style={{background:'#e0f2fe',color:r.mfgQty>0?'#0891b2':'var(--muted)',fontWeight:r.mfgQty>0?600:400,textAlign:'center'}}>{r.mfgQty>0?fmtN(r.mfgQty):'-'}</td>
        <td style={{background:'#fef3c7',color:r.inTransit>0?'#d97706':'var(--muted)',fontWeight:r.inTransit>0?600:400,textAlign:'center'}}>{r.inTransit>0?fmtN(r.inTransit):'-'}</td>
        <td style={{color:'var(--green)',fontWeight:po&&po.deliveredQty?600:400}}>{po&&po.deliveredQty?fmtN(po.deliveredQty):'-'}</td>
        <td><span className={'badge '+badge.cls}>{badge.label}</span></td>
        <td>
          {r.actionType==='supplier_po_required'&&<span className="action-need">Need PO</span>}
          {r.actionType==='supplier_po_inprogress'&&<span className="badge badge-confirmed">In Progress</span>}
          {r.actionType==='no_action'&&<span className="action-ok">No Action</span>}
          {isAdmin&&po&&po.status==='shipped'&&(
            <button className="btn btn-success btn-xs" style={{marginLeft:4}} disabled={deliverMut.isPending}
              onClick={function(){deliverMut.mutate({id:po._id,qty:po.shippedQty});}}>Deliver</button>
          )}
        </td>
      </tr>
    );
  }

  function renderHeaders() {
    var chk = <th style={{width:32}}><input type="checkbox" checked={sel.isAllSelected} ref={function(el){if(el)el.indeterminate=sel.isSomeSelected;}} onChange={function(e){sel.toggleAll(e.target.checked);}}/></th>;
    if (tab==='need_po') return <tr>{chk}{baseTh}<th>Suggest Qty</th><th style={{background:'#fffde7',color:'var(--yellow)'}}>Final Qty (Admin)</th><th>Action</th></tr>;
    if (tab==='manufacturing') return <tr>{chk}{baseTh}<th style={{background:'#fffde7',color:'var(--yellow)'}}>Final Qty</th><th style={{background:'#e0f2fe',color:'#0891b2'}}>Mfg Qty (Confirmed)</th><th>Ship</th></tr>;
    if (tab==='shipped') return <tr>{chk}{baseTh}<th style={{background:'#e0f2fe',color:'#0891b2'}}>Confirmed Qty</th><th style={{background:'#fef3c7',color:'#d97706'}}>In Transit Qty</th>{isAdmin&&<th style={{background:'#dcfce7',color:'var(--green)'}}>Deliver to WH</th>}</tr>;
    if (tab==='delivered') return <tr>{chk}{baseTh}<th>Final Qty</th><th>Confirmed</th><th>Shipped</th><th style={{background:'#dcfce7',color:'var(--green)'}}>Delivered to WH</th><th>Status</th></tr>;
    if (tab==='no_action') return <tr>{chk}{baseTh}<th>Status</th></tr>;
    return <tr>{chk}{baseTh}<th>Suggest Qty</th><th style={{background:'#fffde7',color:'var(--yellow)'}}>Final Qty</th><th style={{background:'#e0f2fe',color:'#0891b2'}}>Mfg Qty</th><th style={{background:'#fef3c7',color:'#d97706'}}>In Transit</th><th>Delivered</th><th>PO Status</th><th>Action</th></tr>;
  }

  var curTab = TABS.find(function(t){return t.key===tab;});

  return (
    <div>
      <div className={'hero '+cfg.heroClass} style={{marginBottom:16}}>
        <h2>{cfg.icon} {cfg.label} Dashboard</h2>
        <p>{allRows.length} SKUs · {counts.need_po} need PO · {counts.manufacturing} in manufacturing · {counts.shipped} in transit · {counts.delivered} delivered</p>
      </div>

      <div className="info-box" style={{marginBottom:14,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',fontSize:11}}>
        <strong>PO Flow:</strong>
        <span className="badge badge-po">1. Admin sets Final Qty</span>
        <span style={{color:'var(--muted)'}}>→</span>
        <span className="badge badge-confirmed">2. Supplier Confirms → Mfg Qty</span>
        <span style={{color:'var(--muted)'}}>→</span>
        <span className="badge badge-transit">3. Supplier Ships → In Transit</span>
        <span style={{color:'var(--muted)'}}>→</span>
        <span className="badge badge-ok">4. Admin Delivers → WH Inv +Qty</span>
      </div>

      <div className="info-box" style={{marginBottom:14,fontSize:11}}>
        <strong>Logic:</strong> WH DOC &lt;{cfg.whT}d = flag | Co. DOC &lt;{cfg.docT}d = Need PO | Target DOC = {cfg.targetDOC}d
      </div>

      <div style={{display:'flex',gap:0,marginBottom:16,borderRadius:10,overflow:'hidden',border:'1px solid var(--border)',width:'fit-content'}}>
        {TABS.map(function(t) {
          var active=tab===t.key;
          var cnt=counts[t.key]||0;
          return (
            <button key={t.key} onClick={function(){setTab(t.key);}}
              style={{padding:'8px 14px',border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:active?700:500,
                background:active?t.color:'var(--bg3)',color:active?'#fff':t.color,
                borderRight:'1px solid var(--border)',whiteSpace:'nowrap'}}>
              {t.label}
              {cnt>0&&<span style={{marginLeft:5,background:active?'rgba(255,255,255,.25)':t.color+'20',borderRadius:10,padding:'1px 6px',fontSize:10}}>{cnt}</span>}
            </button>
          );
        })}
      </div>

      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <div className="sec" style={{marginBottom:0}}>{curTab.label} <small>({rows.length})</small></div>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          {sel.count>0&&<button className="btn btn-success btn-sm" onClick={function(){exportToCSV(sel.selectedRows,[{key:'sku',label:'SKU'},{key:'title',label:'Title'}],'export');}}>Export ({sel.count})</button>}
          <button className="btn btn-ghost" onClick={function(){exportToCSV(rows,[{key:'sku',label:'SKU'},{key:'title',label:'Title'}],'export');}}>Export All</button>
          <input className="filter-input" placeholder="Search..." value={q} onChange={function(e){setQ(e.target.value);}} style={{width:180}}/>
        </div>
      </div>

      {sel.count>0&&(
        <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--blue-lt)',borderRadius:8,padding:'8px 14px',marginBottom:10}}>
          <span style={{fontSize:12,color:'var(--blue)',fontWeight:500}}>{sel.count} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={sel.clear}>Clear</button>
        </div>
      )}

      {rows.length===0
        ? <Empty icon={cfg.icon} title={'No products in '+curTab.label} desc="Try a different tab." />
        : <div className="table-wrap"><table><thead>{renderHeaders()}</thead><tbody>{rows.map(function(r){return renderRow(r);})}</tbody></table></div>
      }
    </div>
  );
}
