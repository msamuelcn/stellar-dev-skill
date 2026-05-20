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

    const { data: gig, error: fetchError } = await supabaseAdmin
      .from("gigs")
      .select("id, creator_id, worker_id, status")
      .eq("id", gigId)
      .single();

    if (fetchError || !gig) {
      throw new ApiError(404, "Gig not found");
    }

    if (gig.creator_id === user.id) {
      throw new ApiError(409, "Creator cannot apply to own gig");
    }

    if (gig.worker_id && gig.worker_id !== user.id) {
      throw new ApiError(409, "Gig already has an assigned worker");
    }

    if (gig.status !== "open" && gig.status !== "in_progress") {
      throw new ApiError(409, "Gig is not open for applications");
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("gigs")
      .update({ worker_id: user.id, status: "in_progress" })
      .eq("id", gigId)
      .select("id, worker_id, status")
      .single();

    if (updateError) {
      throw updateError;
    }

    return jsonOk({ gig: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
