import type { IncomingMessage, ServerResponse } from 'node:http'

export function createApi(options: { dataDir: string }): {
  /** Traite la requête si elle commence par /api. Renvoie true si elle a été traitée. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>
  /** Résolu quand toutes les écritures en cours sont terminées. */
  idle(): Promise<void>
}
