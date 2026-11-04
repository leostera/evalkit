import { piAgent } from '@evalkit/agents';

// Your own Pi setup (logins, providers); the default is a private, empty one.
export const localPiAgent = piAgent({ config: 'user' });
