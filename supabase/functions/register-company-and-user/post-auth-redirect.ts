/**
 * Cópia colocal: o deploy das Edge Functions não embarca `../_shared/`. Manter as três
 * cópias (register-company-and-user, resend-email-confirmation, invite-collaborator) alinhadas.
 *
 * Pós-clique em e-mail: `segment_types.scheduling_mode === 'court'` → /arena; senão /login.
 * Alinhado a useCompanySchedulingMode no app.
 */
export function getPostAuthRedirectTo(
  siteBaseUrl: string,
  isCourtMode: boolean
): string {
  const base = siteBaseUrl.replace(/\/+$/, "");
  return `${base}${isCourtMode ? "/arena" : "/login"}`;
}

type AdminLike = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (a: string, b: string) => {
        maybeSingle: () => Promise<{ data: { scheduling_mode?: string; segment_type?: string } | null; error: unknown }>;
      };
    };
  };
};

export async function isSegmentCourtMode(
  supabaseAdmin: AdminLike,
  segmentTypeId: string
): Promise<boolean> {
  if (!segmentTypeId) return false;
  const { data, error } = await supabaseAdmin
    .from("segment_types")
    .select("scheduling_mode")
    .eq("id", segmentTypeId)
    .maybeSingle();
  if (error || !data) return false;
  return (data as { scheduling_mode?: string }).scheduling_mode === "court";
}

export async function isCompanyCourtMode(
  supabaseAdmin: AdminLike,
  companyId: string
): Promise<boolean> {
  if (!companyId) return false;
  const { data: companyRow, error: cErr } = await supabaseAdmin
    .from("companies")
    .select("segment_type")
    .eq("id", companyId)
    .maybeSingle();
  if (cErr || !companyRow?.segment_type) return false;
  return isSegmentCourtMode(
    supabaseAdmin,
    (companyRow as { segment_type: string }).segment_type
  );
}

/** Resolve se o usuário (por e-mail) tem empresa primária (ou qualquer) em modo court. */
export async function resolveCourtModeForAuthEmail(
  supabaseAdmin: AdminLike & {
    auth: {
      admin: {
        getUserByEmail?: (e: string) => Promise<{
          data: { user: { id: string } | null } | null;
          error: { message?: string } | null;
        }>;
        listUsers?: (o: { page: number; perPage: number; filter?: string }) => Promise<{
          data: { users: { id: string }[] } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  },
  email: string
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  let userId: string | null = null;
  const admin = supabaseAdmin.auth?.admin;
  if (admin && typeof admin.getUserByEmail === "function") {
    const { data, error } = await admin.getUserByEmail(normalized);
    if (error && error?.message && !/not found/i.test(error.message)) {
      return false;
    }
    userId = data?.user?.id ?? null;
  } else if (admin && typeof admin.listUsers === "function") {
    const { data, error } = await admin.listUsers({
      page: 1,
      perPage: 1,
      filter: normalized,
    });
    if (error) return false;
    userId = data?.users?.[0]?.id ?? null;
  }

  if (!userId) return false;

  const { data: primary, error: pErr } = await supabaseAdmin
    .from("user_companies")
    .select("company_id")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (!pErr && primary?.company_id) {
    return isCompanyCourtMode(supabaseAdmin, primary.company_id);
  }

  const { data: anyCo, error: aErr } = await supabaseAdmin
    .from("user_companies")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!aErr && anyCo?.company_id) {
    return isCompanyCourtMode(supabaseAdmin, anyCo.company_id);
  }

  return false;
}
