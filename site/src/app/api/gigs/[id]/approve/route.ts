import { ApiError, handleRouteError, jsonOk, parseIdParam } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const gigId = parseIdParam(id, "gig id");

    const { data: gig, error: gigError } = await supabaseAdmin
      .from("gigs")
      .select("id, creator_id, worker_id, status")
      .eq("id", gigId)
      .single();

    if (gigError || !gig) {
      throw new ApiError(404, "Gig not found");
    }

    if (gig.creator_id !== user.id) {
      throw new ApiError(403, "Only gig creator can approve submission");
    }

    if (!gig.worker_id) {
      throw new ApiError(409, "Gig has no assigned worker");
    }

    if (gig.status !== "pending_review") {
      throw new ApiError(409, "Gig is not pending review");
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("gigs")
      .update({
        status: "approved_pending_payment",
        approved_at: new Date().toISOString(),
      })
      .eq("id", gigId)
      .select("id, status, approved_at")
      .single();

    if (updateError) {
      throw updateError;
    }

    return jsonOk({ gig: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
