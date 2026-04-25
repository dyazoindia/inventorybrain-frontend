import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, supplierPOApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Empty, Loading, fmtN } from '../components/ui';
import { useSelection } from '../components/ui/useSelection';
import { exportToCSV } from '../components/ui/exportUtils';
import toast from 'react-hot-toast';

var fmtDoc = function(v) { return (v !== null && v !== undefined && isFinite(v)) ? (Math.round(v * 10) / 10) + 'd' : '\u2014'; };
var fmtDRR = function(v) { return v ? parseFloat(v).toFixed(2).replace(/\.?0+$/, '') : '\u2014'; };
var docColor = function(v) {
  if (!v && v !== 0) return 'var(--muted)';
  if (v < 7) return 'var(--red)';
  if (v < 15) return 'var(--orange)';
  if (v < 30) return 'var(--yellow)';
  return 'var(--green)';
};

var PO_STATUS = {
  draft:              { cls: 'badge-gray',      label: '\u2014' },
  admin_approved:     { cls: 'badge-po',        label: 'Final Qty Set' },
  supplier_confirmed: { cls: 'badge-confirmed', label: 'Confirmed' },
  shipped:            { cls: 'badge-transit',   label: 'Shipped' },
  delivered:          { cls: 'badge-ok',        label: 'Delivered' },
  rejected:           { cls: 'badge-rejected',  label: 'Rejected' }
};

var ALL_COLS = [
  { key: 'link',         label: 'Link' },
  { key: 'sku',          label: 'SKU',              always: true },
  { key: 'title',        label: 'Title',             always: true },
  { key: 'category',     label: 'Category' },
  { key: 'whInv',        label: 'WH Inv' },
  { key: 'whDOC',        label: 'WH DOC' },
  { key: 'companyDOC',   label: 'Co. DOC',           always: true },
  { key: 'totalDRR',     label: 'DRR/day' },
  { key: 'suggestQty',   label: 'Suggest Qty' },
  { key: 'finalQty',     label: 'Final Qty (Admin)',  always: true },
  { key: 'confirmType',  label: 'Confirm Type',       always: true },
  { key: 'confirmedQty', label: 'Confirmed Qty',      always: true },
  { key: 'shippedQty',   label: 'Shipped Qty',        always: true },
  { key: 'deliveredQty', label: 'Delivered Qty' },
  { key: 'poStatus',     label: 'PO Status',          always: true },
  { key: 'action',       label: 'Action Required',    always: true }
];

var DEFAULT_VIS = new Set([
  'link', 'sku', 'title', 'category', 'whInv', 'whDOC', 'companyDOC',
  'totalDRR', 'suggestQty', 'finalQty', 'confirmType', 'confirmedQty',
  'shippedQty', 'deliveredQty', 'poStatus', 'action'
]);

