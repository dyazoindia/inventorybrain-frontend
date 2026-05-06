import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { compareApi } from '../utils/api';
import { Empty, Loading, fmtN } from '../components/ui';

var fDoc = function(v) { return (v!==null&&v!==undefined&&isFinite(v)) ? (Math.round(v*10)/10)+'d' : '-'; };

export default function CompareDashboard() {
  var [expandedAsin, setExpandedAsin] = useState(null);

  var q = useQuery({
    queryKey: ['compare-latest'],
    queryFn: function() { return compareApi.latest().then(function(r){return r.data;}); },
    retry: 2
  });

  if (q.isLoading) return <Loading text="Comparing snapshots..." />;

  if (q.error) return (
    <div className="warn-box">
      Error loading comparison. Make sure you have at least 2 uploads.
      <br/><small>{q.error.message}</small>
    </div>
  );

  if (!q.data || !q.data.available) return (
    <div>
      <div className="sec">Compare Files</div>
      <Empty icon="🔄" title="Need at least 2 uploads to compare"
        desc="Upload your Excel file a second time to compare changes between uploads." />
    </div>
  );

  var data = q.data;
  var comp = data.comparison;
  var summary   = comp.summary   || {};
  var newSKUs   = comp.newSKUs   || [];
  var removed   = comp.removedSKUs || [];
  var changed   = comp.changed   || [];
  var unchanged = comp.unchanged || [];

  var riskInc = changed.filter(function(c){ return c.riskIncreased; }).length;
  var riskDec = changed.filter(function(c){ return c.riskDecreased; }).length;

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div className="sec" style={{marginBottom:0}}>📊 Compare Files</div>
      </div>

      {/* Files compared */}
      <div style={{ display:'flex', gap:12, alignItems:'center', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 18px', marginBottom:18 }}>
        <div style={{flex:1}}>
          <div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>Previous Upload</div>
          <div style={{fontWeight:600}}>{data.previousFile||'Previous'}</div>
          <div style={{fontSize:11,color:'var(--muted)'}}>{data.previousDate?new Date(data.previousDate).toLocaleString():''}</div>
        </div>
        <div style={{fontSize:28,color:'var(--muted)'}}>→</div>
        <div style={{flex:1}}>
          <div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>Latest Upload</div>
          <div style={{fontWeight:600}}>{data.latestFile||'Latest'}</div>
          <div style={{fontSize:11,color:'var(--muted)'}}>{data.latestDate?new Date(data.latestDate).toLocaleString():''}</div>
        </div>
        <div style={{textAlign:'center',borderLeft:'1px solid var(--border)',paddingLeft:16}}>
          <div style={{fontSize:22,fontWeight:700}}>{changed.length}</div>
          <div style={{fontSize:11,color:'var(--muted)'}}>SKUs changed</div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="kgrid" style={{marginBottom:20}}>
        {[
          {label:'New SKUs',      val:newSKUs.length,  color:'var(--green)',  icon:'✅'},
          {label:'Removed SKUs',  val:removed.length,  color:'var(--red)',    icon:'❌'},
          {label:'Risk Increased',val:riskInc,         color:'var(--orange)', icon:'⬆️'},
          {label:'Risk Decreased',val:riskDec,         color:'var(--green)',  icon:'⬇️'},
          {label:'Changed',       val:changed.length,  color:'var(--blue)',   icon:'📊'},
          {label:'Unchanged',     val:unchanged.length,color:'var(--muted)',  icon:'✔️'}
        ].map(function(k){
          return (
            <div key={k.label} style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'14px 16px',boxShadow:'var(--shadow)'}}>
              <div style={{fontSize:18,marginBottom:4}}>{k.icon}</div>
              <div style={{fontSize:22,fontWeight:700,color:k.color}}>{k.val}</div>
              <div style={{fontSize:11,color:'var(--muted)'}}>{k.label}</div>
            </div>
          );
        })}
      </div>

      {/* Changed SKUs */}
      {changed.length > 0 && (
        <div style={{marginBottom:20}}>
          <div className="sec" style={{marginBottom:12}}>Changed SKUs ({changed.length})</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th style={{minWidth:160}}>Title</th>
                  <th>Supplier</th>
                  <th>Prev WH Inv</th>
                  <th>New WH Inv</th>
                  <th>Prev Co. DOC</th>
                  <th>New Co. DOC</th>
                  <th>WH Inv Change</th>
                  <th>DOC Change</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {changed.map(function(item){
                  var whDelta   = (item.whInv    || 0) - (item.prevWhInv    || 0);
                  var docDelta  = (item.companyDOC||0) - (item.prevCompanyDOC||0);
                  var riskUp    = item.riskIncreased;
                  var riskDown  = item.riskDecreased;
                  var expanded  = expandedAsin === item.asin;

                  return (
                    <>
                      <tr key={item.asin}
                        style={{cursor:'pointer', background: riskUp?'#fff5f5': riskDown?'#f0fdf4':'',
                          borderLeft: riskUp?'3px solid var(--red)': riskDown?'3px solid var(--green)':'3px solid transparent'}}
                        onClick={function(){setExpandedAsin(expanded?null:item.asin);}}>
                        <td style={{fontWeight:600}}>{item.sku||item.asin}</td>
                        <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',fontSize:11}}>{item.title||'-'}</td>
                        <td><span className="badge badge-supplier">{item.supplier}</span></td>
                        <td style={{color:'var(--muted)'}}>{fmtN(item.prevWhInv)}</td>
                        <td style={{fontWeight:600}}>{fmtN(item.whInv)}</td>
                        <td style={{color:'var(--muted)'}}>{fDoc(item.prevCompanyDOC)}</td>
                        <td style={{fontWeight:600,color:item.companyDOC<30?'var(--red)':item.companyDOC<60?'var(--orange)':'var(--green)'}}>{fDoc(item.companyDOC)}</td>
                        <td style={{fontWeight:600,color:whDelta>=0?'var(--green)':'var(--red)'}}>
                          {whDelta>=0?'+':''}{fmtN(whDelta)}
                        </td>
                        <td style={{fontWeight:600,color:docDelta>=0?'var(--green)':'var(--red)'}}>
                          {docDelta>=0?'+':''}{docDelta.toFixed(1)}d
                        </td>
                        <td>
                          {riskUp  && <span style={{background:'#fee2e2',color:'var(--red)',padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:600}}>⬆ Risk Up</span>}
                          {riskDown&& <span style={{background:'#dcfce7',color:'var(--green)',padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:600}}>⬇ Risk Down</span>}
                          {!riskUp&&!riskDown&&<span style={{color:'var(--muted)',fontSize:11}}>Neutral</span>}
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={item.asin+'-detail'}>
                          <td colSpan={10} style={{background:'var(--bg3)',padding:'12px 16px'}}>
                            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10}}>
                              {[
                                {label:'WH Inv',     prev:item.prevWhInv,    curr:item.whInv},
                                {label:'AMZ Inv',    prev:item.prevAmzInv,   curr:item.amzInv},
                                {label:'Total Inv',  prev:item.prevTotalInv, curr:item.totalInv},
                                {label:'Total DRR',  prev:item.prevTotalDRR, curr:item.totalDRR},
                                {label:'Co. DOC',    prev:item.prevCompanyDOC, curr:item.companyDOC, isDoc:true},
                                {label:'WH DOC',     prev:item.prevWhDOC,    curr:item.whDOC, isDoc:true},
                                {label:'Suggest Qty',prev:item.prevSuggestQty,curr:item.suggestQty},
                              ].map(function(f){
                                var delta = (f.curr||0) - (f.prev||0);
                                var fmt = function(v){ return f.isDoc ? fDoc(v) : fmtN(v); };
                                return (
                                  <div key={f.label} style={{background:'var(--card)',borderRadius:8,padding:'8px 12px',border:'1px solid var(--border)'}}>
                                    <div style={{fontSize:10,color:'var(--muted)',marginBottom:4}}>{f.label}</div>
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                      <span style={{color:'var(--muted)',fontSize:12}}>{fmt(f.prev)}</span>
                                      <span style={{fontSize:10,color:'var(--muted)'}}>→</span>
                                      <span style={{fontWeight:700,fontSize:13}}>{fmt(f.curr)}</span>
                                    </div>
                                    <div style={{fontSize:10,color:delta>=0?'var(--green)':'var(--red)',marginTop:2,fontWeight:600}}>
                                      {delta>=0?'+':''}{f.isDoc?delta.toFixed(1)+'d':fmtN(delta)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New SKUs */}
      {newSKUs.length > 0 && (
        <div style={{marginBottom:20}}>
          <div className="sec" style={{color:'var(--green)',marginBottom:10}}>✅ New SKUs Added ({newSKUs.length})</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>SKU</th><th>ASIN</th><th>Supplier</th><th>Co. DOC</th><th>Action</th></tr></thead>
              <tbody>
                {newSKUs.slice(0,30).map(function(r){
                  return (
                    <tr key={r.asin}>
                      <td style={{fontWeight:500}}>{r.sku||'-'}</td>
                      <td style={{fontSize:10,fontFamily:'monospace',color:'var(--muted)'}}>{r.asin}</td>
                      <td><span className="badge badge-supplier">{r.supplier}</span></td>
                      <td style={{fontWeight:600,color:r.companyDOC<30?'var(--red)':'var(--green)'}}>{fDoc(r.companyDOC)}</td>
                      <td>{r.actionType==='supplier_po_required'?<span className="action-need">Need PO</span>:<span className="action-ok">OK</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Removed SKUs */}
      {removed.length > 0 && (
        <div>
          <div className="sec" style={{color:'var(--red)',marginBottom:10}}>❌ Removed SKUs ({removed.length})</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>SKU</th><th>ASIN</th><th>Supplier</th><th>Last Co. DOC</th></tr></thead>
              <tbody>
                {removed.slice(0,30).map(function(r){
                  return (
                    <tr key={r.asin}>
                      <td style={{fontWeight:500}}>{r.sku||'-'}</td>
                      <td style={{fontSize:10,fontFamily:'monospace',color:'var(--muted)'}}>{r.asin}</td>
                      <td><span className="badge badge-supplier">{r.supplier}</span></td>
                      <td>{fDoc(r.companyDOC)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {changed.length === 0 && newSKUs.length === 0 && removed.length === 0 && (
        <Empty icon="✅" title="No changes between uploads" desc="All SKUs and values are identical." />
      )}
    </div>
  );
}
