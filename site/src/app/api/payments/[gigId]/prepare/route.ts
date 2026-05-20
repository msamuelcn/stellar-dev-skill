import {
  ApiError,
  handleRouteError,
  jsonOk,
  parseIdParam,
  parseJsonBody,
} from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { buildUnsignedXlmPaymentXdr } from "@/lib/stellar";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUuid } from "@/lib/validators";

export const runtime = "nodejs";

type PreparePaymentBody = {
  idempotencyKey?: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gigId: string }> },
) {
  try {
    const user = await requireUser(req);
    const body = await parseJsonBody<PreparePaymentBody>(req);
    const { gigId: gigIdParam } = await params;
    const gigId = parseIdParam(gigIdParam, "gig id");
    const idempotencyKey = requireUuid(body.idempotencyKey, "idempotencyKey");

    const { data: gig, error: gigError } = await supabaseAdmin
      .from("gigs")
      .select("id, creator_id, worker_id, reward_amount, reward_asset, status, tx_hash")
      .eq("id", gigId)
      .single();

    if (gigError || !gig) {
      throw new ApiError(404, "Gig not found");
    }

    if (gig.creator_id !== user.id) {
      throw new ApiError(403, "Only gig creator can prepare payout");
    }

    if (!gig.worker_id) {
      throw new ApiError(409, "Gig has no assigned worker");
    }

    if (gig.status !== "approved_pending_payment") {
      throw new ApiError(409, "Gig is not approved for payment");
    }

    if (gig.tx_hash) {
      throw new ApiError(409, "Gig is already paid");
    }

    if (gig.reward_asset !== "XLM") {
      throw new ApiError(409, "Only XLM payouts are supported in this endpoint");
    }

    const { data: existingAttempt, error: attemptLookupError } = await supabaseAdmin
      .from("payment_attempts")
      .select("id, unsigned_xdr, status")
      .eq("gig_id", gigId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (attemptLookupError) {
      throw attemptLookupError;
    }

    if (existingAttempt?.unsigned_xdr) {
      return jsonOk({
        attemptId: existingAttempt.id,
        unsignedXdr: existingAttempt.unsigned_xdr,
        status: existingAttempt.status,
      });
    }

    const [creatorProfile, workerProfile] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("stellar_public_key")
        .eq("id", gig.creator_id)
        .single(),
      supabaseAdmin
        .from("profiles")
        .select("stellar_public_key")
        .eq("id", gig.worker_id)
        .single(),
    ]);

    if (creatorProfile.error || !creatorProfile.data) {
      throw new ApiError(409, "Creator profile not found");
    }

    if (workerProfile.error || !workerProfile.data) {
      throw new ApiError(409, "Worker profile not found");
    }

    const creatorPublicKey = creatorProfile.data.stellar_public_key;
    const workerPublicKey = workerProfile.data.stellar_public_key;

    if (!creatorPublicKey || !workerPublicKey) {
      throw new ApiError(409, "Both creator and worker must connect a Stellar wallet");
    }

    const amount = Number(gig.reward_amount).toFixed(7);
    const unsignedXdr = await buildUnsignedXlmPaymentXdr({
      sourcePublicKey: creatorPublicKey,
      destinationPublicKey: workerPublicKey,
      amount,
      memoText: `gig:${gig.id}`,
    });

    const { data: insertedAttempt, error: insertAttemptError } = await supabaseAdmin
      .from("payment_attempts")
      .insert({
        gig_id: gigId,
        requester_id: user.id,
        idempotency_key: idempotencyKey,
        source_public_key: creatorPublicKey,
        destination_public_key: workerPublicKey,
        amount,
        asset_code: "XLM",
        unsigned_xdr: unsignedXdr,
        status: "prepared",
      })
      .select("id, unsigned_xdr, status")
      .single();

    if (insertAttemptError || !insertedAttempt) {
      throw insertAttemptError ?? new ApiError(500, "Failed to create payment attempt");
    }

    return jsonOk({
      attemptId: insertedAttempt.id,
      unsignedXdr: insertedAttempt.unsigned_xdr,
      status: insertedAttempt.status,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
