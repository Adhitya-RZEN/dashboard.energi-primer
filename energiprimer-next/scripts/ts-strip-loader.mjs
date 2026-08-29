import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export default {};",
      shortCircuit: true,
    };
  }

  if (specifier.startsWith("@/")) {
    const target = resolvePath(projectRoot, "src", specifier.slice(2));
    return nextResolve(pathToFileURL(`${target}.ts`).href, context);
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
