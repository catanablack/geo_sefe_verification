/**
 * Procedural, cached road-surface texture: asphalt with a yellow dashed
 * center divider (two-way street) and white lane-edge lines near each curb.
 * One base texture is generated per road width and cloned per segment (see
 * components/RoadNetworkView.tsx) so each segment can set its own `repeat`
 * to tile the pattern along its exact length without regenerating pixels.
 */
import * as THREE from "three";

const TILE_LENGTH_M = 6;
const TEXTURE_PX_PER_M = 24;

const textureCache = new Map<number, THREE.CanvasTexture>();

function buildRoadSurfaceCanvas(roadWidthM: number): HTMLCanvasElement {
  const width = Math.max(32, Math.round(roadWidthM * TEXTURE_PX_PER_M));
  const height = Math.round(TILE_LENGTH_M * TEXTURE_PX_PER_M);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#3a3a3f";
  ctx.fillRect(0, 0, width, height);

  // Subtle asphalt speckle so the surface doesn't look perfectly flat.
  ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
  for (let i = 0; i < 50; i++) {
    ctx.fillRect(Math.random() * width, Math.random() * height, 1.5, 1.5);
  }

  // White lane-edge lines, inset from each curb.
  const edgeInsetPx = TEXTURE_PX_PER_M * 0.45;
  const edgeLineWidthPx = Math.max(2, TEXTURE_PX_PER_M * 0.1);
  ctx.fillStyle = "#eceae4";
  ctx.fillRect(edgeInsetPx, 0, edgeLineWidthPx, height);
  ctx.fillRect(width - edgeInsetPx - edgeLineWidthPx, 0, edgeLineWidthPx, height);

  // Yellow dashed center line dividing the two directions of travel.
  const centerX = width / 2;
  const dashWidthPx = Math.max(2, TEXTURE_PX_PER_M * 0.12);
  ctx.fillStyle = "#e8b93a";
  ctx.fillRect(centerX - dashWidthPx / 2, 0, dashWidthPx, height * 0.55);

  return canvas;
}

/** Cached base texture for a given road width (meters), rounded to
 * centimeters for the cache key. Callers should `.clone()` this before
 * setting a per-segment `repeat`. */
export function getRoadSurfaceTexture(roadWidthM: number): THREE.CanvasTexture {
  const key = Math.round(roadWidthM * 100);
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = buildRoadSurfaceCanvas(roadWidthM);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

export const ROAD_TILE_LENGTH_M = TILE_LENGTH_M;
