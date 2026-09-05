import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function packageVersion(packageName) {
  const packagePath = join(
    projectRoot,
    "node_modules",
    packageName,
    "package.json",
  );
  return JSON.parse(readFileSync(packagePath, "utf8")).version;
}

function applyReplacements(relativePath, replacements) {
  const absolutePath = join(projectRoot, relativePath);
  const original = readFileSync(absolutePath, "utf8");
  let source = original.replace(/\r\n/g, "\n");

  for (const [search, replacement] of replacements) {
    if (replacement && source.includes(replacement)) continue;
    if (!source.includes(search)) {
      if (!replacement) continue;
      throw new Error(
        "CSP dependency patch did not match " +
          relativePath +
          ". The pinned dependency source may have changed.",
      );
    }
    source = source.replace(search, replacement);
  }

  if (source !== original) writeFileSync(absolutePath, source);
}

function replaceSection(relativePath, startMarker, endMarker, replacement) {
  const absolutePath = join(projectRoot, relativePath);
  const original = readFileSync(absolutePath, "utf8");
  const source = original.replace(/\r\n/g, "\n");
  if (source.includes(replacement.split("\n", 1)[0])) return;

  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(
      "CSP dependency patch did not match " +
        relativePath +
        ". The pinned dependency source may have changed.",
    );
  }

  writeFileSync(absolutePath, source.slice(0, start) + replacement + source.slice(end));
}

function assertPinnedDependency(packageName, expectedVersion) {
  const actualVersion = packageVersion(packageName);
  if (actualVersion !== expectedVersion) {
    throw new Error(
      "CSP dependency patch expects " +
        packageName +
        "@" +
        expectedVersion +
        ", but found " +
        packageName +
        "@" +
        actualVersion +
        ".",
    );
  }
}

assertPinnedDependency("recharts", "3.10.1");
assertPinnedDependency("next", "16.3.3");

applyReplacements("node_modules/recharts/es6/chart/RechartsWrapper.js", [
  [
    "    className: clsx('recharts-wrapper', className),\n" +
      "    style: _objectSpread({\n" +
      "      position: 'relative',\n" +
      "      cursor: 'default',\n" +
      "      width,\n" +
      "      height\n" +
      "    }, style),",
    "    className: clsx('recharts-wrapper', className),\n" +
      "    style: undefined,",
  ],
]);

applyReplacements("node_modules/recharts/lib/chart/RechartsWrapper.js", [
  [
    "    className: (0, _clsx.clsx)('recharts-wrapper', className),\n" +
      "    style: _objectSpread({\n" +
      "      position: 'relative',\n" +
      "      cursor: 'default',\n" +
      "      width,\n" +
      "      height\n" +
      "    }, style),",
    "    className: (0, _clsx.clsx)('recharts-wrapper', className),\n" +
      "    style: undefined,",
  ],
]);

for (const relativePath of [
  "node_modules/recharts/es6/container/RootSurface.js",
  "node_modules/recharts/lib/container/RootSurface.js",
]) {
  applyReplacements(relativePath, [
    [
      "    width: width,\n" +
        "    height: height,\n" +
        "    style: FULL_WIDTH_AND_HEIGHT,\n" +
        "    ref: ref",
      "    width: width,\n" +
        "    height: height,\n" +
        "    className: \"recharts-surface-csp\",\n" +
        "    style: undefined,\n" +
        "    ref: ref",
    ],
  ]);
}

const canvasMeasureFunction = [
  "var measureTextWithCanvas = (text, style) => {",
  "  try {",
  "    var canvas = document.createElement('canvas');",
  "    var context = canvas.getContext('2d');",
  "    if (!context) {",
  "      return { width: 0, height: 0 };",
  "    }",
  "    var fontSize = Number.parseFloat(String(style.fontSize || '12'));",
  "    if (!Number.isFinite(fontSize) || fontSize <= 0) {",
  "      fontSize = 12;",
  "    }",
  "    var fontFamily = style.fontFamily || 'Arial';",
  "    var font = [",
  "      style.fontStyle,",
  "      style.fontVariant,",
  "      style.fontWeight,",
  "      \"\".concat(fontSize, \"px\"),",
  "      fontFamily,",
  "    ].filter(Boolean).join(' ');",
  "    context.font = font;",
  "    var value = \"\".concat(text);",
  "    if (style.textTransform === 'uppercase') value = value.toUpperCase();",
  "    if (style.textTransform === 'lowercase') value = value.toLowerCase();",
  "    var metrics = context.measureText(value);",
  "    var letterSpacing = Number.parseFloat(String(style.letterSpacing || '0'));",
  "    if (!Number.isFinite(letterSpacing)) letterSpacing = 0;",
  "    var width = metrics.width + Math.max(0, value.length - 1) * letterSpacing;",
  "    var height =",
  "      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent ||",
  "      fontSize;",
  "    return {",
  "      width,",
  "      height,",
  "    };",
  "  } catch (_unused) {",
  "    return {",
  "      width: 0,",
  "      height: 0",
  "    };",
  "  }",
  "};",
].join("\n");

