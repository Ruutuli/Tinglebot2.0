import { WindName } from "./names/WindName";

export interface Wind {
  lowSpeed: number;
  highSpeed: number;
  name: WindName;
  emote: string;
}
