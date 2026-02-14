import mongoose from "mongoose";
import { connect } from "@/lib/db";

/** Valid square ID: A-J and 1-12, e.g. H8 */
export const SQUARE_ID_REGEX = /^([A-Ja-j])(1[0-2]|[1-9])$/;

export const SQUARE_W = 2400;
export const SQUARE_H = 1666;

export const BASE_LAYER = "MAP_0002_Map-Base";
export const GCS_BASE = "https://storage.googleapis.com/tinglebot";

/** Quadrant bounds: left, top, width, height (pixels). Q1=top-left, Q2=top-right, Q3=bottom-left, Q4=bottom-right. */
export const QUADRANT_BOUNDS: Record<
  string,
  { left: number; top: number; width: number; height: number }
> = {
  Q1: { left: 0, top: 0, width: SQUARE_W / 2, height: SQUARE_H / 2 },
  Q2: { left: SQUARE_W / 2, top: 0, width: SQUARE_W / 2, height: SQUARE_H / 2 },
  Q3: { left: 0, top: SQUARE_H / 2, width: SQUARE_W / 2, height: SQUARE_H / 2 },
  Q4: {
    left: SQUARE_W / 2,
    top: SQUARE_H / 2,
    width: SQUARE_W / 2,
    height: SQUARE_H / 2,
  },
};

/**
 * Resolves the current path image URL for a square (single source of truth: Square.pathImageUrl).
 * Falls back to Square.image then to the base map tile URL.
 */
export async function getPathImageUrlForSquare(squareId: string): Promise<string> {
  await connect();
  const Square =
    mongoose.models.Square ??
    ((await import("@/models/mapModel.js")) as unknown as {
      default: mongoose.Model<unknown>;
    }).default;
  const squareIdRegex = new RegExp(
    `^${squareId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
    "i"
  );
  const doc = await Square.findOne({ squareId: squareIdRegex })
    .select("pathImageUrl image")
    .lean();
  const pathImageUrl = (doc as { pathImageUrl?: string } | null)?.pathImageUrl;
  const image = (doc as { image?: string } | null)?.image;
  return (
    pathImageUrl ??
    image ??
    `${GCS_BASE}/maps/squares/${BASE_LAYER}/${BASE_LAYER}_${squareId}.png`
  );
}
