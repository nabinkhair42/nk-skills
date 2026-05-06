import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

type SkillItem = {
  slug: string;
  pathSlug: string;
  label: string;
  description?: string;
  topics?: string[];
};

export function SkillSearch({ items }: { items: SkillItem[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;

      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }

      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onSelect = (pathSlug: string) => {
    setOpen(false);
    window.location.href = `/skills/${pathSlug}`;
  };

  return (
    <>
      {/* mobile: icon only */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label="search skills"
        className="md:hidden"
      >
        <HugeiconsIcon icon={SearchIcon} size={16} strokeWidth={1.5} />
      </Button>

      {/* desktop: full search trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 w-56 items-center gap-2 rounded-lg bg-muted px-3 text-sm text-muted-foreground transition-colors hover:bg-muted md:inline-flex"
      >
        <HugeiconsIcon icon={SearchIcon} size={14} strokeWidth={1.5} />
        <span className="flex-1 text-left">search skills...</span>
        <Kbd className="border rounded-md bg-foreground/20">/</Kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="search skills"
        description="find a skill by name or topic"
      >
        <Command>
          <CommandInput placeholder="search skills..." />
          <CommandList>
            <CommandEmpty>no skills found.</CommandEmpty>
            <CommandGroup heading="skills">
              {items.map((item) => (
                <CommandItem
                  key={item.pathSlug}
                  value={`${item.slug} ${item.label} ${item.description ?? ""} ${(item.topics ?? []).join(" ")}`}
                  onSelect={() => onSelect(item.pathSlug)}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{item.slug}</span>
                    {item.description ? (
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
