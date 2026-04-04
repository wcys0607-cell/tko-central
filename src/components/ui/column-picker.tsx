"use client";

import { Settings2, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

interface ColumnOption {
  key: string;
  label: string;
}

interface ColumnPickerProps {
  columns: ColumnOption[];
  visibleColumns: string[];
  onToggle: (key: string) => void;
  onReset: () => void;
}

export function ColumnPicker({
  columns,
  visibleColumns,
  onToggle,
  onReset,
}: ColumnPickerProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="gap-1.5 h-9" />}
      >
        <Settings2 className="h-4 w-4" />
        <span className="hidden sm:inline">Columns</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Toggle columns
        </p>
        {columns.map((col) => {
          const isVisible = visibleColumns.includes(col.key);
          return (
            <button
              key={col.key}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-default select-none"
              onClick={() => onToggle(col.key)}
            >
              <span className="flex h-4 w-4 items-center justify-center">
                {isVisible && <Check className="h-3.5 w-3.5" />}
              </span>
              {col.label}
            </button>
          );
        })}
        <div className="border-t mt-1 pt-1 px-1 pb-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-1.5 h-7 text-xs"
            onClick={onReset}
          >
            <RotateCcw className="h-3 w-3" />
            Reset to default
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
