import { ApiError, handleRouteError, jsonOk, parseJsonBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStellarPublicKey } from "@/lib/validators";

export const runtime = "nodejs";

type ConnectWalletBody = {
  stellarPublicKey?: string;
};

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await parseJsonBody<ConnectWalletBody>(req);
    const stellarPublicKey = requireStellarPublicKey(
      body.stellarPublicKey,
      "stellarPublicKey",
    );

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          stellar_public_key: stellarPublicKey,
          email: user.email ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) {
        throw error;
      }
    } else {
      const { error } = await supabaseAdmin.from("profiles").insert({
        id: user.id,
        email: user.email ?? null,
        stellar_public_key: stellarPublicKey,
      });

      if (error) {
        throw error;
      }
    }

    return jsonOk({ stellarPublicKey });
  } catch (error) {
    if (error instanceof ApiError) {
      return handleRouteError(error);
    }
    return handleRouteError(error);
  }
}
