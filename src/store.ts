import { openDB } from "idb";
export type Pad = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  textColor: string;
  fontSize: number;
  shape: string;
  icon: string;
  image?: string;
  audio?: string;
  volume: number;
  loop: boolean;
};
export type Sound = { id: string; name: string; blob: Blob };
export type Board = {
  name: string;
  pads: Pad[];
  width: number;
  height: number;
  zoom: number;
  snap: boolean;
};
export const fresh = (): Board => ({
  name: "My soundboard",
  pads: [],
  width: 1600,
  height: 1000,
  zoom: 1,
  snap: false,
});
const db = openDB("soundspace", 1, {
  upgrade(db) {
    db.createObjectStore("data");
    db.createObjectStore("sounds", { keyPath: "id" });
  },
});
const persistedBlobs = new Map<string, Blob>();
export async function load() {
  const d = await db;
  const sounds = (await d.getAll("sounds")) as Sound[];
  sounds.forEach((s) => persistedBlobs.set(s.id, s.blob));
  return { board: (await d.get("data", "board")) as Board | undefined, sounds };
}
export async function save(board: Board, sounds: Sound[]) {
  const d = await db;
  const tx = d.transaction(["data", "sounds"], "readwrite");
  await tx.objectStore("data").put(board, "board");
  const stored = await tx.objectStore("sounds").getAllKeys();
  const keep = new Set(sounds.map((s) => s.id));
  for (const key of stored)
    if (!keep.has(String(key))) await tx.objectStore("sounds").delete(key);
  for (const s of sounds)
    if (persistedBlobs.get(s.id) !== s.blob)
      await tx.objectStore("sounds").put(s);
  await tx.done;
  persistedBlobs.clear();
  sounds.forEach((s) => persistedBlobs.set(s.id, s.blob));
}
export function validBoard(b: unknown): b is Board {
  if (!b || typeof b !== "object") return false;
  const a = b as Board;
  return (
    typeof a.name === "string" &&
    Number.isFinite(a.width) &&
    a.width >= 300 &&
    a.width <= 100000 &&
    Number.isFinite(a.height) &&
    a.height >= 300 &&
    a.height <= 100000 &&
    Number.isFinite(a.zoom) &&
    a.zoom >= 0.25 &&
    a.zoom <= 2 &&
    typeof a.snap === "boolean" &&
    Array.isArray(a.pads) &&
    a.pads.length <= 1000 &&
    new Set(a.pads.map((p) => p.id)).size === a.pads.length &&
    a.pads.every(
      (p) =>
        typeof p.id === "string" &&
        typeof p.label === "string" &&
        typeof p.color === "string" &&
        typeof p.textColor === "string" &&
        typeof p.icon === "string" &&
        ["square", "rectangle", "circle", "rounded", "oval"].includes(
          p.shape,
        ) &&
        [p.x, p.y, p.w, p.h, p.fontSize, p.volume].every(Number.isFinite) &&
        p.x >= 0 &&
        p.y >= 0 &&
        p.x <= 100000 &&
        p.y <= 100000 &&
        p.w >= 60 &&
        p.w <= 2000 &&
        p.h >= 60 &&
        p.h <= 2000 &&
        p.fontSize >= 10 &&
        p.fontSize <= 80 &&
        p.volume >= 0 &&
        p.volume <= 1 &&
        typeof p.loop === "boolean" &&
        (!p.image || p.image.startsWith("data:image/")),
    )
  );
}
