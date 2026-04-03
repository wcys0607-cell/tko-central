import type { SupabaseClient } from "@supabase/supabase-js";

export interface NotificationRecipient {
  name: string;
  phone: string;
  logic?: "all" | "custom";
  doc_types?: string[];
}

/**
 * Load notification recipients from app_config by key.
 * Returns parsed JSON array or empty array on failure.
 */
export async function getRecipients(
  supabase: SupabaseClient,
  configKey: string
): Promise<NotificationRecipient[]> {
  const { data } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", configKey)
    .single();

  if (!data?.value) return [];

  try {
    return JSON.parse(data.value) as NotificationRecipient[];
  } catch {
    console.error(`Failed to parse ${configKey}:`, data.value);
    return [];
  }
}

/**
 * Filter recipients that should receive a notification for a given doc type.
 * - logic "all" or missing: always included
 * - logic "custom": only if docType is in doc_types array
 */
export function filterByDocType(
  recipients: NotificationRecipient[],
  docType: string
): NotificationRecipient[] {
  return recipients.filter((r) => {
    if (!r.logic || r.logic === "all") return true;
    if (r.logic === "custom" && r.doc_types) {
      return r.doc_types.some(
        (dt) => dt.toLowerCase() === docType.toLowerCase()
      );
    }
    return false;
  });
}
