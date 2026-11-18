import { guard, json } from '../lib/core.js';
import { syncAll } from '../lib/sync.js';

export default guard(async () => json(await syncAll()));

export const config = { path: '/api/sync' };
