import { Droplet } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Driplet wordmark + droplet glyph. The droplet sits in a soft aqua halo to
 * reinforce the "value flowing in drips" identity.
 */
export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative grid size-8 place-items-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
        <Droplet className="size-4 fill-primary/30 text-primary" />
      </span>
      {showWordmark && (
        <span className="text-lg font-semibold tracking-tight">Driplet</span>
      )}
    </span>
  );
}
