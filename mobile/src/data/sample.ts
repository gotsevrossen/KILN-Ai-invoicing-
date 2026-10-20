import type {
  Business,
  ChangeOrder,
  Customer,
  CustomerEstimate,
  EstimateDraft,
  EstimateLine,
  Invoice,
  Job,
  PriceItem,
  Receipt,
  TimeEntry,
  TimelineItem,
} from './types';

// Example data so every screen can be tried before sign-in and saving exist.
// "Today" in the examples is Oct 19, 2026. All names are made up.

export const TODAY = '2026-10-19';

export const business: Business = {
  name: 'Rivera Home Repair',
  phone: '(555) 014-2290',
  markupBps: 2000,
  tax: { rateBps: 700, labor: false, materials: false },
  dueDays: 15,
  depositBps: 3000,
  pendingUploads: 3,
};

export const customers: Customer[] = [
  { id: 'linda', name: 'Linda Park', firstName: 'Linda', phone: '(555) 010-4412', lang: 'en' },
  { id: 'tom', name: 'Tom Walsh', firstName: 'Tom', phone: '(555) 010-8810', lang: 'en' },
  { id: 'kevin', name: 'Kevin Lee', firstName: 'Kevin', phone: '(555) 010-5252', lang: 'en' },
  { id: 'maria', name: 'María Gómez', firstName: 'María', phone: '(555) 010-1515', lang: 'es' },
  { id: 'maple', name: 'Maple Court Apartments', firstName: 'Maple Court', phone: '(555) 010-1200', lang: 'en' },
  { id: 'ana', name: 'Ana Ortega', firstName: 'Ana', phone: '(555) 010-0909', lang: 'es' },
  { id: 'david', name: 'David Chen', firstName: 'David', phone: '(555) 010-3010', lang: 'en' },
  { id: 'sofia', name: 'Sofia Reyes', firstName: 'Sofia', phone: '(555) 010-7777', lang: 'es' },
];

export const jobs: Job[] = [
  {
    id: 'park',
    title: 'Park bathroom faucet',
    customerId: 'linda',
    address: '412 Elm St',
    pricing: 'hourly',
    rateCents: 8500,
    group: 'active',
    baseStatus: 'live',
    privateNote: 'Gate code 4412. Dog in the yard.',
  },
  {
    id: 'walsh',
    title: 'Walsh deck repair',
    customerId: 'tom',
    address: '88 Ridge Rd',
    pricing: 'flat',
    group: 'active',
    baseStatus: 'live',
  },
  {
    id: 'lee',
    title: 'Lee porch steps',
    customerId: 'kevin',
    address: '52 Cedar St',
    pricing: 'flat',
    group: 'active',
    baseStatus: 'live',
  },
  {
    id: 'gomez',
    title: 'Gómez fence repair',
    customerId: 'maria',
    address: '15 Birch Ln',
    pricing: 'flat',
    group: 'active',
    baseStatus: 'estimateSent',
  },
  {
    id: 'maple-2b',
    title: 'Maple Court, Apt 2B',
    customerId: 'maple',
    address: '1200 Maple Ct, Apt 2B',
    pricing: 'flat',
    group: 'active',
    baseStatus: 'overdue',
    amountCents: 125000,
    overdueDays: 9,
    workOrder: '3318',
  },
  {
    id: 'ortega',
    title: 'Ortega yard, weekly',
    customerId: 'ana',
    address: '9 Pine St',
    pricing: 'flat',
    group: 'done',
    baseStatus: 'repeat',
    amountCents: 5500,
    repeatWeekday: 1,
  },
  {
    id: 'chen',
    title: 'Chen water heater',
    customerId: 'david',
    address: '301 Oak Ave',
    pricing: 'flat',
    group: 'done',
    baseStatus: 'viewed',
    amountCents: 148000,
  },
  {
    id: 'reyes',
    title: 'Reyes kitchen outlets',
    customerId: 'sofia',
    address: '77 Lake Dr',
    pricing: 'flat',
    group: 'paid',
    baseStatus: 'paid',
    amountCents: 64000,
  },
  {
    id: 'maple-4c',
    title: 'Maple Court, Apt 4C',
    customerId: 'maple',
    address: '1200 Maple Ct, Apt 4C',
    pricing: 'flat',
    group: 'paid',
    baseStatus: 'paid',
    amountCents: 91000,
    workOrder: '3290',
  },
];

export const timeEntries: TimeEntry[] = [
  { id: 't1', jobId: 'park', date: TODAY, hundredths: 250, note: 'Install and test' },
];

export const timeline: TimelineItem[] = [
  { kind: 'photos', id: 'p1', jobId: 'park', date: TODAY, time: '2:14 PM', tags: ['before', 'during', 'after'] },
  {
    kind: 'voice',
    id: 'v1',
    jobId: 'park',
    date: TODAY,
    time: '1:50 PM',
    length: '0:42',
    transcript: 'Old shutoff valve under the sink was seized, so I replaced it. New faucet and supply lines are in. No leaks.',
  },
  {
    kind: 'voice',
    id: 'v3',
    jobId: 'lee',
    date: TODAY,
    time: '9:10 AM',
    length: '0:38',
    transcript: 'Rebuild the front porch steps, three steps, about four feet wide. Probably a full day. Haul away the old wood.',
  },
  { kind: 'photos', id: 'p3', jobId: 'lee', date: TODAY, time: '9:12 AM', tags: ['before', 'before'] },
  { kind: 'photos', id: 'p2', jobId: 'walsh', date: '2026-10-18', time: '10:05 AM', tags: ['before', 'before', 'during', 'during'] },
  {
    kind: 'voice',
    id: 'v2',
    jobId: 'walsh',
    date: '2026-10-18',
    time: '10:20 AM',
    length: '1:05',
    transcript: 'Two joists under the stairs are rotted. Need to replace those. Also haul away the old boards.',
  },
];

