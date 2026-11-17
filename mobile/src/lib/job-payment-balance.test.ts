import assert from 'node:assert/strict';
import test from 'node:test';
import { jobCredits } from './job-payment-balance.ts';
test('deposit and milestone credit the final job once, with pending shown separately',()=>{
 const deposit={id:'a',jobId:'j',invoiceId:'i',amountCents:30000,status:'succeeded' as const};
 const rows=[deposit,deposit,{id:'b',jobId:'j',amountCents:20000,status:'processing' as const},{id:'c',jobId:'other',amountCents:90000,status:'succeeded' as const},{id:'d',jobId:'j',amountCents:10000,status:'failed' as const}];
 assert.deepEqual(jobCredits(rows,'j','i'),{paid:30000,pending:20000});
});
test('legacy invoice-only payment still counts; missing linkage and invalid amounts do not',()=>{
 assert.deepEqual(jobCredits([{id:'a',invoiceId:'i',amountCents:100,status:'succeeded'},{id:'b',amountCents:900,status:'succeeded'},{id:'c',jobId:'j',amountCents:-100,status:'succeeded'}],'j','i'),{paid:100,pending:0});
});
