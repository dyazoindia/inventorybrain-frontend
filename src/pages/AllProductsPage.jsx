import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, supplierPOApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Empty, Loading, fmtN, ActionTypeBadge, HealthBadge } from '../components/ui';
import { useSelection } from '../components/ui/useSelection';
import { exportToCSV } from '../components/ui/exportUtils';
import toast from 'react-hot-toast';

var fmtDRR = function(v) { return v ? parseFloat(v).toFixed(2).replace(/\.?0+$/, '') : '\u2014'; };
var fmtDoc = function(v) { return (v !== null && v !== undefined && isFinite(v)) ? (Math.round(v * 10) / 10) + 'd' : '\u2014'; };
var docColor = function(v) {
  if (!v && v !== 0) return 'var(--muted)';
  if (v < 7) return 'var(--red)';
  if (v < 15) return 'var(--orange)';
  if (v < 30) return 'var(--yellow)';
  if (v <= 120) return 'var(--green)';
  if (v <= 150) return 'var(--orange)';
  return 'var(--red)';
};

// Frozen column pixel offsets — checkbox(32) + each col width
// checkbox=32, link=60, sku=100, ean=130, title=200, supplier=90, category=100
var FROZEN_LEFT = {
  link:     32,
  sku:      92,
  ean:      192,
  title:    322,
  supplier: 522,
  category: 612
};

var ALL_COLUMNS = [
  { key: 'link',       label: 'Link',       frozen: true },
  { key: 'sku',        label: 'SKU',        frozen: true, always: true },
  { key: 'ean',        label: 'EAN',        frozen: true },
  { key: 'title',      label: 'Title',      frozen: true, always: true },
  { key: 'supplier',   label: 'Supplier',   frozen: true },
  { key: 'category',   label: 'Category',   frozen: true },
  { key: 'whInv',      label: 'WH Inv' },
  { key: 'amzInv',     label: 'AMZ Inv' },
  { key: 'flkInv',     label: 'FLK Inv' },
  { key: 'zptInv',     label: 'ZPT Inv' },
  { key: 'blkInv',     label: 'BLK Inv' },
  { key: 'amzDRR',     label: 'AMZ DRR' },
  { key: 'flkDRR',     label: 'FLK DRR' },
  { key: 'zptDRR',     label: 'ZPT DRR' },
  { key: 'blkDRR',     label: 'BLK DRR' },
  { key: 'openPO',     label: 'Open PO' },
  { key: 'mfgQty',     label: 'Mfg Qty' },
  { key: 'inTransit',  label: 'In Transit' },
  { key: 'totalInv',   label: 'Total Inv' },
  { key: 'totalDRR',   label: 'Total DRR' },
  { key: 'whDOC',      label: 'WH DOC' },
  { key: 'amzDOC',     label: 'AMZ DOC' },
  { key: 'flkDOC',     label: 'FLK DOC' },
  { key: 'zptDOC',     label: 'ZPT DOC' },
  { key: 'blkDOC',     label: 'BLK DOC' },
  { key: 'companyDOC', label: 'Co. DOC',    always: true },
  { key: 'health',     label: 'Health',      always: true },
  { key: 'suggestQty', label: 'Suggest Qty' },
  { key: 'finalQty',   label: 'Final Qty',   always: true },
  { key: 'actionType', label: 'Action Type', always: true },
  { key: 'actionDetails', label: 'Action Details' }
];

var DEFAULT_VIS = new Set(ALL_COLUMNS.map(function(c) { return c.key; }));

