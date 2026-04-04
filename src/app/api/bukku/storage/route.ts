import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/api-auth";

const BUCKET = "bukku-docs";

/** GET — return storage stats (file count + total size) */
export async function GET() {
  const { user, error, status } = await getAuthenticatedUser(["admin"]);
  if (!user) return NextResponse.json({ error }, { status: status ?? 401 });

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: folders } = await admin.storage.from(BUCKET).list("so", { limit: 1000 });
  let fileCount = 0;
  let totalSize = 0;

  for (const folder of folders ?? []) {
    const { data: files } = await admin.storage.from(BUCKET).list(`so/${folder.name}`, { limit: 100 });
    for (const file of files ?? []) {
      if (file.metadata?.size) {
        totalSize += Number(file.metadata.size);
      }
      fileCount++;
    }
  }

  return NextResponse.json({ fileCount, totalSize });
}

/** DELETE — clear old PDFs (older than X days, default 90) */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only admin can delete
  const { data: driver } = await supabase
    .from("drivers")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (!driver || driver.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { days } = await req.json().catch(() => ({ days: 90 }));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days || 90));

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: folders } = await admin.storage.from(BUCKET).list("so", { limit: 1000 });
  let deleted = 0;

  for (const folder of folders ?? []) {
    const { data: files } = await admin.storage.from(BUCKET).list(`so/${folder.name}`, { limit: 100 });
    const toDelete: string[] = [];
    for (const file of files ?? []) {
      const created = file.created_at ? new Date(file.created_at) : null;
      if (created && created < cutoff) {
        toDelete.push(`so/${folder.name}/${file.name}`);
      }
    }
    if (toDelete.length > 0) {
      await admin.storage.from(BUCKET).remove(toDelete);
      deleted += toDelete.length;
    }
  }

  return NextResponse.json({ deleted });
}
