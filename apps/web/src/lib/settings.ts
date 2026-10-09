import { createStore } from "./storage";

export type Settings = { sound: boolean; voice: boolean; haptics: boolean };

export const settings = createStore<Settings>("naija-games:settings", {
  sound: true,
  voice: true,
  haptics: true,
});
