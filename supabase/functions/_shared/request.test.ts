import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.13';
import { BodyTooLarge, InvalidBody, readBody, readObject } from './request.ts';

function request(chunks: Uint8Array[], headers = {}) {
  return new Request('https://example.test', {
    method: 'POST', headers,
    body: new ReadableStream({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
    }),
  });
}

Deno.test('body limits count actual bytes across chunks and preserve signed UTF-8', async () => {
  const bytes = new TextEncoder().encode('ñ');
  assertEquals(await readBody(request([bytes.slice(0, 1), bytes.slice(1)]), 2), 'ñ');
  await assertRejects(() => readBody(request([bytes], { 'content-length': '1' }), 1), BodyTooLarge);
  await assertRejects(() => readBody(request([], { 'content-length': '9' }), 8), BodyTooLarge);
});

Deno.test('only JSON objects reach action handlers', async () => {
  for (const invalid of ['null', '[]', 'true', '{']) {
    await assertRejects(() => readObject(request([new TextEncoder().encode(invalid)]), 50), InvalidBody);
  }
  assertEquals(await readObject(request([new TextEncoder().encode('{"action":"view"}')]), 50), { action: 'view' });
});
