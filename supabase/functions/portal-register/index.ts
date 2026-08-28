import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type RegistrationBody = {
  email?: string;
  password?: string;
  username?: string;
  family_name?: string;
  first_name?: string;
  middle_initial?: string | null;
};

type OrgChartPerson = {
  first_name: string | null;
  family_name: string | null;
  category: string | null;
  grade_level: string | null;
  is_grade_chairman: boolean | null;
};

const normalizedText = (value: string | null | undefined) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();

const exactName = (value: string | null | undefined) =>
  String(value ?? "").trim().toUpperCase();

const gradeNumber = (value: string | null | undefined) => {
  const grade = String(value ?? "").trim().toUpperCase();
  if (grade === "0" || grade.startsWith("KINDER")) return 0;
  const numeric = grade.match(/(?:^|\b)([1-6])(?:\b|$)/)?.[1];
  return numeric ? Number(numeric) : null;
};

async function findAuthUserByEmail(email: string) {
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email,
    );
    if (user) return user;
    if (data.users.length < perPage) return null;
  }
}

async function portalAuthEmail(realEmail: string) {
  const input = new TextEncoder().encode(`ieces-portal:${realEmail}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  // .invalid is a reserved, non-deliverable domain. This address exists only
  // as Portal's private Supabase Auth login identifier.
  return `portal-${hash}@auth.ieces.invalid`;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    const {
      email,
      password,
      username,
      family_name,
      first_name,
      middle_initial,
    } = (await request.json()) as RegistrationBody;

    if (!email || !password || !username || !family_name || !first_name) {
      return json(400, {
        error:
          "Email, password, username, family name, and first name are required.",
      });
    }

    if (password.length < 6) {
      return json(400, {
        error: "Password must be at least 6 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    // This app's allowlist is maintained by IECES Dashboard Manager.
    const { data: allowed, error: allowedError } = await supabaseAdmin.rpc(
      "is_app_email_allowed",
      {
        app_key: "portal",
        candidate_email: normalizedEmail,
      },
    );

    if (allowedError) {
      return json(500, { error: "Could not verify the registration allowlist." });
    }

    if (!allowed) {
      return json(403, {
        error: "Email not authorized to register. Contact your administrator.",
      });
    }

    const [emailProfileResult, usernameProfileResult] = await Promise.all([
      supabaseAdmin
        .from("portal_profile")
        .select("id")
        .eq("real_email", normalizedEmail)
        .maybeSingle(),
      supabaseAdmin
        .from("portal_profile")
        .select("id")
        .eq("username", normalizedUsername)
        .maybeSingle(),
    ]);

    if (emailProfileResult.error || usernameProfileResult.error) {
      return json(500, { error: "Could not verify the portal profile." });
    }

    if (emailProfileResult.data) {
      return json(409, {
        error: "This email already has an IECES Portal account. Please sign in.",
      });
    }

    if (usernameProfileResult.data) {
      return json(409, { error: "Username is already taken." });
    }

    // IECES Report's shared Org Chart is authoritative for grade-chairman
    // assignments. Resolve it before Auth/profile creation so the stored
    // Portal role is correct from the user's first sign-in.
    const { data: orgRows, error: orgError } = await supabaseAdmin
      .from("org_chart")
      .select(
        "first_name, family_name, category, grade_level, is_grade_chairman",
      );

    if (orgError) {
      return json(500, { error: "Could not verify the Org Chart assignment." });
    }

    const registeredFirstName = exactName(first_name);
    const registeredFamilyName = exactName(family_name);
    const orgPerson = (orgRows as OrgChartPerson[] | null)?.find(
      (person) =>
        normalizedText(person.category) === "TEACHING" &&
        exactName(person.first_name) === registeredFirstName &&
        exactName(person.family_name) === registeredFamilyName,
    );

    if (!orgPerson) {
      return json(403, {
        error:
          "Your name was not found in the IECES Report Org Chart. Use the same first and family name recorded there or contact the administrator.",
      });
    }

    const role = orgPerson.is_grade_chairman
      ? "grade_chairman"
      : "adviser";
    const gradeLevelAssigned = gradeNumber(orgPerson.grade_level);

    const authEmail = await portalAuthEmail(normalizedEmail);
    const existingAuthUser = await findAuthUserByEmail(authEmail);
    let authUserId: string;
    let createdAuthUser = false;

    if (existingAuthUser) {
      // Recover safely if Auth creation succeeded during an earlier request but
      // profile creation did not. Only the password chosen for Portal can reuse
      // this orphaned Portal identity.
      const authClient = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: passwordError } = await authClient.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (passwordError) {
        return json(401, {
          error: "A Portal registration already exists for this email.",
        });
      }

      authUserId = existingAuthUser.id;
    } else {
      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: authEmail,
          password,
          email_confirm: true,
          user_metadata: {
            app_source: "ieces_portal_scoped",
            real_email: normalizedEmail,
          },
        });

      if (createError || !newUser.user) {
        return json(400, {
          error: createError?.message || "Could not create the Auth account.",
        });
      }

      authUserId = newUser.user.id;
      createdAuthUser = true;
    }

    const { error: insertError } = await supabaseAdmin
      .from("portal_profile")
      .insert({
        id: authUserId,
        email: normalizedEmail,
        real_email: normalizedEmail,
        auth_email: authEmail,
        username: normalizedUsername,
        family_name: family_name.trim().toUpperCase(),
        first_name: first_name.trim().toUpperCase(),
        middle_initial: middle_initial?.trim().toUpperCase() || null,
        role,
        grade_level_assigned: gradeLevelAssigned,
      });

    if (insertError) {
      if (createdAuthUser) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      }
      return json(500, { error: insertError.message });
    }

    return json(200, { success: true });
  } catch (error) {
    console.error("Portal registration failed:", error);
    return json(500, { error: "Registration failed. Please try again." });
  }
});
