import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Empty, Loading, fmtN } from '../components/ui';
import { exportToCSV } from '../components/ui/exportUtils';

var PORTALS = ['AMZ', 'FLK', 'ZPT', 'BLK'];
var PNAME   = { AMZ: 'Amazon', FLK: 'Flipkart', ZPT: 'Zepto', BLK: 'Blinkit' };
var PCOLOR  = { AMZ: '#e65100', FLK: '#1565c0', ZPT: '#1b5e20', BLK: '#6a1b9a' };
var PBORDER = { AMZ: '#fff3e0', FLK: '#e8f4fd', ZPT: '#e8fdf5', BLK: '#f3e5f5' };

var fmtDoc = function(v) {
  return (v !== null && v !== undefined && isFinite(v)) ? (Math.round(v * 10) / 10) + 'd' : '\u2014';
};
var fmtDRR = function(v) {
  return v ? parseFloat(v).toFixed(2).replace(/\.?0+$/, '') : '\u2014';
};

function getPortalStatus(portalDOC, portalOpenPO) {
  if (portalDOC === null || portalDOC === undefined) return null;
  var hasPO = portalOpenPO > 0;
  if (!hasPO && portalDOC < 30) return { label: 'PO Required',     cls: 'badge-po',       color: 'var(--yellow)' };
  if (hasPO  && portalDOC < 7)  return { label: 'Please Send',     cls: 'badge-critical', color: 'var(--red)' };
  if (hasPO  && portalDOC < 15) return { label: 'Critical',        cls: 'badge-critical', color: 'var(--red)' };
  if (hasPO  && portalDOC < 30) return { label: 'Urgent PO Sent',  cls: 'badge-urgent',   color: 'var(--orange)' };
  if (hasPO  && portalDOC >= 30)return { label: 'PO Sent OK',      cls: 'badge-ok',       color: 'var(--green)' };
  return null;
}

