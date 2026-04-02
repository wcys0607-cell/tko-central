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
}: DataListProps<T>) {
  const isMobile = useIsMobile();

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
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table className={`w-full ${tableClassName}`}>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {columns.map((col) => (
              <TableHead key={col.key} className={`${col.className ?? ""} ${col.hideClass ?? ""}`}>
                {col.label}
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
                <TableCell key={col.key} className={`${col.className ?? ""} ${col.hideClass ?? ""}`}>
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
