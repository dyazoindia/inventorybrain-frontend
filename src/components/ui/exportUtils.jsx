// Universal CSV export
export function exportToCSV(rows, columns, filename = 'export') {
  const headers = columns.map(c => c.label || c.key);
  const body = rows.map(r =>
    columns.map(c => {
      const v = c.getValue ? c.getValue(r) : (r[c.key] ?? '');
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(',')
  );
  const csv = [headers.join(','), ...body].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `${filename}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}
