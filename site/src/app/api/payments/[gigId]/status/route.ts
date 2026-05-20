import { ApiError, handleRouteError, jsonOk, parseIdParam } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ gigId: string }> },
) {
  try {
    const user = await requireUser(req);
    const { gigId: gigIdParam } = await params;
    const gigId = parseIdParam(gigIdParam, "gig id");

    const { data: gig, error: gigError } = await supabaseAdmin
      .from("gigs")
      .select("id, creator_id, worker_id, status, tx_hash, reward_amount, reward_asset")
      .eq("id", gigId)
      .single();

    if (gigError || !gig) {
      throw new ApiError(404, "Gig not found");
    }

    if (gig.creator_id !== user.id && gig.worker_id !== user.id) {
      throw new ApiError(403, "Not authorized to view this payment status");
    }

    const { data: latestAttempt, error: attemptError } = await supabaseAdmin
      .from("payment_attempts")
      .select("id, status, tx_hash, error_message, created_at, updated_at")
      .eq("gig_id", gigId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (attemptError) {
      throw attemptError;
    }

    return jsonOk({
      gig: {
        id: gig.id,
        status: gig.status,
        txHash: gig.tx_hash,
        rewardAmount: gig.reward_amount,
        rewardAsset: gig.reward_asset,
      },
      latestAttempt,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
