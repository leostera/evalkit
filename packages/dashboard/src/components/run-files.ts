import { createContext } from 'react';
import type { AttachmentEntry } from '../api.js';

/** The run whose files a verdict can link to. */
export const RunFiles = createContext<{
  runId?: string;
  attachments: readonly AttachmentEntry[];
}>({ attachments: [] });
