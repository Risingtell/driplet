"use client";

import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { Loader2, Pause, Radio } from "lucide-react";

type State = "connecting" | "waiting" | "live" | "error";

/**
 * Viewer-side live player. Joins the stream's LiveKit room (room name = slug) as
 * a subscriber and attaches the host's camera + mic. Shows a friendly overlay
 * while connecting or before the host has started broadcasting.
 *
 * The room is joined as soon as the page opens, so the LIVE badge is right and
 * charging can wait for the host, but picture and sound only flow while
 * `active` (the viewer is watching and paying). Otherwise every track is
 * switched off at the server, so stopping the meter stops the stream itself.
 */
export function LiveVideo({
  slug,
  onLiveChange,
  muted = false,
  active = false,
  playButton = false,
}: {
  slug: string;
  /** Fires true once the host's video is playing, false while waiting/ended. */
  onLiveChange?: (live: boolean) => void;
  /** Mute the host's incoming audio (viewer-controlled). */
  muted?: boolean;
  /** The viewer is watching and paying: only then do picture and sound flow. */
  active?: boolean;
  /** The meter's big play button is showing in the middle of this surface. */
  playButton?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioWrap = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("connecting");
  const [screen, setScreen] = useState(false);
  const tracksRef = useRef<Map<string, RemoteTrack>>(new Map());
  const mutedRef = useRef(muted);
  const activeRef = useRef(active);
  const roomRef = useRef<Room | null>(null);
  const cb = useRef(onLiveChange);
  // Latest props for the LiveKit event handlers, which outlive any one render.
  useEffect(() => {
    mutedRef.current = muted;
    activeRef.current = active;
    cb.current = onLiveChange;
  });

  // Not watching is always silent, whatever the mute button says.
  useEffect(() => {
    audioWrap.current?.querySelectorAll("audio").forEach((a) => {
      a.muted = muted || !active;
    });
  }, [muted, active]);

  // Start or stop the host's tracks at the server as the viewer starts and stops.
  useEffect(() => {
    const room = roomRef.current;
    if (room) {
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) pub.setEnabled(active);
      }
    }
    const el = videoRef.current;
    if (el) {
      if (active) el.play().catch(() => {});
      else el.pause();
    }
  }, [active]);

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
        roomRef.current = room;

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

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication) => {
          if (track.sid) tracksRef.current.set(track.sid, track);
          // A track that arrives while the viewer isn't watching stays off.
          pub.setEnabled(activeRef.current);
          if (track.kind === Track.Kind.Audio && audioWrap.current) {
            const el = track.attach() as HTMLMediaElement;
            el.muted = mutedRef.current || !activeRef.current;
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
      roomRef.current = null;
    };
  }, [slug]);

  // While the meter's big play button sits dead centre on this surface, the
  // status line moves down below it instead of being covered by it.
  const statusPos = playButton ? "translate-y-14" : "";

  return (
    <>
      <video
        ref={videoRef}
        className={`absolute inset-0 size-full ${screen ? "object-contain" : "object-cover"}`}
        autoPlay
        playsInline
      />
      <div ref={audioWrap} className="hidden" />
      {state === "live" && !active && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 text-center text-sm text-white/80">
          <span className={`flex items-center gap-2 ${statusPos}`}>
            <Pause className="size-4 text-primary" /> The host is live. Press Watch to tune in.
          </span>
        </div>
      )}
      {state !== "live" && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 text-center text-sm text-white/80">
          {state === "connecting" && (
            <span className={`flex items-center gap-2 ${statusPos}`}>
              <Loader2 className="size-4 animate-spin" /> Connecting to the live stream…
            </span>
          )}
          {state === "waiting" && (
            <span className={`flex items-center gap-2 ${statusPos}`}>
              <Radio className="size-4 text-primary" /> Waiting for the host to go live…
            </span>
          )}
          {state === "error" && (
            <span className={statusPos}>Live video isn&apos;t available right now.</span>
          )}
        </div>
      )}
    </>
  );
}
