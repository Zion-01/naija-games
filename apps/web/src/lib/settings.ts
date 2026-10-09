import { createStore } from "./storage";

export type Settings = {
  /** Sound effects. */
  sound: boolean;
  /** Background music. */
  music: boolean;
  haptics: boolean;
  /** Show other players' emotes in online games. */
  emotes: boolean;
};

export const settings = createStore<Settings>("naija-games:settings", {
  sound: true,
  music: true,
  haptics: true,
  emotes: true,
});
