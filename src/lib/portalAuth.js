import { supabase } from "./supabase";

export const PORTAL_APP_KEY = "portal";

export async function resolvePortalLogin(identifier) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const resolved = await supabase
    .rpc("resolve_portal_login", {
      candidate_identifier: normalizedIdentifier,
    })
    .maybeSingle();

  if (!resolved.error && resolved.data) return resolved;

  // Temporary compatibility path for clients updated before the migration.
  const legacyColumn = normalizedIdentifier.includes("@") ? "email" : "username";
  const legacy = await supabase
    .from("portal_profile")
    .select("email, username")
    .eq(legacyColumn, normalizedIdentifier)
    .maybeSingle();

  if (legacy.error || !legacy.data) return resolved;
  return {
    data: {
      auth_email: legacy.data.email,
      real_email: legacy.data.email,
    },
    error: null,
  };
}

export async function validatePortalSession(session) {
  if (!session?.user?.id) {
    return { valid: false, error: "No active session." };
  }

  const { error: ownerAccessError } = await supabase.rpc(
    "ensure_owner_app_access",
    { app_key: PORTAL_APP_KEY },
  );
  if (ownerAccessError) {
    return { valid: false, error: "Could not verify application access." };
  }

  let profileResult = await supabase
    .from("portal_profile")
    .select("id, real_email, auth_email, username")
    .eq("id", session.user.id)
    .maybeSingle();

  // Temporary compatibility path until real_email/auth_email are deployed.
  if (profileResult.error) {
    const legacyResult = await supabase
      .from("portal_profile")
      .select("id, email, username")
      .eq("id", session.user.id)
      .maybeSingle();
    profileResult = legacyResult.data
      ? {
          data: {
            ...legacyResult.data,
            real_email: legacyResult.data.email,
            auth_email: session.user.email,
          },
          error: legacyResult.error,
        }
      : legacyResult;
  }

  if (profileResult.error || !profileResult.data) {
    return {
      valid: false,
      error: "This account is not registered for IECES Portal.",
    };
  }

  const { data: allowed, error: allowError } = await supabase.rpc(
    "is_app_email_allowed",
    {
      app_key: PORTAL_APP_KEY,
      candidate_email: profileResult.data.real_email,
    },
  );
  if (allowError || !allowed) {
    return {
      valid: false,
      error: "Your email is no longer authorized to access IECES Portal.",
    };
  }

  return { valid: true, profile: profileResult.data };
}
