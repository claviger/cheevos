// Tiny input-validation helpers for write endpoints. Throws ValidationError with
// a 400-friendly message; routes catch and translate to JSON responses.
export class ValidationError extends Error {}

export function str(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== "string") throw new ValidationError(`${field} must be text.`);
  const v = value.trim();
  if (v.length < min) throw new ValidationError(`${field} is required.`);
  if (v.length > max) throw new ValidationError(`${field} must be at most ${max} characters.`);
  return v;
}

// Optional free text (e.g. a description). Missing/empty is allowed and returns
// "". Still length-checked and type-checked.
export function optStr(value, field, { max = 280 } = {}) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new ValidationError(`${field} must be text.`);
  const v = value.trim();
  if (v.length > max) throw new ValidationError(`${field} must be at most ${max} characters.`);
  return v;
}

export function int(value, field, { min = 0, max = 1_000_000 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new ValidationError(`${field} must be a whole number.`);
  if (n < min) throw new ValidationError(`${field} must be at least ${min}.`);
  if (n > max) throw new ValidationError(`${field} must be at most ${max}.`);
  return n;
}

export function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}
