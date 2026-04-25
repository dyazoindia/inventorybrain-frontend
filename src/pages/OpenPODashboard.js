import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Empty, Loading, fmtN } from '../components/ui';
import toast from 'react-hot-toast';

var PORTALS = ['AMZ', 'FLK', 'ZPT', 'BLK'];
var PNAME = { AMZ: 'Amazon', FLK: 'Flipkart', ZPT: 'Zepto', BLK: 'Blinkit' };
var PCOL = { AMZ: '#e65100', FLK: '#1565c0', ZPT: '#1b5e20', BLK: '#6a1b9a' };

export default function OpenPODashboard() {
  var auth = useAuth();
  var isAdmin = auth.isAdmin;
  var portal = useState('AMZ');
  var activePortal = portal[0];
  var setPortal = portal[1];
  var srch = useState('');
  var search = srch[0];
  var setSearch = srch[1];

  var inv = useQuery({
    queryKey: ['inventory-all'],
    queryFn: function() {
      return inventoryApi.getLatest().then(function(r) { return r.data; });
    }
  });

  var allRows = inv.data && inv.data.rows ? inv.data.rows : [];

  var filtered = allRows;
  if (search) {
    var q = search.toLowerCase();
    filtered = allRows.filter(function(r) {
      var s = r.sku ? r.sku.toLowerCase() : '';
      var a = r.asin ? r.asin.toLowerCase() : '';
      var t = r.title ? r.title.toLowerCase() : '';
      return s.indexOf(q) >= 0 || a.indexOf(q) >= 0 || t.indexOf(q) >= 0;
    });
  }

  if (inv.isLoading) {
    return <Loading text="Loading..." />;
  }

  function getDocColor(v) {
    if (!v && v !== 0) return 'var(--muted)';
    if (v < 7) return 'var(--red)';
    if (v < 15) return 'var(--orange)';
    if (v < 30) return 'var(--yellow)';
    return 'var(--green)';
  }

  function getStatus(doc, openPO) {
    if (doc === null || doc === undefined) return null;
    var hasPO = openPO > 0;
    if (!hasPO && doc < 30) return 'PO Required';
    if (hasPO && doc < 7) return 'Please Send';
    if (hasPO && doc < 15) return 'Critical';
    if (hasPO && doc < 30) return 'Urgent PO';
    if (hasPO && doc >= 30) return 'PO Sent';
    return null;
  }

  function getStatusCls(st) {
    if (st === 'PO Required') return 'badge badge-po';
    if (st === 'Please Send') return 'badge badge-critical';
    if (st === 'Critical') return 'badge badge-critical';
    if (st === 'Urgent PO') return 'badge badge-urgent';
    if (st === 'PO Sent') return 'badge badge-ok';
    return 'badge badge-gray';
  }

  function fmtDoc(v) {
    if (v === null || v === undefined || !isFinite(v)) return '\u2014';
    return (Math.round(v * 10) / 10) + 'd';
  }

  var portalKey = activePortal.toLowerCase();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="sec" style={{ marginBottom: 0 }}>
          Open PO Dashboard
        </div>
      </div>

      <div style={{ display: 'flex', marginBottom: 16, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', width: 'fit-content' }}>
        {PORTALS.map(function(p) {
          var active = activePortal === p;
          return (
            <button key={p}
              onClick={function() { setPortal(p); }}
              style={{
                padding: '10px 18px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                background: active ? PCOL[p] : '#f5f6fa',
                color: active ? '#fff' : PCOL[p]
              }}>
              {PNAME[p]}
            </button>
          );
        })}
      </div>

      <div className="info-box" style={{ marginBottom: 14 }}>
        <strong>Portal PO Status:</strong> Shows DOC and PO status per portal. PO Required = DOC below 30, no PO. Urgent/Critical = DOC below 30, PO exists.
      </div>

      <div className="filter-row" style={{ marginBottom: 12 }}>
        <input
          className="filter-input"
          placeholder="Search SKU / ASIN / Title..."
          value={search}
          onChange={function(e) { setSearch(e.target.value); }}
        />
        <span className="filter-count" style={{ marginLeft: 'auto' }}>
          {filtered.length} rows
        </span>
      </div>

      {filtered.length === 0 ? (
        <Empty icon="📦" title="No products found" desc="Try clearing search." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th style={{ minWidth: 140 }}>Title</th>
                <th>Supplier</th>
                <th>WH Inv</th>
                <th>Open PO</th>
                <th>Suggest Qty</th>
                <th>AMZ DOC</th>
                <th>FLK DOC</th>
                <th>ZPT DOC</th>
                <th>BLK DOC</th>
                <th>Co. DOC</th>
                <th>AMZ Status</th>
                <th>FLK Status</th>
                <th>ZPT Status</th>
                <th>BLK Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(function(r) {
                var amzSt = getStatus(r.amzDOC, r.openPO);
                var flkSt = getStatus(r.flkDOC, r.openPO);
                var zptSt = getStatus(r.zptDOC, r.openPO);
                var blkSt = getStatus(r.blkDOC, r.openPO);
                return (
                  <tr key={r.asin}>
                    <td style={{ fontWeight: 500 }}>{r.sku || r.asin}</td>
                    <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}>{r.title || '\u2014'}</td>
                    <td><span className="badge badge-supplier">{r.supplier}</span></td>
                    <td style={{ fontWeight: 500, color: r.whInv === 0 ? 'var(--red)' : 'var(--text)' }}>{fmtN(r.whInv)}</td>
                    <td style={{ color: r.openPO > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: r.openPO > 0 ? 600 : 400 }}>{fmtN(r.openPO)}</td>
                    <td style={{ color: 'var(--blue)', fontWeight: 600 }}>{r.suggestQty > 0 ? fmtN(r.suggestQty) : '\u2014'}</td>
                    <td><span style={{ fontWeight: 600, color: getDocColor(r.amzDOC) }}>{fmtDoc(r.amzDOC)}</span></td>
                    <td><span style={{ fontWeight: 600, color: getDocColor(r.flkDOC) }}>{fmtDoc(r.flkDOC)}</span></td>
                    <td><span style={{ fontWeight: 600, color: getDocColor(r.zptDOC) }}>{fmtDoc(r.zptDOC)}</span></td>
                    <td><span style={{ fontWeight: 600, color: getDocColor(r.blkDOC) }}>{fmtDoc(r.blkDOC)}</span></td>
                    <td><span style={{ fontWeight: 700, color: getDocColor(r.companyDOC) }}>{fmtDoc(r.companyDOC)}</span></td>
                    <td>{amzSt ? <span className={getStatusCls(amzSt)}>{amzSt}</span> : <span className="badge badge-gray">{'\u2014'}</span>}</td>
                    <td>{flkSt ? <span className={getStatusCls(flkSt)}>{flkSt}</span> : <span className="badge badge-gray">{'\u2014'}</span>}</td>
                    <td>{zptSt ? <span className={getStatusCls(zptSt)}>{zptSt}</span> : <span className="badge badge-gray">{'\u2014'}</span>}</td>
                    <td>{blkSt ? <span className={getStatusCls(blkSt)}>{blkSt}</span> : <span className="badge badge-gray">{'\u2014'}</span>}</td>
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
