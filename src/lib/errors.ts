export class PermanentError extends Error {
  readonly permanent = true;

  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

export function isPermanent(error: unknown): error is PermanentError {
  return error instanceof PermanentError || (error as { permanent?: boolean })?.permanent === true;
}
