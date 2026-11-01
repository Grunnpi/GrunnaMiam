import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Updater } from './update.mjs'

export function createApi(options: {
  dataDir: string
  /** Racine du projet : sert à lire la version (package.json) et le commit git. */
  rootDir?: string
  /** Si fourni, active les routes /api/update. */
  updater?: Updater
}): {
  /** Traite la requête si elle commence par /api. Renvoie true si elle a été traitée. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>
  /** Résolu quand toutes les écritures en cours sont terminées. */
  idle(): Promise<void>
}
