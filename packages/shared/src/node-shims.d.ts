/**
 * Minimal ambient declarations for the Node.js built-in modules used by the
 * unit tests. The sandbox cannot install `@types/node`, so we declare just
 * enough of `node:test` and `node:assert/strict` to type-check the tests.
 *
 * In a fully installed environment `@types/node` supersedes these.
 */

declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function test(fn: () => void | Promise<void>): void;
}

declare module "node:assert/strict" {
  interface AssertStrict {
    (value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    throws(fn: () => unknown, expected?: RegExp | ((err: unknown) => boolean)): void;
  }
  const assert: AssertStrict;
  export default assert;
}

/** `globalThis.process` reference used by bedrock-models env resolution. */
declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
}
