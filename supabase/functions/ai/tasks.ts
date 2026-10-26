import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

// What KILN asks Claude, and the checks on every answer before it goes back to the app.
// Rules (CLAUDE.md): the AI drafts, the owner approves. It never makes up prices, only
// picks from the owner's own trades and price list, and says nothing when it isn't sure.

export const MODEL = 'claude-haiku-5-5';

/** A refusal the app can show: `code` is a short word the app translates. */
export class AiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

// ---------------------------------------------------------------- what the app sends

const lang = z.enum(['en', 'es']);
const unit = z.enum(['sq_ft', 'board', 'linear_ft', 'hour', 'flat', 'each', 'cu_yd']);
const id = z.string().min(1).max(120);
const text = (max: number) => z.string().max(max);
const item = z.object({ id, name: text(160), unit });
const items = z.array(item).max(400);
const image = z.object({
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  // about 5 MB once decoded, Claude's limit per image
  data: z.string().min(1).max(7_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

export const inputs = {
  /** Job type and quantities from the job's title and notes. */
  guess: z.object({
    title: text(200),
    note: text(2000),
    notes: z.array(text(2000)).max(20),
    hourly: z.boolean(),
    trades: z.array(z.object({ id, name: text(80), jobTypes: z.array(z.object({ id, name: text(80) })).max(20) })).min(1).max(10),
    items,
  }),
  /** Price list items an estimate like this usually has, that this one doesn't. */
  missed: z.object({
    lang,
    title: text(200),
    jobType: text(80),
    lines: z.array(z.object({ description: text(300), excluded: z.boolean() })).max(100),
    items,
  }),
  /** The job description the customer reads, in the customer's language. */
  scope: z.object({
    lang,
    title: text(200),
    jobType: text(80),
    draft: text(2000),
    location: text(300),
    lines: z.array(z.object({ description: text(300), qty: text(40) })).max(100),
    excluded: z.array(text(300)).max(100),
  }),
  /** Prices read from the owner's old invoices or price sheets (photos or pasted text). */
  prices: z.object({
    text: text(20000),
    images: z.array(image).max(3),
    items,
  }).refine((x) => x.text.trim().length > 0 || x.images.length > 0),
  /** Before / during / after for new job photos (small copies). */
  tags: z.object({ title: text(200), images: z.array(image).min(1).max(10) }),
  /** A store receipt read from photos (a long receipt can take two). */
  receipt: z.object({ images: z.array(image).min(1).max(2) }),
  /** A change order drafted from the owner's quick note, priced from their own list by the app. */
  change: z.object({
    lang,
    title: text(200),
    note: text(2000).refine((s) => s.trim().length > 0),
    agreed: z.array(text(300)).max(100),
    items,
  }),
  /** "Add 2 hours and a $40 faucet to the Smith job" turned into actions the owner confirms. */
  command: z.object({
    lang,
    text: text(1000).refine((s) => s.trim().length > 0),
    jobs: z.array(z.object({ id, title: text(200), customer: text(120), address: text(300) })).max(100),
    items,
  }),
};

export type Task = keyof typeof inputs;
// own keys only: 'constructor' or 'toString' are "in" every object
export const isTask = (t: unknown): t is Task => typeof t === 'string' && Object.hasOwn(inputs, t);

// ---------------------------------------------------------------- asking Claude

const LANGUAGE = { en: 'English', es: 'Spanish (as spoken in the US)' };

/** z.enum needs at least one value; with none, any string (the checks below drop it). */
const oneOf = (values: string[]) => (values.length ? z.enum(values as [string, ...string[]]) : z.string());

async function ask<S extends z.ZodType>(
  client: Anthropic,
  opts: { system: string; content: Anthropic.ContentBlockParam[]; schema: S; effort: 'low' | 'medium'; maxTokens: number },
): Promise<z.infer<S>> {
  let res;
  try {
    res = await client.messages.parse({
      model: MODEL,
      max_tokens: opts.maxTokens,
      system: opts.system,
      output_config: { effort: opts.effort, format: zodOutputFormat(opts.schema) },
      messages: [{ role: 'user', content: opts.content }],
    });
  } catch (e) {
    // the answer didn't match the shape asked for (API errors are handled by the caller)
    if (e instanceof Anthropic.AnthropicError && !(e instanceof Anthropic.APIError)) throw new AiError(502, 'unreadable');
    throw e;
  }
  if (res.stop_reason === 'refusal') throw new AiError(422, 'refused');
  if (res.stop_reason === 'max_tokens' || res.parsed_output == null) throw new AiError(502, 'unreadable');
  return res.parsed_output as z.infer<S>;
}

const data = (label: string, value: unknown): Anthropic.TextBlockParam => ({ type: 'text', text: `<${label}>\n${JSON.stringify(value)}\n</${label}>` });

/** 2.5 -> 250. Above 0, at most 1,000,000. Anything else -> null. */
function hundredths(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  const h = Math.round(n * 100);
  return h > 0 ? h : null;
}

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12,
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12, docena: 12,
};

/** Every number the owner wrote (450, 2.5, "1,200", "two", "dos"), in hundredths. */
export function numbersIn(text: string): Set<number> {
  const found = new Set<number>();
  for (const m of text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?/g)) {
    // "1,200" is twelve hundred; "2,5" (Spanish) is two and a half
    const raw = /^\d{1,3}(,\d{3})+/.test(m[0]) ? m[0].replace(/,/g, '') : m[0].replace(',', '.');
    found.add(Math.round(Number(raw) * 100));
  }
  for (const word of text.toLowerCase().split(/[^a-záéíóúñ]+/)) if (WORDS[word]) found.add(WORDS[word] * 100);
  return found;
}

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);

