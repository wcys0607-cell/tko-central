"use client";

import { Settings2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface ColumnOption {
  key: string;
  label: string;
  /** If true, column is always shown and cannot be toggled */
  locked?: boolean;
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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(props) => (
          <Button variant="outline" size="sm" className="gap-1.5 h-9" {...props}>
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Columns</span>
          </Button>
        )}
      />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((col) => {
          if (col.locked) return null;
          return (
            <DropdownMenuCheckboxItem
              key={col.key}
              checked={visibleColumns.includes(col.key)}
              onCheckedChange={() => onToggle(col.key)}
            >
              {col.label}
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="px-1.5 py-1">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
