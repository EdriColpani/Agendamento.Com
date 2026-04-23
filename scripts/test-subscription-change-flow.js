// Testa o fluxo de troca de plano (upgrade/downgrade) via Edge Function.
// Uso (PowerShell):
//   $env:SUPABASE_URL="https://<project>.supabase.co"
//   $env:SUPABASE_ANON_KEY="<anon_key>"
//   $env:SUPABASE_USER_ACCESS_TOKEN="<jwt_user>"
//   node scripts/test-subscription-change-flow.js <company_id> <target_plan_id> [monthly|yearly]

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ocawpokndruxakzmhzsa.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const USER_ACCESS_TOKEN = process.env.SUPABASE_USER_ACCESS_TOKEN;
const FUNCTION_NAME = "change-subscription-plan";

const companyId = process.argv[2];
const targetPlanId = process.argv[3];
const billingPeriod = process.argv[4] === "yearly" ? "yearly" : "monthly";

if (!SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_ANON_KEY env var.");
  process.exit(1);
}
if (!USER_ACCESS_TOKEN) {
  console.error("Missing SUPABASE_USER_ACCESS_TOKEN env var.");
  process.exit(1);
}
if (!companyId || !targetPlanId) {
  console.error("Usage: node scripts/test-subscription-change-flow.js <company_id> <target_plan_id> [monthly|yearly]");
  process.exit(1);
}

async function main() {
  const payload = {
    companyId,
    targetPlanId,
    billingPeriod,
  };

  console.log("Calling Edge Function:", FUNCTION_NAME);
  console.log("Payload:", payload);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${USER_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = { error: "Invalid JSON response." };
  }

  console.log("HTTP status:", response.status);
  console.log("Response:", JSON.stringify(body, null, 2));

  if (!response.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error?.message || error);
  process.exit(1);
});

