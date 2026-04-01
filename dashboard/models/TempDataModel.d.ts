import type { HydratedDocument, Model } from "mongoose";

export interface ITempData {
  key: string;
  type: string;
  createdAt: Date;
  data: unknown;
  expiresAt: Date;
}

export type TempDataDocument = HydratedDocument<ITempData>;

export interface TempDataModelStatics {
  cleanup(maxAgeInMs?: number): Promise<{ deletedCount?: number }>;
  cleanupByType(type: string): Promise<{ deletedCount?: number }>;
  findByTypeAndKey(type: string, key: string): Promise<TempDataDocument | null>;
  findAllByType(type: string): Promise<TempDataDocument[]>;
  findExpired(): Promise<TempDataDocument[]>;
  extendExpiration(
    type: string,
    key: string,
    additionalTimeMs: number
  ): Promise<TempDataDocument | null>;
}

declare const TempData: Model<ITempData> & TempDataModelStatics;
export default TempData;