for (const [relativePath, endMarker] of [
  [
    "node_modules/recharts/es6/util/DOMUtils.js",
    "\nexport var getStringSize",
  ],
  [
    "node_modules/recharts/lib/util/DOMUtils.js",
    "\nvar getStringSize = exports.getStringSize",
  ],
]) {
  applyReplacements(relativePath, [
    [
      "var SPAN_STYLE = {\n" +
        "  position: 'absolute',\n" +
        "  top: '-20000px',\n" +
        "  left: 0,\n" +
        "  padding: 0,\n" +
        "  margin: 0,\n" +
        "  border: 'none',\n" +
        "  whiteSpace: 'pre'\n" +
        "};\n" +
        "var MEASUREMENT_SPAN_ID = 'recharts_measurement_span';\n",
      "",
    ],
  ]);
  replaceSection(
    relativePath,
    "var measureTextWithDOM = (text, style) => {",
    endMarker,
    canvasMeasureFunction,
  );
  applyReplacements(relativePath, [
    [
      " * Measure text using DOM (accurate but slower)",
      " * Measure text with a canvas so chart measurement does not create " +
        "inline style attributes",
    ],
  ]);
}

for (const relativePath of [
  "node_modules/next/dist/esm/client/components/app-router-announcer.js",
  "node_modules/next/dist/client/components/app-router-announcer.js",
]) {
  applyReplacements(relativePath, [
    [
      "const ANNOUNCER_TYPE = 'next-route-announcer';\n" +
        "const ANNOUNCER_ID = '__next-route-announcer__';",
      "const ANNOUNCER_TYPE = 'next-route-announcer';\n" +
        "const ANNOUNCER_ID = '__next-route-announcer__';\n" +
        "const ANNOUNCER_CONTAINER_CLASS = 'phase6s-route-announcer';\n" +
        "const ANNOUNCER_CONTENT_CLASS = 'phase6s-route-announcer-content';",
    ],
    [
      "        const container = document.createElement(ANNOUNCER_TYPE);\n" +
        "        container.style.cssText = 'position:absolute';\n" +
        "        const announcer = document.createElement('div');\n" +
        "        announcer.ariaLive = 'assertive';\n" +
        "        announcer.id = ANNOUNCER_ID;\n" +
        "        announcer.role = 'alert';\n" +
        "        announcer.style.cssText = " +
        "'position:absolute;border:0;height:1px;margin:-1px;padding:0;" +
        "width:1px;clip:rect(0 0 0 0);overflow:hidden;white-space:nowrap;" +
        "word-wrap:normal';\n" +
        "        // Use shadow DOM here to avoid any potential CSS bleed\n" +
        "        const shadow = container.attachShadow({\n" +
        "            mode: 'open'\n" +
        "        });\n" +
        "        shadow.appendChild(announcer);",
      "        const container = document.createElement(ANNOUNCER_TYPE);\n" +
        "        container.setAttribute('name', ANNOUNCER_TYPE);\n" +
        "        container.className = ANNOUNCER_CONTAINER_CLASS;\n" +
        "        const announcer = document.createElement('div');\n" +
        "        announcer.ariaLive = 'assertive';\n" +
        "        announcer.id = ANNOUNCER_ID;\n" +
        "        announcer.role = 'alert';\n" +
        "        announcer.className = ANNOUNCER_CONTENT_CLASS;\n" +
        "        container.appendChild(announcer);",
    ],
  ]);
}

console.log("CSP dependency patches applied for Next.js 16.3.3 and Recharts 3.10.1.");
