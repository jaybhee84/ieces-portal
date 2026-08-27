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
