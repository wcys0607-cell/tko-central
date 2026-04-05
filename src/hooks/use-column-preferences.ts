"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/auth-provider";

export interface ColumnPreferences {
  visible: string[];
  widths: Record<string, number>;
  order: string[];
}

const STORAGE_KEY_PREFIX = "tko-col-prefs";

function getStorageKey(userId: string, tableId: string) {
  return `${STORAGE_KEY_PREFIX}:${tableId}:${userId}`;
}

export function useColumnPreferences(
  tableId: string,
  allColumnKeys: string[],
  defaultVisible?: string[]
) {
  const { user } = useAuth();
  const userId = user?.id ?? "anon";

  const defaults: ColumnPreferences = {
    visible: defaultVisible ?? allColumnKeys,
    widths: {},
    order: defaultVisible ?? allColumnKeys,
  };

  const [prefs, setPrefs] = useState<ColumnPreferences>(defaults);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount / user change
  useEffect(() => {
    const key = getStorageKey(userId, tableId);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ColumnPreferences>;
        const validVisible = (parsed.visible ?? allColumnKeys).filter((k) =>
          allColumnKeys.includes(k)
        );
        const validOrder = (parsed.order ?? validVisible).filter((k) =>
          allColumnKeys.includes(k)
        );
        // Add any missing keys to order
        const missingFromOrder = allColumnKeys.filter((k) => !validOrder.includes(k));
        setPrefs({
          visible: validVisible.length > 0 ? validVisible : allColumnKeys,
          widths: parsed.widths ?? {},
          order: [...validOrder, ...missingFromOrder],
        });
      } else {
        setPrefs({
          visible: defaultVisible ?? allColumnKeys,
          widths: {},
          order: defaultVisible ?? allColumnKeys,
        });
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, [userId, tableId, allColumnKeys, defaultVisible]);

  const persist = useCallback(
    (newPrefs: ColumnPreferences) => {
      const key = getStorageKey(userId, tableId);
      try {
        localStorage.setItem(key, JSON.stringify(newPrefs));
      } catch {
        // quota exceeded
      }
    },
    [userId, tableId]
  );

  const toggleColumn = useCallback(
    (columnKey: string) => {
      setPrefs((prev) => {
        const isVisible = prev.visible.includes(columnKey);
        if (isVisible && prev.visible.length <= 1) return prev;
        const newVisible = isVisible
          ? prev.visible.filter((k) => k !== columnKey)
          : [...prev.visible, columnKey];
        // Use stored order for ordering visible columns
        const ordered = prev.order.filter((k) => newVisible.includes(k));
        // Add any that aren't in order yet
        const extra = newVisible.filter((k) => !ordered.includes(k));
        const next = { ...prev, visible: [...ordered, ...extra] };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const setColumnWidth = useCallback(
    (columnKey: string, width: number) => {
      setPrefs((prev) => {
        const next = { ...prev, widths: { ...prev.widths, [columnKey]: width } };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const reorderColumns = useCallback(
    (fromKey: string, toKey: string) => {
      setPrefs((prev) => {
        const order = [...prev.order];
        const fromIdx = order.indexOf(fromKey);
        const toIdx = order.indexOf(toKey);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
        order.splice(fromIdx, 1);
        order.splice(toIdx, 0, fromKey);
        // Re-order visible to match new order
        const visible = order.filter((k) => prev.visible.includes(k));
        const next = { ...prev, order, visible };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const resetPreferences = useCallback(() => {
    const next: ColumnPreferences = {
      visible: defaultVisible ?? allColumnKeys,
      widths: {},
      order: defaultVisible ?? allColumnKeys,
    };
    setPrefs(next);
    persist(next);
  }, [allColumnKeys, defaultVisible, persist]);

  const isVisible = useCallback(
    (columnKey: string) => prefs.visible.includes(columnKey),
    [prefs.visible]
  );

  return {
    prefs,
    loaded,
    toggleColumn,
    setColumnWidth,
    reorderColumns,
    resetPreferences,
    isVisible,
    visibleColumns: prefs.visible,
  };
}
