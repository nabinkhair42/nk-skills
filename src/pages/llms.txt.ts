import type { APIRoute } from "astro";
import { skills } from "@/data/skills";

export const GET: APIRoute = () => {
  const navigation = [
    { label: "home", path: "/" },
    { label: "skills", path: "/skills" },
  ];

  const skillCatalog = skills
    .map((skill) => {
      const description = skill.description ?? "";

      return `- ${skill.label} (${skill.pathSlug})\n  page: /skills/${skill.pathSlug}\n  llms: /skills/${skill.pathSlug}/llms.txt\n  description: ${description}`;
    })
    .join("\n\n");

  const body = [
    "# skills by nabin khair",
    "",
    "## site navigation",
    ...navigation.map((item) => `- ${item.label}: ${item.path}`),
    "",
    "## skill catalog",
    skillCatalog,
  ]
    .join("\n")
    .concat("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
};
