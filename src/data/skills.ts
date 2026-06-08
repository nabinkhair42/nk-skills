import type { MarkdownInstance } from "astro";

import type { TopicSlug } from "./topics";

type SkillFrontmatter = {
  name?: string;
  description?: string;
  label?: string;
  topics?: TopicSlug[];
};

export type Skill = {
  slug: string;
  pathSlug: string;
  name: string;
  label: string;
  description?: string;
  topics?: TopicSlug[];
};

const localSkillTopics: Record<string, TopicSlug[]> = {
  "structural-grid": ["design-systems", "architecture"],
  "optimistic-cache-pattern": ["react-patterns", "performance"],
  "product-stack": ["architecture", "react-patterns", "tooling"],
};

const skillModules = import.meta.glob<MarkdownInstance<SkillFrontmatter>>(
  "/skills/*/SKILL.md",
  { eager: true },
);

const titleize = (value: string) =>
  value
    .split("-")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");

export const skills: Skill[] = Object.entries(skillModules)
  .map(([path, module]) => {
    const slug = path.split("/").at(-2) ?? "";
    const name = module.frontmatter.name ?? slug;

    return {
      slug,
      pathSlug: slug,
      name,
      label: module.frontmatter.label ?? titleize(name),
      description: module.frontmatter.description,
      topics: module.frontmatter.topics ?? localSkillTopics[slug] ?? [],
    };
  })
  .sort((a, b) => a.pathSlug.localeCompare(b.pathSlug));
