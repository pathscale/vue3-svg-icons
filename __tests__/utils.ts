import path from "path";
import fs from "fs-extra";
import { rollup, InputOptions, OutputOptions } from "rollup";
import vue from "rollup-plugin-vue";

import plugin from "../src";
import { Options } from "../src/types";

export interface WriteData {
  input: string | string[];
  title?: string;
  outDir?: string;
  options?: Options;
  inputOpts?: InputOptions;
  outputOpts?: OutputOptions;
}

export interface WriteResult {
  js: () => Promise<string[]>;
  svg: () => Promise<string[]>;
  isSvg: () => Promise<boolean>;
  isFile: (file: string) => Promise<boolean>;
}

async function pathExistsAll(files: string[]): Promise<boolean> {
  if (files.length === 0) return false;
  for await (const file of files) {
    const exists = await fs.pathExists(file);
    if (!exists) return false;
  }
  return true;
}

export const fixture = (...args: string[]): string =>
  path.normalize(path.join(__dirname, "fixtures", ...args));

export async function write(data: WriteData): Promise<WriteResult> {
  const outDir = fixture("dist", data.outDir ?? data.title ?? "");
  const input = Array.isArray(data.input) ? data.input.map(i => fixture(i)) : fixture(data.input);
  const bundle = await rollup({
    ...data.inputOpts,
    input,
    plugins: [plugin(), vue()],
    onwarn: (warning, warn) => {
      if (warning.message.includes("'vue'")) {
        if (warning.code === "UNUSED_EXTERNAL_IMPORT") return;
        if (warning.code === "UNRESOLVED_IMPORT") return;
      }
      warn(warning);
    },
  });

  const { output } = await bundle.write({
    ...data.outputOpts,
    dir: data.outputOpts?.file ? undefined : outDir,
    file: data.outputOpts?.file && path.join(outDir, data.outputOpts.file),
  });

  const js = output
    .filter(f => f.type === "chunk")
    .map(f => path.join(outDir, f.fileName))
    .sort();

  const svg = output
    .filter(f => f.type === "asset" && f.fileName.endsWith(".svg"))
    .map(f => path.join(outDir, f.fileName))
    .sort();

  const res: WriteResult = {
    js: async () => Promise.all(js.map(async f => fs.readFile(f, "utf8"))),
    svg: async () => Promise.all(svg.map(async f => fs.readFile(f, "utf8"))),
    isSvg: async () => pathExistsAll(svg),
    isFile: async file => fs.pathExists(path.join(outDir, file)),
  };

  return res;
}
