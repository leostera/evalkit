import type { TrajectoryEvent } from '../api.js';

export function eventLabel(event: TrajectoryEvent): string {
  if (event.kind === 'message' && event.role === 'user') return 'User message';
  if (event.kind === 'message' && event.role === 'assistant')
    return 'Assistant message';
  if (event.kind.includes('scorer'))
    return `Scorer · ${event.kind.replace('scorer-', '')}`;
  if (event.kind.includes('tool'))
    return `Tool · ${event.kind.replace('tool-', '')}`;
  return event.kind.replaceAll('-', ' ');
}
