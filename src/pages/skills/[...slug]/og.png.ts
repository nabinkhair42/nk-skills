import type { APIRoute } from "astro";
import { Grid } from "@/components/og/grid";
import { renderOgImage } from "@/lib/og";
import { skills } from "@/data/skills";

const shorten = (value: string, max = 140) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}...`;

// the vendored Geist latin subset has no glyph for ⌘ — swap it for text
const sanitize = (value: string) => value.replace(/⌘/g, "cmd+");

export function getStaticPaths() {
  return skills.map((skill) => ({
    params: { slug: skill.pathSlug },
  }));
}

export const GET: APIRoute = ({ params }) => {
  const routeSlug = params.slug ?? "";
  const pathSlug = Array.isArray(routeSlug) ? routeSlug.join("/") : routeSlug;
  const skill = skills.find((entry) => entry.pathSlug === pathSlug);

  if (!skill) {
    return Promise.resolve(new Response("skill not found", { status: 404 }));
  }

  return renderOgImage(
    Grid({
      title: skill.label,
      description: shorten(
        sanitize(
          skill.description ?? "install this skill with a single command.",
        ),
      ),
      brand: "skills.nabinkhair.com.np",
    }),
  );
};
