import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, supplierPOApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Empty, Loading, fmtN } from '../components/ui';
import { useSelection } from '../components/ui/useSelection';
import { exportToCSV } from '../components/ui/exportUtils';
import toast from 'react-hot-toast';

var fmtDoc = function(v) { return (v !== null && v !== undefined && isFinite(v)) ? (Math.round(v*10)/10)+'d' : '\u2014'; };
var fmtDRR = function(v) { return v ? parseFloat(v).toFixed(2).replace(/\.?0+$/,'') : '\u2014'; };
var docColor = function(v) {
  if (!v && v !== 0) return 'var(--muted)';
  if (v < 7) return 'var(--red)';
  if (v < 15) return 'var(--orange)';
  if (v < 30) return 'var(--yellow)';
  return 'var(--green)';
};

var SUPPLIER_CONFIG = {
  CHINA: { label:'China Supplier', icon:'🏭', color:'#7c3aed', heroClass:'hero-china', docThreshold:120, whThreshold:60, targetDOC:120 },
  MD:    { label:'MD Supplier',    icon:'🏢', color:'#ea580c', heroClass:'hero-md',    docThreshold:60,  whThreshold:30, targetDOC:60  }
};

var TABS = [
  { key:'all',           label:'All SKUs',        color:'#3b6ff5' },
  { key:'need_po',       label:'Need PO',         color:'#dc2626' },
  { key:'manufacturing', label:'Manufacturing',   color:'#7c3aed' },
  { key:'shipped',       label:'In Transit',      color:'#0891b2' },
  { key:'delivered',     label:'Delivered',       color:'#16a34a' },
  { key:'no_action',     label:'No Action',       color:'#6b7280' }
];

