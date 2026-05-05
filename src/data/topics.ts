export type TopicSlug =
  | "design-systems"
  | "react-patterns"
  | "performance"
  | "architecture"
  | "tooling"
  | "ai";

export type Topic = {
  slug: TopicSlug;
  label: string;
  description: string;
};

export const topics: Topic[] = [
  {
    slug: "design-systems",
    label: "Design systems",
    description:
      "Component architecture, layout patterns, and scalable UI foundations.",
  },
  {
    slug: "react-patterns",
    label: "React patterns",
    description:
      "Data fetching, state management, and composition techniques for React.",
  },
  {
    slug: "performance",
    label: "Performance",
    description:
      "Rendering, caching, and runtime optimization for fast interfaces.",
  },
  {
    slug: "architecture",
    label: "Architecture",
    description:
      "Project structure, composition patterns, and scalable code design.",
  },
  {
    slug: "tooling",
    label: "Tooling",
    description:
      "Build systems, CLI workflows, and developer productivity tools.",
  },
  {
    slug: "ai",
    label: "AI",
    description:
      "AI integration patterns, prompt engineering, and agent tooling.",
  },
];

export const topicBySlug = new Map(topics.map((topic) => [topic.slug, topic]));

export const relatedTopicSlugs: Record<TopicSlug, TopicSlug[]> = {
  "design-systems": ["architecture", "performance"],
  "react-patterns": ["performance", "architecture"],
  performance: ["react-patterns", "tooling"],
  architecture: ["design-systems", "react-patterns"],
  tooling: ["architecture", "performance"],
  ai: ["tooling", "architecture"],
};
