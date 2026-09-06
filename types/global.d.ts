// Ambient declaration for the lazily-created global pg Pool, shared across
// HMR reloads in dev and warm invocations in serverless runtimes.
export {};
declare global {
  var __quickcapturePgPool: import("pg").Pool | undefined;
}
