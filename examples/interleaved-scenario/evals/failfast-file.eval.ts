import { fileAgent } from '../agents/file-agent.js';
import { writeRevise } from '../scenarios/write-revise.js';

// The call is emitted, but the first write produces the wrong file; failfast skips the revision.
export default writeRevise('failfast-file', fileAgent({ firstWrite: 'wrong' }));
