import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const jsonOk = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });

export const jsonError = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const handleRouteError = (error: unknown) => {
  if (error instanceof ApiError) {
    return jsonError(error.status, error.message);
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  return jsonError(500, message);
};

export const parseJsonBody = async <T>(req: Request): Promise<T> => {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
};

export const parseIdParam = (value: string, label = "id") => {
  const id = Number.parseInt(value, 10);
  if (Number.isNaN(id) || id <= 0) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return id;
};
