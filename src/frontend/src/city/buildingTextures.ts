/**
 * Procedurally generated, cached window-tile textures used by `Building.tsx`.
 *
 * Instead of baking one large canvas per building (expensive for a town with
 * dozens of structures), we generate a small number of reusable "wall tile"
 * canvases — each showing a single window cell on a light, near-neutral wall
 * background — and tile them via `THREE.RepeatWrapping`. Per building we
 * clone the base texture and set `repeat` to match that building's
 * width/height in "window cells", then apply the building's own color as the
 * material tint (multiplying with the light wall background) so each
 * building keeps a distinct hue while still showing crisp window detail.
 */
import * as THREE from "three";

interface WindowStyle {
  wallBase: string;
  glass: string;
  frame: string;
  siding: string;
}

const WINDOW_STYLES: WindowStyle[] = [
  { wallBase: "#f3f1ec", glass: "#274257", frame: "#c9c4b8", siding: "#e9e6de" },
  { wallBase: "#eef0f2", glass: "#3a5068", frame: "#b9c0c6", siding: "#e2e6e9" },
  { wallBase: "#f0ece4", glass: "#2f4a52", frame: "#cabfa9", siding: "#e6ddcd" },
  { wallBase: "#eceef0", glass: "#41586e", frame: "#c2c7cb", siding: "#dfe3e6" },
  { wallBase: "#f4efe8", glass: "#33475c", frame: "#d0c6b4", siding: "#eae3d5" },
];

const textureCache = new Map<number, THREE.CanvasTexture>();

function buildWindowTileCanvas(style: WindowStyle): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = style.wallBase;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // subtle vertical siding lines for wall texture detail
  ctx.strokeStyle = style.siding;
  ctx.lineWidth = 1;
  for (let x = 6; x < canvas.width; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // window frame
  const winX = 12;
  const winY = 18;
  const winW = canvas.width - 24;
  const winH = 56;
  ctx.fillStyle = style.frame;
  ctx.fillRect(winX - 3, winY - 3, winW + 6, winH + 6);

  // glass panes (2x2 grid with mullions)
  ctx.fillStyle = style.glass;
  ctx.fillRect(winX, winY, winW, winH);
  ctx.strokeStyle = style.frame;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(winX, winY + winH / 2);
  ctx.lineTo(winX + winW, winY + winH / 2);
  ctx.moveTo(winX + winW / 2, winY);
  ctx.lineTo(winX + winW / 2, winY + winH);
  ctx.stroke();

  // sill
  ctx.fillStyle = style.frame;
  ctx.fillRect(winX - 4, winY + winH + 4, winW + 8, 4);

  return canvas;
}

/** Returns a cached base `CanvasTexture` for the given style index (0..N-1),
 * creating and caching it lazily on first use. Callers should `.clone()`
 * this before mutating `repeat`/`offset` per building. */
export function getWindowStyleTexture(styleIndex: number): THREE.CanvasTexture {
  const index = ((styleIndex % WINDOW_STYLES.length) + WINDOW_STYLES.length) % WINDOW_STYLES.length;
  const cached = textureCache.get(index);
  if (cached) return cached;

  const canvas = buildWindowTileCanvas(WINDOW_STYLES[index]);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(index, texture);
  return texture;
}

export const WINDOW_STYLE_COUNT = WINDOW_STYLES.length;
