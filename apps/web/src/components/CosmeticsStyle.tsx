"use client";

import { useEffect } from "react";
import { cosmeticVars, cosmetics } from "@/lib/cosmetics";
import { stats } from "@/lib/stats";

const VARS = ["--card-back", "--card-back-pattern", "--wood", "--wood-dark", "--pit", "--seed"];

/** Applies the chosen card back and Ayo board as CSS variables on <html>, so every table and preview picks them up. */
export function CosmeticsStyle() {
  const chosen = cosmetics.use();
  const record = stats.use();
  useEffect(() => {
    const root = document.documentElement.style;
    const vars = cosmeticVars(chosen, record);
    for (const name of VARS) {
      if (vars[name]) root.setProperty(name, vars[name]);
      else root.removeProperty(name);
    }
  }, [chosen, record]);
  return null;
}
