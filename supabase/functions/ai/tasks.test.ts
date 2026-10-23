// The checks on Claude's answers, with a stand-in for Claude (no key, no cost).
// Run: npx deno@2.9.6 test supabase/functions/ai/tasks.test.ts
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.13';
import type Anthropic from '@anthropic-ai/sdk';

import { AiError, checkInput, numbersIn, runTask, type Task } from './tasks.ts';

/** A pretend Claude that gives `answer` back, after making sure the answer format builds. */
function fake(answer: unknown, stop = 'end_turn') {
  const sent: Record<string, unknown>[] = [];
  const client = {
    messages: {
      parse: (params: Record<string, unknown>) => {
        sent.push(params);
        const format = (params.output_config as { format: { type: string; schema: object } }).format;
        assertEquals(format.type, 'json_schema');
        return Promise.resolve({ stop_reason: stop, parsed_output: answer });
      },
    },
  } as unknown as Anthropic;
  return { client, sent };
}

const run = (client: Anthropic, task: Task, input: unknown) => runTask(client, task, checkInput(task, input));

const items = [
  { id: 'paint-wall', name: 'Paint interior walls', unit: 'sq_ft' },
  { id: 'trip', name: 'Trip fee', unit: 'flat' },
  { id: 'haul', name: 'Haul away and cleanup', unit: 'flat' },
];
const guessInput = {
  title: 'Paint living room', note: '400 sq ft of walls', notes: [], hourly: false,
  trades: [{ id: 'painting', name: 'Painting', jobTypes: [{ id: 'interiorPaint', name: 'Interior' }] }],
  items,
};

Deno.test('guess: keeps a job type and quantities that are on the owner’s lists', async () => {
  const { client } = fake({ jobType: 'painting/interiorPaint', items: [{ itemId: 'paint-wall', qty: 400 }, { itemId: 'trip', qty: 1 }] });
  assertEquals(await run(client, 'guess', guessInput), {
    tradeId: 'painting', jobTypeId: 'interiorPaint',
    quantities: [{ itemId: 'paint-wall', qtyHundredths: 40000 }, { itemId: 'trip', qtyHundredths: 100 }],
  });
});

Deno.test('guess: drops made-up items, bad quantities, repeats, and unknown job types', async () => {
  const { client } = fake({
    jobType: 'plumbing/leak',
    items: [{ itemId: 'gold-faucet', qty: 1 }, { itemId: 'paint-wall', qty: -5 }, { itemId: 'trip', qty: 1 }, { itemId: 'trip', qty: 2 }, { itemId: 'haul', qty: 0.001 }],
  });
  assertEquals(await run(client, 'guess', guessInput), { tradeId: null, jobTypeId: null, quantities: [{ itemId: 'trip', qtyHundredths: 100 }] });
});

Deno.test('guess: an area, length, or hours amount not written in the text is dropped', async () => {
  const { client } = fake({ jobType: 'painting/interiorPaint', items: [{ itemId: 'paint-wall', qty: 1 }, { itemId: 'haul', qty: 1 }] });
  assertEquals((await run(client, 'guess', guessInput) as { quantities: unknown }).quantities, [{ itemId: 'haul', qtyHundredths: 100 }]);
});

Deno.test('numbers the owner wrote, as digits or words, in English or Spanish', () => {
  const said = numbersIn('About 1,200 sq ft, 2.5 hours, two doors, dos horas, 3,5 metros');
  for (const n of [120000, 250, 200, 350]) assertEquals(said.has(n), true);
  assertEquals(said.has(100), false);
});

Deno.test('guess: an unsure answer stays empty', async () => {
  const { client } = fake({ jobType: null, items: [] });
  assertEquals(await run(client, 'guess', guessInput), { tradeId: null, jobTypeId: null, quantities: [] });
});

Deno.test('guess: prices never go to Claude', async () => {
  const { client, sent } = fake({ jobType: null, items: [] });
  await run(client, 'guess', { ...guessInput, items: items.map((i) => ({ ...i, unitCents: 4500 })) });
  assertEquals(JSON.stringify(sent[0].messages).includes('4500'), false);
});

