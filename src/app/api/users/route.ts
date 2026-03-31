import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
      name,
      email,
      phone: phone || null,
      ic_number: ic_number || null,
      role: role || "driver",
    })
    .select()
    .single();

  if (driverError) {
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

  const adminClient = createAdminClient();
  const { data: driver, error } = await adminClient
    .from("drivers")
    .update({
      name,
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
