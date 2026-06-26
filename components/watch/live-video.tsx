"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { Loader2, Radio } from "lucide-react";

type State = "connecting" | "waiting" | "live" | "error";

/**
 * Viewer-side live player. Joins the stream's LiveKit room (room name = slug) as
 * a subscriber and attaches the host's camera + mic. Shows a friendly overlay
 * while connecting or before the host has started broadcasting.
 */
export function LiveVideo({
  slug,
  onLiveChange,
  muted = false,
}: {
  slug: string;
  /** Fires true once the host's video is playing, false while waiting/ended. */
  onLiveChange?: (live: boolean) => void;
  /** Mute the host's incoming audio (viewer-controlled). */
  muted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioWrap = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("connecting");
  const [screen, setScreen] = useState(false);
  const tracksRef = useRef<Map<string, RemoteTrack>>(new Map());
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const cb = useRef(onLiveChange);
  cb.current = onLiveChange;

  // Apply mute to any attached audio elements when the viewer toggles it.
  useEffect(() => {
    audioWrap.current?.querySelectorAll("audio").forEach((a) => {
      a.muted = muted;
    });
  }, [muted]);

  useEffect(() => {
    let room: Room | null = null;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room: slug, role: "viewer" }),
        });
        const j = (await res.json()) as { token?: string; url?: string; error?: string };
        if (!res.ok || !j.token || !j.url) {
          setState("error");
          return;
        }

        room = new Room({ adaptiveStream: true, dynacast: true });

        // Show the best available video track: prefer a screen share, else the
        // camera. Only fall back to "waiting" when no video track remains, so
        // stopping a screen share doesn't look like the host going offline.
        const reattach = () => {
          const el = videoRef.current;
          if (!el) return;
          const videos = [...tracksRef.current.values()].filter(
            (t) => t.kind === Track.Kind.Video,
          );
          if (videos.length === 0) {
            setState("waiting");
            setScreen(false);
            cb.current?.(false);
            return;
          }
          const shared = videos.find((t) => t.source === Track.Source.ScreenShare);
          const show = shared ?? videos[videos.length - 1];
          show.attach(el);
          setScreen(!!shared);
          setState("live");
          cb.current?.(true);
        };

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.sid) tracksRef.current.set(track.sid, track);
          if (track.kind === Track.Kind.Audio && audioWrap.current) {
            const el = track.attach() as HTMLMediaElement;
            el.muted = mutedRef.current;
            audioWrap.current.appendChild(el);
          } else if (track.kind === Track.Kind.Video) {
            reattach();
          }
        });
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          if (track.sid) tracksRef.current.delete(track.sid);
          track.detach();
          if (track.kind === Track.Kind.Video) reattach();
        });

        await room.connect(j.url, j.token);
        if (cancelled) {
          room.disconnect();
          return;
        }
        setState((s) => (s === "live" ? s : "waiting"));
      } catch {
        setState("error");
        cb.current?.(false);
      }
    })();

    return () => {
      cancelled = true;
      room?.disconnect();
    };
  }, [slug]);

  return (
    <>
      <video
        ref={videoRef}
        className={`absolute inset-0 size-full ${screen ? "object-contain" : "object-cover"}`}
        autoPlay
        playsInline
      />
      <div ref={audioWrap} className="hidden" />
      {state !== "live" && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 text-center text-sm text-white/80">
          {state === "connecting" && (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Connecting to the live stream…
            </span>
          )}
          {state === "waiting" && (
            <span className="flex items-center gap-2">
              <Radio className="size-4 text-primary" /> Waiting for the host to go live…
            </span>
          )}
          {state === "error" && <span>Live video isn&apos;t available right now.</span>}
        </div>
      )}
    </>
  );
}
