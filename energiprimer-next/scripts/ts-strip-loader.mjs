export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export default {};",
      shortCircuit: true,
    };
  }

  if (specifier.startsWith(".") && !/[.]\w+$/.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Let Node report the original resolution error for other extensions.
    }
  }
  return nextResolve(specifier, context);
}

