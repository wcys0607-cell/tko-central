import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_ROLES = ["admin", "manager", "office", "driver"];

export async function POST(request: Request) {
  // Verify the requesting user is admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("drivers")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (requester?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const { name, email, password, phone, ic_number, role } = body;

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "Name, email, and password are required" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  // Validate role
  const validatedRole = VALID_ROLES.includes(role) ? role : "driver";

  // Create auth user with service role key
  const adminClient = createAdminClient();
  const { data: authUser, error: authError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Insert driver record
  const { data: driver, error: driverError } = await adminClient
    .from("drivers")
    .insert({
      auth_user_id: authUser.user.id,
      name: name.trim(),
      email,
      phone: phone || null,
      ic_number: ic_number || null,
      role: validatedRole,
    })
    .select()
    .single();

  if (driverError) {
    // Rollback: delete the orphaned auth user
    await adminClient.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: driverError.message }, { status: 400 });
  }

  return NextResponse.json({ driver });
}

export async function PATCH(request: Request) {
  // Verify the requesting user is admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("drivers")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (requester?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const { id, name, phone, ic_number, role } = body;

  if (!id) {
    return NextResponse.json({ error: "Driver ID required" }, { status: 400 });
  }

  // Validate role
  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
  }

  // Prevent empty name
  if (name !== undefined && !name.trim()) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: driver, error } = await adminClient
    .from("drivers")
    .update({
      name: name?.trim(),
      phone: phone || null,
      ic_number: ic_number || null,
      role,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ driver });
}
