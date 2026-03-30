import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { errorHandler } from "../error.js";
import { ApiError } from "../api-error.js";
import { RequestValidationError } from "../../services/stellar.js";

describe("errorHandler", () => {
  const mockRequest = {} as Request;
  const mockResponse = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    locals: { requestId: "test-id" }
  } as unknown as Response;
  const next = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should handle ApiError correctly", () => {
    const error = ApiError.badRequest("Invalid data");
    errorHandler(error, mockRequest, mockResponse, next);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "bad_request",
      message: "Invalid data",
      requestId: "test-id"
    });
  });

  it("should map Soroban contract error strings to structured responses", () => {
    const error = new Error("Transaction failed: Error(Contract, #4)");
    errorHandler(error, mockRequest, mockResponse, next);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "invalid_split",
      message: "Basis points do not sum to exactly 10,000",
      details: "Transaction failed: Error(Contract, #4)",
      requestId: "test-id"
    });
  });

  it("should map unknown Soroban codes to generic contract error", () => {
    const error = new Error("Error(Contract, #99)");
    errorHandler(error, mockRequest, mockResponse, next);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "contract_error",
      message: "Unknown contract error code #99",
      details: "Error(Contract, #99)",
      requestId: "test-id"
    });
  });

  it("should handle RequestValidationError", () => {
    const error = new RequestValidationError("Account not found");
    errorHandler(error, mockRequest, mockResponse, next);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "validation_error",
      message: "Account not found",
      requestId: "test-id"
    });
  });

  it("should return 500 for generic unknown errors", () => {
    const error = new Error("Something blew up");
    errorHandler(error, mockRequest, mockResponse, next);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "internal_error",
      message: "Unexpected server error.",
      requestId: "test-id"
    });
  });

  it("should handle Soroban simulation errors", () => {
    const error = new Error("Transaction simulation failed: some rpc reason");
    errorHandler(error, mockRequest, mockResponse, next);

    expect(mockResponse.status).toHaveBeenCalledWith(502);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "simulation_failed",
      message: "Soroban transaction simulation failed.",
      details: "Transaction simulation failed: some rpc reason",
      requestId: "test-id"
    });
  });
});
