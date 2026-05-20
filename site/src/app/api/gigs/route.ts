import { ApiError, handleRouteError, jsonOk, parseJsonBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requirePositiveAmount, requireString } from "@/lib/validators";

export const runtime = "nodejs";

type CreateGigBody = {
  title?: string;
  description?: string;
  rewardAmount?: string;
  rewardAsset?: "XLM" | "USDC";
};

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await parseJsonBody<CreateGigBody>(req);

    const title = requireString(body.title, "title");
    const description = requireString(body.description, "description");
    const rewardAmount = requirePositiveAmount(body.rewardAmount);
    const rewardAsset = body.rewardAsset ?? "XLM";

    if (rewardAsset !== "XLM" && rewardAsset !== "USDC") {
      throw new ApiError(400, "rewardAsset must be XLM or USDC");
    }

    const { data, error } = await supabaseAdmin
      .from("gigs")
      .insert({
        creator_id: user.id,
        title,
        description,
        reward_amount: rewardAmount,
        reward_asset: rewardAsset,
        status: "open",
      })
      .select("id, title, description, reward_amount, reward_asset, status")
      .single();

    if (error) {
      throw error;
    }

    return jsonOk({ gig: data }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