// ---------------------------------------------------------------- the tasks

const GUESS = `You help the owner of a small trades business (plumbing, electrical, painting, lawn care and similar) start an estimate. You get the job title and the owner's notes, the job types they offer, and their price list items (names and units only).

Pick the one job type that best fits the work described. If the text doesn't make it clear, use null: no guess is better than a wrong one.

Then list the price list items the job clearly needs, with a quantity:
- Use a number only when the text states it for that item ("400 sq ft", "3 outlets", "about 2 hours"). Convert only when it's direct ("a dozen" is 12).
- If the text names work that matches a flat-price or per-each item but gives no count, use 1.
- Leave out items charged by area, length, volume, or the hour when the text gives no number. Never estimate a measurement.
- Only use items from the list. Leave the list empty when nothing matches.
The text may be in English, Spanish, or both.`;

async function guess(client: Anthropic, input: z.infer<typeof inputs.guess>) {
  const jobTypes = input.trades.flatMap((t) => t.jobTypes.map((jt) => ({ key: `${t.id}/${jt.id}`, trade: t.name, jobType: jt.name })));
  const itemIds = input.items.map((i) => i.id);
  const out = await ask(client, {
    system: GUESS,
    content: [
      data('job', { title: input.title, note: input.note, notes: input.notes, billed: input.hourly ? 'by the hour' : 'flat price' }),
      data('job_types', jobTypes),
      data('price_list', input.items),
    ],
    schema: z.object({
      jobType: oneOf(jobTypes.map((j) => j.key)).nullable(),
      items: z.array(z.object({ itemId: oneOf(itemIds), qty: z.number() })),
    }),
    effort: 'low',
    maxTokens: 4000,
  });
  // a measurement (area, length, volume, hours) only counts when that number is in the owner's text
  const measured = new Set(input.items.filter((i) => ['sq_ft', 'linear_ft', 'cu_yd', 'hour'].includes(i.unit)).map((i) => i.id));
  const said = numbersIn([input.title, input.note, ...input.notes].join(' '));

  const [tradeId, jobTypeId] = out.jobType && jobTypes.some((j) => j.key === out.jobType) ? out.jobType.split('/') : [null, null];
  const seen = new Set<string>();
  const quantities: { itemId: string; qtyHundredths: number }[] = [];
  for (const x of out.items) {
    const qty = hundredths(x.qty);
    if (!itemIds.includes(x.itemId) || seen.has(x.itemId) || qty === null || (measured.has(x.itemId) && !said.has(qty))) continue;
    seen.add(x.itemId);
    quantities.push({ itemId: x.itemId, qtyHundredths: qty });
  }
  return { tradeId, jobTypeId, quantities: quantities.slice(0, 20) };
}

const MISSED = (language: string) => `You check a small trades business owner's estimate for items they often forget. You get the job, the lines already on the estimate, and the rest of their price list.

Suggest at most 3 items from the price list that a job like this usually needs and that are missing, such as haul-away after removing old material, or a trip fee on a service call. Excluded lines were left out on purpose: never suggest them again. When nothing is clearly missing, return an empty list; that is a good answer. Never suggest work the job doesn't need.

For each item, give a short reason (under 15 words) in ${language}, written to the owner.`;