export default function MDDashboard() {
  var auth = useAuth();
  var isAdmin = auth.isAdmin;
  var qc = useQueryClient();
  var [search, setSearch] = useState('');
  var [fAction, setFAction] = useState('all');
  var [visible, setVisible] = useState(DEFAULT_VIS);
  var [showCols, setShowCols] = useState(false);
  var [confirmInputs, setConfirmInputs] = useState({});
  var [shipInputs, setShipInputs] = useState({});

  var invQuery = useQuery({
    queryKey: ['inventory-md'],
    queryFn: function() { return inventoryApi.getLatest({ supplier: 'MD' }).then(function(r) { return r.data; }); }
  });

  var poQuery = useQuery({
    queryKey: ['pos-md'],
    queryFn: function() { return supplierPOApi.list({ supplier: 'MD' }).then(function(r) { return r.data; }); }
  });

  var confirmMut = useMutation({
    mutationFn: function(d) { return supplierPOApi.confirm(d.id, { poConfirmType: d.poConfirmType, confirmedQty: d.confirmedQty }); },
    onSuccess: function() { toast.success('PO Confirmed!'); qc.invalidateQueries(['pos-md']); },
    onError: function(e) { toast.error(e.response && e.response.data ? e.response.data.error : 'Failed'); }
  });

  var shipMut = useMutation({
    mutationFn: function(d) { return supplierPOApi.ship(d.id, { shippedQty: d.shippedQty }); },
    onSuccess: function() { toast.success('Shipment recorded!'); qc.invalidateQueries(['pos-md']); },
    onError: function(e) { toast.error('Failed'); }
  });

  var deliverMut = useMutation({
    mutationFn: function(d) { return supplierPOApi.deliver(d.id, { deliveredQty: d.deliveredQty }); },
    onSuccess: function() { toast.success('Marked delivered!'); qc.invalidateQueries(['pos-md']); },
    onError: function(e) { toast.error('Failed'); }
  });

  var allRows = invQuery.data && invQuery.data.rows ? invQuery.data.rows : [];
  var poList = poQuery.data && poQuery.data.purchaseOrders ? poQuery.data.purchaseOrders : [];

  var poMap = useMemo(function() {
    var m = {};
    poList.forEach(function(po) { m[po.asin] = po; });
    return m;
  }, [poList]);

  var rows = useMemo(function() {
    var r = allRows;
    if (search) {
      var q = search.toLowerCase();
      r = r.filter(function(x) {
        return (x.sku && x.sku.toLowerCase().indexOf(q) >= 0) ||
               (x.asin && x.asin.toLowerCase().indexOf(q) >= 0) ||
               (x.ean && x.ean.toLowerCase().indexOf(q) >= 0);
      });
    }
    if (fAction === 'need_po')    r = r.filter(function(x) { return x.actionType === 'supplier_po_required'; });
    if (fAction === 'inprogress') r = r.filter(function(x) { return x.actionType === 'supplier_po_inprogress'; });
    if (fAction === 'no_action')  r = r.filter(function(x) { return x.actionType === 'no_action'; });
    return r;
  }, [allRows, search, fAction]);

  var sel = useSelection(rows);

  var needPO     = allRows.filter(function(r) { return r.actionType === 'supplier_po_required'; }).length;
  var inProgress = allRows.filter(function(r) { return r.actionType === 'supplier_po_inprogress'; }).length;
  var noAction   = allRows.filter(function(r) { return r.actionType === 'no_action'; }).length;

  var toggleCol = function(key) {
    var col = ALL_COLS.find(function(c) { return c.key === key; });
    if (col && col.always) return;
    var next = new Set(visible);
    if (next.has(key)) next.delete(key); else next.add(key);
    setVisible(next);
  };

  var doExport = function() {
    var visCols = ALL_COLS.filter(function(c) { return visible.has(c.key); });
    var exportRows = sel.count > 0 ? sel.selectedRows : rows;
    exportToCSV(exportRows, visCols.map(function(c) {
      return {
        key: c.key, label: c.label,
        getValue: function(r) {
          var po = poMap[r.asin];
          if (c.key === 'whDOC') return fmtDoc(r.whDOC);
          if (c.key === 'companyDOC') return fmtDoc(r.companyDOC);
          if (c.key === 'totalDRR') return fmtDRR(r.totalDRR);
          if (c.key === 'finalQty') return po ? po.finalQty || '' : '';
          if (c.key === 'confirmType') return po ? po.poConfirmType || '' : '';
          if (c.key === 'confirmedQty') return po ? po.confirmedQty || '' : '';
          if (c.key === 'shippedQty') return po ? po.shippedQty || '' : '';
          if (c.key === 'deliveredQty') return po ? po.deliveredQty || '' : '';
          if (c.key === 'poStatus') return po ? po.status || '' : '';
          if (c.key === 'action') return r.actionType || '';
          return r[c.key] !== undefined ? r[c.key] : '';
        }
      };
    }), 'md_supplier');
  };

  if (invQuery.isLoading) return <Loading text="Loading MD SKUs..." />;

  return (
    <div>
      <div className="hero hero-md" style={{ marginBottom: 16 }}>
        <h2>🏢 MD Supplier Dashboard</h2>
        <p>{allRows.length} SKUs · {needPO} need PO · {inProgress} in progress · {noAction} OK</p>
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'all',        label: 'All',                    count: allRows.length, color: 'var(--text)',  bg: 'var(--bg3)' },
          { key: 'need_po',    label: 'Supplier PO Required',   count: needPO,         color: 'var(--red)',   bg: 'var(--red-lt)' },
          { key: 'inprogress', label: 'PO In Progress',         count: inProgress,     color: 'var(--blue)',  bg: 'var(--blue-lt)' },
          { key: 'no_action',  label: 'No Action',              count: noAction,       color: 'var(--green)', bg: 'var(--green-lt)' }
        ].map(function(a) {
          return (
            <div key={a.key}
              onClick={function() { setFAction(a.key); }}
              style={{
                padding: '7px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                background: fAction === a.key ? a.color : a.bg,
                color: fAction === a.key ? '#fff' : a.color,
                border: '1px solid ' + a.color,
                fontWeight: fAction === a.key ? 700 : 500
              }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{a.count}</span> {a.label}
            </div>
          );
        })}
      </div>

      {/* Info */}
      <div className="info-box" style={{ marginBottom: 14 }}>
        📋 <strong>MD Logic:</strong> WH DOC &lt;30 = flag | Co. DOC &lt;60 = Need PO | Co. DOC &gt;60 = No Need
        &nbsp;|&nbsp; <strong>PO Flow:</strong> Admin sets Final Qty → Supplier Confirms (Full/Custom) → Supplier Ships → Admin Delivers
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div className="sec" style={{ marginBottom: 0 }}>MD SKU Table <small>({rows.length})</small></div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {sel.count > 0 && <button className="btn btn-success btn-sm" onClick={doExport}>Export ({sel.count})</button>}
          <button className="btn btn-ghost" onClick={doExport}>Export All</button>
          <button className="btn btn-ghost" onClick={function() { setShowCols(!showCols); }}>Columns</button>
          <input className="filter-input" placeholder="Search..." value={search}
            onChange={function(e) { setSearch(e.target.value); }} style={{ width: 180 }} />
        </div>
      </div>

      {/* Column picker */}
      {showCols && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ALL_COLS.map(function(col) {
            return (
              <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: col.always ? 'not-allowed' : 'pointer', opacity: col.always ? 0.6 : 1 }}>
                <input type="checkbox" checked={visible.has(col.key)} onChange={function() { toggleCol(col.key); }} disabled={col.always} />
                {col.label}
              </label>
            );
          })}
          <button className="btn btn-ghost btn-xs" onClick={function() { setVisible(new Set(ALL_COLS.map(function(c) { return c.key; }))); }}>All</button>
          <button className="btn btn-ghost btn-xs" onClick={function() { setVisible(DEFAULT_VIS); }}>Reset</button>
        </div>
      )}

      {/* Selection bar */}
      {sel.count > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--blue-lt)', border: '1px solid rgba(59,111,245,.2)', borderRadius: 8, padding: '8px 14px', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 500 }}>{sel.count} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={sel.clear}>Clear</button>
          <button className="btn btn-success btn-sm" onClick={doExport}>Export</button>
        </div>
      )}

      {!rows.length ? <Empty icon="🏢" title="No MD SKUs match filter" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={sel.isAllSelected}
                    ref={function(el) { if (el) el.indeterminate = sel.isSomeSelected; }}
                    onChange={function(e) { sel.toggleAll(e.target.checked); }} />
                </th>
                {ALL_COLS.filter(function(c) { return visible.has(c.key); }).map(function(c) {
                  var style = {};
                  if (c.key === 'finalQty') style = { background: '#fffde7', color: 'var(--yellow)', fontWeight: 700 };
                  return <th key={c.key} style={style}>{c.label}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(function(r) {
                var po = poMap[r.asin];
                var poStatus = PO_STATUS[po ? po.status : 'draft'] || PO_STATUS.draft;
                var ci = confirmInputs[po ? po._id : ''] || { type: 'full', qty: po ? po.finalQty || 0 : 0 };
                var si = shipInputs[po ? po._id : ''] || '';

                return (
                  <tr key={r.asin} style={{ background: sel.selected.has(r.asin) ? 'var(--blue-lt)' : '' }}>
                    <td><input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function() { sel.toggle(r.asin); }} /></td>

                    {visible.has('link') && <td>{r.productLink ? <a className="link-btn" href={r.productLink} target="_blank" rel="noreferrer">Link</a> : '\u2014'}</td>}
                    {visible.has('sku') && <td style={{ fontWeight: 500 }}>{r.sku || '\u2014'}</td>}
                    {visible.has('title') && <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}>{r.title || '\u2014'}</td>}
                    {visible.has('category') && <td style={{ fontSize: 11, color: 'var(--muted)' }}>{r.category || '\u2014'}</td>}
                    {visible.has('whInv') && <td style={{ fontWeight: 500, color: r.whInv === 0 ? 'var(--red)' : 'var(--text)' }}>{fmtN(r.whInv)}</td>}
                    {visible.has('whDOC') && <td><span style={{ fontWeight: 600, color: docColor(r.whDOC) }}>{fmtDoc(r.whDOC)}</span></td>}
                    {visible.has('companyDOC') && <td><span style={{ fontWeight: 700, color: docColor(r.companyDOC) }}>{fmtDoc(r.companyDOC)}</span></td>}
                    {visible.has('totalDRR') && <td>{fmtDRR(r.totalDRR)}</td>}
                    {visible.has('suggestQty') && <td style={{ color: 'var(--blue)', fontWeight: 600 }}>{r.suggestQty > 0 ? fmtN(r.suggestQty) : '\u2014'}</td>}

                    {/* Final Qty */}
                    {visible.has('finalQty') && (
                      <td style={{ background: '#fffde7' }}>
                        <span style={{ fontWeight: 700, color: po && po.finalQty ? 'var(--green)' : 'var(--muted)', fontSize: 13 }}>
                          {po && po.finalQty ? fmtN(po.finalQty) : '\u2014'}
                        </span>
                      </td>
                    )}

                    {/* Confirm Type */}
                    {visible.has('confirmType') && (
                      <td>
                        {po && po.status === 'admin_approved' && !isAdmin ? (
                          <select className="filter-select" style={{ fontSize: 11, padding: '3px 6px' }}
                            value={ci.type}
                            onChange={function(e) {
                              var n = {}; n[po._id] = { type: e.target.value, qty: e.target.value === 'full' ? po.finalQty : ci.qty };
                              setConfirmInputs(Object.assign({}, confirmInputs, n));
                            }}>
                            <option value="full">Full ({fmtN(po.finalQty)})</option>
                            <option value="custom">Custom Qty</option>
                          </select>
                        ) : <span style={{ fontSize: 11, color: 'var(--muted)' }}>{po && po.poConfirmType ? po.poConfirmType : '\u2014'}</span>}
                      </td>
                    )}

                    {/* Confirmed Qty */}
                    {visible.has('confirmedQty') && (
                      <td>
                        {po && po.status === 'admin_approved' && !isAdmin ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {ci.type === 'custom' && (
                              <input type="number" min="0" max={po.finalQty} value={ci.qty}
                                onChange={function(e) {
                                  var n = {}; n[po._id] = { type: ci.type, qty: e.target.value };
                                  setConfirmInputs(Object.assign({}, confirmInputs, n));
                                }}
                                style={{ width: 70, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 5, fontFamily: 'inherit', fontSize: 12, textAlign: 'center' }} />
                            )}
                            <button className="btn btn-primary btn-xs"
                              onClick={function() { confirmMut.mutate({ id: po._id, poConfirmType: ci.type, confirmedQty: parseInt(ci.qty) || po.finalQty }); }}
                              disabled={confirmMut.isPending}>Confirm PO</button>
                          </div>
                        ) : <span style={{ fontWeight: 600, color: 'var(--blue)' }}>{po && po.confirmedQty ? fmtN(po.confirmedQty) : '\u2014'}</span>}
                      </td>
                    )}

                    {/* Shipped Qty */}
                    {visible.has('shippedQty') && (
                      <td>
                        {po && po.status === 'supplier_confirmed' && !isAdmin ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <input type="number" min="0" max={po.confirmedQty} value={si}
                              onChange={function(e) { var n = {}; n[po._id] = e.target.value; setShipInputs(Object.assign({}, shipInputs, n)); }}
                              placeholder={po.confirmedQty}
                              style={{ width: 70, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 5, fontFamily: 'inherit', fontSize: 12, textAlign: 'center' }} />
                            <button className="btn btn-success btn-xs"
                              onClick={function() { shipMut.mutate({ id: po._id, shippedQty: parseInt(si) || po.confirmedQty }); }}
                              disabled={shipMut.isPending}>Ship</button>
                          </div>
                        ) : <span style={{ fontWeight: 600, color: 'var(--teal)' }}>{po && po.shippedQty ? fmtN(po.shippedQty) : '\u2014'}</span>}
                      </td>
                    )}

                    {/* Delivered */}
                    {visible.has('deliveredQty') && (
                      <td>
                        {isAdmin && po && po.status === 'shipped' ? (
                          <button className="btn btn-success btn-sm"
                            onClick={function() { deliverMut.mutate({ id: po._id, deliveredQty: po.shippedQty }); }}
                            disabled={deliverMut.isPending}>
                            Deliver ({fmtN(po.shippedQty)})
                          </button>
                        ) : <span style={{ color: 'var(--green)', fontWeight: po && po.deliveredQty ? 600 : 400 }}>{po && po.deliveredQty ? fmtN(po.deliveredQty) : '\u2014'}</span>}
                      </td>
                    )}

                    {/* PO Status */}
                    {visible.has('poStatus') && (
                      <td><span className={'badge ' + poStatus.cls}>{poStatus.label}</span></td>
                    )}

                    {/* Action */}
                    {visible.has('action') && (
                      <td>
                        <span className={r.actionType === 'supplier_po_required' ? 'action-need' : r.actionType === 'supplier_po_inprogress' ? 'badge badge-confirmed' : 'action-ok'}>
                          {r.actionType === 'supplier_po_required' ? 'Need PO' : r.actionType === 'supplier_po_inprogress' ? 'PO In Progress' : 'No Action'}
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
