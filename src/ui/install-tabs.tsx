import { HugeiconsIcon } from "@hugeicons/react";
import { TerminalIcon } from "@hugeicons/core-free-icons";
import { CopyButton } from "./copy-button";

const command = "curl -fsSL https://skills.nabinkhair.com.np/install | bash";

export function InstallTabs() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 py-2 pl-4">
        <HugeiconsIcon
          icon={TerminalIcon}
          size={14}
          strokeWidth={2}
          className="text-muted-foreground"
        />
        <span className="font-mono text-xs text-muted-foreground">bash</span>
      </div>
      <div className="flex items-center justify-between border-t border-border py-3.5 pr-4 pl-6">
        <code className="font-mono text-sm">
          <span style={{ color: "var(--syntax-command)" }}>curl</span>
          <span style={{ color: "var(--syntax-flag)" }}> -fsSL</span>
          <span style={{ color: "var(--syntax-string)" }}>
            {" "}
            https://skills.nabinkhair.com.np/install
          </span>
          <span style={{ color: "var(--syntax-punctuation)" }}> |</span>
          <span style={{ color: "var(--syntax-command)" }}> bash</span>
        </code>
        <CopyButton
          content={command}
          showText={false}
          className="size-8"
        />
      </div>
    </div>
  );
}
