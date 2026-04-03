import { Badge } from "@/components/ui/badge";

type StatusType = "order" | "bukku" | "payment" | "fleet";

const STATUS_STYLES: Record<StatusType, Record<string, string>> = {
  order: {
    pending: "bg-status-pending-bg text-status-pending-fg",
    approved: "bg-status-approved-bg text-status-approved-fg",
    rejected: "bg-status-rejected-bg text-status-rejected-fg",
    delivered: "bg-status-delivered-bg text-status-delivered-fg",
    cancelled: "bg-status-cancelled-bg text-status-cancelled-fg",
  },
  bukku: {
    pending: "bg-status-pending-bg text-status-pending-fg",
    synced: "bg-status-approved-bg text-status-approved-fg",
    error: "bg-status-rejected-bg text-status-rejected-fg",
    skipped: "bg-status-cancelled-bg text-status-cancelled-fg",
    voided: "bg-status-cancelled-bg text-status-cancelled-fg",
  },
  payment: {
    paid: "bg-status-approved-bg text-status-approved-fg",
    partial: "bg-status-pending-bg text-status-pending-fg",
    unpaid: "bg-status-pending-bg text-status-pending-fg",
    overdue: "bg-status-rejected-bg text-status-rejected-fg animate-pulse-status",
  },
  fleet: {
    valid: "bg-status-approved-bg text-status-approved-fg",
    expiring_soon: "bg-status-pending-bg text-status-pending-fg",
    expired: "bg-status-rejected-bg text-status-rejected-fg animate-pulse-status",
  },
};

interface StatusBadgeProps {
  status: string;
  type?: StatusType;
  className?: string;
}

export function StatusBadge({
  status,
  type = "order",
  className = "",
}: StatusBadgeProps) {
  const styles = STATUS_STYLES[type]?.[status] ?? "bg-muted text-muted-foreground";

  const LABEL_MAP: Record<string, string> = {
    approved: "acknowledged",
  };

  return (
    <Badge
      variant="secondary"
      className={`capitalize font-medium ${styles} ${className}`}
    >
      {LABEL_MAP[status] ?? status.replace(/_/g, " ")}
    </Badge>
  );
}
