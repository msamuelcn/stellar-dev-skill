import {
  ApiError,
  handleRouteError,
  jsonOk,
  parseIdParam,
  parseJsonBody,
} from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOptionalString, requireString } from "@/lib/validators";

export const runtime = "nodejs";

type SubmitGigBody = {
  proofUrl?: string;
  notes?: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    const body = await parseJsonBody<SubmitGigBody>(req);
    const { id } = await params;
    const gigId = parseIdParam(id, "gig id");

    const proofUrl = requireString(body.proofUrl, "proofUrl");
    const notes = requireOptionalString(body.notes, "notes");

    const { data: gig, error: gigError } = await supabaseAdmin
      .from("gigs")
      .select("id, worker_id, status")
      .eq("id", gigId)
      .single();

    if (gigError || !gig) {
      throw new ApiError(404, "Gig not found");
    }

    if (gig.worker_id !== user.id) {
      throw new ApiError(403, "Only the assigned worker can submit work");
    }

    if (gig.status !== "in_progress") {
      throw new ApiError(409, "Gig is not in progress");
    }

    const { error: submissionError } = await supabaseAdmin
      .from("submissions")
      .upsert(
        {
          gig_id: gigId,
          worker_id: user.id,
          proof_url: proofUrl,
          notes,
          status: "submitted",
        },
        {
          onConflict: "gig_id,worker_id",
        },
      );

    if (submissionError) {
      throw submissionError;
    }

    const { data: updatedGig, error: updateGigError } = await supabaseAdmin
      .from("gigs")
      .update({ status: "pending_review" })
      .eq("id", gigId)
      .select("id, status")
      .single();

    if (updateGigError) {
      throw updateGigError;
    }

    return jsonOk({ gig: updatedGig });
  } catch (error) {
    return handleRouteError(error);
  }
}
