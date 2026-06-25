"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";

interface ChatMessage {
  id: number;
  name: string;
  text: string;
  host?: boolean;
  created_at: string;
}

const ADJ = ["Swift", "Bright", "Calm", "Bold", "Kind", "Lucky", "Quiet", "Sunny"];
const ANIMALS = ["Falcon", "Otter", "Lion", "Gecko", "Heron", "Zebra", "Koala", "Crane"];
function guestName(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${a} ${n}`;
}

/**
 * Real-time stream chat over a lightweight polling API (GET every 2s, POST to
 * send). Works on both live and recorded streams and needs no client-side
 * Realtime/RLS setup. Requires supabase/chat_setup.sql.
 */
export function LiveChat({ slug, host = false }: { slug: string; host?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const nameRef = useRef<string>(host ? "Host" : guestName());
  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${slug}`, { cache: "no-store" });
      const json = (await res.json()) as { messages: ChatMessage[] };
      setMessages(json.messages ?? []);
    } catch {
      /* ignore, retry next tick */
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (atBottomRef.current) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText("");
    try {
      await fetch(`/api/chat/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameRef.current, text: t, host }),
      });
      await refresh();
    } catch {
      setText(t); // restore on failure
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="glass flex h-full min-h-[20rem] flex-col rounded-2xl border border-border/60">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 text-sm font-medium">
        <MessageCircle className="size-4 text-primary" /> Live chat
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          you&apos;re {nameRef.current}
        </span>
      </div>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 space-y-2 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Say hi to the stream 👋</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="text-sm">
              <span className={`font-medium ${m.host ? "text-primary" : "text-foreground/80"}`}>
                {m.name}
                {m.host && " (host)"}
              </span>{" "}
              <span className="text-muted-foreground">{m.text}</span>
            </div>
          ))
        )}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border/60 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message…"
          maxLength={300}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={sending}
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