async function missed(client: Anthropic, input: z.infer<typeof inputs.missed>) {
  if (!input.items.length || !input.lines.length) return { items: [] };
  const itemIds = input.items.map((i) => i.id);
  const out = await ask(client, {
    system: MISSED(LANGUAGE[input.lang]),
    content: [
      data('job', { title: input.title, jobType: input.jobType }),
      data('estimate_lines', input.lines),
      data('price_list', input.items),
    ],
    schema: z.object({ items: z.array(z.object({ itemId: oneOf(itemIds), reason: z.string() })) }),
    effort: 'low',
    maxTokens: 2000,
  });
  const seen = new Set<string>();
  const result: { itemId: string; reason: string }[] = [];
  for (const x of out.items) {
    const reason = clean(x.reason, 160);
    if (!itemIds.includes(x.itemId) || seen.has(x.itemId) || !reason) continue;
    seen.add(x.itemId);
    result.push({ itemId: x.itemId, reason });
  }
  return { items: result.slice(0, 3) };
}

const SCOPE = (language: string) => `You write the job description a homeowner or property manager reads on an estimate from a small trades business. Write in ${language}.

Use only the facts given: the job, the owner's rough notes, the location, and the line items. Write 1 to 4 short sentences, plain and professional, describing the work that will be done and where. Mention excluded work only when it is listed as excluded.

Do not include prices, totals, payment terms, warranties, guarantees, legal terms, dates, or promises. Do not add materials, brands, sizes, or steps that aren't in the input. Return only the description.`;

async function scope(client: Anthropic, input: z.infer<typeof inputs.scope>) {
  const out = await ask(client, {
    system: SCOPE(LANGUAGE[input.lang]),
    content: [data('job', {
      title: input.title,
      jobType: input.jobType,
      ownerNotes: input.draft,
      location: input.location,
      lines: input.lines,
      excluded: input.excluded,
    })],
    schema: z.object({ text: z.string() }),
    effort: 'low',
    maxTokens: 2000,
  });
  const result = out.text.trim();
  // too long to be what was asked for: don't send the owner a wall of text to fix
  if (!result || result.length > 1500) throw new AiError(502, 'unreadable');
  return { text: result };
}

const PRICES = `You read old invoices, estimates, or price sheets from a small trades business and pull out the business's own prices, so the owner can fill in their price list.

For each service or item with a price:
- name: a short item name in the document's language. Never include customer names, addresses, dates, or invoice numbers.
- unit: how it's charged: hour, sq_ft, linear_ft, each, board, cu_yd, or flat for a set price.
- cents: the price for one unit, in cents (45.50 is 4550). If a line shows a quantity and a total but no unit price, divide the total by the quantity.
- matchId: the id of the owner's existing price list item when it is clearly the same service; otherwise null.
- unclear: true when you can't read the name or price with confidence.

Skip subtotals, totals, taxes, discounts, deposits, payments, tips, and balances due. List each item once; if it appears with different prices, use the most common one and mark it unclear. Return an empty list if there are no prices.`;

async function prices(client: Anthropic, input: z.infer<typeof inputs.prices>) {
  const itemIds = input.items.map((i) => i.id);
  const content = photos(input.images);
  if (input.text.trim()) content.push(data('pasted_text', input.text));
  content.push(data('price_list', input.items));
  const out = await ask(client, {
    system: PRICES,
    content,
    schema: z.object({
      prices: z.array(z.object({ name: z.string(), unit, cents: z.number().int(), matchId: oneOf(itemIds).nullable(), unclear: z.boolean() })),
    }),
    effort: 'medium',
    maxTokens: 16000,
  });
  const matched = new Set<string>();
  const result: { name: string; unit: z.infer<typeof unit>; unitCents: number; matchId: string | null; unclear: boolean }[] = [];
  for (const x of out.prices) {
    const name = clean(x.name, 160);
    if (!name || !Number.isSafeInteger(x.cents) || x.cents < 0 || x.cents > 100_000_000) continue;
    // one price per existing item; a second match becomes its own new item
    const matchId = x.matchId && itemIds.includes(x.matchId) && !matched.has(x.matchId) ? x.matchId : null;
    if (matchId) matched.add(matchId);
    result.push({ name, unit: x.unit, unitCents: x.cents, matchId, unclear: x.unclear });
  }
  return { prices: result.slice(0, 150) };
}

const photos = (images: z.infer<typeof image>[]): Anthropic.ContentBlockParam[] => images.map((img) => ({
  type: 'image',
  source: { type: 'base64', media_type: img.mediaType, data: img.data },
}));

