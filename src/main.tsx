import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  fresh,
  load,
  save,
  validBoard,
  type Board,
  type Pad,
  type Sound,
} from "./store";
import "./style.css";
const uid = () => crypto.randomUUID();
const colors = [
  "#b9a4ef",
  "#9cd6bf",
  "#f1c483",
  "#9fc9ed",
  "#efacb9",
  "#c3c9d5",
];
function AudioPreview({ sound }: { sound: Sound }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(sound.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [sound]);
  return <audio controls src={url} />;
}
function App() {
  const [night, setNight] = useState(() => {
    try {
      return localStorage.getItem("soundspace-theme") === "night";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = night ? "night" : "normal";
    document.documentElement.style.colorScheme = night ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", night ? "#191623" : "#7155d9");
    try {
      localStorage.setItem("soundspace-theme", night ? "night" : "normal");
    } catch {
      /* Still allow switching for this session. */
    }
  }, [night]);
  const [board, setBoard] = useState<Board>(fresh),
    [sounds, setSounds] = useState<Sound[]>([]),
    [ready, setReady] = useState(false),
    [edit, setEdit] = useState(true),
    [selected, select] = useState<string>(),
    [status, setStatus] = useState("Loading…"),
    [error, setError] = useState(""),
    [pending, setPending] = useState<Sound>(),
    [recordOpen, setRecordOpen] = useState(false),
    [recording, setRecording] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [playing, setPlaying] = useState<Set<string>>(new Set());
  const audio = useRef(new Map<string, HTMLAudioElement>()),
    urls = useRef(new Map<string, string>()),
    rec = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    cancelled = useRef(false),
    recordRequest = useRef(0),
    latest = useRef({ board, sounds }),
    saveQueue = useRef(Promise.resolve());
  const pad = board.pads.find((p) => p.id === selected);
  latest.current = { board, sounds };
  useEffect(() => {
    load()
      .then((v) => {
        if (v.board) setBoard(v.board);
        setSounds(v.sounds);
        setReady(true);
        setStatus("All changes saved");
      })
      .catch(() =>
        setError(
          "Local storage could not be opened. Enable browser storage and reload before editing.",
        ),
      );
    return () => {
      audio.current.forEach((a) => a.pause());
      urls.current.forEach(URL.revokeObjectURL);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    setStatus("Saving…");
    const t = setTimeout(() => {
      const snapshot = latest.current;
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(() => save(snapshot.board, snapshot.sounds))
        .then(() => {
          if (
            latest.current.board === snapshot.board &&
            latest.current.sounds === snapshot.sounds
          )
            setStatus("All changes saved");
        })
        .catch(() => {
          setStatus("Save failed");
          setError(
            "Storage is full or unavailable. Export a backup now to protect your changes.",
          );
        });
    }, 250);
    return () => clearTimeout(t);
  }, [board, sounds, ready]);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => {
    // Update every active sound in place; keep its position and playback state.
    audio.current.forEach((a) => {
      a.playbackRate = board.speed ?? 1;
      a.preservesPitch = true;
    });
  }, [board.speed]);
  const update = (v: Partial<Board>) => setBoard((b) => ({ ...b, ...v }));
  const change = (v: Partial<Pad>) =>
    setBoard((b) => ({
      ...b,
      pads: b.pads.map((p) => (p.id === selected ? { ...p, ...v } : p)),
    }));
  const stop = () => {
    audio.current.forEach((a) => {
      a.pause();
      a.currentTime = 0;
    });
    setPlaying(new Set());
  };
  const play = (p: Pad) => {
    if (!p.audio) {
      setError(
        "This button has no sound yet. Switch to Edit and upload or record one.",
      );
      return;
    }
    const s = sounds.find((s) => s.id === p.audio);
    if (!s) return;
    let a = audio.current.get(p.id);
    if (!a || a.dataset.sound !== s.id) {
      a?.pause();
      let url = urls.current.get(s.id);
      if (!url) {
        url = URL.createObjectURL(s.blob);
        urls.current.set(s.id, url);
      }
      a = new Audio(url);
      a.dataset.sound = s.id;
      audio.current.set(p.id, a);
      a.onended = () =>
        setPlaying((v) => {
          const n = new Set(v);
          n.delete(p.id);
          return n;
        });
    }
    a.pause();
    a.currentTime = 0;
    a.volume = p.volume;
    a.playbackRate = board.speed ?? 1;
    a.preservesPitch = true;
    a.loop = p.loop;
    void a
      .play()
      .then(() => setPlaying((v) => new Set(v).add(p.id)))
      .catch(() =>
        setError(
          "This audio format cannot be played by your browser. Try MP3 or WAV.",
        ),
      );
  };
  const add = () => {
    if (board.pads.length >= 1000) {
      setError("This board has reached the 1,000 button limit.");
      return;
    }
    const id = uid();
    const i = board.pads.length;
    const p: Pad = {
      id,
      label: `Sound ${i + 1}`,
      x: 50 + (i % 5) * 205,
      y: 50 + Math.floor(i / 5) * 170,
      w: 170,
      h: 140,
      color: colors[i % colors.length],
      textColor: "#242034",
      fontSize: 20,
      shape: "rounded",
      icon: "♫",
      volume: 1,
      loop: false,
    };
    update({
      pads: [...board.pads, p],
      height: Math.max(board.height, p.y + 250),
    });
    select(id);
  };
  const gesture = (e: React.PointerEvent, id: string, resize = false) => {
    if (!edit) return;
    e.stopPropagation();
    select(id);
    const p = board.pads.find((p) => p.id === id)!;
    const sx = e.clientX,
      sy = e.clientY,
      z = board.zoom;
    e.currentTarget.setPointerCapture(e.pointerId);
    const target = e.currentTarget;
    const move = (ev: Event) => {
      const v = ev as PointerEvent;
      const dx = (v.clientX - sx) / z,
        dy = (v.clientY - sy) / z;
      const snap = (n: number) =>
        board.snap ? Math.round(n / 20) * 20 : Math.round(n);
      let w = Math.min(2000, Math.max(60, snap(p.w + dx))),
        h = Math.min(2000, Math.max(60, snap(p.h + dy)));
      if (["square", "circle"].includes(p.shape)) w = h = Math.max(w, h);
      const changes = resize
        ? { w, h }
        : {
            x: Math.min(98000, Math.max(0, snap(p.x + dx))),
            y: Math.min(98000, Math.max(0, snap(p.y + dy))),
          };
      setBoard((b) => {
        const pads = b.pads.map((a) =>
          a.id === id ? { ...a, ...changes } : a,
        );
        const moved = pads.find((a) => a.id === id)!;
        return {
          ...b,
          pads,
          width: Math.max(b.width, moved.x + moved.w + 100),
          height: Math.max(b.height, moved.y + moved.h + 100),
        };
      });
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };
  const fileSound = (file?: File) => {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setError("Choose an audio file smaller than 100 MB.");
      return;
    }
    setPending({ id: uid(), name: file.name, blob: file });
  };
  const closeRecording = () => {
    recordRequest.current++;
    cancelled.current = true;
    if (rec.current?.state === "recording") rec.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
    setRecordOpen(false);
    setPending(undefined);
  };
  const record = async () => {
    const request = ++recordRequest.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw Error(
          "Recording requires HTTPS and a browser supporting MediaRecorder.",
        );
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (request !== recordRequest.current) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = acquired;
      cancelled.current = false;
      const r = new MediaRecorder(stream.current);
      rec.current = r;
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (!cancelled.current)
          setPending({
            id: uid(),
            name: `Recording ${new Date().toLocaleTimeString()}.${r.mimeType.includes("mp4") ? "m4a" : "webm"}`,
            blob: new Blob(chunks, { type: r.mimeType }),
          });
      };
      r.onerror = () => {
        closeRecording();
        setError("Recording failed. Check the microphone and try again.");
      };
      r.start();
      setPending(undefined);
      setElapsed(0);
      setRecording(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Microphone access denied. Check browser permissions.",
      );
      stream.current?.getTracks().forEach((t) => t.stop());
    }
  };
  const assign = () => {
    if (!pending || !pad) return;
    setSounds((s) => [...s, pending]);
    change({ audio: pending.id });
    setPending(undefined);
    setRecordOpen(false);
  };
  const exportBoard = async () => {
    try {
      const packed = await Promise.all(
        sounds.map(async (s) => ({
          ...s,
          blob: await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(s.blob);
          }),
        })),
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify({ version: 1, board, sounds: packed })], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "soundspace-backup.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Backup could not be created. Try freeing device memory.");
    }
  };
  const importBoard = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 250 * 1024 * 1024) throw Error();
      const data = JSON.parse(await file.text());
      if (
        data.version !== 1 ||
        !validBoard(data.board) ||
        !Array.isArray(data.sounds)
      )
        throw Error();
      const imported: Sound[] = await Promise.all(
        data.sounds.map(
          async (s: { id: string; name: string; blob: string }) => {
            if (
              typeof s.id !== "string" ||
              typeof s.name !== "string" ||
              typeof s.blob !== "string" ||
              !/^data:(audio\/[^;,]+|video\/mp4|application\/octet-stream)(;[^,]*)?;base64,/.test(
                s.blob,
              )
            )
              throw Error();
            return {
              id: s.id,
              name: s.name,
              blob: await (await fetch(s.blob)).blob(),
            };
          },
        ),
      );
      if (
        data.board.pads.some(
          (p: Pad) => p.audio && !imported.some((s) => s.id === p.audio),
        )
      )
        throw Error();
      if (
        !confirm(
          "Replace this board with the backup? Export your current board first if needed.",
        )
      )
        return;
      stop();
      select(undefined);
      setSounds(imported);
      setBoard(data.board);
    } catch {
      setError(
        "Invalid or oversized backup. Choose a Soundspace JSON export under 250 MB.",
      );
    }
  };
  if (!ready)
    return (
      <main className="loading">
        <h1>Soundspace</h1>
        <p>{error || "Opening your soundboard…"}</p>
      </main>
    );
  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">▥</span>
          <div>
            <strong>
              soundspace<span className="brand-dot">.</span>
            </strong>
            <small>MAKE SOME NOISE</small>
          </div>
        </div>
        <div className="mode" aria-label="Board mode">
          <button
            className={!edit ? "active" : ""}
            onClick={() => {
              setEdit(false);
              select(undefined);
            }}
          >
            ▷ Play
          </button>
          <button
            className={edit ? "active" : ""}
            onClick={() => {
              stop();
              setEdit(true);
            }}
          >
            ✎ Edit
          </button>
        </div>
        <div className="header-actions">
          <button
            className="theme-toggle"
            aria-label={
              night ? "Switch to normal mode" : "Switch to night mode"
            }
            aria-pressed={night}
            onClick={() => setNight((v) => !v)}
          >
            {night ? "☀" : "☾"}{" "}
            <span>{night ? "Normal mode" : "Night mode"}</span>
          </button>
          <button className="stop" aria-label="Stop all sounds" onClick={stop}>
            ■ <span>Stop all sounds</span>
          </button>
        </div>
      </header>
      <section className="speedbar" aria-label="Board speed">
        <div className="speed-heading">
          <strong>Board speed</strong>
          <small>One speed for every sound · change it anytime</small>
        </div>
        <div className="speed-options" role="group" aria-label="Playback speed">
          {[0.5, 1, 2, 4].map((speed) => (
            <button
              key={speed}
              aria-label={`Entire board ${speed.toFixed(1)}×`}
              aria-pressed={(board.speed ?? 1) === speed}
              className={(board.speed ?? 1) === speed ? "speed-active" : ""}
              onClick={() => update({ speed })}
            >
              {speed.toFixed(1)}×
            </button>
          ))}
        </div>
      </section>
      <div className="boardbar">
        <div>
          <input
            className="boardtitle"
            aria-label="Soundboard name"
            value={board.name}
            onChange={(e) => update({ name: e.target.value })}
          />
          <span className="count">{board.pads.length} sounds</span>
          <span className="saved">● {status}</span>
        </div>
        <div className="actions">
          <button
            onClick={() => {
              if (
                confirm(
                  "Create a blank board? Export a backup first to keep this one.",
                )
              ) {
                stop();
                setBoard(fresh());
                setSounds([]);
                select(undefined);
              }
            }}
          >
            ＋ New board
          </button>
          <button onClick={() => void exportBoard()}>↓ Export</button>
          <label className="filebutton">
            ↑ Import
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => void importBoard(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>
      <div className="workspace">
        <section className="canvaswrap" aria-label="Scrollable soundboard">
          <div
            style={{
              width: board.width * board.zoom,
              height: board.height * board.zoom,
            }}
          >
            <div
              className={`canvas ${edit ? "editing" : ""} ${board.snap ? "grid" : ""}`}
              style={{
                width: board.width,
                height: board.height,
                transform: `scale(${board.zoom})`,
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) select(undefined);
              }}
            >
              {board.pads.map((p, i) => (
                <div
                  key={p.id}
                  className={`padwrap ${selected === p.id && edit ? "selected" : ""}`}
                  style={{
                    left: p.x,
                    top: p.y,
                    width: p.w,
                    height: p.h,
                    zIndex: i + 1,
                  }}
                >
                  <button
                    className={`pad ${p.shape} ${p.image ? "has-image" : ""} ${playing.has(p.id) ? "playing" : ""}`}
                    style={{
                      background: p.image ? "transparent" : p.color,
                      color: p.textColor,
                      fontSize: p.fontSize,
                      touchAction: edit ? "none" : "manipulation",
                    }}
                    onPointerDown={(e) => gesture(e, p.id)}
                    onClick={() => (edit ? select(p.id) : play(p))}
                    aria-label={p.label}
                  >
                    {p.image ? (
                      <>
                        <span
                          className={`pad-image fit-${p.imageFit ?? "cover"} ${p.showImageLabel === true && p.label ? "with-label" : ""}`}
                        >
                          <img
                            src={p.image}
                            alt=""
                            draggable={false}
                            style={{ objectFit: p.imageFit ?? "cover" }}
                          />
                        </span>
                        {p.showImageLabel === true && p.label && (
                          <span
                            className="image-caption"
                            style={{
                              background: p.image ? "transparent" : p.color,
                              color: p.textColor,
                            }}
                          >
                            {p.label}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="padicon">{p.icon}</span>
                        <span>{p.label}</span>
                        {edit && (
                          <small>
                            {p.audio ? "● Sound attached" : "＋ Add a sound"}
                          </small>
                        )}
                      </>
                    )}
                  </button>
                  {edit && selected === p.id && (
                    <button
                      className="resize"
                      aria-label="Resize button"
                      onPointerDown={(e) => gesture(e, p.id, true)}
                    >
                      ↘
                    </button>
                  )}
                </div>
              ))}
              {!board.pads.length && (
                <div className="empty">
                  <div className="emptyicon">♫</div>
                  <h2>Your sounds. Your space.</h2>
                  <p>
                    A little applause, a dramatic entrance, or something
                    entirely you.
                    <br />
                    Create a button to get your soundboard started.
                  </p>
                  <button
                    className="primary"
                    onClick={() => {
                      setEdit(true);
                      add();
                    }}
                  >
                    ＋ Create your first button
                  </button>
                  <span>Upload a sound or record your own</span>
                </div>
              )}
            </div>
          </div>
        </section>
        {edit && (
          <aside>
            <div className="asidehead">
              <strong>{pad ? "Button settings" : "Make it yours"}</strong>
              <span>✦</span>
            </div>
            <button className="primary add" onClick={add}>
              ＋ Add sound button
            </button>
            {pad ? (
              <>
                <label>
                  Label
                  <input
                    value={pad.label}
                    onChange={(e) => change({ label: e.target.value })}
                  />
                </label>
                <div className="row">
                  <label>
                    Shape
                    <select
                      aria-label="Shape"
                      value={pad.shape}
                      onChange={(e) => {
                        const shape = e.target.value;
                        change({
                          shape,
                          ...(["square", "circle"].includes(shape)
                            ? { h: pad.w }
                            : {}),
                        });
                      }}
                    >
                      {["rounded", "square", "rectangle", "circle", "oval"].map(
                        (s) => (
                          <option key={s} value={s}>
                            {s === "rounded"
                              ? "Rounded rectangle"
                              : s[0].toUpperCase() + s.slice(1)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
                <div className="row">
                  <label>
                    Button color
                    <input
                      type="color"
                      value={pad.color}
                      onChange={(e) => change({ color: e.target.value })}
                    />
                  </label>
                  <label>
                    Text color
                    <input
                      type="color"
                      value={pad.textColor}
                      onChange={(e) => change({ textColor: e.target.value })}
                    />
                  </label>
                </div>
                <div className="swatches">
                  {colors.map((c) => (
                    <button
                      key={c}
                      aria-label={`Use ${c}`}
                      style={{ background: c }}
                      onClick={() => change({ color: c })}
                    />
                  ))}
                </div>
                <div className="row">
                  <label>
                    Font size
                    <input
                      type="number"
                      min="10"
                      max="80"
                      value={pad.fontSize}
                      onChange={(e) =>
                        change({
                          fontSize: Math.max(10, Math.min(80, +e.target.value)),
                        })
                      }
                    />
                  </label>
                  <label>
                    Icon / emoji
                    <input
                      value={pad.icon}
                      onChange={(e) => change({ icon: e.target.value })}
                    />
                  </label>
                </div>
                <div className="row">
                  {(["w", "h", "x", "y"] as const).map((k) => (
                    <label key={k}>
                      {{ w: "Width", h: "Height", x: "X", y: "Y" }[k]}
                      <input
                        type="number"
                        value={pad[k]}
                        min={k === "x" || k === "y" ? 0 : 60}
                        max="2000"
                        onChange={(e) => {
                          const v = Math.min(
                            2000,
                            Math.max(
                              k === "x" || k === "y" ? 0 : 60,
                              +e.target.value,
                            ),
                          );
                          change(
                            ["square", "circle"].includes(pad.shape) &&
                              (k === "w" || k === "h")
                              ? { w: v, h: v }
                              : { [k]: v },
                          );
                        }}
                      />
                    </label>
                  ))}
                </div>
                <label className="filebutton imageupload">
                  ▧ Add button image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        if (f.size > 2 * 1024 * 1024) {
                          setError("Choose an image under 2 MB.");
                          return;
                        }
                        const r = new FileReader();
                        r.onload = () =>
                          change({
                            image: String(r.result),
                            imageFit: "cover",
                            showImageLabel: false,
                          });
                        r.readAsDataURL(f);
                      }
                    }}
                  />
                </label>
                {pad.image && (
                  <>
                    <label>
                      Image fit
                      <select
                        aria-label="Image fit"
                        value={pad.imageFit ?? "cover"}
                        onChange={(e) =>
                          change({
                            imageFit: e.target.value as Pad["imageFit"],
                          })
                        }
                      >
                        <option value="contain">
                          Fit whole image (no cropping)
                        </option>
                        <option value="cover">Fill shape (crop edges)</option>
                        <option value="fill">Stretch to fit</option>
                      </select>
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={pad.showImageLabel === true}
                        onChange={(e) =>
                          change({ showImageLabel: e.target.checked })
                        }
                      />
                      Show label on image
                    </label>
                    <button onClick={() => change({ image: undefined })}>
                      Remove image
                    </button>
                  </>
                )}
                <hr />
                <h3>Sound</h3>
                <label className="filebutton upload">
                  ↑ Upload audio
                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a"
                    onChange={(e) => {
                      fileSound(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button className="wide" onClick={() => setRecordOpen(true)}>
                  ◉ Record sound
                </button>
                <label>
                  Assigned sound
                  <select
                    aria-label="Assigned sound"
                    value={pad.audio || ""}
                    onChange={(e) =>
                      change({ audio: e.target.value || undefined })
                    }
                  >
                    <option value="">No sound</option>
                    {sounds.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                {pad.audio && (
                  <button className="wide" onClick={() => play(pad)}>
                    ▷ Preview button
                  </button>
                )}
                <label>
                  Volume · {Math.round(pad.volume * 100)}%
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value={pad.volume}
                    onChange={(e) => change({ volume: +e.target.value })}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={pad.loop}
                    onChange={(e) => change({ loop: e.target.checked })}
                  />{" "}
                  Loop sound
                </label>
                <hr />
                <div className="row">
                  <button
                    onClick={() => {
                      const p = {
                        ...pad,
                        id: uid(),
                        label: pad.label + " copy",
                        x: pad.x + 25,
                        y: pad.y + 25,
                      };
                      update({ pads: [...board.pads, p] });
                      select(p.id);
                    }}
                  >
                    ⧉ Duplicate
                  </button>
                  <button
                    onClick={() => {
                      audio.current.get(pad.id)?.pause();
                      update({
                        pads: board.pads.filter((p) => p.id !== pad.id),
                      });
                      select(undefined);
                    }}
                  >
                    ⌫ Delete
                  </button>
                </div>
                <div className="row">
                  <button
                    onClick={() =>
                      update({
                        pads: [
                          pad,
                          ...board.pads.filter((p) => p.id !== pad.id),
                        ],
                      })
                    }
                  >
                    Send back
                  </button>
                  <button
                    onClick={() =>
                      update({
                        pads: [
                          ...board.pads.filter((p) => p.id !== pad.id),
                          pad,
                        ],
                      })
                    }
                  >
                    Bring forward
                  </button>
                </div>
              </>
            ) : (
              <div className="tip">
                <span>↖</span>
                <h3>A canvas without rules</h3>
                <p>
                  Add a button, then drag it anywhere. Mix shapes, layer sounds,
                  and make this space your own.
                </p>
                <div>
                  01 <b>Add a button</b>
                  <br />
                  02 <b>Upload or record a sound</b>
                  <br />
                  03 <b>Switch to Play</b>
                </div>
              </div>
            )}
            <div className="asidebottom">
              <label className="check">
                <input
                  type="checkbox"
                  checked={board.snap}
                  onChange={(e) => update({ snap: e.target.checked })}
                />{" "}
                Snap to grid <span>20 px</span>
              </label>
              <p>
                Stored on this device. Clearing browser data erases sounds.
                Export a backup to keep them safe.
              </p>
            </div>
          </aside>
        )}
      </div>
      <footer>
        <span>
          <span className={edit ? "editdot" : "playdot"}>●</span>{" "}
          {edit ? "EDIT MODE" : "PLAY MODE"}{" "}
          <span className="foothelp">
            {edit
              ? "Drag to move · Pull the corner to resize"
              : "Tap a button to play · Tap again to restart"}
          </span>
        </span>
        <div className="zoom">
          <button
            aria-label="Zoom out"
            onClick={() =>
              update({ zoom: Math.max(0.25, +(board.zoom - 0.1).toFixed(2)) })
            }
          >
            −
          </button>
          <button aria-label="Reset zoom" onClick={() => update({ zoom: 1 })}>
            {Math.round(board.zoom * 100)}%
          </button>
          <button
            aria-label="Zoom in"
            onClick={() =>
              update({ zoom: Math.min(2, +(board.zoom + 0.1).toFixed(2)) })
            }
          >
            ＋
          </button>
        </div>
      </footer>
      {error && (
        <div className="toast" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {(pending || recordOpen) && (
        <div className="overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Assign sound"
          >
            <button
              className="close"
              aria-label="Cancel sound"
              onClick={closeRecording}
            >
              ×
            </button>
            <div className="recordicon">{recording ? "●" : "♫"}</div>
            <h2>
              {recording
                ? "Recording…"
                : pending
                  ? "Give it a listen"
                  : "Record your sound"}
            </h2>
            <p>
              {recording
                ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
                : pending
                  ? pending.name
                  : "Use your microphone to capture something great."}
            </p>
            {pending && <AudioPreview sound={pending} />}
            <div className="row">
              {recording ? (
                <button className="primary" onClick={() => rec.current?.stop()}>
                  ■ Stop recording
                </button>
              ) : pending ? (
                <>
                  <button
                    onClick={() => {
                      setPending(undefined);
                      if (!recordOpen) setRecordOpen(true);
                    }}
                  >
                    Retry
                  </button>
                  <button className="primary" onClick={assign}>
                    Save to button
                  </button>
                </>
              ) : (
                <button className="primary" onClick={() => void record()}>
                  ◉ Start recording
                </button>
              )}
            </div>
            <button className="cancel" onClick={closeRecording}>
              Cancel
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
        /* Offline shell remains available. */
      });
  });