export default function SupplierDashboard({ supplier }) {
  var config = SUPPLIER_CONFIG[supplier] || {
    label:supplier+' Supplier', icon:'🏪', color:'#3b6ff5',
    heroClass:'hero-china', docThreshold:60, whThreshold:30, targetDOC:60
  };

  var auth = useAuth();
  var isAdmin = auth.isAdmin;
  var qc = useQueryClient();

  var [activeTab, setActiveTab] = useState('all');
  var [search, setSearch] = useState('');
  var [confirmInputs, setConfirmInputs] = useState({});
  var [shipInputs, setShipInputs] = useState({});

  var invQ = useQuery({
    queryKey: ['inventory-'+supplier],
    queryFn: function() { return inventoryApi.getLatest({ supplier:supplier }).then(function(r){return r.data;}); }
  });
  var poQ = useQuery({
    queryKey: ['pos-'+supplier],
    queryFn: function() { return supplierPOApi.list({ supplier:supplier }).then(function(r){return r.data;}); }
  });

  var confirmMut = useMutation({
    mutationFn: function(d) { return supplierPOApi.confirm(d.id,{poConfirmType:d.type,confirmedQty:d.qty}); },
    onSuccess: function(data) {
      toast.success(data.data.message||'PO Confirmed! Qty moved to Manufacturing.');
      qc.invalidateQueries(['pos-'+supplier]); qc.invalidateQueries(['inventory-'+supplier]); qc.invalidateQueries(['inventory-all']);
    },
    onError: function(e) { toast.error(e.response&&e.response.data?e.response.data.error:'Failed'); }
  });
  var shipMut = useMutation({
    mutationFn: function(d) { return supplierPOApi.ship(d.id,{shippedQty:d.qty}); },
    onSuccess: function(data) {
      toast.success(data.data.message||'Shipped! Qty now In Transit.');
      qc.invalidateQueries(['pos-'+supplier]); qc.invalidateQueries(['inventory-'+supplier]);
    },
    onError: function() { toast.error('Failed'); }
  });
  var deliverMut = useMutation({
    mutationFn: function(d) { return supplierPOApi.deliver(d.id,{deliveredQty:d.qty}); },
    onSuccess: function(data) {
      toast.success(data.data.message||'Delivered! Warehouse inventory updated.');
      qc.invalidateQueries(['pos-'+supplier]); qc.invalidateQueries(['inventory-'+supplier]);
      qc.invalidateQueries(['inventory-all']); qc.invalidateQueries(['dashboard-stats']);
    },
    onError: function() { toast.error('Failed'); }
  });

  var allRows = invQ.data&&invQ.data.rows ? invQ.data.rows : [];
  var poList  = poQ.data&&poQ.data.purchaseOrders ? poQ.data.purchaseOrders : [];

  var poMap = useMemo(function() {
    var m={};
    poList.forEach(function(po){m[po.asin]=po;});
    return m;
  },[poList]);

  var counts = useMemo(function() {
    return {
      all:           allRows.length,
      need_po:       allRows.filter(function(r){return r.actionType==='supplier_po_required';}).length,
      manufacturing: poList.filter(function(p){return p.status==='supplier_confirmed';}).length,
      shipped:       poList.filter(function(p){return p.status==='shipped';}).length,
      delivered:     poList.filter(function(p){return p.status==='delivered';}).length,
      no_action:     allRows.filter(function(r){return r.actionType==='no_action';}).length
    };
  },[allRows,poList]);

  var rows = useMemo(function() {
    var r = allRows;
    if (search) {
      var q=search.toLowerCase();
      r=r.filter(function(x){
        return (x.sku&&x.sku.toLowerCase().indexOf(q)>=0)||(x.asin&&x.asin.toLowerCase().indexOf(q)>=0)||(x.title&&x.title.toLowerCase().indexOf(q)>=0);
      });
    }
    if (activeTab==='need_po')       return r.filter(function(x){return x.actionType==='supplier_po_required';});
    if (activeTab==='manufacturing') return r.filter(function(x){var po=poMap[x.asin];return po&&po.status==='supplier_confirmed';});
    if (activeTab==='shipped')       return r.filter(function(x){var po=poMap[x.asin];return po&&po.status==='shipped';});
    if (activeTab==='delivered')     return r.filter(function(x){var po=poMap[x.asin];return po&&po.status==='delivered';});
    if (activeTab==='no_action')     return r.filter(function(x){return x.actionType==='no_action';});
    return r;
  },[allRows,poMap,activeTab,search]);

  var sel = useSelection(rows);

  var doExport = function() {
    exportToCSV(sel.count>0?sel.selectedRows:rows,[
      {key:'sku',label:'SKU'},{key:'title',label:'Title'},{key:'category',label:'Category'},
      {key:'whInv',label:'WH Inv'},{key:'companyDOC',label:'Co. DOC',getValue:function(r){return fmtDoc(r.companyDOC);}},
      {key:'suggestQty',label:'Suggest Qty'},
      {key:'finalQty',label:'Final Qty',getValue:function(r){var po=poMap[r.asin];return po?po.finalQty||'':'';}},
      {key:'confirmedQty',label:'Confirmed Qty',getValue:function(r){var po=poMap[r.asin];return po?po.confirmedQty||'':'';}},
      {key:'shippedQty',label:'Shipped Qty',getValue:function(r){var po=poMap[r.asin];return po?po.shippedQty||'':'';}},
      {key:'deliveredQty',label:'Delivered Qty',getValue:function(r){var po=poMap[r.asin];return po?po.deliveredQty||'':'';}},
      {key:'poStatus',label:'PO Status',getValue:function(r){var po=poMap[r.asin];return po?po.status:'';}}
    ],supplier.toLowerCase()+'_supplier');
  };

  if (invQ.isLoading) return <Loading text={'Loading '+config.label+' SKUs...'} />;

  // ── CONTEXTUAL HEADERS per tab ─────────────────────────────
  function renderHeaders() {
    var base = (
      <>
        <th>Link</th>
        <th>SKU</th>
        <th style={{minWidth:150}}>Title</th>
        <th>Category</th>
        <th>WH Inv</th>
        <th>WH DOC</th>
        <th>Co. DOC</th>
        <th>DRR</th>
      </>
    );

    if (activeTab==='need_po' || activeTab==='all') {
      return (
        <tr>
          <th style={{width:32}}><input type="checkbox" checked={sel.isAllSelected} ref={function(el){if(el)el.indeterminate=sel.isSomeSelected;}} onChange={function(e){sel.toggleAll(e.target.checked);}}/></th>
          {base}
          <th style={{color:'var(--blue)',fontWeight:700}}>Suggest Qty</th>
          <th style={{background:'#fffde7',color:'var(--yellow)',fontWeight:700}}>Final Qty (Admin sets)</th>
          {(activeTab==='all') && <th>Mfg Qty</th>}
          {(activeTab==='all') && <th>Confirm Type</th>}
          {(activeTab==='all') && <th>Confirmed Qty</th>}
          {(activeTab==='all') && <th>Shipped Qty</th>}
          {(activeTab==='all') && <th>Delivered</th>}
          <th>PO Status</th>
          <th>Action</th>
        </tr>
      );
    }

    if (activeTab==='manufacturing') {
      return (
        <tr>
          <th style={{width:32}}><input type="checkbox" checked={sel.isAllSelected} ref={function(el){if(el)el.indeterminate=sel.isSomeSelected;}} onChange={function(e){sel.toggleAll(e.target.checked);}}/></th>
          {base}
          <th style={{background:'#fffde7',color:'var(--yellow)',fontWeight:700}}>Final Qty</th>
          <th>Confirm Type</th>
          <th style={{background:'#e0f2fe',color:'#0891b2',fontWeight:700}}>Confirmed (Mfg) Qty</th>
          <th>Action</th>
        </tr>
      );
    }

    if (activeTab==='shipped') {
      return (
        <tr>
          <th style={{width:32}}><input type="checkbox" checked={sel.isAllSelected} ref={function(el){if(el)el.indeterminate=sel.isSomeSelected;}} onChange={function(e){sel.toggleAll(e.target.checked);}}/></th>
          {base}
          <th style={{background:'#e0f2fe',color:'#0891b2'}}>Confirmed Qty</th>
          <th style={{background:'#fef3c7',color:'#d97706',fontWeight:700}}>Shipped (In Transit)</th>
          {isAdmin && <th style={{background:'#dcfce7',color:'var(--green)',fontWeight:700}}>Admin: Mark Delivered</th>}
        </tr>
      );
    }

    if (activeTab==='delivered') {
      return (
        <tr>
          <th style={{width:32}}><input type="checkbox" checked={sel.isAllSelected} ref={function(el){if(el)el.indeterminate=sel.isSomeSelected;}} onChange={function(e){sel.toggleAll(e.target.checked);}}/></th>
          {base}
          <th>Final Qty</th>
          <th>Confirmed Qty</th>
          <th>Shipped Qty</th>
          <th style={{background:'#dcfce7',color:'var(--green)',fontWeight:700}}>Delivered to WH</th>
          <th>Status</th>
        </tr>
      );
    }

    if (activeTab==='no_action') {
      return (
        <tr>
          <th style={{width:32}}><input type="checkbox" checked={sel.isAllSelected} ref={function(el){if(el)el.indeterminate=sel.isSomeSelected;}} onChange={function(e){sel.toggleAll(e.target.checked);}}/></th>
          {base}
          <th>Health</th>
          <th>Status</th>
        </tr>
      );
    }
  }

  // ── CONTEXTUAL CELLS per tab ───────────────────────────────
  function renderRow(r) {
    var po    = poMap[r.asin];
    var poId  = po ? po._id.toString() : r.asin;
    var ci    = confirmInputs[poId] || { type:'full', qty: po?po.finalQty||0:0 };
    var si    = shipInputs[poId]    || '';
    var pStatus = po ? po.status : 'draft';

    var baseHealth = r.healthStatus === 'healthy' ? 'badge-healthy' : r.healthStatus === 'dead_inventory' ? 'badge-dead' : 'badge-slow';

    var baseCells = (
      <>
        <td>{r.productLink?<a className="link-btn" href={r.productLink} target="_blank" rel="noreferrer">Link</a>:'\u2014'}</td>
        <td style={{fontWeight:500}}>{r.sku||'\u2014'}</td>
        <td style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',fontSize:11}}>{r.title||'\u2014'}</td>
        <td style={{fontSize:11,color:'var(--muted)'}}>{r.category||'\u2014'}</td>
        <td style={{fontWeight:500,color:r.whInv===0?'var(--red)':'var(--text)'}}>{fmtN(r.whInv)}{r.whInv===0&&<span style={{fontSize:9,marginLeft:3,color:'var(--red)'}}>EMPTY</span>}</td>
        <td><span style={{fontWeight:600,color:docColor(r.whDOC)}}>{fmtDoc(r.whDOC)}</span></td>
        <td><span style={{fontWeight:700,color:docColor(r.companyDOC)}}>{fmtDoc(r.companyDOC)}</span></td>
        <td>{fmtDRR(r.totalDRR)}</td>
      </>
    );

    // ── NEED PO tab: show suggest qty + final qty (read-only) ─
    if (activeTab==='need_po') {
      return (
        <tr key={r.asin} style={{background:sel.selected.has(r.asin)?'var(--blue-lt)':''}}>
          <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function(){sel.toggle(r.asin);}}/></td>
          {baseCells}
          <td style={{color:'var(--blue)',fontWeight:600}}>{r.suggestQty>0?fmtN(r.suggestQty):'\u2014'}</td>
          <td style={{background:'#fffde7',fontWeight:700,color:po&&po.finalQty?'var(--green)':'var(--muted)',textAlign:'center'}}>
            {po&&po.finalQty?fmtN(po.finalQty):'Waiting for Admin'}
          </td>
          <td>
            <span className={pStatus==='admin_approved'?'badge badge-po':'badge badge-gray'}>
              {pStatus==='admin_approved'?'Final Qty Set':pStatus==='draft'?'No PO Yet':pStatus}
            </span>
          </td>
          <td>
            {po&&po.status==='admin_approved'&&!isAdmin?(
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <select className="filter-select" style={{fontSize:11,padding:'3px 6px'}} value={ci.type}
                  onChange={function(e){var n={};n[poId]={type:e.target.value,qty:e.target.value==='full'?po.finalQty:ci.qty};setConfirmInputs(Object.assign({},confirmInputs,n));}}>
                  <option value="full">Full ({fmtN(po.finalQty)})</option>
                  <option value="custom">Custom Qty</option>
                </select>
                {ci.type==='custom'&&<input type="number" min="0" max={po.finalQty} value={ci.qty} onChange={function(e){var n={};n[poId]={type:ci.type,qty:e.target.value};setConfirmInputs(Object.assign({},confirmInputs,n));}} style={{width:70,padding:'3px 6px',border:'1px solid var(--border)',borderRadius:5,fontSize:12,textAlign:'center'}}/>}
                <button className="btn btn-primary btn-xs" onClick={function(){confirmMut.mutate({id:po._id,type:ci.type,qty:parseInt(ci.qty)||po.finalQty});}} disabled={confirmMut.isPending}>Confirm PO</button>
              </div>
            ):<span style={{fontSize:11,color:'var(--muted)'}}>{po&&po.status==='supplier_confirmed'?'Confirmed':'\u2014'}</span>}
          </td>
        </tr>
      );
    }

    // ── MANUFACTURING tab: only confirm/mfg info ─────────────
    if (activeTab==='manufacturing') {
      return (
        <tr key={r.asin} style={{background:sel.selected.has(r.asin)?'var(--blue-lt)':''}}>
          <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function(){sel.toggle(r.asin);}}/></td>
          {baseCells}
          <td style={{background:'#fffde7',fontWeight:700,color:'var(--green)',textAlign:'center'}}>{po?fmtN(po.finalQty):'\u2014'}</td>
          <td style={{fontSize:11,color:'var(--muted)'}}>{po?po.poConfirmType:'\u2014'}</td>
          <td style={{background:'#e0f2fe',fontWeight:700,color:'#0891b2',textAlign:'center'}}>{po?fmtN(po.confirmedQty):'\u2014'}</td>
          <td>
            {po&&po.status==='supplier_confirmed'&&!isAdmin?(
              <div style={{display:'flex',gap:4}}>
                <input type="number" min="0" max={po.confirmedQty} value={si} placeholder={po.confirmedQty}
                  onChange={function(e){var n={};n[poId]=e.target.value;setShipInputs(Object.assign({},shipInputs,n));}}
                  style={{width:70,padding:'3px 6px',border:'1px solid var(--border)',borderRadius:5,fontSize:12,textAlign:'center'}}/>
                <button className="btn btn-success btn-xs" onClick={function(){shipMut.mutate({id:po._id,qty:parseInt(si)||po.confirmedQty});}} disabled={shipMut.isPending}>Ship</button>
              </div>
            ):<span className="badge badge-confirmed">In Manufacturing</span>}
          </td>
        </tr>
      );
    }

    // ── SHIPPED/IN TRANSIT tab: only shipping info ────────────
    if (activeTab==='shipped') {
      return (
        <tr key={r.asin} style={{background:sel.selected.has(r.asin)?'var(--blue-lt)':''}}>
          <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function(){sel.toggle(r.asin);}}/></td>
          {baseCells}
          <td style={{background:'#e0f2fe',color:'#0891b2',fontWeight:600,textAlign:'center'}}>{po?fmtN(po.confirmedQty):'\u2014'}</td>
          <td style={{background:'#fef3c7',fontWeight:700,color:'#d97706',textAlign:'center'}}>{po?fmtN(po.shippedQty):'\u2014'}</td>
          {isAdmin&&(
            <td>
              {po&&po.status==='shipped'?(
                <button className="btn btn-success btn-sm" onClick={function(){deliverMut.mutate({id:po._id,qty:po.shippedQty});}} disabled={deliverMut.isPending}>
                  Deliver {fmtN(po.shippedQty)} to WH
                </button>
              ):<span style={{fontSize:10,color:'var(--muted)'}}>Awaiting</span>}
            </td>
          )}
        </tr>
      );
    }

    // ── DELIVERED tab: completed view ─────────────────────────
    if (activeTab==='delivered') {
      return (
        <tr key={r.asin} style={{background:sel.selected.has(r.asin)?'var(--blue-lt)':'',opacity:0.85}}>
          <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function(){sel.toggle(r.asin);}}/></td>
          {baseCells}
          <td style={{color:'var(--muted)'}}>{po?fmtN(po.finalQty):'\u2014'}</td>
          <td style={{color:'var(--muted)'}}>{po?fmtN(po.confirmedQty):'\u2014'}</td>
          <td style={{color:'var(--muted)'}}>{po?fmtN(po.shippedQty):'\u2014'}</td>
          <td style={{background:'#dcfce7',fontWeight:700,color:'var(--green)',textAlign:'center'}}>{po?fmtN(po.deliveredQty):'\u2014'}</td>
          <td><span className="badge badge-ok">Delivered</span></td>
        </tr>
      );
    }

    // ── NO ACTION tab: minimal info ───────────────────────────
    if (activeTab==='no_action') {
      return (
        <tr key={r.asin} style={{background:sel.selected.has(r.asin)?'var(--blue-lt)':''}}>
          <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function(){sel.toggle(r.asin);}}/></td>
          {baseCells}
          <td><span className={'badge '+baseHealth}>{r.healthStatus?r.healthStatus.replace('_',' '):'—'}</span></td>
          <td><span className="action-ok">No Action Needed</span></td>
        </tr>
      );
    }

    // ── ALL tab: full info ────────────────────────────────────
    var pst = {draft:{cls:'badge-gray',label:'No PO'},admin_approved:{cls:'badge-po',label:'Final Qty Set'},supplier_confirmed:{cls:'badge-confirmed',label:'In Mfg'},shipped:{cls:'badge-transit',label:'In Transit'},delivered:{cls:'badge-ok',label:'Delivered'},rejected:{cls:'badge-rejected',label:'Rejected'}};
    var badge = pst[pStatus] || pst.draft;
    return (
      <tr key={r.asin} style={{background:sel.selected.has(r.asin)?'var(--blue-lt)':''}}>
        <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function(){sel.toggle(r.asin);}}/></td>
        {baseCells}
        <td style={{color:r.suggestQty>0?'var(--blue)':'var(--muted)',fontWeight:r.suggestQty>0?600:400}}>{r.suggestQty>0?fmtN(r.suggestQty):'\u2014'}</td>
        <td style={{background:'#fffde7',fontWeight:700,color:po&&po.finalQty?'var(--green)':'var(--muted)',textAlign:'center'}}>{po&&po.finalQty?fmtN(po.finalQty):'\u2014'}</td>
        <td style={{background:'#e0f2fe',color:r.mfgQty>0?'#0891b2':'var(--muted)',fontWeight:r.mfgQty>0?600:400}}>{r.mfgQty>0?fmtN(r.mfgQty):'\u2014'}</td>
        <td style={{fontSize:11,color:'var(--muted)'}}>{po&&po.poConfirmType?po.poConfirmType:'\u2014'}</td>
        <td style={{color:'var(--blue)',fontWeight:po&&po.confirmedQty?600:400}}>{po&&po.confirmedQty?fmtN(po.confirmedQty):'\u2014'}</td>
        <td style={{color:'var(--teal)',fontWeight:po&&po.shippedQty?600:400}}>{po&&po.shippedQty?fmtN(po.shippedQty):'\u2014'}</td>
        <td>
          {isAdmin&&po&&po.status==='shipped'?(
            <button className="btn btn-success btn-xs" onClick={function(){deliverMut.mutate({id:po._id,qty:po.shippedQty});}} disabled={deliverMut.isPending}>Deliver</button>
          ):<span style={{color:'var(--green)',fontWeight:po&&po.deliveredQty?600:400}}>{po&&po.deliveredQty?fmtN(po.deliveredQty):'\u2014'}</span>}
        </td>
        <td><span className={'badge '+badge.cls}>{badge.label}</span></td>
        <td>
          {r.actionType==='supplier_po_required'&&<span className="action-need">Need PO</span>}
          {r.actionType==='supplier_po_inprogress'&&<span className="badge badge-confirmed">In Progress</span>}
          {r.actionType==='no_action'&&<span className="action-ok">No Action</span>}
        </td>
      </tr>
    );
  }

  return (
    <div>
      <div className={'hero '+config.heroClass} style={{marginBottom:16}}>
        <h2>{config.icon} {config.label} Dashboard</h2>
        <p>{allRows.length} SKUs &nbsp;·&nbsp; {counts.need_po} need PO &nbsp;·&nbsp; {counts.manufacturing} in manufacturing &nbsp;·&nbsp; {counts.shipped} in transit &nbsp;·&nbsp; {counts.delivered} delivered</p>
      </div>

      <div className="info-box" style={{marginBottom:14,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',fontSize:11}}>
        <strong>PO Flow:</strong>
        <span className="badge badge-po">1. Admin sets Final Qty</span>
        <span style={{color:'var(--muted)'}}>→</span>
        <span className="badge badge-confirmed">2. Supplier Confirms → Mfg</span>
        <span style={{color:'var(--muted)'}}>→</span>
        <span className="badge badge-transit">3. Supplier Ships → In Transit</span>
        <span style={{color:'var(--muted)'}}>→</span>
        <span className="badge badge-ok">4. Admin Delivers → WH +Qty</span>
      </div>

      <div className="info-box" style={{marginBottom:14,fontSize:11}}>
        <strong>Logic:</strong> WH DOC &lt;{config.whThreshold}d = flag &nbsp;|&nbsp; Co. DOC &lt;{config.docThreshold}d = Need PO &nbsp;|&nbsp; Target DOC = {config.targetDOC}d
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:0,marginBottom:16,borderRadius:10,overflow:'hidden',border:'1px solid var(--border)',width:'fit-content'}}>
        {TABS.map(function(tab) {
          var active = activeTab===tab.key;
          var cnt = counts[tab.key]||0;
          return (
            <button key={tab.key} onClick={function(){setActiveTab(tab.key);}}
              style={{padding:'8px 14px',border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:active?700:500,
                background:active?tab.color:'var(--bg3)',color:active?'#fff':tab.color,
                borderRight:'1px solid var(--border)',whiteSpace:'nowrap'}}>
              {tab.label}
              {cnt>0&&<span style={{marginLeft:5,background:active?'rgba(255,255,255,.25)':tab.color+'20',borderRadius:10,padding:'1px 6px',fontSize:10}}>{cnt}</span>}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <div className="sec" style={{marginBottom:0}}>
          {TABS.find(function(t){return t.key===activeTab;}).label} <small>({rows.length})</small>
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          {sel.count>0&&<button className="btn btn-success btn-sm" onClick={doExport}>Export ({sel.count})</button>}
          <button className="btn btn-ghost" onClick={doExport}>Export All</button>
          <input className="filter-input" placeholder="Search..." value={search} onChange={function(e){setSearch(e.target.value);}} style={{width:180}}/>
        </div>
      </div>

      {sel.count>0&&(
        <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--blue-lt)',borderRadius:8,padding:'8px 14px',marginBottom:10}}>
          <span style={{fontSize:12,color:'var(--blue)',fontWeight:500}}>{sel.count} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={sel.clear}>Clear</button>
          <button className="btn btn-success btn-sm" onClick={doExport}>Export</button>
        </div>
      )}

      {rows.length===0?(
        <Empty icon={config.icon} title={'No products in '+TABS.find(function(t){return t.key===activeTab;}).label} desc="Try a different tab." />
      ):(
        <div className="table-wrap">
          <table>
            <thead>{renderHeaders()}</thead>
            <tbody>{rows.map(function(r){return renderRow(r);})}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
