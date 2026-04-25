import { useState, useMemo, useCallback } from 'react';
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
  if (v < 7)    return 'var(--red)';
  if (v < 15)   return 'var(--orange)';
  if (v < 30)   return 'var(--yellow)';
  if (v <= 120) return 'var(--green)';
  if (v <= 150) return 'var(--orange)';
  return 'var(--red)';
};

var ALL_COLUMNS = [
  { key: 'link',          label: 'Link',          frozen: true },
  { key: 'sku',           label: 'SKU',           frozen: true, always: true },
  { key: 'ean',           label: 'EAN',           frozen: true },
  { key: 'title',         label: 'Title',         frozen: true, always: true },
  { key: 'supplier',      label: 'Supplier',      frozen: true },
  { key: 'category',      label: 'Category',      frozen: true },
  { key: 'whInv',         label: 'WH Inv' },
  { key: 'amzInv',        label: 'AMZ Inv' },
  { key: 'flkInv',        label: 'FLK Inv' },
  { key: 'zptInv',        label: 'ZPT Inv' },
  { key: 'blkInv',        label: 'BLK Inv' },
  { key: 'amzDRR',        label: 'AMZ DRR' },
  { key: 'flkDRR',        label: 'FLK DRR' },
  { key: 'zptDRR',        label: 'ZPT DRR' },
  { key: 'blkDRR',        label: 'BLK DRR' },
  { key: 'openPO',        label: 'Open PO' },
  { key: 'mfgQty',        label: 'Mfg Qty' },
  { key: 'totalInv',      label: 'Total Inv' },
  { key: 'totalDRR',      label: 'Total DRR' },
  { key: 'whDOC',         label: 'WH DOC' },
  { key: 'amzDOC',        label: 'AMZ DOC' },
  { key: 'flkDOC',        label: 'FLK DOC' },
  { key: 'zptDOC',        label: 'ZPT DOC' },
  { key: 'blkDOC',        label: 'BLK DOC' },
  { key: 'companyDOC',    label: 'Co. DOC',       always: true },
  { key: 'health',        label: 'Health',         always: true },
  { key: 'suggestQty',    label: 'Suggest Qty' },
  { key: 'finalQty',      label: 'Final Qty',      always: true },
  { key: 'actionType',    label: 'Action Type',    always: true },
  { key: 'actionDetails', label: 'Action Details' }
];

var DEFAULT_VIS = new Set([
  'link','sku','ean','title','supplier','category','whInv',
  'amzInv','flkInv','zptInv','blkInv','openPO','mfgQty',
  'amzDRR','flkDRR','zptDRR','blkDRR',
  'whDOC','amzDOC','flkDOC','zptDOC','blkDOC',
  'totalInv','totalDRR','companyDOC','health',
  'suggestQty','finalQty','actionType','actionDetails'
]);