Deno.test('missed: at most 3, only from the price list, each with a reason', async () => {
  const { client } = fake({ items: [
    { itemId: 'haul', reason: 'You removed old flooring.' }, { itemId: 'nope', reason: 'x' }, { itemId: 'trip', reason: '  ' },
    { itemId: 'paint-wall', reason: 'a' }, { itemId: 'haul', reason: 'again' },
  ] });
  const input = { lang: 'en', title: 'Floor', jobType: 'Vinyl plank', lines: [{ description: 'Remove old flooring', excluded: false }], items };
  assertEquals(await run(client, 'missed', input), { items: [{ itemId: 'haul', reason: 'You removed old flooring.' }, { itemId: 'paint-wall', reason: 'a' }] });
});

Deno.test('missed: an empty estimate is not checked', async () => {
  const { client, sent } = fake({ items: [] });
  assertEquals(await run(client, 'missed', { lang: 'en', title: 'x', jobType: 'x', lines: [], items }), { items: [] });
  assertEquals(sent.length, 0);
});

Deno.test('scope: trims the text; refuses an empty or overlong one', async () => {
  const input = { lang: 'es', title: 'Pintar sala', jobType: 'Interior', draft: '', location: '', lines: [], excluded: [] };
  assertEquals(await run(fake({ text: '  Pintaremos la sala.  ' }).client, 'scope', input), { text: 'Pintaremos la sala.' });
  await assertRejects(() => run(fake({ text: ' ' }).client, 'scope', input), AiError);
  await assertRejects(() => run(fake({ text: 'a'.repeat(1600) }).client, 'scope', input), AiError);
});

Deno.test('prices: whole cents in range, one match per existing item', async () => {
  const { client } = fake({ prices: [
    { name: 'Trip charge', unit: 'flat', cents: 7500, matchId: 'trip', unclear: false },
    { name: 'Service call', unit: 'flat', cents: 9000, matchId: 'trip', unclear: true },
    { name: 'Gutter cleaning', unit: 'linear_ft', cents: 150, matchId: 'made-up', unclear: false },
    { name: 'Negative', unit: 'flat', cents: -100, matchId: null, unclear: false },
    { name: '   ', unit: 'flat', cents: 100, matchId: null, unclear: false },
  ] });
  assertEquals(await run(client, 'prices', { text: 'Trip charge $75', images: [], items }), { prices: [
    { name: 'Trip charge', unit: 'flat', unitCents: 7500, matchId: 'trip', unclear: false },
    { name: 'Service call', unit: 'flat', unitCents: 9000, matchId: null, unclear: true },
    { name: 'Gutter cleaning', unit: 'linear_ft', unitCents: 150, matchId: null, unclear: false },
  ] });
});

Deno.test('a refusal or a cut-off answer is an error, not an empty result', async () => {
  await assertRejects(() => run(fake(null, 'refusal').client, 'guess', guessInput), AiError, 'refused');
  await assertRejects(() => run(fake({ jobType: null, items: [] }, 'max_tokens').client, 'guess', guessInput), AiError, 'unreadable');
});

Deno.test('input limits are checked before anything is sent', () => {
  const bad = (task: Task, input: unknown) => {
    try {
      checkInput(task, input);
      return false;
    } catch (e) {
      return e instanceof AiError && e.status === 400;
    }
  };
  assertEquals(bad('guess', { ...guessInput, title: 'x'.repeat(201) }), true);
  assertEquals(bad('guess', { ...guessInput, trades: [] }), true);
  assertEquals(bad('prices', { text: '', images: [], items }), true);
  assertEquals(bad('prices', { text: '', images: [{ mediaType: 'image/gif', data: 'AAAA' }], items }), true);
  assertEquals(bad('prices', { text: '', images: [{ mediaType: 'image/jpeg', data: 'not base64!' }], items }), true);
  assertEquals(bad('scope', { lang: 'fr', title: '', jobType: '', draft: '', location: '', lines: [], excluded: [] }), true);
});

const photo = { mediaType: 'image/jpeg', data: 'AAAA' };

