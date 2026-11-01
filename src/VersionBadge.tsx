import { useEffect, useState } from "react";
import { loadInfo, type ServerInfo } from "./api";

/** Informations du serveur en cours d'exécution (version, commit, heure de démarrage). */
export function useServerInfo() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadInfo()
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return info;
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
}

/** Petite ligne affichée sous le titre du header : « v1.1.0 (a1b2c3d) · démarré le 01/11/2026 14:32:05 ». */
export default function VersionBadge() {
  const info = useServerInfo();
  if (!info) return null;

  return (
    <p
      className="mt-1 text-[10px] leading-tight text-[var(--muted-foreground)]"
      title="Version du serveur et heure de son dernier démarrage"
    >
      v{info.version}
      {info.commit ? ` (${info.commit})` : ""} · démarré le {formatDateTime(info.startedAt)}
    </p>
  );
}
