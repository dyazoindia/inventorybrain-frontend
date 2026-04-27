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

var PO_STATUS_MAP = {
  draft:              { cls: 'badge-gray',      label: 'No PO' },
  admin_approved:     { cls: 'badge-po',        label: 'Final Qty Set' },
  supplier_confirmed: { cls: 'badge-confirmed', label: 'In Manufacturing' },
  shipped:            { cls: 'badge-transit',   label: 'In Transit' },
  delivered:          { cls: 'badge-ok',        label: 'Delivered' },
  rejected:           { cls: 'badge-rejected',  label: 'Rejected' }
};

var TABS = ['all', 'need_po', 'manufacturing', 'shipped', 'delivered', 'no_action'];
var TAB_LABELS = {
  all:           'All SKUs',
  need_po:       'Need PO',
  manufacturing: 'Manufacturing',
  shipped:       'Shipped / Transit',
  delivered:     'Delivered',
  no_action:     'No Action'
};

export default function ChinaDashboard() {
  var auth = useAuth();
  var isAdmin = auth.isAdmin;
  var qc = useQueryClient();

  var [activeTab, setActiveTab] = useState('all');
  var [search, setSearch] = useState('');
  var [visible, setVisible] = useState(new Set(['link','sku','title','category','whInv','whDOC','companyDOC','totalDRR','suggestQty','finalQty','confirmType','confirmedQty','shippedQty','deliveredQty','poStatus','action']));
  var [showCols, setShowCols] = useState(false);
  var [confirmInputs, setConfirmInputs] = useState({});
  var [shipInputs, setShipInputs] = useState({});

  var invQ = useQuery({
    queryKey: ['inventory-china'],
    queryFn: function() { return inventoryApi.getLatest({ supplier: 'CHINA' }).then(function(r) { return r.data; }); }
  });

  var poQ = useQuery({
    queryKey: ['pos-china'],
    queryFn: function() { return supplierPOApi.list({ supplier: 'CHINA' }).then(function(r) { return r.data; }); }
  });

  var confirmMut = useMutation({
    mutationFn: function(d) { return supplierPOApi.confirm(d.id, { poConfirmType: d.type, confirmedQty: d.qty }); },
    onSuccess: function(data) {
      toast.success(data.data.message || 'PO Confirmed! Qty moved to Manufacturing.');
      qc.invalidateQueries(['pos-china']);
      qc.invalidateQueries(['inventory-china']);
      qc.invalidateQueries(['inventory-all']);
    },
    onError: function(e) { toast.error(e.response && e.response.data ? e.response.data.error : 'Failed'); }
  });

  var shipMut = useMutation({
    mutationFn: function(d) { return supplierPOApi.ship(d.id, { shippedQty: d.qty }); },
    onSuccess: function(data) {
      toast.success(data.data.message || 'Shipped! Qty now In Transit.');
      qc.invalidateQueries(['pos-china']);
      qc.invalidateQueries(['inventory-china']);
    },
    onError: function(e) { toast.error('Failed'); }
  });

  var deliverMut = useMutation({
    mutationFn: function(d) { return supplierPOApi.deliver(d.id, { deliveredQty: d.qty }); },
    onSuccess: function(data) {
      toast.success(data.data.message || 'Delivered! Warehouse inventory updated.');
      qc.invalidateQueries(['pos-china']);
      qc.invalidateQueries(['inventory-china']);
      qc.invalidateQueries(['inventory-all']);
      qc.invalidateQueries(['dashboard-stats']);
    },
    onError: function(e) { toast.error('Failed'); }
  });

  var allRows = invQ.data && invQ.data.rows ? invQ.data.rows : [];
  var poList  = poQ.data  && poQ.data.purchaseOrders ? poQ.data.purchaseOrders : [];

  var poMap = useMemo(function() {
    var m = {};
    poList.forEach(function(po) { m[po.asin] = po; });
    return m;
  }, [poList]);

  // Tab counts
  var counts = {
    all:           allRows.length,
    need_po:       allRows.filter(function(r) { return r.actionType === 'supplier_po_required'; }).length,
    manufacturing: poList.filter(function(p) { return p.status === 'supplier_confirmed'; }).length,
    shipped:       poList.filter(function(p) { return p.status === 'shipped'; }).length,
    delivered:     poList.filter(function(p) { return p.status === 'delivered'; }).length,
    no_action:     allRows.filter(function(r) { return r.actionType === 'no_action'; }).length
  };

  // Filter rows based on active tab
  var rows = useMemo(function() {
    var r = allRows;
    if (search) {
      var q = search.toLowerCase();
      r = r.filter(function(x) {
        return (x.sku && x.sku.toLowerCase().indexOf(q) >= 0) ||
               (x.asin && x.asin.toLowerCase().indexOf(q) >= 0);
      });
    }
    if (activeTab === 'need_po')       return r.filter(function(x) { return x.actionType === 'supplier_po_required'; });
    if (activeTab === 'manufacturing') return r.filter(function(x) { var po = poMap[x.asin]; return po && po.status === 'supplier_confirmed'; });
    if (activeTab === 'shipped')       return r.filter(function(x) { var po = poMap[x.asin]; return po && po.status === 'shipped'; });
    if (activeTab === 'delivered')     return r.filter(function(x) { var po = poMap[x.asin]; return po && po.status === 'delivered'; });
    if (activeTab === 'no_action')     return r.filter(function(x) { return x.actionType === 'no_action'; });
    return r;
  }, [allRows, poMap, activeTab, search]);

  var sel = useSelection(rows);

  var doExport = function() {
    exportToCSV(sel.count > 0 ? sel.selectedRows : rows, [
      { key: 'sku', label: 'SKU' }, { key: 'title', label: 'Title' },
      { key: 'whInv', label: 'WH Inv' }, { key: 'companyDOC', label: 'Co. DOC', getValue: function(r) { return fmtDoc(r.companyDOC); } },
      { key: 'suggestQty', label: 'Suggest Qty' },
      { key: 'finalQty', label: 'Final Qty', getValue: function(r) { var po = poMap[r.asin]; return po ? po.finalQty || '' : ''; } },
      { key: 'confirmedQty', label: 'Confirmed Qty', getValue: function(r) { var po = poMap[r.asin]; return po ? po.confirmedQty || '' : ''; } },
      { key: 'shippedQty', label: 'Shipped Qty', getValue: function(r) { var po = poMap[r.asin]; return po ? po.shippedQty || '' : ''; } },
      { key: 'poStatus', label: 'PO Status', getValue: function(r) { var po = poMap[r.asin]; return po ? po.status : ''; } }
    ], 'china_supplier');
  };

  if (invQ.isLoading) return <Loading text="Loading China SKUs..." />;

  return (
    <div>
      {/* Header */}
      <div className="hero hero-china" style={{ marginBottom: 16 }}>
        <h2>🏭 China Supplier Dashboard</h2>
        <p>{allRows.length} SKUs · {counts.need_po} need PO · {counts.manufacturing} in manufacturing · {counts.shipped} shipped</p>
      </div>

      {/* PO Flow Banner */}
      <div className="info-box" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong>PO Flow:</strong>
        <span className="badge badge-po">1. Admin sets Final Qty</span>
        <span style={{ color: 'var(--muted)' }}>→</span>
        <span className="badge badge-confirmed">2. Supplier Confirms → Manufacturing</span>
        <span style={{ color: 'var(--muted)' }}>→</span>
        <span className="badge badge-transit">3. Supplier Ships → In Transit</span>
        <span style={{ color: 'var(--muted)' }}>→</span>
        <span className="badge badge-ok">4. Admin Delivers → Warehouse +Qty</span>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', width: 'fit-content' }}>
        {TABS.map(function(tab) {
          var active = activeTab === tab;
          var colors = {
            all: '#3b6ff5', need_po: '#dc2626', manufacturing: '#7c3aed',
            shipped: '#0891b2', delivered: '#16a34a', no_action: '#6b7280'
          };
          var color = colors[tab] || '#3b6ff5';
          return (
            <button key={tab} onClick={function() { setActiveTab(tab); }}
              style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: active ? 700 : 500,
                background: active ? color : 'var(--bg3)', color: active ? '#fff' : color,
                borderRight: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
              {TAB_LABELS[tab]} {counts[tab] > 0 ? <span style={{ marginLeft: 4, background: active ? 'rgba(255,255,255,.25)' : color + '20', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>{counts[tab]}</span> : ''}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div className="sec" style={{ marginBottom: 0 }}>
          {TAB_LABELS[activeTab]} <small>({rows.length})</small>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {sel.count > 0 && <button className="btn btn-success btn-sm" onClick={doExport}>Export ({sel.count})</button>}
          <button className="btn btn-ghost" onClick={doExport}>Export</button>
          <button className="btn btn-ghost" onClick={function() { setShowCols(!showCols); }}>Columns</button>
          <input className="filter-input" placeholder="Search SKU / ASIN..." value={search}
            onChange={function(e) { setSearch(e.target.value); }} style={{ width: 180 }} />
        </div>
      </div>

      {/* Selection bar */}
      {sel.count > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--blue-lt)', borderRadius: 8, padding: '8px 14px', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 500 }}>{sel.count} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={sel.clear}>Clear</button>
          <button className="btn btn-success btn-sm" onClick={doExport}>Export</button>
        </div>
      )}

      {rows.length === 0 ? <Empty icon="🏭" title={'No products in ' + TAB_LABELS[activeTab]} desc="Try a different tab." /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={sel.isAllSelected}
                    ref={function(el) { if (el) el.indeterminate = sel.isSomeSelected; }}
                    onChange={function(e) { sel.toggleAll(e.target.checked); }} />
                </th>
                <th>Link</th>
                <th>SKU</th>
                <th style={{ minWidth: 150 }}>Title</th>
                <th>Category</th>
                <th>WH Inv</th>
                <th>WH DOC</th>
                <th>Co. DOC</th>
                <th>DRR</th>
                <th>Suggest Qty</th>
                <th style={{ background: '#fffde7', color: 'var(--yellow)', fontWeight: 700 }}>Final Qty (Admin)</th>
                <th style={{ background: '#e0f2fe', color: 'var(--blue)' }}>Mfg Qty</th>
                <th>Confirm Type</th>
                <th>Confirmed Qty</th>
                <th>Shipped Qty</th>
                <th>Delivered</th>
                <th>PO Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(function(r) {
                var po = poMap[r.asin];
                var pst = PO_STATUS_MAP[po ? po.status : 'draft'] || PO_STATUS_MAP.draft;
                var ci = confirmInputs[po && po._id ? po._id : r.asin] || { type: 'full', qty: po ? po.finalQty || 0 : 0 };
                var si = shipInputs[po && po._id ? po._id : r.asin] || '';

                return (
                  <tr key={r.asin} style={{ background: sel.selected.has(r.asin) ? 'var(--blue-lt)' : '' }}>
                    <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function() { sel.toggle(r.asin); }} /></td>
                    <td>{r.productLink ? <a className="link-btn" href={r.productLink} target="_blank" rel="noreferrer">Link</a> : '\u2014'}</td>
                    <td style={{ fontWeight: 500 }}>{r.sku || '\u2014'}</td>
                    <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}>{r.title || '\u2014'}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{r.category || '\u2014'}</td>
                    <td style={{ fontWeight: 500, color: r.whInv === 0 ? 'var(--red)' : 'var(--text)' }}>{fmtN(r.whInv)}</td>
                    <td><span style={{ fontWeight: 600, color: docColor(r.whDOC) }}>{fmtDoc(r.whDOC)}</span></td>
                    <td><span style={{ fontWeight: 700, color: docColor(r.companyDOC) }}>{fmtDoc(r.companyDOC)}</span></td>
                    <td>{fmtDRR(r.totalDRR)}</td>
                    <td style={{ color: r.suggestQty > 0 ? 'var(--blue)' : 'var(--muted)', fontWeight: r.suggestQty > 0 ? 600 : 400 }}>{r.suggestQty > 0 ? fmtN(r.suggestQty) : '\u2014'}</td>

                    {/* Final Qty */}
                    <td style={{ background: '#fffde7', fontWeight: 700, color: po && po.finalQty ? 'var(--green)' : 'var(--muted)' }}>
                      {po && po.finalQty ? fmtN(po.finalQty) : '\u2014'}
                    </td>

                    {/* Mfg Qty — shows confirmed qty in manufacturing */}
                    <td style={{ background: '#e0f2fe', fontWeight: 600, color: r.mfgQty > 0 ? 'var(--blue)' : 'var(--muted)' }}>
                      {r.mfgQty > 0 ? fmtN(r.mfgQty) : '\u2014'}
                    </td>

                    {/* Confirm Type */}
                    <td>
                      {po && po.status === 'admin_approved' && !isAdmin ? (
                        <select className="filter-select" style={{ fontSize: 11, padding: '3px 6px' }}
                          value={ci.type}
                          onChange={function(e) {
                            var id = po._id.toString();
                            var n = {}; n[id] = { type: e.target.value, qty: e.target.value === 'full' ? po.finalQty : ci.qty };
                            setConfirmInputs(Object.assign({}, confirmInputs, n));
                          }}>
                          <option value="full">Full ({fmtN(po.finalQty)})</option>
                          <option value="custom">Custom Qty</option>
                        </select>
                      ) : <span style={{ fontSize: 11, color: 'var(--muted)' }}>{po && po.poConfirmType ? po.poConfirmType : '\u2014'}</span>}
                    </td>

                    {/* Confirmed Qty */}
                    <td>
                      {po && po.status === 'admin_approved' && !isAdmin ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {ci.type === 'custom' && (
                            <input type="number" min="0" max={po.finalQty} value={ci.qty}
                              onChange={function(e) {
                                var id = po._id.toString();
                                var n = {}; n[id] = { type: ci.type, qty: e.target.value };
                                setConfirmInputs(Object.assign({}, confirmInputs, n));
                              }}
                              style={{ width: 70, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12, textAlign: 'center' }} />
                          )}
                          <button className="btn btn-primary btn-xs"
                            onClick={function() {
                              confirmMut.mutate({ id: po._id, type: ci.type, qty: parseInt(ci.qty) || po.finalQty });
                            }}
                            disabled={confirmMut.isPending}>
                            Confirm PO
                          </button>
                        </div>
                      ) : <span style={{ fontWeight: 600, color: 'var(--blue)' }}>{po && po.confirmedQty ? fmtN(po.confirmedQty) : '\u2014'}</span>}
                    </td>

                    {/* Shipped Qty */}
                    <td>
                      {po && po.status === 'supplier_confirmed' && !isAdmin ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input type="number" min="0" max={po.confirmedQty} value={si} placeholder={po.confirmedQty}
                            onChange={function(e) {
                              var id = po._id.toString();
                              var n = {}; n[id] = e.target.value;
                              setShipInputs(Object.assign({}, shipInputs, n));
                            }}
                            style={{ width: 70, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12, textAlign: 'center' }} />
                          <button className="btn btn-success btn-xs"
                            onClick={function() {
                              shipMut.mutate({ id: po._id, qty: parseInt(si) || po.confirmedQty });
                            }}
                            disabled={shipMut.isPending}>Ship</button>
                        </div>
                      ) : <span style={{ fontWeight: 600, color: 'var(--teal)' }}>{po && po.shippedQty ? fmtN(po.shippedQty) : '\u2014'}</span>}
                    </td>

                    {/* Delivered — Admin only */}
                    <td>
                      {isAdmin && po && po.status === 'shipped' ? (
                        <button className="btn btn-success btn-sm"
                          onClick={function() { deliverMut.mutate({ id: po._id, qty: po.shippedQty }); }}
                          disabled={deliverMut.isPending}>
                          Deliver {fmtN(po.shippedQty)}
                        </button>
                      ) : (
                        <span style={{ color: 'var(--green)', fontWeight: po && po.deliveredQty ? 600 : 400 }}>
                          {po && po.deliveredQty ? fmtN(po.deliveredQty) : '\u2014'}
                        </span>
                      )}
                    </td>

                    {/* PO Status */}
                    <td><span className={'badge ' + pst.cls}>{pst.label}</span></td>

                    {/* Action */}
                    <td>
                      <span className={r.actionType === 'supplier_po_required' ? 'action-need' : r.actionType === 'supplier_po_inprogress' ? 'badge badge-confirmed' : 'action-ok'}>
                        {r.actionType === 'supplier_po_required' ? 'Need PO' : r.actionType === 'supplier_po_inprogress' ? 'In Progress' : 'No Action'}
                      </span>
                    </td>
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
