import { useState, useCallback } from 'react';

export function useSelection(rows, keyField = 'asin') {
  const [selected, setSelected] = useState(new Set());

  const toggle = useCallback((key) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback((checked) => {
    setSelected(checked ? new Set(rows.map(r => r[keyField])) : new Set());
  }, [rows, keyField]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isAllSelected  = rows.length > 0 && selected.size === rows.length;
  const isSomeSelected = selected.size > 0 && selected.size < rows.length;
  const selectedRows   = rows.filter(r => selected.has(r[keyField]));
  const count          = selected.size;

  return { selected, toggle, toggleAll, clear, isAllSelected, isSomeSelected, selectedRows, count };
}
