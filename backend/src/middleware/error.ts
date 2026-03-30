import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "./api-error.js";
import { RequestValidationError } from "../services/stellar.js";

export function notFoundHandler(_req: Request, res: Response) {
  const body = ApiError.notFound("Route not found.").toBody(res.locals.requestId);
  res.status(404).json(body);
}

// ---------------------------------------------------------------------------
// Soroban SplitError code → structured HTTP response mapping.
//
// Each key matches the u32 discriminant in contracts/errors.rs `SplitError`.
// The error handler extracts the code from strings like "Error(Contract, #4)"
// and maps it to the correct HTTP status and human-readable message.
// ---------------------------------------------------------------------------

const SPLIT_ERRORS: Record<number, { status: number; code: string; message: string }> = {
  1:  { status: 409, code: "project_exists",        message: "Project ID already exists on-chain" },
  2:  { status: 404, code: "not_found",             message: "Project ID not found" },
  3:  { status: 403, code: "unauthorized",           message: "Caller is not the project owner" },
  4:  { status: 400, code: "invalid_split",          message: "Basis points do not sum to exactly 10,000" },
  5:  { status: 400, code: "too_few_collaborators",  message: "Fewer than 2 collaborators provided" },
  6:  { status: 400, code: "zero_share",             message: "A collaborator was assigned 0 basis points" },
  7:  { status: 400, code: "no_balance",             message: "Target project holds no balance to distribute" },
  8:  { status: 400, code: "already_locked",         message: "Project is already locked and cannot be modified" },
  9:  { status: 400, code: "project_locked",         message: "Project is locked; splits cannot be updated" },
  10: { status: 400, code: "duplicate_collaborator", message: "Duplicate collaborator address detected in split definition" },
  11: { status: 400, code: "invalid_amount",         message: "Deposit or transfer amount is invalid" },
  12: { status: 400, code: "token_not_allowed",      message: "Token is not included in the configured allowlist" },
  13: { status: 400, code: "admin_not_set",          message: "Contract admin is not configured yet" },
};

// ---------------------------------------------------------------------------
// Soroban error parsing
// ---------------------------------------------------------------------------

/**
 * Attempts to extract a Soroban contract error code from an error message.
 *
 * Soroban surfaces contract errors in several patterns:
 *   • "Error(Contract, #4)"                – direct contract error
 *   • "HostError: Error(Contract, #4)"      – wrapped host error
 *   • "Transaction simulation failed: ... Error(Contract, #4) ..."
 *
 * Returns an `ApiError` if a known code is found, otherwise `null`.
 */
function parseSorobanContractError(message: string | undefined): ApiError | null {
  if (!message) return null;

  const match = message.match(/Error\(Contract, #(\d+)\)/);
  if (!match) return null;

  const errorCode = parseInt(match[1], 10);
  const mapped = SPLIT_ERRORS[errorCode];
  if (!mapped) {
    // Unknown contract error code — return a generic contract error
    return ApiError.sorobanError(
      500,
      "contract_error",
      `Unknown contract error code #${errorCode}`,
      message
    );
  }

  return ApiError.sorobanError(mapped.status, mapped.code, mapped.message, message);
}

/**
 * Attempts to parse a Soroban simulation/RPC error that is NOT a contract error.
 *
 * These are infrastructure-level failures (e.g. insufficient funds for fees,
 * expired transaction, network issues) and should surface as 502/503.
 */
function parseSorobanSimulationError(message: string | undefined): ApiError | null {
  if (!message) return null;

  // Simulation failure that is not a contract error
  if (message.includes("simulation") || message.includes("Simulation")) {
    return new ApiError(502, "simulation_failed", "Soroban transaction simulation failed.", message);
  }

  // Expired / resource limit errors
  if (message.includes("expired") || message.includes("resource")) {
    return new ApiError(502, "soroban_error", "Soroban RPC error.", message);
  }

  return null;
}

/**
 * Builds structured Zod validation details from a ZodError.
 */
function buildZodDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
}

// ---------------------------------------------------------------------------
// Central error handler
//
// This is the SINGLE point where all errors are turned into the consistent
// { error, message, details?, requestId } response shape.
// ---------------------------------------------------------------------------

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId: string | undefined = res.locals.requestId;

  // 1) Already an ApiError — just serialise it.
  if (err instanceof ApiError) {
    console.error({ requestId, error: err.code, message: err.message });
    return res.status(err.statusCode).json(err.toBody(requestId));
  }

  // 2) Zod validation error — should not normally reach here (validate middleware
  //    catches these), but handle defensively.
  if (err instanceof z.ZodError) {
    const apiErr = ApiError.validationError("Request validation failed.", buildZodDetails(err));
    console.error({ requestId, error: apiErr.code, message: apiErr.message });
    return res.status(apiErr.statusCode).json(apiErr.toBody(requestId));
  }

  // 3) RequestValidationError from stellar service (e.g. "owner account not found").
  if (err instanceof RequestValidationError) {
    const apiErr = ApiError.validationError(err.message);
    console.error({ requestId, error: apiErr.code, message: apiErr.message });
    return res.status(apiErr.statusCode).json(apiErr.toBody(requestId));
  }

  // 4) Generic Error — try to extract Soroban contract or simulation errors.
  if (err instanceof Error) {
    const contractErr = parseSorobanContractError(err.message);
    if (contractErr) {
      console.error({ requestId, error: contractErr.code, message: contractErr.message, raw: err.message });
      return res.status(contractErr.statusCode).json(contractErr.toBody(requestId));
    }

    const simErr = parseSorobanSimulationError(err.message);
    if (simErr) {
      console.error({ requestId, error: simErr.code, message: simErr.message, raw: err.message });
      return res.status(simErr.statusCode).json(simErr.toBody(requestId));
    }

    // Stellar config missing
    if (err.message?.includes("Missing Stellar configuration")) {
      const configErr = ApiError.configError("Server is missing required Stellar configuration.");
      console.error({ requestId, error: configErr.code, message: configErr.message });
      return res.status(configErr.statusCode).json(configErr.toBody(requestId));
    }
  }

  // 5) Fallback — generic 500
  console.error({ requestId, err });
  const fallback = ApiError.internal();
  res.status(fallback.statusCode).json(fallback.toBody(requestId));
}