export const receipts: Receipt[] = [
  {
    id: 'hd-4471',
    store: 'Home Depot',
    number: '4471',
    date: TODAY,
    taxCents: 1390,
    items: [
      { id: 'hd-1', line: 1, name: 'Faucet supply lines', qtyLabel: '× 2', costCents: 1896, likelyJobIds: ['park'] },
      { id: 'hd-2', line: 2, name: '1/2 in. shutoff valve', qtyLabel: '× 1', costCents: 1248, likelyJobIds: ['park'] },
      { id: 'hd-3', line: 3, name: '2x6x8 pressure-treated', qtyLabel: '× 6', costCents: 5982, likelyJobIds: ['walsh'] },
      { id: 'hd-4', line: 4, name: 'Joist hangers', qtyLabel: '× 10', costCents: 2190, likelyJobIds: ['walsh'] },
      { id: 'hd-5', line: 5, name: 'Line 5 (unclear)', qtyLabel: '', costCents: 7544, flagged: true, likelyJobIds: [] },
      { id: 'hd-6', line: 6, name: 'Shop towels', qtyLabel: '× 1', costCents: 998, likelyJobIds: [] },
    ],
  },
  {
    id: 'fg-2210',
    store: 'Ferguson',
    number: '2210',
    date: '2026-10-17',
    taxCents: 0,
    items: [{ id: 'fg-1', line: 1, name: 'Moen single-handle faucet', qtyLabel: '× 1', costCents: 12399, likelyJobIds: ['park'] }],
  },
];

/** Receipt items already sorted before the owner opened the app today. */
export const initialAssignments: Record<string, string[]> = {
  'hd-1': ['park'],
  'hd-2': ['park'],
  'fg-1': ['park'],
};

export const priceList: PriceItem[] = [
  { id: 'deck-board', name: 'Replace deck boards', unit: 'board', unitCents: 2400 },
  { id: 'railing', name: 'Repair railing', unit: 'linear_ft', unitCents: 1800 },
  { id: 'wash-seal', name: 'Wash and seal deck', unit: 'sq_ft', unitCents: 110 },
  { id: 'trip', name: 'Trip fee', unit: 'flat', unitCents: 4500 },
  { id: 'labor', name: 'Hourly labor', unit: 'hour', unitCents: 8500 },
  { id: 'fence-repair', name: 'Fence repair', unit: 'linear_ft', unitCents: 2200 },
  { id: 'fence-paint', name: 'Fence painting', unit: 'linear_ft', unitCents: 600 },
];

export const invoices: Invoice[] = [
  {
    id: 'inv-1042',
    number: '1042',
    jobId: 'park',
    laborDescription: 'Install faucet, test for leaks',
    fees: [{ id: 'fee-trip', kind: 'fee', description: 'Trip fee', qtyHundredths: 100, unitCents: 4500 }],
    materialItemIds: ['fg-1', 'hd-1'],
    suggestion: { id: 's-valve', title: 'Shutoff valve', reasonKey: 'invoice.missedValve', receiptItemId: 'hd-2' },
    summary: 'Replaced the seized shutoff valve under the sink. Installed a new single-handle faucet with new supply lines. Tested, no leaks.',
    sources: { photos: 3, voice: 1, receipts: 2 },
  },
];

export const changeOrders: ChangeOrder[] = [
  {
    id: 'co-2',
    number: 2,
    jobId: 'walsh',
    description: 'Replace 2 rotted joists found under the stairs. Includes lumber, joist hangers, and labor.',
    amountCents: 45000,
    baseCents: 127200,
  },
];

export const customerEstimates: CustomerEstimate[] = [
  {
    id: 'e-208',
    number: 'E-208',
    jobId: 'gomez',
    goodUntil: '2026-11-02',
    lines: [
      { id: 'l1', kind: 'labor', description: 'Reparación de cerca', qtyHundredths: 4000, unitCents: 2200, unit: 'linear_ft' },
      { id: 'l2', kind: 'labor', description: 'Pintura de cerca', qtyHundredths: 4000, unitCents: 600, unit: 'linear_ft' },
    ],
  },
];

/** Walsh deck: estimate already signed. */
const walshEstimateLines: EstimateLine[] = [
  { id: 'w1', priceItemId: 'deck-board', description: 'Replace deck boards', unit: 'board', qtyHundredths: 1800, unitCents: 2400 },
  { id: 'w2', priceItemId: 'railing', description: 'Repair railing', unit: 'linear_ft', qtyHundredths: 3200, unitCents: 1800 },
  { id: 'w3', priceItemId: 'wash-seal', description: 'Wash and seal deck', unit: 'sq_ft', qtyHundredths: 24000, unitCents: 110 },
];

/** Lee porch steps: draft not sent yet. The haul-away came from a voice note and has no price. */
const leeEstimateLines: EstimateLine[] = [
  { id: 'l1', priceItemId: 'labor', description: 'Rebuild porch steps', unit: 'hour', qtyHundredths: 800, unitCents: 8500 },
  { id: 'l2', description: 'Haul away old wood', unit: 'flat', qtyHundredths: 100, unitCents: null, fromVoice: true },
];

export const initialEstimates: Record<string, EstimateDraft> = {
  walsh: { lines: walshEstimateLines, depositOn: true, depositBps: 3000, sent: true, signed: true },
  lee: { lines: leeEstimateLines, depositOn: true, depositBps: 3000, sent: false, signed: false },
};
