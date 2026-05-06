import { CopyButton } from "./copy-button";

const command = "curl -fsSL https://skills.nabinkhair.com.np/install | bash";

export function InstallTabs() {
  return (
    <div className="group relative inline-flex items-center rounded-lg bg-muted/50 px-5 py-3 pr-12 font-mono text-sm text-muted-foreground transition-colors hover:bg-muted">
      <code>{command}</code>
      <div className="absolute right-2 opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton value={command} size="sm" />
      </div>
    </div>
  );
}
