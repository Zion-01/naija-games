import { createStore } from "./storage";

export type Settings = {
  sound: boolean;
  haptics: boolean;
  /** Show other players' emotes in online games. */
  emotes: boolean;
};

export const settings = createStore<Settings>("naija-games:settings", {
  sound: true,
  haptics: true,
  emotes: true,
});
