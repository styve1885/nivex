import { useEffect } from "react";

/**
 * Prévient le tableau de bord qu'un onglet a des modifications en attente.
 *
 * Il s'en sert pour garder l'onglet en vie quand on en sort, le marquer dans
 * la barre des onglets, et demander avant de quitter la page : un brouillon
 * ne se perd plus sans un mot.
 */
export function useReportUnsaved(dirty: boolean, onDirty?: (dirty: boolean) => void) {
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
}
