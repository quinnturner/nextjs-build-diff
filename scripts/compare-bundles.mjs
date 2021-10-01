// @ts-check
import fs from "fs";
import path from "path";

import currentBundle from "../.next/analyze/bundle.json";
import developBundle from "../.next/analyze/develop/bundle/bundle.json";

const prefix = ".next";
const outdir = path.join(process.cwd(), prefix, "analyze");
const outfile = path.join(outdir, "bundle-comparison.txt");

function formatBytes(bytes, signed = false) {
  const sign = signed ? (bytes < 0 ? "-" : "+") : "";
  if (bytes === 0) {
    return `${sign}0B`;
  }

  const k = 1024;
  const dm = 2;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));

  return `${sign}${parseFloat(Math.abs(bytes / Math.pow(k, i)).toFixed(dm))}${
    sizes[i]
  }`;
}

// Produce a Markdown table with each page & its size

const makeTable = () => {
  let totalBundleDiff = 0;
  const sizes = currentBundle
    .map(({ path, size }) => {
      const developSize = developBundle.find((x) => x.path === path);
      const pageExistsOnDevelop = !!developSize;
      const diff = pageExistsOnDevelop ? size - developSize.size : 0;
      totalBundleDiff += diff;
      const diffStr = pageExistsOnDevelop ? formatBytes(diff, true) : "added";
      return `| \`${path}\` | ${formatBytes(size)} (${diffStr}) |`;
    })
    .concat(
      developBundle
        .filter(({ path }) => !currentBundle.find((x) => x.path === path))
        .map(({ path }) => `| \`${path}\` | removed |`)
    )
    .join("\n");

  const output = `## Bundle comparison
  
  > This output will not match next build's bundle size output.
  > It's not intended to be precise, but it will help catch significant bundle changes.

  ### Sum of all route increases: ${formatBytes(totalBundleDiff, true)}

  | Route | Size (gzipped) |
  | --- | --- |
  ${sizes}
  <!-- GH BOT -->`;
  return output;
};

const output = makeTable();

try {
  fs.mkdirSync(outdir);
} catch (e) {
  // may already exist
}

fs.writeFileSync(outfile, output);
