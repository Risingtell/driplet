"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/** Goes to the previous page (falls back to the studio if there's no history). */
export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/studio");
      }}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Go back"
    >
      <ArrowLeft className="size-4" /> Back
    </button>
  );
}
