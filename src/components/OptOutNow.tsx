"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isOptedOut, setOptedOut, subscribeOptOut } from "./SiteMeasurement";
import type { Dict } from "@/lib/i18n";

/* Vrai une fois le marqueur demandé : avant, un marqueur absent veut dire
   « pas encore », après, « refusé ». */
let tried = false;

const snapshot = () => (isOptedOut() ? true : tried ? false : null);

/**
 * Pose le marqueur de retrait dès l'ouverture, puis dit ce qu'il en est.
 *
 * Ce qui s'affiche est relu dans le navigateur, et non supposé : un
 * navigateur en navigation privée peut refuser de garder quoi que ce soit,
 * et l'artisan doit le savoir plutôt que de se croire retiré.
 */
export function OptOutNow({ t }: { t: Dict }) {
  const out = useSyncExternalStore(subscribeOptOut, snapshot, () => null);

  useEffect(() => {
    tried = true;
    setOptedOut(true);
  }, []);

  if (out === null) return null;
  return out ? (
    <>
      <p className="mt-6 text-[1rem] text-ink-800" role="status">{t.optOut.done}</p>
      <p className="mt-3 text-[0.9rem] font-light leading-relaxed text-ink-500">{t.optOut.body}</p>
    </>
  ) : (
    <p className="mt-6 text-[0.9rem] font-light leading-relaxed text-ink-500" role="status">{t.optOut.refused}</p>
  );
}