Deno.test('receipt: keeps readable lines and a real date; drops bad prices', async () => {
  const { client } = fake({
    store: ' Home Depot ', number: '0042', date: '2026-02-30', taxCents: 312, totalCents: 4312,
    items: [{ name: 'PVC elbow 1/2"', cents: 1000, unclear: false }, { name: 'Smudged', cents: 3000, unclear: true },
      { name: 'Refund', cents: -500, unclear: false }, { name: '', cents: 100, unclear: false }],
  });
  assertEquals(await run(client, 'receipt', { images: [photo] }), {
    store: 'Home Depot', number: '0042', date: null, taxCents: 312, totalCents: 4312,
    items: [{ name: 'PVC elbow 1/2"', costCents: 1000, unclear: false }, { name: 'Smudged', costCents: 3000, unclear: true }],
  });
});

Deno.test('receipt: needs one or two photos', () => {
  for (const images of [[], [photo, photo, photo]]) {
    let refused = false;
    try {
      checkInput('receipt', { images });
    } catch (e) {
      refused = e instanceof AiError && e.status === 400;
    }
    assertEquals(refused, true);
  }
});

const changeInput = { lang: 'en', title: 'Kitchen', note: 'add outlet in garage for $150', agreed: [], items };

Deno.test('change: a description, list items with quantities, and only a stated price', async () => {
  const { client } = fake({ description: ' Add one outlet in the garage. ', items: [{ itemId: 'trip', qty: 1 }, { itemId: 'gold', qty: 1 }], statedCents: 15000 });
  assertEquals(await run(client, 'change', changeInput), {
    description: 'Add one outlet in the garage.', quantities: [{ itemId: 'trip', qtyHundredths: 100 }], statedCents: 15000,
  });
  const none = fake({ description: 'Add an outlet.', items: [], statedCents: -1 });
  assertEquals((await run(none.client, 'change', changeInput) as { statedCents: unknown }).statedCents, null);
});

Deno.test('change: an empty note is refused before anything is sent', () => {
  let refused = false;
  try {
    checkInput('change', { ...changeInput, note: '   ' });
  } catch (e) {
    refused = e instanceof AiError;
  }
  assertEquals(refused, true);
});

const commandInput = {
  lang: 'en', text: 'add 2 hours and a $40 faucet to the Smith job',
  jobs: [{ id: 'smith', title: 'Bathroom faucet', customer: 'Ann Smith', address: '12 Oak St' }],
  items,
};
const action = { jobId: null, hours: null, description: null, qty: null, cents: null, itemId: null, kind: null, text: null };

Deno.test('command: hours, work and notes on known jobs only', async () => {
  const { client } = fake({ actions: [
    { ...action, type: 'hours', jobId: 'smith', hours: 2 },
    { ...action, type: 'work', jobId: 'smith', description: 'Faucet', qty: 1, cents: 4000, kind: 'material' },
    { ...action, type: 'work', jobId: 'jones', itemId: 'trip', qty: null },
    { ...action, type: 'note', jobId: 'smith', text: 'Customer wants a quote for the tub.' },
  ] });
  assertEquals(await run(client, 'command', commandInput), { actions: [
    { type: 'hours', jobId: 'smith', hundredths: 200, note: '' },
    { type: 'work', jobId: 'smith', description: 'Faucet', qtyHundredths: 100, unitCents: 4000, itemId: null, kind: 'material' },
    { type: 'work', jobId: null, description: 'Trip fee', qtyHundredths: 100, unitCents: null, itemId: 'trip', kind: 'labor' },
    { type: 'note', jobId: 'smith', text: 'Customer wants a quote for the tub.' },
  ] });
});

Deno.test('command: drops impossible hours, empty work, and empty notes', async () => {
  const { client } = fake({ actions: [
    { ...action, type: 'hours', jobId: 'smith', hours: 200 },
    { ...action, type: 'hours', jobId: 'smith', hours: 0 },
    { ...action, type: 'work', jobId: 'smith', description: '  ' },
    { ...action, type: 'note', jobId: 'smith', text: '' },
  ] });
  assertEquals(await run(client, 'command', commandInput), { actions: [] });
});

Deno.test('tags: one per photo, in order; a mismatched answer is not used', async () => {
  const input = { title: 'Deck repair', images: [photo, photo] };
  assertEquals(await run(fake({ tags: ['before', null] }).client, 'tags', input), { tags: ['before', null] });
  assertEquals(await run(fake({ tags: ['after'] }).client, 'tags', input), { tags: [null, null] });
});
