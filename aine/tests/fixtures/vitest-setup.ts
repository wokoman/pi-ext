/**
 * Vitest setup: polyfill Bun globals that don't exist in Node.
 */
import { createHash } from "node:crypto";

if (typeof globalThis.Bun === "undefined") {
  (globalThis as any).Bun = {
    hash(input: string | Buffer, seed?: number): bigint {
      const h = createHash("sha256");
      if (seed !== undefined) h.update(String(seed));
      h.update(typeof input === "string" ? input : Buffer.from(input));
      const hex = h.digest("hex").slice(0, 16); // 64-bit
      return BigInt("0x" + hex);
    },
  };
}
