import os from "os";
import path from "path";

/**
 * Writable root for `dreams.json`, `persons.json`, `audio/`, `person-reference/`.
 *
 * Locally this is `./data`. On Vercel (and most serverless hosts) only `/tmp`
 * is writable, so we use `{tmpdir}/dreamcup-data`.
 *
 * Note: `/tmp` on serverless survives for one function instance lifecycle, not forever
 * across deployments or all replicas — for durable storage use Postgres, KV, or Blob.
 */
export function getServerDataRoot(): string {
  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "dreamcup-data");
  }
  return path.join(process.cwd(), "data");
}
