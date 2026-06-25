"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isBookmarked, toggleBookmark } from "@/lib/bookmarks";

/** Save/unsave a creator to the browser (no account needed). */
export function SaveCreatorButton({ address, name }: { address: string; name: string }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setSaved(isBookmarked(address));
  }, [address]);

  return (
    <Button
      variant={saved ? "default" : "outline"}
      size="sm"
      onClick={() => setSaved(toggleBookmark({ address, name }))}
    >
      <Star className={`size-4 ${saved ? "fill-current" : ""}`} />
      {saved ? "Saved" : "Save creator"}
    </Button>
  );
}
