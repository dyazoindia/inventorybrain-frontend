import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { inventoryApi } from '../utils/api';
import { Empty, Loading, fmtN } from '../components/ui';
import AllProductsPage from './AllProductsPage';

var PLATFORMS = ['AMZ', 'FLK', 'ZPT', 'BLK'];
var PNAMES = { AMZ: 'Amazon', FLK: 'Flipkart', ZPT: 'Zepto', BLK: 'Blinkit' };
var PCOLORS = { AMZ: '#e65100', FLK: '#1565c0', ZPT: '#1b5e20', BLK: '#6a1b9a' };

export default function AdminDashboard() {
  var [activeFilter, setActiveFilter] = useState(null);
  var navigate = useNavigate();

  // Use /latest instead of /stats — more reliable after Render wake-up
  var inv = useQuery({
    queryKey: ['dashboard-latest'],
    queryFn: function() { return inventoryApi.getLatest().then(function(r) { return r.data; }); },
    retry: 3,
    retryDelay: 2000,
    staleTime: 30000
  });

  if (inv.isLoading) return <Loading text="Loading dashboard..." />;

  if (activeFilter !== null) {
    return (
      <div>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={function() { setActiveFilter(null); }}>
          Back to Dashboard
        </button>
        <AllProductsPage initialFilter={activeFilter} />
      </div>
    );
  }

  var rows = (inv.data && inv.data.rows) ? inv.data.rows : [];

  if (!rows.length) {
    return (
      <div>
        <div className="sec" style={{ marginBottom: 16 }}>Admin Dashboard</div>
        <Empty icon="📊" title="No inventory data yet"
          desc='Go to Upload Data in the sidebar to upload your Excel file.' />
      </div>
    );
  }

  // Calculate stats from rows directly
  var totalSKUs = rows.length;
  var totalInv  = 0;
  var totalDRR  = 0;
  var alerts    = { critical: 0, urgent: 0, po_required: 0, ok: 0 };
  var health    = { healthy: 0, unhealthy: 0, very_unhealthy: 0, dead_inventory: 0 };
  var supStats  = { CHINA: { needPO: 0, stockOk: 0, total: 0 }, MD: { needPO: 0, stockOk: 0, total: 0 } };
  var pDocs     = { AMZ: [], FLK: [], ZPT: [], BLK: [] };
  var pOOS      = { AMZ: 0, FLK: 0, ZPT: 0, BLK: 0 };
  var pUrg      = { AMZ: 0, FLK: 0, ZPT: 0, BLK: 0 };

  rows.forEach(function(r) {
    totalInv += r.totalInv || 0;
    totalDRR += r.totalDRR || 0;
    var doc = r.companyDOC;
    if (doc !== null && doc !== undefined) {
      if (doc < 7) alerts.critical++;
      else if (doc < 15) alerts.urgent++;
      else if (doc < 30) alerts.po_required++;
      else alerts.ok++;
      if (doc > 180) health.dead_inventory++;
      else if (doc > 150) health.very_unhealthy++;
      else if (doc > 120) health.unhealthy++;
      else health.healthy++;
    }
    var sup = r.supplier;
    if (sup === 'CHINA' || sup === 'MD') {
      supStats[sup].total++;
      var threshold = sup === 'CHINA' ? 120 : 60;
      if (r.actionType === 'supplier_po_required') supStats[sup].needPO++;
      else supStats[sup].stockOk++;
    }
    PLATFORMS.forEach(function(p) {
      var drr = r[p.toLowerCase()+'DRR'] || 0;
      var inv2 = r[p.toLowerCase()+'Inv'] || 0;
      var d = drr > 0 ? inv2 / drr : null;
      if (d !== null) {
        pDocs[p].push(d);
        if (d < 7) pOOS[p]++; else if (d < 15) pUrg[p]++;
      }
    });
  });

  var companyDOC = totalDRR > 0 ? Math.round(totalInv / totalDRR * 10) / 10 : 0;
  var docColor = companyDOC < 30 ? 'var(--red)' : companyDOC < 60 ? 'var(--orange)' : 'var(--green)';

  var platformStats = {};
  PLATFORMS.forEach(function(p) {
    var docs = pDocs[p];
    platformStats[p] = {
      avgDOC: docs.length > 0 ? docs.reduce(function(a,b){return a+b;},0)/docs.length : null,
      oosRisk: pOOS[p], urgent: pUrg[p]
    };
  });

  var cardStyle = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px', position:'relative', overflow:'hidden', boxShadow:'var(--shadow)', cursor:'pointer', transition:'box-shadow .15s' };

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div className="sec" style={{ marginBottom:0 }}>Admin Dashboard</div>
        <div style={{ fontSize:11, color:'var(--muted)' }}>
          Last upload: {inv.data && inv.data.uploadedAt ? new Date(inv.data.uploadedAt).toLocaleString() : ''} &nbsp;·&nbsp; {inv.data && inv.data.fileName}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kgrid">
        {[
          { label:'Total Inventory', value:fmtN(totalInv), sub:'click to view all', bar:'linear-gradient(90deg,var(--blue),#7c3aed)', color:'var(--blue)', filter:'all' },
          { label:'Daily Run Rate',  value:totalDRR.toFixed(1), sub:'units/day', bar:'var(--purple)', color:'var(--purple)', filter:null },
          { label:'Company DOC',     value:companyDOC+'d', sub:'click for low DOC', bar:docColor, color:docColor, filter:'low' },
          { label:'Active SKUs',     value:totalSKUs, sub:'click to view all', bar:'var(--teal)', color:'var(--teal)', filter:'all' },
          { label:'Critical Stock',  value:alerts.critical, sub:'DOC < 7 days', bar:'var(--red)', color:'var(--red)', filter:'critical' }
        ].map(function(k) {
          return (
            <div key={k.label} style={cardStyle}
              onClick={function() { if (k.filter) setActiveFilter(k.filter); }}
              onMouseEnter={function(e) { if (k.filter) e.currentTarget.style.boxShadow='var(--shadow-md)'; }}
              onMouseLeave={function(e) { e.currentTarget.style.boxShadow='var(--shadow)'; }}>
              <div className="kbar" style={{ background:k.bar }} />
              <div className="klbl">{k.label}</div>
              <div className="kval" style={{ color:k.color }}>{k.value}</div>
              <div className="ksub">{k.sub}</div>
              {k.filter && <div style={{ fontSize:10, color:'var(--blue)', marginTop:4 }}>View</div>}
            </div>
          );
        })}
      </div>

      {/* Alert pills */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:18 }}>
        {[
          { label:'Critical (<7d)',   count:alerts.critical,    filter:'critical', color:'var(--red)' },
          { label:'Urgent (7-14d)',   count:alerts.urgent,      filter:'urgent',   color:'var(--orange)' },
          { label:'PO Required',      count:alerts.po_required, filter:'po',       color:'var(--yellow)' },
          { label:'Stock OK',         count:alerts.ok,          filter:'all',      color:'var(--green)' }
        ].map(function(a) {
          return (
            <div key={a.filter} onClick={function() { setActiveFilter(a.filter); }}
              style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:20, padding:'6px 14px', fontSize:12, display:'flex', alignItems:'center', gap:8, cursor:'pointer', boxShadow:'var(--shadow)' }}>
              <span style={{ fontWeight:700, fontSize:15, color:a.color }}>{a.count}</span>
              <span>{a.label}</span>
            </div>
          );
        })}
      </div>

      {/* Supplier Summary */}
      <div className="sec" style={{ marginBottom:10 }}>Supplier Action Summary</div>
      <div className="kgrid" style={{ marginBottom:18 }}>
        {['CHINA','MD'].map(function(sup) {
          return (
            <div key={sup} style={cardStyle}
              onClick={function() { navigate(sup==='CHINA'?'/admin/china':'/admin/md'); }}
              onMouseEnter={function(e){e.currentTarget.style.boxShadow='var(--shadow-md)';}}
              onMouseLeave={function(e){e.currentTarget.style.boxShadow='var(--shadow)';}}>
              <div className="kbar" style={{ background:sup==='CHINA'?'var(--purple)':'var(--orange)' }} />
              <div className="klbl">{sup} Supplier</div>
              <div style={{ display:'flex', gap:16, marginTop:8 }}>
                <div><div style={{ fontSize:22, fontWeight:700, color:'var(--red)' }}>{supStats[sup].needPO}</div><div style={{ fontSize:10, color:'var(--muted)' }}>Need PO</div></div>
                <div><div style={{ fontSize:22, fontWeight:700, color:'var(--green)' }}>{supStats[sup].stockOk}</div><div style={{ fontSize:10, color:'var(--muted)' }}>Stock OK</div></div>
                <div><div style={{ fontSize:22, fontWeight:700, color:'var(--muted)' }}>{supStats[sup].total}</div><div style={{ fontSize:10, color:'var(--muted)' }}>Total</div></div>
              </div>
              <div style={{ fontSize:10, color:'var(--blue)', marginTop:8 }}>Click to view</div>
            </div>
          );
        })}

        {/* Health card */}
        <div style={Object.assign({},cardStyle,{cursor:'default'})}>
          <div className="kbar" style={{ background:'var(--green)' }} />
          <div className="klbl">Inventory Health</div>
          <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:8 }}>
            {[
              { label:'Healthy',        val:health.healthy,        color:'var(--green)',  filter:'all' },
              { label:'Unhealthy',      val:health.unhealthy,      color:'var(--yellow)', filter:'over' },
              { label:'Very Unhealthy', val:health.very_unhealthy, color:'var(--orange)', filter:'over' },
              { label:'Dead Inventory', val:health.dead_inventory,  color:'var(--red)',   filter:'dead' }
            ].map(function(h) {
              return (
                <div key={h.label} style={{ display:'flex', justifyContent:'space-between', fontSize:12, cursor:'pointer' }}
                  onClick={function(){setActiveFilter(h.filter);}}>
                  <span style={{ color:'var(--muted)' }}>{h.label}</span>
                  <span style={{ fontWeight:700, color:h.color }}>{h.val}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Platform DOC */}
      <div className="sec" style={{ marginBottom:10 }}>Platform Average DOC</div>
      <div className="kgrid" style={{ marginBottom:24 }}>
        {PLATFORMS.map(function(p) {
          var ps = platformStats[p];
          var avg = ps && ps.avgDOC;
          var color = !avg ? 'var(--muted)' : avg < 15 ? 'var(--red)' : avg < 30 ? 'var(--orange)' : 'var(--green)';
          return (
            <div key={p} style={Object.assign({},cardStyle,{cursor:'default'})}>
              <div style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'.7px', color:PCOLORS[p], marginBottom:8 }}>{PNAMES[p]}</div>
              <div style={{ fontSize:22, fontWeight:700, color:color, marginBottom:2 }}>{avg ? avg.toFixed(1)+'d' : '\u2014'}</div>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:8 }}>avg. days of cover</div>
              <div style={{ fontSize:10, display:'flex', gap:8 }}>
                <span style={{ color:'var(--red)', fontWeight:600 }}>OOS: {ps?ps.oosRisk:0}</span>
                <span style={{ color:'var(--orange)', fontWeight:600 }}>Urgent: {ps?ps.urgent:0}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mini table — most at risk */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div className="sec" style={{ marginBottom:0 }}>Most At-Risk Products</div>
        <button className="btn btn-primary btn-sm" onClick={function(){setActiveFilter('all');}}>View All {totalSKUs} Products</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>SKU</th><th>Title</th><th>Supplier</th><th>WH Inv</th><th>DRR</th><th>Co. DOC</th><th>Action</th></tr>
          </thead>
          <tbody>
            {rows.filter(function(r){return r.companyDOC!==null;})
              .sort(function(a,b){return (a.companyDOC||999)-(b.companyDOC||999);})
              .slice(0,15)
              .map(function(r) {
                var docC = r.companyDOC < 7?'var(--red)':r.companyDOC<15?'var(--orange)':r.companyDOC<30?'var(--yellow)':'var(--green)';
                return (
                  <tr key={r.asin}>
                    <td style={{fontWeight:500}}>{r.sku||r.asin}</td>
                    <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',fontSize:11}}>{r.title||'\u2014'}</td>
                    <td><span className="badge badge-supplier">{r.supplier}</span></td>
                    <td style={{color:r.whInv===0?'var(--red)':'var(--text)',fontWeight:r.whInv===0?700:400}}>{fmtN(r.whInv)}</td>
                    <td>{r.totalDRR?r.totalDRR.toFixed(1):'\u2014'}</td>
                    <td><span style={{fontWeight:700,color:docC}}>{r.companyDOC?r.companyDOC.toFixed(1)+'d':'\u2014'}</span></td>
                    <td>
                      {r.actionType==='supplier_po_required'&&<span className="action-need">Need PO</span>}
                      {r.actionType==='supplier_po_inprogress'&&<span className="badge badge-confirmed">In Progress</span>}
                      {r.actionType==='no_action'&&<span className="action-ok">No Action</span>}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <div style={{ textAlign:'center', marginTop:12 }}>
        <button className="btn btn-ghost" onClick={function(){setActiveFilter('all');}}>View all {totalSKUs} products</button>
      </div>
    </div>
  );
}
