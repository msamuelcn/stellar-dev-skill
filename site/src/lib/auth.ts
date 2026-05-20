import { ApiError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase-admin";

const bearerPrefix = "Bearer ";

const getBearerToken = (req: Request): string => {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith(bearerPrefix)) {
    throw new ApiError(401, "Missing Authorization bearer token");
  }

  const token = authHeader.slice(bearerPrefix.length).trim();
  if (!token) {
    throw new ApiError(401, "Missing Authorization bearer token");
  }

  return token;
};

export const requireUser = async (req: Request) => {
  const token = getBearerToken(req);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    throw new ApiError(401, "Invalid or expired access token");
  }

  return data.user;
};