export default function AllProductsPage({ initialFilter }) {
  var auth = useAuth();
  var isAdmin = auth.isAdmin;
  var qc = useQueryClient();

  var s1 = useState('');       var search    = s1[0]; var setSearch    = s1[1];
  var s2 = useState('all');    var fSupplier = s2[0]; var setFSupplier = s2[1];
  var s3 = useState('all');    var fCategory = s3[0]; var setFCategory = s3[1];
  var s4 = useState(initialFilter || 'all'); var fAlert = s4[0]; var setFAlert = s4[1];
  var s5 = useState('all');    var fAction   = s5[0]; var setFAction   = s5[1];
  var s6 = useState(DEFAULT_VIS); var visible = s6[0]; var setVisible  = s6[1];
  var s7 = useState(false);    var showCols  = s7[0]; var setShowCols  = s7[1];
  var s8 = useState({});       var editQtys  = s8[0]; var setEditQtys  = s8[1];
  var s9 = useState(null);     var editingAsin = s9[0]; var setEditingAsin = s9[1];

  var inv = useQuery({
    queryKey: ['inventory-all'],
    queryFn: function() { return inventoryApi.getLatest().then(function(r) { return r.data; }); }
  });

  var poQ = useQuery({
    queryKey: ['pos-all'],
    queryFn: function() { return supplierPOApi.list().then(function(r) { return r.data; }); }
  });

  var setFinalMut = useMutation({
    mutationFn: function(d) { return supplierPOApi.setFinalQty(d); },
    onSuccess: function() {
      toast.success('Saved!');
      qc.invalidateQueries(['pos-all']);
      qc.invalidateQueries(['inventory-all']);
      setEditingAsin(null);
    },
    onError: function() { toast.error('Failed'); }
  });

  var allRows = (inv.data && inv.data.rows) ? inv.data.rows : [];

  var poMap = {};
  var poList = (poQ.data && poQ.data.purchaseOrders) ? poQ.data.purchaseOrders : [];
  poList.forEach(function(po) { poMap[po.asin] = po; });

  // Filtering
  var rows = allRows;
  if (search) {
    var q = search.toLowerCase();
    rows = rows.filter(function(x) {
      return (x.asin  && x.asin.toLowerCase().indexOf(q)  >= 0) ||
             (x.sku   && x.sku.toLowerCase().indexOf(q)   >= 0) ||
             (x.title && x.title.toLowerCase().indexOf(q) >= 0) ||
             (x.ean   && x.ean.toLowerCase().indexOf(q)   >= 0);
    });
  }
  if (fSupplier !== 'all') rows = rows.filter(function(x) { return x.supplier === fSupplier; });
  if (fCategory !== 'all') rows = rows.filter(function(x) { return x.category === fCategory; });

  if (fAction === 'supplier_po_required') {
    rows = rows.filter(function(x) { return x.actionType === 'supplier_po_required'; });
  } else if (fAction === 'supplier_po_inprogress') {
    rows = rows.filter(function(x) { return x.actionType === 'supplier_po_inprogress'; });
  } else if (fAction === 'no_action') {
    rows = rows.filter(function(x) { return x.actionType === 'no_action'; });
  }

  if      (fAlert === 'critical') rows = rows.filter(function(x) { return x.companyDOC !== null && x.companyDOC < 7; });
  else if (fAlert === 'urgent')   rows = rows.filter(function(x) { return x.companyDOC !== null && x.companyDOC >= 7  && x.companyDOC < 15; });
  else if (fAlert === 'po')       rows = rows.filter(function(x) { return x.companyDOC !== null && x.companyDOC >= 15 && x.companyDOC < 30; });
  else if (fAlert === 'dead')     rows = rows.filter(function(x) { return x.companyDOC !== null && x.companyDOC > 180; });
  else if (fAlert === 'over')     rows = rows.filter(function(x) { return x.companyDOC !== null && x.companyDOC > 120; });

  // Counts from allRows
  var poReqCount  = allRows.filter(function(r) { return r.actionType === 'supplier_po_required'; }).length;
  var inProgCount = allRows.filter(function(r) { return r.actionType === 'supplier_po_inprogress'; }).length;
  var noActCount  = allRows.filter(function(r) { return r.actionType === 'no_action'; }).length;

  var suppliers = [];
  var supSeen = {};
  allRows.forEach(function(r) { if (r.supplier && !supSeen[r.supplier]) { supSeen[r.supplier] = 1; suppliers.push(r.supplier); } });
  suppliers.sort();

  var catBase = fSupplier !== 'all' ? allRows.filter(function(r) { return r.supplier === fSupplier; }) : allRows;
  var categories = [];
  var catSeen = {};
  catBase.forEach(function(r) { if (r.category && !catSeen[r.category]) { catSeen[r.category] = 1; categories.push(r.category); } });
  categories.sort();

  var sel = useSelection(rows);

  var toggleCol = function(key) {
    var col = ALL_COLUMNS.find(function(c) { return c.key === key; });
    if (col && col.always) return;
    var next = new Set(visible);
    if (next.has(key)) next.delete(key); else next.add(key);
    setVisible(next);
  };

  var doExport = function(expRows) {
    var visCols = ALL_COLUMNS.filter(function(c) { return visible.has(c.key); });
    exportToCSV(expRows, visCols.map(function(c) {
      return {
        key: c.key, label: c.label,
        getValue: function(r) {
          var po = poMap[r.asin];
          if (c.key === 'finalQty') return po ? po.finalQty || '' : '';
          if (c.key === 'health')   return r.healthStatus || '';
          if (c.key === 'title')    return r.title || '';
          if (c.key.indexOf('DRR') >= 0) return fmtDRR(r[c.key]);
          return r[c.key] !== undefined ? r[c.key] : '';
        }
      };
    }), 'inventory_export');
  };

  var saveFinalQty = function(asin) {
    var qty = parseInt(editQtys[asin]);
    if (isNaN(qty) || qty < 0) { toast.error('Enter valid qty'); return; }
    setFinalMut.mutate({ asin: asin, finalQty: qty });
  };

  if (inv.isLoading) return <Loading text="Loading products..." />;

  // Frozen column header style
  var frozenTh = function(key) {
    var s = {
      position: 'sticky',
      left: FROZEN_LEFT[key],
      top: 0,
      zIndex: 5,
      background: 'var(--card)',
      borderBottom: '2px solid var(--border)',
      boxShadow: key === 'category' ? '3px 0 6px rgba(0,0,0,.08)' : 'none'
    };
    return s;
  };

  // Frozen column cell style
  var frozenTd = function(key, bg) {
    var s = {
      position: 'sticky',
      left: FROZEN_LEFT[key],
      zIndex: 2,
      background: bg || 'var(--card)',
      boxShadow: key === 'category' ? '3px 0 6px rgba(0,0,0,.06)' : 'none'
    };
    return s;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="sec" style={{ marginBottom: 0 }}>
          All Products <small>({rows.length} of {allRows.length} SKUs)</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {sel.count > 0 && (
            <button className="btn btn-success btn-sm" onClick={function() { doExport(sel.selectedRows); }}>
              Export ({sel.count})
            </button>
          )}
          <button className="btn btn-ghost" onClick={function() { doExport(rows); }}>Export All</button>
          <button className="btn btn-ghost" onClick={function() { setShowCols(!showCols); }}>Columns</button>
        </div>
      </div>

      {/* Action chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'all',                    label: 'All',                    count: allRows.length, color: 'var(--text)',  bg: 'var(--bg3)' },
          { key: 'supplier_po_required',   label: 'Supplier PO Required',  count: poReqCount,     color: 'var(--red)',   bg: 'var(--red-lt)' },
          { key: 'supplier_po_inprogress', label: 'PO In Progress',        count: inProgCount,    color: 'var(--blue)',  bg: 'var(--blue-lt)' },
          { key: 'no_action',              label: 'No Action',             count: noActCount,     color: 'var(--green)', bg: 'var(--green-lt)' }
        ].map(function(a) {
          return (
            <div key={a.key} onClick={function() { setFAction(a.key); }}
              style={{
                padding: '7px 14px', borderRadius: 20, fontSize: 12,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
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

      {/* Column picker */}
      {showCols && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ width: '100%', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
            Pinned columns: Link, SKU, EAN, Title, Supplier, Category (always visible while scrolling)
          </div>
          {ALL_COLUMNS.map(function(col) {
            return (
              <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: col.always ? 'not-allowed' : 'pointer', opacity: col.always ? 0.6 : 1 }}>
                <input type="checkbox" checked={visible.has(col.key)} onChange={function() { toggleCol(col.key); }} disabled={col.always} />
                {col.label} {col.frozen ? '📌' : ''}
              </label>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="filter-row" style={{ marginBottom: 12 }}>
        <input className="filter-input" placeholder="Search SKU / ASIN / EAN / Title..."
          value={search} onChange={function(e) { setSearch(e.target.value); }} style={{ width: 220 }} />
        <select className="filter-select" value={fSupplier}
          onChange={function(e) { setFSupplier(e.target.value); setFCategory('all'); }}>
          <option value="all">All Suppliers</option>
          {suppliers.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
        </select>
        <select className="filter-select" value={fCategory}
          onChange={function(e) { setFCategory(e.target.value); }}>
          <option value="all">All Categories</option>
          {categories.map(function(c) { return <option key={c} value={c}>{c}</option>; })}
        </select>
        <select className="filter-select" value={fAlert}
          onChange={function(e) { setFAlert(e.target.value); }}>
          <option value="all">All DOC</option>
          <option value="critical">Critical &lt;7d</option>
          <option value="urgent">Urgent 7-14d</option>
          <option value="po">PO Required 15-29d</option>
          <option value="dead">Dead &gt;180d</option>
          <option value="over">Overstock &gt;120d</option>
        </select>
        {(search || fSupplier !== 'all' || fCategory !== 'all' || fAlert !== 'all' || fAction !== 'all') && (
          <button className="btn btn-ghost btn-sm" onClick={function() {
            setSearch(''); setFSupplier('all'); setFCategory('all'); setFAlert('all'); setFAction('all');
          }}>Clear All</button>
        )}
        <span className="filter-count" style={{ marginLeft: 'auto' }}>{rows.length} rows</span>
      </div>

      {/* Selection bar */}
      {sel.count > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--blue-lt)', borderRadius: 8, padding: '8px 14px', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 500 }}>{sel.count} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={sel.clear}>Clear</button>
          <button className="btn btn-success btn-sm" onClick={function() { doExport(sel.selectedRows); }}>Export</button>
        </div>
      )}

      {rows.length === 0
        ? <Empty icon="🔍" title="No products found" desc="Try clearing filters." />
        : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '74vh', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 1800, width: '100%' }}>
              <thead>
                <tr>
                  {/* Checkbox */}
                  <th style={{ width: 32, position: 'sticky', left: 0, top: 0, zIndex: 6, background: 'var(--card)', borderBottom: '2px solid var(--border)' }}>
                    <input type="checkbox" checked={sel.isAllSelected}
                      ref={function(el) { if (el) el.indeterminate = sel.isSomeSelected; }}
                      onChange={function(e) { sel.toggleAll(e.target.checked); }} />
                  </th>
                  {/* Frozen columns */}
                  {visible.has('link')     && <th style={frozenTh('link')}>Link</th>}
                  {visible.has('sku')      && <th style={frozenTh('sku')}>SKU</th>}
                  {visible.has('ean')      && <th style={frozenTh('ean')}>EAN</th>}
                  {visible.has('title')    && <th style={Object.assign({}, frozenTh('title'), { minWidth: 200 })}>Title</th>}
                  {visible.has('supplier') && <th style={frozenTh('supplier')}>Supplier</th>}
                  {visible.has('category') && <th style={frozenTh('category')}>Category</th>}
                  {/* Scrollable columns */}
                  {visible.has('whInv')      && <th style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--card)', fontWeight: 700, color: 'var(--text)', borderBottom: '2px solid var(--border)' }}>WH Inv</th>}
                  {visible.has('amzInv')     && <th>AMZ Inv</th>}
                  {visible.has('flkInv')     && <th>FLK Inv</th>}
                  {visible.has('zptInv')     && <th>ZPT Inv</th>}
                  {visible.has('blkInv')     && <th>BLK Inv</th>}
                  {visible.has('amzDRR')     && <th>AMZ DRR</th>}
                  {visible.has('flkDRR')     && <th>FLK DRR</th>}
                  {visible.has('zptDRR')     && <th>ZPT DRR</th>}
                  {visible.has('blkDRR')     && <th>BLK DRR</th>}
                  {visible.has('openPO')     && <th>Open PO</th>}
                  {visible.has('mfgQty')     && <th style={{ background: '#e0f2fe', color: '#0891b2' }}>Mfg Qty</th>}
                  {visible.has('inTransit')  && <th style={{ background: '#fef3c7', color: '#d97706' }}>In Transit</th>}
                  {visible.has('totalInv')   && <th>Total Inv</th>}
                  {visible.has('totalDRR')   && <th>Total DRR</th>}
                  {visible.has('whDOC')      && <th>WH DOC</th>}
                  {visible.has('amzDOC')     && <th>AMZ DOC</th>}
                  {visible.has('flkDOC')     && <th>FLK DOC</th>}
                  {visible.has('zptDOC')     && <th>ZPT DOC</th>}
                  {visible.has('blkDOC')     && <th>BLK DOC</th>}
                  {visible.has('companyDOC') && <th>Co. DOC</th>}
                  {visible.has('health')     && <th>Health</th>}
                  {visible.has('suggestQty') && <th>Suggest Qty</th>}
                  {visible.has('finalQty')   && <th style={{ background: '#fffde7', color: 'var(--yellow)', fontWeight: 700 }}>Final Qty</th>}
                  {visible.has('actionType') && <th>Action Type</th>}
                  {visible.has('actionDetails') && <th style={{ minWidth: 180 }}>Action Details</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(function(r) {
                  var po = poMap[r.asin];
                  var isEd = editingAsin === r.asin;
                  var fq = editQtys[r.asin] !== undefined ? editQtys[r.asin] : (po && po.finalQty ? po.finalQty : '');
                  var bg = sel.selected.has(r.asin) ? 'var(--blue-lt)' : 'var(--card)';

                  return (
                    <tr key={r.asin} style={{ background: bg }}>
                      {/* Checkbox */}
                      <td style={{ position: 'sticky', left: 0, zIndex: 1, background: bg }}>
                        <input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function() { sel.toggle(r.asin); }} />
                      </td>
                      {/* Frozen cells */}
                      {visible.has('link') && (
                        <td style={frozenTd('link', bg)}>
                          {r.productLink ? <a className="link-btn" href={r.productLink} target="_blank" rel="noreferrer">↗</a> : '\u2014'}
                        </td>
                      )}
                      {visible.has('sku') && (
                        <td style={Object.assign({ fontWeight: 500, whiteSpace: 'nowrap' }, frozenTd('sku', bg))}>
                          {r.sku || '\u2014'}
                        </td>
                      )}
                      {visible.has('ean') && (
                        <td style={Object.assign({ fontSize: 10, fontFamily: 'monospace', color: 'var(--subtle)' }, frozenTd('ean', bg))}>
                          {r.ean || '\u2014'}
                        </td>
                      )}
                      {visible.has('title') && (
                        <td style={Object.assign({ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }, frozenTd('title', bg))}>
                          {r.productLink
                            ? <a href={r.productLink} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none' }}>{r.title || '\u2014'}</a>
                            : r.title || '\u2014'}
                        </td>
                      )}
                      {visible.has('supplier') && (
                        <td style={frozenTd('supplier', bg)}>
                          <span className="badge badge-supplier">{r.supplier || '\u2014'}</span>
                        </td>
                      )}
                      {visible.has('category') && (
                        <td style={Object.assign({ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }, frozenTd('category', bg))}>
                          {r.category || '\u2014'}
                        </td>
                      )}
                      {/* Scrollable cells */}
                      {visible.has('whInv') && (
                        <td style={{ fontWeight: r.whInv === 0 ? 700 : 500, color: r.whInv === 0 ? 'var(--red)' : 'var(--text)', whiteSpace: 'nowrap' }}>
                          {fmtN(r.whInv)}
                          {r.whInv === 0 && <span style={{ fontSize: 9, marginLeft: 3, color: 'var(--red)' }}>EMPTY</span>}
                        </td>
                      )}
                      {visible.has('amzInv') && <td>{fmtN(r.amzInv)}</td>}
                      {visible.has('flkInv') && <td>{fmtN(r.flkInv)}</td>}
                      {visible.has('zptInv') && <td>{fmtN(r.zptInv)}</td>}
                      {visible.has('blkInv') && <td>{fmtN(r.blkInv)}</td>}
                      {visible.has('amzDRR') && <td>{fmtDRR(r.amzDRR)}</td>}
                      {visible.has('flkDRR') && <td>{fmtDRR(r.flkDRR)}</td>}
                      {visible.has('zptDRR') && <td>{fmtDRR(r.zptDRR)}</td>}
                      {visible.has('blkDRR') && <td>{fmtDRR(r.blkDRR)}</td>}
                      {visible.has('openPO') && (
                        <td style={{ color: r.openPO > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: r.openPO > 0 ? 600 : 400 }}>
                          {fmtN(r.openPO)}
                        </td>
                      )}
                      {visible.has('mfgQty') && (
                        <td style={{ background: '#e0f2fe', color: r.mfgQty > 0 ? '#0891b2' : 'var(--muted)', fontWeight: r.mfgQty > 0 ? 600 : 400 }}>
                          {r.mfgQty > 0 ? fmtN(r.mfgQty) : '\u2014'}
                        </td>
                      )}
                      {visible.has('inTransit') && (
                        <td style={{ background: '#fef3c7', color: r.inTransit > 0 ? '#d97706' : 'var(--muted)', fontWeight: r.inTransit > 0 ? 600 : 400 }}>
                          {r.inTransit > 0 ? fmtN(r.inTransit) : '\u2014'}
                        </td>
                      )}
                      {visible.has('totalInv')   && <td style={{ fontWeight: 500 }}>{fmtN(r.totalInv)}</td>}
                      {visible.has('totalDRR')   && <td>{fmtDRR(r.totalDRR)}</td>}
                      {visible.has('whDOC')      && <td><span style={{ fontWeight: 600, color: docColor(r.whDOC) }}>{fmtDoc(r.whDOC)}</span></td>}
                      {visible.has('amzDOC')     && <td><span style={{ fontWeight: 600, color: docColor(r.amzDOC) }}>{fmtDoc(r.amzDOC)}</span></td>}
                      {visible.has('flkDOC')     && <td><span style={{ fontWeight: 600, color: docColor(r.flkDOC) }}>{fmtDoc(r.flkDOC)}</span></td>}
                      {visible.has('zptDOC')     && <td><span style={{ fontWeight: 600, color: docColor(r.zptDOC) }}>{fmtDoc(r.zptDOC)}</span></td>}
                      {visible.has('blkDOC')     && <td><span style={{ fontWeight: 600, color: docColor(r.blkDOC) }}>{fmtDoc(r.blkDOC)}</span></td>}
                      {visible.has('companyDOC') && <td><span style={{ fontWeight: 700, color: docColor(r.companyDOC) }}>{fmtDoc(r.companyDOC)}</span></td>}
                      {visible.has('health')     && <td><HealthBadge status={r.healthStatus} /></td>}
                      {visible.has('suggestQty') && (
                        <td style={{ color: r.suggestQty > 0 ? 'var(--blue)' : 'var(--muted)', fontWeight: r.suggestQty > 0 ? 600 : 400 }}>
                          {r.suggestQty > 0 ? fmtN(r.suggestQty) : '\u2014'}
                        </td>
                      )}
                      {visible.has('finalQty') && (
                        <td style={{ background: '#fffde7' }}>
                          {isAdmin ? (
                            isEd ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <input type="number" min="0" value={fq} autoFocus
                                  onChange={function(e) { var n = {}; n[r.asin] = e.target.value; setEditQtys(Object.assign({}, editQtys, n)); }}
                                  onKeyDown={function(e) { if (e.key === 'Enter') saveFinalQty(r.asin); if (e.key === 'Escape') setEditingAsin(null); }}
                                  style={{ width: 70, padding: '3px 6px', border: '1px solid var(--blue)', borderRadius: 5, fontSize: 12, textAlign: 'center' }} />
                                <button className="btn btn-success btn-xs" onClick={function() { saveFinalQty(r.asin); }}>OK</button>
                              </div>
                            ) : (
                              <div onClick={function() { setEditingAsin(r.asin); var n = {}; n[r.asin] = po && po.finalQty ? po.finalQty : ''; setEditQtys(Object.assign({}, editQtys, n)); }}
                                style={{ cursor: 'pointer', minWidth: 60, padding: '3px 8px', borderRadius: 5,
                                  background: po && po.finalQty ? 'var(--green-lt)' : '#fffde7',
                                  border: '1px dashed ' + (po && po.finalQty ? 'var(--green)' : 'var(--yellow)'),
                                  fontSize: 12, fontWeight: 600,
                                  color: po && po.finalQty ? 'var(--green)' : 'var(--yellow)', textAlign: 'center' }}>
                                {po && po.finalQty ? fmtN(po.finalQty) : 'Set Qty'}
                              </div>
                            )
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 600, color: po && po.finalQty ? 'var(--green)' : 'var(--muted)' }}>
                              {po && po.finalQty ? fmtN(po.finalQty) : '\u2014'}
                            </span>
                          )}
                        </td>
                      )}
                      {visible.has('actionType')    && <td><ActionTypeBadge actionType={r.actionType} /></td>}
                      {visible.has('actionDetails') && (
                        <td style={{ fontSize: 10, color: 'var(--muted)', maxWidth: 180, whiteSpace: 'normal', lineHeight: 1.4 }}>
                          {r.actionDetails || '\u2014'}
                        </td>
                      )}
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
