import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import type { Request, Response } from "express";
import { validateRequest } from "../validate.js";
import { ApiError } from "../api-error.js";

describe("validateRequest", () => {
  const mockResponse = {
    locals: { requestId: "test-id" }
  } as unknown as Response;
  const next = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should call next() if validation passes", () => {
    const schema = z.object({ id: z.string() });
    const middleware = validateRequest({ body: schema });
    const mockRequest = { body: { id: "123" } } as Request;

    middleware(mockRequest, mockResponse, next);

    expect(next).toHaveBeenCalledWith();
    expect(mockRequest.body).toEqual({ id: "123" });
  });

  it("should call next(ApiError) if validation fails", () => {
    const schema = z.object({ id: z.string() });
    const middleware = validateRequest({ body: schema });
    const mockRequest = { body: { id: 123 } } as unknown as Request;

    middleware(mockRequest, mockResponse, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0] as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("validation_error");
    expect(error.statusCode).toBe(400);
    expect(error.details).toContainEqual(expect.objectContaining({
      path: "id",
      message: expect.stringContaining("Expected string, received number")
    }));
  });

  it("should validate multiple sources (body, params, query)", () => {
    const bodySchema = z.object({ name: z.string() });
    const paramsSchema = z.object({ id: z.string().transform(Number) });
    const middleware = validateRequest({ body: bodySchema, params: paramsSchema });
    const mockRequest = { 
      body: { name: "test" },
      params: { id: "123" }
    } as unknown as Request;

    middleware(mockRequest, mockResponse, next);

    expect(next).toHaveBeenCalledWith();
    expect(mockRequest.body.name).toBe("test");
    expect(mockRequest.params.id).toBe(123); // testing transform
  });
});
