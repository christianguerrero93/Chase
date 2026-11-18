import { guard, json, store, load, save } from '../lib/core.js';

// Receipt photos, one per transaction.
// GET    /api/receipt?id=TXN      -> the image
// POST   /api/receipt { id, dataUrl }   (JPEG/PNG/WebP, resized in the browser)
// DELETE /api/receipt?id=TXN
const MAX_BYTES = 3_000_000;

export default guard(async (req) => {
  const url = new URL(req.url);
  const key = (id) => `receipt/${String(id).replace(/[^\w-]/g, '').slice(0, 80)}`;

  if (req.method === 'GET') {
    const id = url.searchParams.get('id');
    const blob = await store().getWithMetadata(key(id), { type: 'arrayBuffer' });
    if (!blob) return json({ error: 'Not found' }, 404);
    return new Response(blob.data, {
      headers: { 'content-type': blob.metadata?.type || 'image/jpeg', 'cache-control': 'private, max-age=86400' },
    });
  }

  const settings = await load('settings', {});
  settings.receipts = settings.receipts || {};

  if (req.method === 'POST') {
    const { id, dataUrl } = await req.json();
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
    if (!id || !m) return json({ error: 'Send a JPEG, PNG or WebP image' }, 400);
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > MAX_BYTES) return json({ error: 'Image too large (max 3 MB)' }, 413);
    await store().set(key(id), bytes, { metadata: { type: m[1] } });
    settings.receipts[id] = true;
    await save('settings', settings);
    return json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id');
    await store().delete(key(id));
    delete settings.receipts[id];
    await save('settings', settings);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});

export const config = { path: '/api/receipt' };
