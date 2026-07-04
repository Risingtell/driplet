"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, VideoPresets, type LocalVideoTrack } from "livekit-client";
import {
  Check,
  Copy,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  Radio,
  SwitchCamera,
  Video,
  VideoOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type State = "idle" | "connecting" | "live" | "error";

/**
 * In-app browsers (WhatsApp, Instagram, Facebook, TikTok, Telegram) frequently
 * block camera/mic access on iOS, so getUserMedia throws NotAllowedError with no
 * way to recover in-page. Detect them so we can tell the host to open the link
 * in a real browser instead of showing a dead-end error.
 */
function inAppBrowser(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return "Facebook";
  if (/Instagram/.test(ua)) return "Instagram";
  if (/WhatsApp/i.test(ua)) return "WhatsApp";
  if (/Line\//.test(ua)) return "LINE";
  if (/Twitter/.test(ua)) return "X";
  if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return "TikTok";
  // WhatsApp's iOS webview often doesn't stamp the UA, so also flag a webview
  // that isn't Safari/Chrome/Firefox as a likely in-app browser.
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isRealBrowser = /Safari|CriOS|FxiOS|EdgiOS/.test(ua);
  if (isIOS && !isRealBrowser) return "this app";
  return null;
}

/** Turn a raw getUserMedia/LiveKit error into something the host can act on. */
function friendlyBroadcastError(e: Error): string {
  const app = inAppBrowser();
  const msg = e.message || "";
  const permissionDenied =
    e.name === "NotAllowedError" || /not allowed|permission|denied/i.test(msg);
  if (permissionDenied && app) {
    return `${app}'s built-in browser can't use your camera. Tap the ⋯ or "Open in browser" and open this page in Safari or Chrome, then press Go on air again.`;
  }
  if (permissionDenied) {
    return "Camera access was blocked. Allow camera and microphone for this site (in iPhone: Settings → Safari → Camera → Allow, or tap the ‘aA’ in the address bar → Website Settings), then press Go on air again.";
  }
  if (e.name === "NotFoundError" || /no (camera|device)/i.test(msg)) {
    return "No camera was found on this device. Check that another app isn't already using it.";
  }
  if (e.name === "NotReadableError" || /in use|could not start/i.test(msg)) {
    return "Your camera is busy in another app. Close it (video call, other camera app) and try again.";
  }
  return msg || "Could not start your camera.";
}

/**
 * Creator broadcast studio. Publishes the host's camera + mic into the stream's
 * LiveKit room (room name = slug). Viewers who open /watch/<slug> see this feed
 * and pay per second. Shows the shareable link and a live viewer count.
 */
export function Broadcaster({ slug, title }: { slug: string; title: string }) {
  const previewRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [state, setState] = useState<State>("idle");
  const [viewers, setViewers] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [micOn, setMicOn] = useState(true);
  const [warnApp, setWarnApp] = useState<string | null>(null);

  // Warn up front if we're inside an in-app browser that will block the camera,
  // before the host taps Go on air and hits a confusing failure.
  useEffect(() => {
    setWarnApp(inAppBrowser());
  }, []);

  /** Mute or unmute the host's own microphone. */
  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!micOn);
      setMicOn(!micOn);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** Flip between front and back camera (mainly for phones). */
  async function flipCamera() {
    const room = roomRef.current;
    if (!room) return;
    const track = room.localParticipant.getTrackPublication(Track.Source.Camera)
      ?.videoTrack as LocalVideoTrack | undefined;
    if (!track) return;
    const next = facing === "user" ? "environment" : "user";
    try {
      await track.restartTrack({ facingMode: next, resolution: VideoPresets.h720.resolution });
      if (previewRef.current) track.attach(previewRef.current);
      setFacing(next);
    } catch {
      setError("This device doesn't have another camera to switch to.");
    }
  }

  async function toggleScreenShare() {
    const room = roomRef.current;
    if (!room) return;
    try {
      const next = !sharingScreen;
      const pub = await room.localParticipant.setScreenShareEnabled(next);
      // Show the host what they're actually broadcasting: while sharing, point the
      // preview at the screen track; when they stop, flip it back to the camera.
      if (previewRef.current) {
        const track = next
          ? pub?.videoTrack
          : room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
        track?.attach(previewRef.current);
      }
      setSharingScreen(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const watchUrl =
    typeof window !== "undefined" ? `${window.location.origin}/watch/${slug}` : `/watch/${slug}`;

  async function start() {
    setError(null);
    setState("connecting");

    // iPhone Safari only shows the camera/mic permission prompt when
    // getUserMedia runs inside the tap gesture, BEFORE any network await. The
    // token fetch and room.connect() below are awaits, so on stricter iOS
    // devices the camera is silently blocked ("not allowed by the user agent")
    // by the time LiveKit asks for it. Prime the permission here first (then
    // release it) so the prompt actually appears; once granted, LiveKit can
    // re-acquire without a gesture.
    try {
      const warm = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      warm.getTracks().forEach((t) => t.stop());
    } catch (e) {
      setError(friendlyBroadcastError(e as Error));
      setState("error");
      return;
    }

    try {
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: slug, role: "host", identity: `host-${slug}` }),
      });
      const j = (await res.json()) as { token?: string; url?: string; error?: string };
      if (!res.ok || !j.token || !j.url) throw new Error(j.error ?? "Could not start the stream");

      // Capture + publish at 720p so the viewer sees a sharp feed (the default
      // is much lower). Simulcast keeps it smooth on weaker connections.
      const room = new Room({
        videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
        publishDefaults: {
          videoEncoding: VideoPresets.h720.encoding,
          videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
        },
      });
      roomRef.current = room;
      const updateViewers = () => setViewers(room.remoteParticipants.size);
      room.on(RoomEvent.ParticipantConnected, updateViewers);
      room.on(RoomEvent.ParticipantDisconnected, updateViewers);

      await room.connect(j.url, j.token);
      await room.localParticipant.enableCameraAndMicrophone();
      const cam = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (cam?.videoTrack && previewRef.current) cam.videoTrack.attach(previewRef.current);
      updateViewers();
      setState("live");
    } catch (e) {
      roomRef.current?.disconnect();
      roomRef.current = null;
      setError(friendlyBroadcastError(e as Error));
      setState("error");
    }
  }

  function stop() {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setViewers(0);
    setSharingScreen(false);
    setMicOn(true);
    setState("idle");
  }

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
    };
  }, []);

  const live = state === "live";

  return (
    <section className="py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {live && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-destructive/90 px-2 py-1 text-xs font-semibold text-white">
            <span className="size-1.5 rounded-full bg-white animate-live" /> LIVE · {viewers}{" "}
            watching
          </span>
        )}
      </div>

      <div className="relative mt-5 aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <video
          ref={previewRef}
          className="absolute inset-0 size-full object-cover"
          autoPlay
          muted
          playsInline
        />
        {!live && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-center text-sm text-white/80">
            {state === "connecting" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Starting your camera…
              </span>
            ) : (
              <span className="px-6">Press “Go on air” to start broadcasting your camera.</span>
            )}
          </div>
        )}
      </div>

      {warnApp && !live && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-500">
          <span>
            You&apos;re viewing this inside {warnApp}&apos;s browser, which can&apos;t use your
            camera. Tap the ⋯ menu (or &quot;Open in browser&quot;) and open this page in{" "}
            <strong>Safari</strong> or <strong>Chrome</strong>, then press Go on air.{" "}
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  },
                  () => {},
                );
              }}
              className="underline underline-offset-2"
            >
              {copied ? "Link copied — paste it in Safari" : "Copy this page link"}
            </button>
          </span>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-amber-500">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {live ? (
          <>
            <Button variant={micOn ? "outline" : "default"} onClick={toggleMic}>
              {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              {micOn ? "Mute" : "Unmute"}
            </Button>
            {!sharingScreen && (
              <Button variant="outline" onClick={flipCamera}>
                <SwitchCamera className="size-4" /> Flip camera
              </Button>
            )}
            <Button
              variant={sharingScreen ? "default" : "outline"}
              onClick={toggleScreenShare}
            >
              <MonitorUp className="size-4" /> {sharingScreen ? "Stop sharing" : "Share screen"}
            </Button>
            <Button variant="outline" onClick={stop}>
              <VideoOff className="size-4" /> End broadcast
            </Button>
          </>
        ) : (
          <Button onClick={start} disabled={state === "connecting"}>
            <Video className="size-4" /> Go on air
          </Button>
        )}
      </div>

      <div className="glass mt-6 rounded-2xl border border-border/60 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Radio className="size-4 text-primary" /> Share this link with your audience
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Every second someone watches, USDC drips to your wallet and auto-splits to your co-host
          and the AI agent.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/60 p-3">
          <code className="flex-1 truncate text-left text-sm">{watchUrl}</code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(watchUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </div>
    </section>
  );
}
