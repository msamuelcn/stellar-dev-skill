import {
  ApiError,
  handleRouteError,
  jsonOk,
  parseIdParam,
  parseJsonBody,
} from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { submitSignedXdr, verifyPaymentByHash } from "@/lib/stellar";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type ConfirmPaymentBody = {
  attemptId?: number;
  signedXdr?: string;
  txHash?: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gigId: string }> },
) {
  try {
    const user = await requireUser(req);
    const body = await parseJsonBody<ConfirmPaymentBody>(req);
    const { gigId: gigIdParam } = await params;
    const gigId = parseIdParam(gigIdParam, "gig id");

    const attemptId = Number(body.attemptId);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      throw new ApiError(400, "attemptId must be a positive integer");
    }

    const hasSignedXdr = typeof body.signedXdr === "string" && body.signedXdr.length > 0;
    const hasTxHash = typeof body.txHash === "string" && body.txHash.length > 0;
    if (!hasSignedXdr && !hasTxHash) {
      throw new ApiError(400, "Either signedXdr or txHash is required");
    }

    const { data: gig, error: gigError } = await supabaseAdmin
      .from("gigs")
      .select("id, creator_id, worker_id, reward_amount, reward_asset, status, tx_hash")
      .eq("id", gigId)
      .single();

    if (gigError || !gig) {
      throw new ApiError(404, "Gig not found");
    }

    if (gig.creator_id !== user.id) {
      throw new ApiError(403, "Only gig creator can confirm payout");
    }

    if (!gig.worker_id) {
      throw new ApiError(409, "Gig has no assigned worker");
    }

    if (gig.status !== "approved_pending_payment" && gig.status !== "paid") {
      throw new ApiError(409, "Gig is not in a payable state");
    }

    const { data: attempt, error: attemptError } = await supabaseAdmin
      .from("payment_attempts")
      .select(
        "id, gig_id, requester_id, source_public_key, destination_public_key, amount, status, tx_hash",
      )
      .eq("id", attemptId)
      .eq("gig_id", gigId)
      .single();

    if (attemptError || !attempt) {
      throw new ApiError(404, "Payment attempt not found");
    }

    if (attempt.requester_id !== user.id) {
      throw new ApiError(403, "Payment attempt does not belong to current user");
    }

    let txHash = hasTxHash ? body.txHash!.trim() : "";

    if (!txHash && hasSignedXdr) {
      const signedXdr = body.signedXdr!.trim();
      const { error: signingUpdateError } = await supabaseAdmin
        .from("payment_attempts")
        .update({
          status: "signed",
          signed_xdr: signedXdr,
        })
        .eq("id", attemptId);

      if (signingUpdateError) {
        throw signingUpdateError;
      }

      txHash = await submitSignedXdr(signedXdr);

      const { error: submittedUpdateError } = await supabaseAdmin
        .from("payment_attempts")
        .update({
          status: "submitted",
          tx_hash: txHash,
        })
        .eq("id", attemptId);

      if (submittedUpdateError) {
        throw submittedUpdateError;
      }
    }

    const verified = await verifyPaymentByHash(txHash, {
      sourcePublicKey: attempt.source_public_key,
      destinationPublicKey: attempt.destination_public_key,
      amount: Number(attempt.amount).toFixed(7),
    });

    if (gig.reward_asset !== "XLM") {
      throw new ApiError(409, "Only XLM payouts are supported in this endpoint");
    }

    const { data: updatedGig, error: gigUpdateError } = await supabaseAdmin
      .from("gigs")
      .update({
        status: "paid",
        tx_hash: verified.txHash,
        paid_at: new Date().toISOString(),
      })
      .eq("id", gigId)
      .is("tx_hash", null)
      .in("status", ["approved_pending_payment"])
      .select("id, status, tx_hash, paid_at")
      .maybeSingle();

    if (gigUpdateError) {
      throw gigUpdateError;
    }

    if (!updatedGig && gig.status !== "paid") {
      throw new ApiError(409, "Gig payout was already processed or state changed");
    }

    const { error: attemptConfirmError } = await supabaseAdmin
      .from("payment_attempts")
      .update({
        status: "confirmed",
        tx_hash: verified.txHash,
      })
      .eq("id", attemptId);

    if (attemptConfirmError) {
      throw attemptConfirmError;
    }

    return jsonOk({
      status: "paid",
      txHash: verified.txHash,
      amount: verified.amount,
      from: verified.from,
      to: verified.to,
      gig: updatedGig ?? {
        id: gigId,
        status: "paid",
        tx_hash: verified.txHash,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