/** "2026-10-20" if it's a real day, else null. */
function isoDay(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

const cents = (n: number | null): number | null => (n !== null && Number.isSafeInteger(n) && n >= 0 && n <= 100_000_000 ? n : null);

const RECEIPT = `You read a store receipt for a small trades business owner, so they can sort each item to the job it was bought for. The photos may be two parts of one long receipt.

Return:
- store: the store name as printed.
- number: the receipt or transaction number, or an empty string.
- date: the purchase date as YYYY-MM-DD, or null if you can't read it.
- items: every purchased line, in order. name: the item as printed, made readable (expand obvious abbreviations, keep sizes and part numbers). cents: what was paid for that line before sales tax, in cents, after any discount printed for that line. unclear: true when you can't read the name or price with confidence.
- taxCents: the total sales tax, in cents (0 if none).
- totalCents: the receipt's final total in cents, or null if you can't read it.

Leave out subtotals, totals, tax lines, payment and change lines, returned items, and loyalty or coupon summaries. Never guess a price you can't read: give your best reading and mark it unclear.`;

async function receipt(client: Anthropic, input: z.infer<typeof inputs.receipt>) {
  const out = await ask(client, {
    system: RECEIPT,
    content: photos(input.images),
    schema: z.object({
      store: z.string(),
      number: z.string(),
      date: z.string().nullable(),
      items: z.array(z.object({ name: z.string(), cents: z.number().int(), unclear: z.boolean() })),
      taxCents: z.number().int(),
      totalCents: z.number().int().nullable(),
    }),
    effort: 'medium',
    maxTokens: 16000,
  });
  const items = out.items.flatMap((x) => {
    const name = clean(x.name, 160);
    const c = cents(x.cents);
    return name && c !== null ? [{ name, costCents: c, unclear: x.unclear }] : [];
  });
  return {
    store: clean(out.store, 120),
    number: clean(out.number, 60),
    date: isoDay(out.date),
    taxCents: cents(out.taxCents) ?? 0,
    totalCents: cents(out.totalCents),
    items: items.slice(0, 200),
  };
}

const CHANGE = (language: string) => `A small trades business owner is on a job and the customer wants a change. You get the owner's quick note, the work already agreed, and the owner's price list (names and units only).

Return:
- description: the change order text the customer will read and sign, in ${language}. 1 to 3 short, plain sentences saying what will be added, changed, or removed. Use only facts in the note. No prices, warranties, legal terms, dates, or promises.
- items: price list items this change clearly needs, with a quantity. Use a number only when the note states it; use 1 for flat-price or per-each work it names without a count; leave out items charged by area, length, or the hour when the note gives no number. Only items from the list.
- statedCents: if the note states the price of the change ("for $150", "add 200 dollars"), that amount in cents; otherwise null. Never work out or guess a price.`;

async function change(client: Anthropic, input: z.infer<typeof inputs.change>) {
  const itemIds = input.items.map((i) => i.id);
  const out = await ask(client, {
    system: CHANGE(LANGUAGE[input.lang]),
    content: [data('job', { title: input.title, agreedWork: input.agreed }), data('note', input.note), data('price_list', input.items)],
    schema: z.object({
      description: z.string(),
      items: z.array(z.object({ itemId: oneOf(itemIds), qty: z.number() })),
      statedCents: z.number().int().nullable(),
    }),
    effort: 'low',
    maxTokens: 3000,
  });
  const description = out.description.trim();
  if (!description || description.length > 2000) throw new AiError(502, 'unreadable');
  const seen = new Set<string>();
  const quantities: { itemId: string; qtyHundredths: number }[] = [];
  for (const x of out.items) {
    const qty = hundredths(x.qty);
    if (!itemIds.includes(x.itemId) || seen.has(x.itemId) || qty === null) continue;
    seen.add(x.itemId);
    quantities.push({ itemId: x.itemId, qtyHundredths: qty });
  }
  return { description, quantities: quantities.slice(0, 20), statedCents: cents(out.statedCents) };
}

const COMMAND = (language: string) => `A small trades business owner typed a quick instruction for their invoicing app. Turn it into actions for the owner to confirm. Each action is one of:
- hours: time worked. hours: the number of hours. text: what was done, if said, else null.
- work: work done or a material to bill. description: what it is, in ${language}. qty: how many (1 if not said). cents: the price for one, in cents, only if the owner said a price (if they said a total for several, divide); else null. itemId: the matching price list item, or null. kind: labor, material, or fee.
- note: anything else worth keeping on the job. text: the note.

jobId: the job the owner means, matched by title, customer name, or address. Use null when it isn't clear which job: never pick one at random. Unused fields are null.
Never invent work, hours, or prices the owner didn't say. If the text isn't an instruction, return a single note. At most 10 actions.`;

type Action =
  | { type: 'hours'; jobId: string | null; hundredths: number; note: string }
  | { type: 'work'; jobId: string | null; description: string; qtyHundredths: number; unitCents: number | null; itemId: string | null; kind: 'labor' | 'material' | 'fee' }
  | { type: 'note'; jobId: string | null; text: string };

async function command(client: Anthropic, input: z.infer<typeof inputs.command>) {
  const jobIds = input.jobs.map((j) => j.id);
  const itemIds = input.items.map((i) => i.id);
  const out = await ask(client, {
    system: COMMAND(LANGUAGE[input.lang]),
    content: [data('instruction', input.text), data('jobs', input.jobs), data('price_list', input.items)],
    schema: z.object({
      actions: z.array(z.object({
        type: z.enum(['hours', 'work', 'note']),
        jobId: oneOf(jobIds).nullable(),
        hours: z.number().nullable(),
        description: z.string().nullable(),
        qty: z.number().nullable(),
        cents: z.number().int().nullable(),
        itemId: oneOf(itemIds).nullable(),
        kind: z.enum(['labor', 'material', 'fee']).nullable(),
        text: z.string().nullable(),
      })),
    }),
    effort: 'low',
    maxTokens: 3000,
  });
  const actions = out.actions.flatMap((a): Action[] => {
    const jobId = a.jobId && jobIds.includes(a.jobId) ? a.jobId : null;
    if (a.type === 'hours') {
      const h = a.hours === null ? null : hundredths(a.hours);
      // a day's work at most, so "200 hours" can't slip through
      return h !== null && h <= 2400 ? [{ type: 'hours' as const, jobId, hundredths: h, note: clean(a.text ?? '', 200) }] : [];
    }
    if (a.type === 'work') {
      const itemId = a.itemId && itemIds.includes(a.itemId) ? a.itemId : null;
      const description = clean(a.description ?? '', 300) || input.items.find((i) => i.id === itemId)?.name || '';
      const qty = hundredths(a.qty ?? 1);
      return description && qty !== null
        ? [{ type: 'work' as const, jobId, description, qtyHundredths: qty, unitCents: cents(a.cents), itemId, kind: a.kind ?? 'labor' }]
        : [];
    }
    const note = clean(a.text ?? '', 2000);
    return note ? [{ type: 'note' as const, jobId, text: note }] : [];
  });
  return { actions: actions.slice(0, 10) };
}

const TAGS = `You sort a small trades business owner's job photos into before, during, or after the work, for proof of work on the customer's invoice. You get the job title and the photos in order.

For each photo, in the same order, give one tag:
- before: the problem or the space before work started (damage, leaks, old fixtures, an untouched yard).
- during: work in progress (open walls, tools out, parts half installed, materials laid out).
- after: the finished result (clean, installed, repaired).
- null: you can't tell, or it isn't a job photo (a receipt, a person, a screenshot).`;

async function tags(client: Anthropic, input: z.infer<typeof inputs.tags>) {
  const tag = z.enum(['before', 'during', 'after']).nullable();
  const out = await ask(client, {
    system: TAGS,
    content: [data('job', { title: input.title }), ...photos(input.images)],
    schema: z.object({ tags: z.array(tag) }),
    effort: 'low',
    maxTokens: 2000,
  });
  // one per photo, in order; a short or long answer can't be matched up, so none are used
  return { tags: out.tags.length === input.images.length ? out.tags : input.images.map(() => null) };
}

/** The request checked against its task's limits, or a 400. Checked before any request is counted. */
export function checkInput(task: Task, input: unknown): unknown {
  const parsed = inputs[task].safeParse(input);
  if (!parsed.success) throw new AiError(400, 'bad_request');
  return parsed.data;
}

export function runTask(client: Anthropic, task: Task, input: unknown) {
  switch (task) {
    case 'guess': return guess(client, input as z.infer<typeof inputs.guess>);
    case 'missed': return missed(client, input as z.infer<typeof inputs.missed>);
    case 'scope': return scope(client, input as z.infer<typeof inputs.scope>);
    case 'prices': return prices(client, input as z.infer<typeof inputs.prices>);
    case 'tags': return tags(client, input as z.infer<typeof inputs.tags>);
    case 'receipt': return receipt(client, input as z.infer<typeof inputs.receipt>);
    case 'change': return change(client, input as z.infer<typeof inputs.change>);
    case 'command': return command(client, input as z.infer<typeof inputs.command>);
  }
}
