import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

type CopyButtonProps = {
  content: string;
  className?: string;
  showText?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function CopyButton({
  content,
  className,
  showText = true,
  ...props
}: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Ignore error
    }
  };

  return (
    <button
      onClick={handleCopy}
      type="button"
      className={`flex h-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground ${className}`}
      aria-label="Copy to clipboard"
      {...props}
    >
      {showText ? (
        <div className="flex w-[70px] items-center justify-center text-sm font-medium">
          {isCopied ? "copied" : "copy"}
        </div>
      ) : (
        <HugeiconsIcon
          icon={isCopied ? Tick02Icon : Copy01Icon}
          size={16}
          strokeWidth={2}
        />
      )}
    </button>
  );
}
