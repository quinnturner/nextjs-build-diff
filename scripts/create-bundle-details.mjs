// @ts-check
// Taken entirely from:
// https://jeffchen.dev/posts/Measuring-Bundle-Sizes-With-Next-js-And-Github-Actions/
import fs from "fs";
import path from "path";
import zlib from "zlib";

import bundle from "../.next/build-manifest.json";

const prefix = ".next";
// outputs to .next/analyze/bundle-details.json
const outfile = path.join(
  process.cwd(),
  prefix,
  "analyze",
  "bundle-details.json"
);

const pageSizes = Object.keys(bundle.pages).map((p) => {
  /** @type {string[]} */
  const files = bundle.pages[p];
  const size = files
    .map((filename) => {
      const fn = path.join(process.cwd(), prefix, filename);
      const bytes = fs.readFileSync(fn);
      const gzipped = zlib.gzipSync(bytes);
      return gzipped.byteLength;
    })
    .reduce((s, b) => s + b, 0);

  return { path: p, size };
});

fs.writeFileSync(outfile, JSON.stringify(pageSizes));
