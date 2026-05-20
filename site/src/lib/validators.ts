import { StrKey } from "@stellar/stellar-sdk";

import { ApiError } from "@/lib/api";

export const requireString = (
  value: unknown,
  field: string,
  minLength = 1,
): string => {
  if (typeof value !== "string") {
    throw new ApiError(400, `${field} must be a string`);
  }

  const normalized = value.trim();
  if (normalized.length < minLength) {
    throw new ApiError(400, `${field} is required`);
  }
  return normalized;
};

export const requireOptionalString = (value: unknown, field: string) => {
  if (value === undefined || value === null) {
    return null;
  }
  return requireString(value, field);
};

export const requirePositiveAmount = (
  value: unknown,
  field = "rewardAmount",
): string => {
  const text = requireString(value, field);
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(400, `${field} must be a positive number`);
  }
  return parsed.toFixed(7);
};

export const requireStellarPublicKey = (value: unknown, field: string) => {
  const key = requireString(value, field);
  if (!StrKey.isValidEd25519PublicKey(key)) {
    throw new ApiError(400, `${field} must be a valid Stellar public key`);
  }
  return key;
};

export const requireUuid = (value: unknown, field: string): string => {
  const text = requireString(value, field);
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(text)) {
    throw new ApiError(400, `${field} must be a valid UUID`);
  }
  return text;
};
