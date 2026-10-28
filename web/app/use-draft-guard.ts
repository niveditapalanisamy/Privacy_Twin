"use client";
import { useEffect } from "react";

export function useDraftGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: Event) => event.preventDefault();
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("privacytwin:leave", leave);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("privacytwin:leave", leave);
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty]);
}
