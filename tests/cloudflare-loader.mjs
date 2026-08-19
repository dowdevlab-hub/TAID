export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      url: `data:text/javascript,${encodeURIComponent(`
        export const env = new Proxy({}, {
          get(_target, property) {
            const testEnv = globalThis.__TAID_TEST_ENV__;
            if (testEnv && Reflect.has(testEnv, property)) {
              return Reflect.get(testEnv, property);
            }
            return Reflect.get(process.env, property);
          }
        });
      `)}`,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}
