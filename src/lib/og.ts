import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReactNode } from "react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const fontFile = (weight: number) =>
  path.join(
    process.cwd(),
    "src/assets/fonts",
    `geist-latin-${weight}-normal.ttf`,
  );

let fontsPromise: Promise<{ name: string; weight: number; data: Buffer }[]>;

const loadFonts = () => {
  fontsPromise ??= Promise.all(
    [400, 600, 700, 800].map(async (weight) => ({
      name: "Geist",
      weight,
      data: await readFile(fontFile(weight)),
    })),
  );
  return fontsPromise;
};

export async function renderOgImage(element: ReactNode): Promise<Response> {
  const fonts = await loadFonts();
  const svg = await satori(element, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: fonts.map((font) => ({
      ...font,
      weight: font.weight as 400 | 600 | 700 | 800,
      style: "normal",
    })),
  });

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_WIDTH },
  })
    .render()
    .asPng();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
