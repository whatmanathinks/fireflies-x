export type FailureCode = "no_speech" | "not_admitted" | "too_large" | "error";

export class PermanentError extends Error {
  readonly permanent = true;
  readonly code: FailureCode;

  constructor(message: string, code: FailureCode = "error") {
    super(message);
    this.name = "PermanentError";
    this.code = code;
  }
}

export function isPermanent(error: unknown): error is PermanentError {
  return error instanceof PermanentError || (error as { permanent?: boolean })?.permanent === true;
}

export function failureCodeOf(error: unknown): FailureCode {
  return isPermanent(error) ? error.code : "error";
}