export default function AllProductsPage({ initialFilter, initialSupplier, initialCategory }) {
  var auth = useAuth();
  var isAdmin = auth.isAdmin;
  var qc = useQueryClient();

  var [search, setSearch]       = useState('');
  var [fSupplier, setFSupplier] = useState(initialSupplier || 'all');
  var [fCategory, setFCategory] = useState(initialCategory || 'all');
  var [fAlert, setFAlert]       = useState(initialFilter || 'all');
  var [fAction, setFAction]     = useState('all');
  var [visible, setVisible]     = useState(DEFAULT_VIS);
  var [showCols, setShowCols]   = useState(false);
  var [editQtys, setEditQtys]   = useState({});
  var [editingAsin, setEditingAsin] = useState(null);

  var { data, isLoading } = useQuery({
    queryKey: ['inventory-all'],
    queryFn: function() { return inventoryApi.getLatest().then(function(r) { return r.data; }); }
  });

  var { data: poData } = useQuery({
    queryKey: ['pos-all-products'],
    queryFn: function() { return supplierPOApi.list().then(function(r) { return r.data; }); }
  });

  var setFinalQtyMut = useMutation({
    mutationFn: function(d) { return supplierPOApi.setFinalQty(d); },
    onSuccess: function() { toast.success('Final Qty saved!'); qc.invalidateQueries(['pos-all-products']); setEditingAsin(null); },
    onError: function(err) { toast.error(err.response && err.response.data ? err.response.data.error : 'Failed'); }
  });

  var allRows = data && data.rows ? data.rows : [];

  var poMap = useMemo(function() {
    var m = {};
    var pos = poData && poData.purchaseOrders ? poData.purchaseOrders : [];
    pos.forEach(function(po) { m[po.asin] = po; });
    return m;
  }, [poData]);

  // FIXED: Proper AND filtering — supplier + category together
  var rows = useMemo(function() {
    var r = allRows;
    if (search) {
      var q = search.toLowerCase();
      r = r.filter(function(x) {
        return (x.asin && x.asin.toLowerCase().indexOf(q) >= 0) ||
               (x.sku && x.sku.toLowerCase().indexOf(q) >= 0) ||
               (x.title && x.title.toLowerCase().indexOf(q) >= 0) ||
               (x.ean && x.ean.toLowerCase().indexOf(q) >= 0);
      });
    }
    // AND filters — both must match
    if (fSupplier !== 'all') r = r.filter(function(x) { return x.supplier === fSupplier; });
    if (fCategory !== 'all') r = r.filter(function(x) { return x.category === fCategory; });
    if (fAction !== 'all')   r = r.filter(function(x) { return x.actionType === fAction; });
    if (fAlert === 'critical')    r = r.filter(function(x) { return x.companyDOC !== null && x.companyDOC < 7; });
    else if (fAlert === 'urgent') r = r.filter(function(x) { return x.companyDOC !== null && x.companyDOC >= 7 && x.companyDOC < 15; });
    else if (fAlert === 'po')     r = r.filter(function(x) { return x.companyDOC !== null && x.companyDOC >= 15 && x.companyDOC < 30; });
    else if (fAlert === 'low')    r = r.filter(function(x) { return x.companyDOC !== null && x.companyDOC < 30; });
    else if (fAlert === 'dead')   r = r.filter(function(x) { return x.companyDOC !== null && x.companyDOC > 180; });
    else if (fAlert === 'over')   r = r.filter(function(x) { return x.companyDOC !== null && x.companyDOC > 120; });
    return r;
  }, [allRows, search, fSupplier, fCategory, fAlert, fAction]);

  // FIXED: Counts from allRows, not filtered
  var actionCounts = useMemo(function() {
    return {
      supplier_po_required:   allRows.filter(function(r) { return r.actionType === 'supplier_po_required'; }).length,
      supplier_po_inprogress: allRows.filter(function(r) { return r.actionType === 'supplier_po_inprogress'; }).length,
      platform_po_incoming:   allRows.filter(function(r) { return r.actionType === 'platform_po_incoming'; }).length,
      no_action:              allRows.filter(function(r) { return r.actionType === 'no_action'; }).length
    };
  }, [allRows]);

  var suppliers = useMemo(function() {
    var s = new Set();
    allRows.forEach(function(r) { if (r.supplier) s.add(r.supplier); });
    return Array.from(s).sort();
  }, [allRows]);

  // FIXED: Categories filter based on selected supplier
  var categories = useMemo(function() {
    var base = fSupplier !== 'all' ? allRows.filter(function(r) { return r.supplier === fSupplier; }) : allRows;
    var s = new Set();
    base.forEach(function(r) { if (r.category) s.add(r.category); });
    return Array.from(s).sort();
  }, [allRows, fSupplier]);

  var sel = useSelection(rows);

  var toggleCol = function(key) {
    var col = ALL_COLUMNS.find(function(c) { return c.key === key; });
    if (col && col.always) return;
    var next = new Set(visible);
    if (next.has(key)) next.delete(key); else next.add(key);
    setVisible(next);
  };

  var doExport = function(exportRows) {
    var visCols = ALL_COLUMNS.filter(function(c) { return visible.has(c.key); });
    exportToCSV(exportRows, visCols.map(function(c) {
      return {
        key: c.key, label: c.label,
        getValue: function(r) {
          var po = poMap[r.asin];
          if (c.key === 'finalQty') return po ? po.finalQty : '';
          if (c.key === 'health') return r.healthStatus || '';
          if (['amzDRR','flkDRR','zptDRR','blkDRR','totalDRR'].indexOf(c.key) >= 0) return fmtDRR(r[c.key]);
          if (c.key.indexOf('DOC') >= 0) return r[c.key] !== null ? Math.round(r[c.key] * 10) / 10 : '';
          if (c.key === 'title') return r.title || '';
          return r[c.key] !== undefined ? r[c.key] : '';
        }
      };
    }), 'inventory_export');
  };

  var saveFinalQty = function(asin) {
    var qty = parseInt(editQtys[asin]);
    if (isNaN(qty) || qty < 0) { toast.error('Enter a valid quantity'); return; }
    setFinalQtyMut.mutate({ asin: asin, finalQty: qty });
  };

  if (isLoading) return <Loading text="Loading products..." />;

  // Frozen column CSS
  var frozenStyle = function(colIndex) {
    var lefts = [0, 30, 70, 160, 290, 400, 480]; // cumulative widths
    if (colIndex < lefts.length) {
      return {
        position: 'sticky',
        left: lefts[colIndex],
        zIndex: 2,
        background: 'var(--card)',
        borderRight: colIndex === 5 ? '2px solid var(--border2)' : undefined
      };
    }
    return {};
  };

  var visibleCols = ALL_COLUMNS.filter(function(c) { return visible.has(c.key); });
  var frozenCount = 0;
  visibleCols.forEach(function(c) { if (c.frozen) frozenCount++; });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="sec" style={{ marginBottom: 0 }}>
          All Products <small>({rows.length} of {allRows.length} SKUs)</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {sel.count > 0 && (
            <button className="btn btn-success btn-sm" onClick={function() { doExport(sel.selectedRows); }}>
              Export Selected ({sel.count})
            </button>
          )}
          <button className="btn btn-ghost" onClick={function() { doExport(rows); }}>Export All</button>
          <button className="btn btn-ghost" onClick={function() { setShowCols(!showCols); }}>Columns</button>
        </div>
      </div>

      {/* Action Summary */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'all',                    label: 'All',                    count: allRows.length,                       color: 'var(--text)',   bg: 'var(--bg3)' },
          { key: 'supplier_po_required',   label: 'Supplier PO Required',   count: actionCounts.supplier_po_required,   color: 'var(--red)',    bg: 'var(--red-lt)' },
          { key: 'supplier_po_inprogress', label: 'Supplier PO In Progress',count: actionCounts.supplier_po_inprogress, color: 'var(--blue)',   bg: 'var(--blue-lt)' },
          { key: 'no_action',              label: 'No Action',              count: actionCounts.no_action,              color: 'var(--green)',  bg: 'var(--green-lt)' }
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

      {/* Column Picker */}
      {showCols && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ width: '100%', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Toggle columns:</div>
          {ALL_COLUMNS.map(function(col) {
            return (
              <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: col.always ? 'not-allowed' : 'pointer', opacity: col.always ? 0.6 : 1 }}>
                <input type="checkbox" checked={visible.has(col.key)} onChange={function() { toggleCol(col.key); }} disabled={col.always} />
                {col.label} {col.frozen ? '(frozen)' : ''}
              </label>
            );
          })}
          <button className="btn btn-ghost btn-xs" onClick={function() { setVisible(new Set(ALL_COLUMNS.map(function(c) { return c.key; }))); }}>All</button>
          <button className="btn btn-ghost btn-xs" onClick={function() { setVisible(DEFAULT_VIS); }}>Reset</button>
        </div>
      )}

      {/* Filters - FIXED: Category resets when supplier changes */}
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
          <option value="all">All DOC Levels</option>
          <option value="critical">Critical</option>
          <option value="urgent">Urgent</option>
          <option value="po">PO Required</option>
          <option value="low">All Low</option>
          <option value="dead">Dead Stock</option>
          <option value="over">Overstock</option>
        </select>

        {(search || fSupplier !== 'all' || fCategory !== 'all' || fAlert !== 'all' || fAction !== 'all') && (
          <button className="btn btn-ghost btn-sm" onClick={function() {
            setSearch(''); setFSupplier('all'); setFCategory('all'); setFAlert('all'); setFAction('all');
          }}>Clear</button>
        )}
        <span className="filter-count" style={{ marginLeft: 'auto' }}>{rows.length} rows</span>
      </div>

      {/* Selection bar */}
      {sel.count > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--blue-lt)', border: '1px solid rgba(59,111,245,.2)', borderRadius: 8, padding: '8px 14px', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 500 }}>{sel.count} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={sel.clear}>Clear</button>
          <button className="btn btn-success btn-sm" onClick={function() { doExport(sel.selectedRows); }}>Export</button>
        </div>
      )}

      {!rows.length
        ? <Empty icon="🔍" title="No products found" desc="Try clearing filters." />
        : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32, position: 'sticky', left: 0, zIndex: 3, background: 'var(--card)' }}>
                    <input type="checkbox" checked={sel.isAllSelected}
                      ref={function(el) { if (el) el.indeterminate = sel.isSomeSelected; }}
                      onChange={function(e) { sel.toggleAll(e.target.checked); }} />
                  </th>
                  {visibleCols.map(function(c, i) {
                    var style = {};
                    if (c.key === 'finalQty') style = { background: '#fffde7', color: 'var(--yellow)', fontWeight: 700 };
                    return <th key={c.key} style={style}>{c.label}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(function(r) {
                  var po = poMap[r.asin];
                  var isEditing = editingAsin === r.asin;
                  var fq = editQtys[r.asin] !== undefined ? editQtys[r.asin] : (po && po.finalQty ? po.finalQty : '');
                  return (
                    <tr key={r.asin} style={{ background: sel.selected.has(r.asin) ? 'var(--blue-lt)' : '' }}>
                      <td style={{ position: 'sticky', left: 0, zIndex: 1, background: sel.selected.has(r.asin) ? 'var(--blue-lt)' : 'var(--card)' }}>
                        <input type="checkbox" checked={sel.selected.has(r.asin)} onChange={function() { sel.toggle(r.asin); }} />
                      </td>
                      {visible.has('link')       && <td>{r.productLink ? <a className="link-btn" href={r.productLink} target="_blank" rel="noreferrer">Link</a> : '\u2014'}</td>}
                      {visible.has('sku')        && <td style={{ fontWeight: 500 }}>{r.sku || '\u2014'}</td>}
                      {visible.has('ean')        && <td style={{ fontSize: 10, color: 'var(--subtle)', fontFamily: 'monospace' }}>{r.ean || '\u2014'}</td>}
                      {visible.has('title')      && <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}>{r.title || '\u2014'}</td>}
                      {visible.has('supplier')   && <td><span className="badge badge-supplier">{r.supplier || '\u2014'}</span></td>}
                      {visible.has('category')   && <td style={{ fontSize: 11, color: 'var(--muted)' }}>{r.category || '\u2014'}</td>}
                      {visible.has('whInv')      && <td style={{ fontWeight: r.whInv === 0 ? 700 : 500, color: r.whInv === 0 ? 'var(--red)' : 'var(--text)' }}>{fmtN(r.whInv)}</td>}
                      {visible.has('amzInv')     && <td>{fmtN(r.amzInv)}</td>}
                      {visible.has('flkInv')     && <td>{fmtN(r.flkInv)}</td>}
                      {visible.has('zptInv')     && <td>{fmtN(r.zptInv)}</td>}
                      {visible.has('blkInv')     && <td>{fmtN(r.blkInv)}</td>}
                      {visible.has('amzDRR')     && <td>{fmtDRR(r.amzDRR)}</td>}
                      {visible.has('flkDRR')     && <td>{fmtDRR(r.flkDRR)}</td>}
                      {visible.has('zptDRR')     && <td>{fmtDRR(r.zptDRR)}</td>}
                      {visible.has('blkDRR')     && <td>{fmtDRR(r.blkDRR)}</td>}
                      {visible.has('openPO')     && <td style={{ color: r.openPO > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: r.openPO > 0 ? 600 : 400 }}>{fmtN(r.openPO)}</td>}
                      {visible.has('mfgQty')     && <td>{fmtN(r.mfgQty)}</td>}
                      {visible.has('totalInv')   && <td style={{ fontWeight: 500 }}>{fmtN(r.totalInv)}</td>}
                      {visible.has('totalDRR')   && <td>{fmtDRR(r.totalDRR)}</td>}
                      {visible.has('whDOC')      && <td><span style={{ fontWeight: 600, color: docColor(r.whDOC) }}>{fmtDoc(r.whDOC)}</span></td>}
                      {visible.has('amzDOC')     && <td><span style={{ fontWeight: 600, color: docColor(r.amzDOC) }}>{fmtDoc(r.amzDOC)}</span></td>}
                      {visible.has('flkDOC')     && <td><span style={{ fontWeight: 600, color: docColor(r.flkDOC) }}>{fmtDoc(r.flkDOC)}</span></td>}
                      {visible.has('zptDOC')     && <td><span style={{ fontWeight: 600, color: docColor(r.zptDOC) }}>{fmtDoc(r.zptDOC)}</span></td>}
                      {visible.has('blkDOC')     && <td><span style={{ fontWeight: 600, color: docColor(r.blkDOC) }}>{fmtDoc(r.blkDOC)}</span></td>}
                      {visible.has('companyDOC') && <td><span style={{ fontWeight: 700, color: docColor(r.companyDOC) }}>{fmtDoc(r.companyDOC)}</span></td>}
                      {visible.has('health')     && <td><HealthBadge status={r.healthStatus} /></td>}
                      {visible.has('suggestQty') && <td style={{ color: 'var(--blue)', fontWeight: 600 }}>{r.suggestQty > 0 ? fmtN(r.suggestQty) : '\u2014'}</td>}
                      {visible.has('finalQty') && (
                        <td style={{ background: '#fffde7' }}>
                          {isAdmin ? (
                            isEditing ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <input type="number" min="0" value={fq} autoFocus
                                  onChange={function(e) { var n = {}; n[r.asin] = e.target.value; setEditQtys(Object.assign({}, editQtys, n)); }}
                                  onKeyDown={function(e) { if (e.key === 'Enter') saveFinalQty(r.asin); if (e.key === 'Escape') setEditingAsin(null); }}
                                  style={{ width: 70, padding: '3px 6px', border: '1px solid var(--blue)', borderRadius: 5, fontFamily: 'inherit', fontSize: 12, textAlign: 'center' }} />
                                <button className="btn btn-success btn-xs" onClick={function() { saveFinalQty(r.asin); }}>OK</button>
                              </div>
                            ) : (
                              <div onClick={function() { setEditingAsin(r.asin); var n = {}; n[r.asin] = po && po.finalQty ? po.finalQty : ''; setEditQtys(Object.assign({}, editQtys, n)); }}
                                style={{ cursor: 'pointer', minWidth: 60, padding: '3px 8px', borderRadius: 5, background: po && po.finalQty ? 'var(--green-lt)' : '#fffde7', border: '1px dashed ' + (po && po.finalQty ? 'var(--green)' : 'var(--yellow)'), fontSize: 12, fontWeight: 600, color: po && po.finalQty ? 'var(--green)' : 'var(--yellow)', textAlign: 'center' }}>
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
                      {visible.has('actionType') && <td><ActionTypeBadge actionType={r.actionType} /></td>}
                      {visible.has('actionDetails') && <td style={{ fontSize: 10, color: 'var(--muted)', maxWidth: 160, whiteSpace: 'normal', lineHeight: 1.4 }}>{r.actionDetails || '\u2014'}</td>}
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
