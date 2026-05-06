import type { APIRoute } from "astro";
import { skills, type Skill } from "@/data/skills";

const SITE_URL = "https://skills.nabinkhair.com.np";

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const buildTopicRoutes = (allSkills: Skill[]) =>
  Array.from(new Set(allSkills.flatMap((skill) => skill.topics ?? []))).map(
    (topic) => `/skills/${topic}`,
  );

export const GET: APIRoute = ({ site }) => {
  const origin = site?.origin ?? SITE_URL;

  const staticRoutes = ["/", "/skills"];
  const topicRoutes = buildTopicRoutes(skills);
  const skillRoutes = skills.map((skill) => `/skills/${skill.pathSlug}`);
  const allRoutes = Array.from(
    new Set([...staticRoutes, ...topicRoutes, ...skillRoutes]),
  );

  const urlset = allRoutes
    .map((route) => {
      const loc = new URL(route, origin).toString();
      return `<url><loc>${escapeXml(loc)}</loc></url>`;
    })
    .join("");

  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlset}</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};
