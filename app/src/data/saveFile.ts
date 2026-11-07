import type { GameConfig, SaveState } from '../domain/types.ts';
import { parseSave } from './saveSchema.ts';

const FORMAT = 'gachapuff-save';

/** Serialises the save for the "export" button. */
export function exportSave(state: SaveState, now: number): string {
  return JSON.stringify({ format: FORMAT, exportedAt: now, save: state }, null, 2);
}

export function exportFileName(now: number): string {
  return `gachapuff-${new Date(now).toISOString().slice(0, 10)}.json`;
}

/** Parses an exported file. Returns null with a reason when the file is not usable. */
export function importSave(
  text: string,
  now: number,
  config: GameConfig,
): { state: SaveState } | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: 'Ce fichier n’est pas du JSON.' };
  }
  const payload =
    json && typeof json === 'object' && (json as { format?: unknown }).format === FORMAT
      ? (json as { save: unknown }).save
      : json;
  const result = parseSave(payload, now, config);
  if (result.status !== 'ok') return { error: 'Sauvegarde illisible ou corrompue.' };
  return { state: result.state };
}
