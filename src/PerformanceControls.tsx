import { useEffect, useRef, useState, type RefObject } from "react";
import { PerformanceMixer, speeds, type PerformanceTake } from "./performance";
import { loadPerformance, savePerformance } from "./store";
const time = (n: number) =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
export function PerformanceControls({
  mixer,
  player,
  onBegin,
  onRecordingChange,
  onError,
}: {
  mixer: PerformanceMixer;
  player: RefObject<HTMLAudioElement | null>;
  onBegin: () => void;
  onRecordingChange: (v: boolean) => void;
  onError: (message: string) => void;
}) {
  const [take, setTake] = useState<PerformanceTake>(),
    [speed, setSpeed] = useState(1),
    [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [url, setUrl] = useState(""),
    [playing, setPlaying] = useState(false),
    [saved, setSaved] = useState(""),
    [loaded, setLoaded] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    start = useRef(0),
    mounted = useRef(true),
    saveQueue = useRef(Promise.resolve()),
    request = useRef(0),
    saveRevision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    void loadPerformance()
      .then((t) => {
        if (mounted.current) {
          setTake(t);
          if (t) setSpeed(t.speed || 1);
          setLoaded(true);
        }
      })
      .catch(() => {
        setLoaded(true);
        onError(
          "Could not restore the saved performance. You can still record and download a new one.",
        );
      });
    return () => {
      mounted.current = false;
      request.current++;
      if (recorder.current?.state === "recording") recorder.current.stop();
    };
  }, []);
  useEffect(() => {
    if (!take) return;
    const u = URL.createObjectURL(take.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [take?.blob]);
  useEffect(() => {
    if (player.current) player.current.playbackRate = speed;
  }, [speed, url]);
  useEffect(() => {
    if (!recording) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [recording]);
  useEffect(() => {
    if (!recording) return;
    const tick = () => setElapsed((performance.now() - start.current) / 1000);
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [recording]);
  const persist = (t: PerformanceTake) => {
    const revision = ++saveRevision.current;
    setSaved("Saving performance…");
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => savePerformance(t))
      .then(() => {
        if (mounted.current && revision === saveRevision.current)
          setSaved("Performance saved on this device");
      })
      .catch(() => {
        if (mounted.current) {
          setSaved("Not saved — download this take");
          onError(
            "Could not save the performance. Storage may be full. Download it before closing this tab.",
          );
        }
      });
  };
  const begin = async () => {
    if (
      take &&
      !confirm(
        "Record a new performance? This will replace the saved performance when you stop. Download the current take first to keep it.",
      )
    )
      return;
    setBusy(true);
    const token = ++request.current;
    try {
      if (!window.MediaRecorder)
        throw Error(
          "Performance recording is unavailable in this browser. Try a current Chrome or Safari browser.",
        );
      const stream = await mixer.recordingStream();
      if (!mounted.current || token !== request.current) {
        mixer.endRecording();
        return;
      }
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const r = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = r;
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onerror = () => {
        request.current++;
        if (r.state === "recording") r.stop();
        setRecording(false);
        onRecordingChange(false);
        setBusy(false);
        onError(
          "Performance recording failed. Your previous saved take has been kept.",
        );
      };
      r.onstop = () => {
        mixer.endRecording();
        if (!mounted.current || token !== request.current) return;
        setRecording(false);
        onRecordingChange(false);
        setBusy(false);
        const duration = (performance.now() - start.current) / 1000;
        const blob = new Blob(chunks, { type: r.mimeType });
        if (!blob.size) {
          onError("The recording was empty. Try again.");
          return;
        }
        const next = {
          name: `Performance ${new Date().toLocaleString()}`,
          blob,
          duration,
          speed: 1,
        };
        setTake(next);
        setSpeed(1);
        persist(next);
      };
      onBegin();
      setPlaying(false);
      start.current = performance.now();
      r.start(1000);
      setElapsed(0);
      setRecording(true);
      onRecordingChange(true);
    } catch (e) {
      mixer.endRecording();
      onError(
        e instanceof Error ? e.message : "Unable to record this performance.",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const finish = () => {
    if (recorder.current?.state === "recording") {
      setBusy(true);
      recorder.current.stop();
    }
  };
  const play = () => {
    const a = player.current;
    if (!a) return;
    onBegin();
    a.currentTime = 0;
    a.playbackRate = speed;
    a.preservesPitch = true;
    void a
      .play()
      .then(() => setPlaying(true))
      .catch(() =>
        onError(
          "This recording cannot be played in this browser. Try Chrome or download it.",
        ),
      );
  };
  const download = () => {
    if (!take || !url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `soundspace-performance.${take.blob.type.includes("mp4") ? "m4a" : take.blob.type.includes("ogg") ? "ogg" : "webm"}`;
    a.click();
  };
  return (
    <section className="performancebar" aria-label="Performance recorder">
      <div className="performance-heading">
        <strong>Performance</strong>
        <small aria-live="polite">
          {recording
            ? `● Recording ${time(elapsed)} · tap your sound buttons`
            : take
              ? `${time(take.duration)} at 1× · ${saved || "Saved on this device"}`
              : "Record your button presses, sounds, and pauses together"}
        </small>
      </div>
      <div className="performance-actions">
        {recording ? (
          <button className="record-active" disabled={busy} onClick={finish}>
            ■ Stop recording performance
          </button>
        ) : (
          <button disabled={!loaded || busy} onClick={() => void begin()}>
            ● Record performance
          </button>
        )}
        <button disabled={!take || recording || busy} onClick={play}>
          ▷ {playing ? "Restart performance" : "Play performance"}
        </button>
        <label>
          Speed
          <select
            aria-label="Performance speed"
            disabled={recording || busy}
            value={speed}
            onChange={(e) => {
              const n = +e.target.value;
              setSpeed(n);
              if (take) {
                const next = { ...take, speed: n };
                setTake(next);
                persist(next);
              }
            }}
          >
            {speeds.map((s) => (
              <option key={s} value={s}>
                {s.toFixed(1)}×
              </option>
            ))}
          </select>
        </label>
        {take && (
          <button disabled={recording || busy} onClick={download}>
            ↓ Download performance (1×)
          </button>
        )}
      </div>
      {take && (
        <audio
          ref={player}
          src={url}
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          preload="metadata"
        />
      )}
    </section>
  );
}
