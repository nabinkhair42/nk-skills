import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

type SizeVariant = "sm" | "default" | "lg";

interface CopyButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value?: string;
  size?: SizeVariant;
}

const sizeMap: Record<SizeVariant, { button: string; icon: number }> = {
  sm: { button: "h-8 w-8", icon: 14 },
  default: { button: "h-9 w-9", icon: 16 },
  lg: { button: "h-12 w-12", icon: 20 },
};

const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
  ({ value, size = "default", className, onClick, ...props }, ref) => {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (value) {
        navigator.clipboard.writeText(value).catch(() => { });
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      onClick?.(event);
    };

    const { button: buttonSize, icon: iconSize } = sizeMap[size];

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "copied" : "copy to clipboard"}
        disabled={copied}
        className={cn(
          "relative inline-flex cursor-copy items-center justify-center rounded-md text-muted-foreground transition-all duration-200 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-100 hover:text-foreground",
          buttonSize,
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "transition-all duration-200",
            copied
              ? "scale-100 opacity-100 blur-none"
              : "scale-70 opacity-0 blur-[2px]",
          )}
        >
          <HugeiconsIcon
            icon={Tick02Icon}
            size={iconSize}
            strokeWidth={2}
          />
        </div>
        <div
          className={cn(
            "absolute transition-all duration-200",
            copied
              ? "scale-0 opacity-0 blur-[2px]"
              : "scale-100 opacity-100 blur-none",
          )}
        >
          <HugeiconsIcon
            icon={Copy01Icon}
            size={iconSize}
            strokeWidth={2}
          />
        </div>
      </button>
    );
  },
);

CopyButton.displayName = "CopyButton";

export { CopyButton };
export type { CopyButtonProps };