export default function OpenPODashboard() {
  var auth   = useAuth();
  var isAdmin = auth.isAdmin;
  var isOps   = auth.user && auth.user.role === 'operations';

  var activePortalState = useState('AMZ');
  var activePortal = activePortalState[0];
  var setActivePortal = activePortalState[1];

  var searchState = useState('');
  var search    = searchState[0];
  var setSearch = searchState[1];

  // Per-row shipped qty edits (stored locally until saved)
  var shippedState = useState({});
  var shippedQtys = shippedState[0];
  var setShippedQtys = shippedState[1];

  var inv = useQuery({
    queryKey: ['inventory-all'],
    queryFn: function() { return inventoryApi.getLatest().then(function(r) { return r.data; }); }
  });

  var allRows = (inv.data && inv.data.rows) ? inv.data.rows : [];

  // Get portal-specific field keys
  var p = activePortal.toLowerCase();
  var invKey   = p + 'Inv';
  var drrKey   = p + 'DRR';
  var docKey   = p + 'DOC';
  var openPOKey = p + 'OpenPO'; // custom field from Excel if available, else use openPO

  // Filter + search
  var rows = allRows;
  if (search) {
    var q = search.toLowerCase();
    rows = rows.filter(function(r) {
      return (r.sku   && r.sku.toLowerCase().indexOf(q)   >= 0) ||
             (r.asin  && r.asin.toLowerCase().indexOf(q)  >= 0) ||
             (r.title && r.title.toLowerCase().indexOf(q) >= 0);
    });
  }

  // Summary counts per portal for the tab badges
  function getPortalCount(portal) {
    var pk = portal.toLowerCase();
    return allRows.filter(function(r) {
      var doc = r[pk + 'DOC'];
      return doc !== null && doc !== undefined && doc < 30;
    }).length;
  }

  // Export current portal view
  function doExport() {
    exportToCSV(rows, [
      { key: 'sku',     label: 'SKU' },
      { key: 'title',   label: 'Title' },
      { key: 'supplier',label: 'Supplier' },
      { key: 'category',label: 'Category' },
      { key: 'whInv',   label: 'WH Inv' },
      { key: invKey,    label: PNAME[activePortal] + ' Inv',     getValue: function(r) { return r[invKey] || 0; } },
      { key: drrKey,    label: PNAME[activePortal] + ' DRR',     getValue: function(r) { return fmtDRR(r[drrKey]); } },
      { key: docKey,    label: PNAME[activePortal] + ' DOC',     getValue: function(r) { return fmtDoc(r[docKey]); } },
      { key: 'openPO',  label: PNAME[activePortal] + ' Open PO', getValue: function(r) { return r[openPOKey] || r.openPO || 0; } },
      { key: 'shipped', label: 'Shipped Qty', getValue: function(r) { return shippedQtys[r.asin] || 0; } },
      { key: 'pending', label: 'Pending Qty', getValue: function(r) {
        var opo = r[openPOKey] || r.openPO || 0;
        var sh  = shippedQtys[r.asin] || 0;
        return Math.max(0, opo - sh);
      }},
      { key: 'companyDOC', label: 'Company DOC', getValue: function(r) { return fmtDoc(r.companyDOC); } }
    ], 'open_po_' + activePortal.toLowerCase());
  }

  if (inv.isLoading) return <Loading text="Loading Open PO data..." />;

  var color  = PCOLOR[activePortal];
  var border = PBORDER[activePortal];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="sec" style={{ marginBottom: 0 }}>Open PO Dashboard</div>
        <button className="btn btn-ghost" onClick={doExport}>Export {PNAME[activePortal]} Data</button>
      </div>

      {/* Portal Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, width: 'fit-content', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {PORTALS.map(function(portal) {
          var active = activePortal === portal;
          var cnt = getPortalCount(portal);
          return (
            <button key={portal}
              onClick={function() { setActivePortal(portal); }}
              style={{
                padding: '10px 22px', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 500,
                background: active ? PCOLOR[portal] : PBORDER[portal],
                color: active ? '#fff' : PCOLOR[portal],
                borderRight: portal !== 'BLK' ? '1px solid rgba(0,0,0,.08)' : 'none',
                transition: 'all .15s'
              }}>
              {PNAME[portal]}
              {cnt > 0 && (
                <span style={{
                  marginLeft: 6,
                  background: active ? 'rgba(255,255,255,.25)' : PCOLOR[portal] + '22',
                  borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700
                }}>{cnt}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Info Box */}
      <div className="info-box" style={{ marginBottom: 14 }}>
        <strong>{PNAME[activePortal]} Open PO View:</strong>
        &nbsp;Shows WH Inv + {PNAME[activePortal]} Inv + {PNAME[activePortal]} DRR + {PNAME[activePortal]} DOC + Open PO &nbsp;|&nbsp;
        Ops team enters <strong>Shipped Qty</strong> &nbsp;|&nbsp;
        <strong>Pending = Open PO - Shipped</strong>
      </div>

      {/* Search + filter */}
      <div className="filter-row" style={{ marginBottom: 12 }}>
        <input className="filter-input" placeholder={'Search ' + PNAME[activePortal] + ' products...'}
          value={search} onChange={function(e) { setSearch(e.target.value); }} />
        <span className="filter-count" style={{ marginLeft: 'auto' }}>{rows.length} rows</span>
      </div>

      {rows.length === 0
        ? <Empty icon="📦" title="No products found" />
        : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 130 }}>SKU</th>
                  <th style={{ minWidth: 180 }}>Title</th>
                  <th>Supplier</th>
                  <th>Category</th>
                  {/* WH Inv */}
                  <th style={{ background: '#f0fdf4', color: '#16a34a', fontWeight: 700 }}>WH Inv</th>
                  {/* Portal-specific columns */}
                  <th style={{ background: border, color: color, fontWeight: 700 }}>
                    {PNAME[activePortal]} Inv
                  </th>
                  <th style={{ background: border, color: color }}>
                    {PNAME[activePortal]} DRR
                  </th>
                  <th style={{ background: border, color: color }}>
                    {PNAME[activePortal]} DOC
                  </th>
                  <th style={{ background: border, color: color, fontWeight: 700 }}>
                    {PNAME[activePortal]} Open PO
                  </th>
                  {/* Ops editable */}
                  <th style={{ background: '#fffde7', color: 'var(--yellow)', fontWeight: 700 }}>
                    Shipped Qty
                  </th>
                  <th style={{ background: '#fef2f2', color: 'var(--red)', fontWeight: 700 }}>
                    Pending Qty
                  </th>
                  {/* Company DOC */}
                  <th>Company DOC</th>
                  {/* Status */}
                  <th style={{ background: border, color: color }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(function(r) {
                  var portalInv   = r[invKey]    || 0;
                  var portalDRR   = r[drrKey]    || 0;
                  var portalDOC   = r[docKey];
                  var portalOpenPO = r[openPOKey] !== undefined ? r[openPOKey] : (r.openPO || 0);
                  var shipped     = shippedQtys[r.asin] !== undefined ? parseInt(shippedQtys[r.asin]) || 0 : 0;
                  var pending     = Math.max(0, portalOpenPO - shipped);
                  var status      = getPortalStatus(portalDOC, portalOpenPO);

                  var docColor = 'var(--green)';
                  if (portalDOC !== null && portalDOC !== undefined) {
                    if (portalDOC < 7) docColor = 'var(--red)';
                    else if (portalDOC < 15) docColor = 'var(--orange)';
                    else if (portalDOC < 30) docColor = 'var(--yellow)';
                  }

                  return (
                    <tr key={r.asin}>
                      <td style={{ fontWeight: 500 }}>{r.sku || r.asin}</td>
                      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}>
                        {r.productLink
                          ? <a href={r.productLink} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none' }}>{r.title || '\u2014'}</a>
                          : r.title || '\u2014'}
                      </td>
                      <td><span className="badge badge-supplier">{r.supplier}</span></td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{r.category || '\u2014'}</td>

                      {/* WH Inv */}
                      <td style={{ background: '#f0fdf4', fontWeight: 600, color: r.whInv === 0 ? 'var(--red)' : '#16a34a' }}>
                        {fmtN(r.whInv)}
                        {r.whInv === 0 && <span style={{ fontSize: 9, marginLeft: 3, color: 'var(--red)' }}>EMPTY</span>}
                      </td>

                      {/* Portal Inv */}
                      <td style={{ background: border, fontWeight: 500 }}>{fmtN(portalInv)}</td>

                      {/* Portal DRR */}
                      <td style={{ background: border }}>{fmtDRR(portalDRR)}</td>

                      {/* Portal DOC */}
                      <td style={{ background: border, fontWeight: 700, color: docColor }}>
                        {fmtDoc(portalDOC)}
                      </td>

                      {/* Portal Open PO */}
                      <td style={{ background: border, fontWeight: portalOpenPO > 0 ? 700 : 400, color: portalOpenPO > 0 ? color : 'var(--muted)' }}>
                        {fmtN(portalOpenPO)}
                      </td>

                      {/* Shipped Qty — Ops team editable */}
                      <td style={{ background: '#fffde7' }}>
                        {(isAdmin || isOps) ? (
                          <input
                            type="number"
                            min="0"
                            max={portalOpenPO}
                            value={shippedQtys[r.asin] !== undefined ? shippedQtys[r.asin] : ''}
                            placeholder="0"
                            onChange={function(e) {
                              var n = {}; n[r.asin] = e.target.value;
                              setShippedQtys(Object.assign({}, shippedQtys, n));
                            }}
                            style={{
                              width: 70, padding: '3px 6px',
                              border: '1px solid var(--border)', borderRadius: 5,
                              fontFamily: 'inherit', fontSize: 12, textAlign: 'center',
                              background: '#fffde7'
                            }}
                          />
                        ) : (
                          <span style={{ fontWeight: 600, color: 'var(--teal)' }}>{fmtN(shipped)}</span>
                        )}
                      </td>

                      {/* Pending Qty — auto calculated */}
                      <td style={{ background: '#fef2f2', fontWeight: 700, color: pending > 0 ? 'var(--red)' : 'var(--green)' }}>
                        {fmtN(pending)}
                      </td>

                      {/* Company DOC */}
                      <td style={{ fontWeight: 600, color: r.companyDOC !== null ? (r.companyDOC <= 120 ? 'var(--green)' : r.companyDOC <= 150 ? 'var(--orange)' : 'var(--red)') : 'var(--muted)' }}>
                        {fmtDoc(r.companyDOC)}
                      </td>

                      {/* Status */}
                      <td>
                        {status
                          ? <span className={'badge ' + status.cls}>{status.label}</span>
                          : <span style={{ color: 'var(--muted)', fontSize: 11 }}>\u2014</span>}
                      </td>
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
