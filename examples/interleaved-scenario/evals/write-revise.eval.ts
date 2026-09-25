import { fileAgent } from '../agents/file-agent.js';
import { writeRevise } from '../scenarios/write-revise.js';

// A complete two-turn scenario: both intermediate and final file states pass.
export default writeRevise('write-revise', fileAgent());
