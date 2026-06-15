// Shared route helpers. better-sqlite3 is synchronous, so handlers are plain
// functions; this wrapper translates thrown RuleError / ValidationError into
// JSON error responses with the right status code.
import { RuleError } from "../logic.js";
import { ValidationError } from "../validate.js";

export function handle(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      if (err instanceof RuleError) {
        return res.status(err.status || 400).json({ error: err.message });
      }
      console.error("Unhandled route error:", err);
      return res.status(500).json({ error: "Something went wrong." });
    }
  };
}

// Parse and validate an :id route param as a positive integer.
export function idParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    const e = new Error("Invalid id.");
    e.status = 400;
    throw e;
  }
  return id;
}
