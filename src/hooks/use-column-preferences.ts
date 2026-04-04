"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/auth-provider";

export interface ColumnPreferences {
  visible: string[];
  widths: Record<string, number>;
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

  const [prefs, setPrefs] = useState<ColumnPreferences>(() => ({
    visible: defaultVisible ?? allColumnKeys,
    widths: {},
  }));
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount / user change
  useEffect(() => {
    const key = getStorageKey(userId, tableId);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ColumnPreferences>;
        // Filter out any keys that no longer exist
        const validVisible = (parsed.visible ?? allColumnKeys).filter((k) =>
          allColumnKeys.includes(k)
        );
        setPrefs({
          visible: validVisible.length > 0 ? validVisible : allColumnKeys,
          widths: parsed.widths ?? {},
        });
      } else {
        setPrefs({
          visible: defaultVisible ?? allColumnKeys,
          widths: {},
        });
      }
    } catch {
      // ignore parse errors
    }
    setLoaded(true);
  }, [userId, tableId, allColumnKeys, defaultVisible]);

  // Save to localStorage
  const persist = useCallback(
    (newPrefs: ColumnPreferences) => {
      const key = getStorageKey(userId, tableId);
      try {
        localStorage.setItem(key, JSON.stringify(newPrefs));
      } catch {
        // quota exceeded, ignore
      }
    },
    [userId, tableId]
  );

  const toggleColumn = useCallback(
    (columnKey: string) => {
      setPrefs((prev) => {
        const isVisible = prev.visible.includes(columnKey);
        // Don't allow hiding all columns
        if (isVisible && prev.visible.length <= 1) return prev;
        const newVisible = isVisible
          ? prev.visible.filter((k) => k !== columnKey)
          : [...prev.visible, columnKey];
        // Maintain original order
        const ordered = allColumnKeys.filter((k) => newVisible.includes(k));
        const next = { ...prev, visible: ordered };
        persist(next);
        return next;
      });
    },
    [allColumnKeys, persist]
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

  const resetPreferences = useCallback(() => {
    const next: ColumnPreferences = {
      visible: defaultVisible ?? allColumnKeys,
      widths: {},
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
    resetPreferences,
    isVisible,
    visibleColumns: prefs.visible,
  };
}
