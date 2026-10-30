import { useEffect, useSyncExternalStore } from "react";
import { dismissError, requestRetry, syncStore } from "./api";

/** Petit bandeau : « Enregistrement… » pendant les sauvegardes, message d'erreur avec « Réessayer » si ça échoue. */
export default function SyncStatus() {
  const { pending, error } = useSyncExternalStore(syncStore.subscribe, syncStore.getSnapshot);

  // Évite de fermer l'onglet pendant qu'une sauvegarde est en cours.
  useEffect(() => {
    if (pending === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  if (error) {
    return (
      <div
        role="alert"
        className="fixed bottom-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--card)] px-4 py-3 text-sm shadow-lg"
      >
        <span className="flex-1 text-[var(--accent)]">{error}</span>
        <button
          type="button"
          onClick={requestRetry}
          className="shrink-0 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-foreground)] hover:opacity-90"
        >
          Réessayer
        </button>
        <button
          type="button"
          onClick={dismissError}
          aria-label="Fermer"
          className="shrink-0 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          ✕
        </button>
      </div>
    );
  }

  if (pending > 0) {
    return (
      <div
        role="status"
        className="fixed bottom-4 right-4 z-[60] rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] shadow"
      >
        Enregistrement…
      </div>
    );
  }

  return null;
}
