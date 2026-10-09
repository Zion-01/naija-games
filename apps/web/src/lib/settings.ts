import { createStore } from "./storage";

export type Settings = { sound: boolean; haptics: boolean };

export const settings = createStore<Settings>("naija-games:settings", {
  sound: true,
  haptics: true,
});
