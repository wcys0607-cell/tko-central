"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useRef } from "react";

export interface DataColumn<T> {
  key: string;
  label: string;
  className?: string;
  render: (item: T) => ReactNode;
  /** Show this column on mobile card view */
  mobileVisible?: boolean;
  /** Use as primary (bold, larger) on mobile card */
  mobilePrimary?: boolean;
  /** Use as secondary line on mobile card */
  mobileSecondary?: boolean;
  /** Extra class to hide column at certain breakpoints, e.g. "hidden lg:table-cell" */
  hideClass?: string;
  /** If true, column cannot be resized */
  noResize?: boolean;
}

interface DataListProps<T> {
  data: T[];
  columns: DataColumn<T>[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  loading?: boolean;
  loadingRows?: number;
  tableClassName?: string;
  /** Force table layout even on mobile */
  alwaysTable?: boolean;
  /** Column widths (key -> px). Used for resizable columns. */
  columnWidths?: Record<string, number>;
  /** Called when a column is resized by dragging */
  onColumnResize?: (key: string, width: number) => void;
}

export function DataList<T>({
  data,
  columns,
  keyExtractor,
  onRowClick,
  emptyMessage = "No data found.",
  loading = false,
  loadingRows = 6,
  tableClassName = "",
  alwaysTable = false,
  columnWidths,
  onColumnResize,
}: DataListProps<T>) {
  const isMobile = useIsMobile();

  // Resize handler (hooks must be called before any returns)
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, colKey: string, currentWidth: number) => {
      e.preventDefault();
      e.stopPropagation();
      resizingRef.current = { key: colKey, startX: e.clientX, startW: currentWidth };

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return;
        const diff = ev.clientX - resizingRef.current.startX;
        const newWidth = Math.max(50, resizingRef.current.startW + diff);
        onColumnResize?.(resizingRef.current.key, newWidth);
      };

      const onMouseUp = () => {
        resizingRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [onColumnResize]
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: loadingRows }).map((_, i) => (
          <div
            key={i}
            className="h-16 bg-muted rounded-lg animate-pulse"
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  // Mobile: Card layout (skipped if alwaysTable)
  if (isMobile && !alwaysTable) {
    const primaryCol = columns.find((c) => c.mobilePrimary);
    const secondaryCol = columns.find((c) => c.mobileSecondary);
    const metaCols = columns.filter(
      (c) => c.mobileVisible && !c.mobilePrimary && !c.mobileSecondary
    );

    return (
      <div className="space-y-2">
        {data.map((item, idx) => (
          <div
            key={keyExtractor(item)}
            className={`bg-card border border-border rounded-xl p-3.5 animate-slide-up ${
              onRowClick ? "active:scale-[0.98] transition-transform cursor-pointer" : ""
            }`}
            style={{ animationDelay: `${idx * 30}ms` }}
            onClick={() => onRowClick?.(item)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {primaryCol && (
                  <div className="font-semibold text-sm truncate">
                    {primaryCol.render(item)}
                  </div>
                )}
                {secondaryCol && (
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {secondaryCol.render(item)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {metaCols.slice(-2).map((col) => (
                  <span key={col.key} className="text-xs">
                    {col.render(item)}
                  </span>
                ))}
                {onRowClick && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
            {metaCols.length > 2 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 pt-2 border-t border-border/50">
                {metaCols.slice(0, -2).map((col) => (
                  <div key={col.key} className="text-xs">
                    <span className="text-muted-foreground">{col.label}: </span>
                    <span className="font-medium">{col.render(item)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Desktop: Table layout
  const hasResizing = !!onColumnResize;

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table className={`${hasResizing ? "table-fixed" : "w-full"} ${tableClassName}`}>
        {hasResizing && (
          <colgroup>
            {columns.map((col) => {
              const w = columnWidths?.[col.key];
              return <col key={col.key} style={w ? { width: w } : undefined} />;
            })}
          </colgroup>
        )}
        <TableHeader>
          <TableRow className="bg-muted/50">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={`${col.className ?? ""} ${col.hideClass ?? ""} ${hasResizing ? "relative overflow-hidden" : ""}`}
                style={columnWidths?.[col.key] ? { width: columnWidths[col.key] } : undefined}
              >
                <span className="truncate">{col.label}</span>
                {hasResizing && !col.noResize && col.label && (
                  <span
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50"
                    onMouseDown={(e) =>
                      handleResizeStart(
                        e,
                        col.key,
                        columnWidths?.[col.key] ??
                          (e.currentTarget.parentElement?.offsetWidth ?? 100)
                      )
                    }
                  />
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => (
            <TableRow
              key={keyExtractor(item)}
              className={onRowClick ? "hover:bg-muted/50 cursor-pointer" : ""}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={`${col.className ?? ""} ${col.hideClass ?? ""} ${hasResizing ? "overflow-hidden text-ellipsis" : ""}`}
                >
                  {col.render(item)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
