"use client";

import { useEffect, useState } from "react";
import { startMusic, stopMusic } from "@/lib/music";
import { settings } from "@/lib/settings";

const GESTURES = ["pointerdown", "keydown"] as const;

/**
 * Plays the background music while the setting is on. Browsers only allow audio after the player
 * touches the page, so it waits for the first tap or key; it also pauses while the tab is hidden.
 */
export function BackgroundMusic() {
  const { music } = settings.use();
  const [touched, setTouched] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (touched) return;
    const onGesture = () => setTouched(true);
    GESTURES.forEach((g) => window.addEventListener(g, onGesture, { once: true, capture: true }));
    return () => GESTURES.forEach((g) => window.removeEventListener(g, onGesture, { capture: true }));
  }, [touched]);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (music && touched && visible) startMusic();
    else stopMusic();
  }, [music, touched, visible]);

  useEffect(() => stopMusic, []);
  return null;
}
