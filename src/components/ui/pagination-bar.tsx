"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: PaginationBarProps) {
  if (totalPages <= 1) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  // Generate page numbers with ellipsis
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    pages.push(0);
    if (page > 2) pages.push("...");
    for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 3) pages.push("...");
    pages.push(totalPages - 1);
  }

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span className="hidden sm:inline">
        {start.toLocaleString()}&ndash;{end.toLocaleString()} of {total.toLocaleString()}
      </span>
      <span className="sm:hidden text-xs">
        Page {page + 1}/{totalPages}
      </span>
      <div className="flex gap-1 items-center">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="hidden sm:flex gap-1">
          {pages.map((p, i) =>
            p === "..." ? (
              <span key={`dots-${i}`} className="px-1 text-muted-foreground">
                ...
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "default" : "ghost"}
                size="icon"
                className="h-9 w-9 text-xs"
                onClick={() => onPageChange(p)}
              >
                {p + 1}
              </Button>
            )
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
