/** Order status badge colors */
export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  delivered: "bg-blue-100 text-blue-700",
  cancelled: "bg-gray-100 text-gray-500",
};

/** Bukku sync status badge colors */
export const BUKKU_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  synced: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-500",
};

/** Payment status badge colors */
export const PAYMENT_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  unpaid: "bg-orange-100 text-orange-700",
  overdue: "bg-red-100 text-red-700",
};
