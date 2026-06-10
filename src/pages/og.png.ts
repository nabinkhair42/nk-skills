import type { APIRoute } from "astro";
import { Event } from "@/components/og/event";
import { renderOgImage } from "@/lib/og";
import { skills } from "@/data/skills";

export const GET: APIRoute = () =>
  renderOgImage(
    Event({
      label: "agent skills",
      brand: "skills.nk",
      title: "reusable skills for product engineers",
      date: `${skills.length} skills`,
      location: "skills.nabinkhair.com.np",
    }),
  );
