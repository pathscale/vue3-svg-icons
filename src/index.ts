import { Plugin } from "rollup";
import cheerio from "cheerio";
import fs from "fs-extra";

// helper functions
const createSymbol = (code: string, name: string) => {
  const markup = cheerio.load(code, { xmlMode: true });
  const svgMarkup = markup("svg");
  const symbolId = name;

  markup("svg").replaceWith("<symbol/>");
  markup("symbol")
    .attr("id", symbolId)
    .attr("viewBox", svgMarkup.attr("viewBox") as string)
    .append(svgMarkup.children());

  return markup.xml("symbol");
};

interface TSymbol {
  bundle: string;
  code: string;
}

const createSprite = (bundle: string, _symbols: Array<TSymbol>) => {
  const symbols = _symbols.filter(symbol => symbol.bundle === bundle).map(symbol => symbol.code);
  return `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join("")}</svg>`;
};

// plugin
export default (): Plugin => {
  const bundles = new Set();
  const symbols: Array<TSymbol> = [];

  const plugin: Plugin = {
    name: "vue3-svg-icons",

    transform(code: string, id: string) {
      const $ = cheerio.load(code);
      const tags = $("v-icon");

      // skip if no tags
      if (tags.length === 0) return null;

      tags.map(async (_, tag) => {
        if (!tag.attribs || !("src" in tag.attribs)) return;

        if (!("bundle" in tag.attribs) || !("name" in tag.attribs)) {
          this.error(
            `Wrong props passed to v-icon (bundle and name are required): ${tag.attribs.src}, ${id}`,
          );
        }

        const file = await this.resolve(tag.attribs.src, id, {
          skipSelf: true,
        });
        if (!file) this.error(`SVG file not found: ${tag.attribs.src}, ${id}`);

        const svgSource = await fs.readFile(file.id, "utf8");

        // register bundle
        bundles.add(tag.attribs.bundle);

        // register symbol
        symbols.push({
          bundle: tag.attribs.bundle,
          code: createSymbol(svgSource, tag.attribs.name),
        });
      });

      return { code };
    },

    generateBundle() {
      [...bundles].map(bundle => {
        this.emitFile({
          type: "asset",
          fileName: `${bundle as string}.svg`,
          source: createSprite(bundle as string, symbols),
        });
      });
    },
  };
  return plugin;
};
