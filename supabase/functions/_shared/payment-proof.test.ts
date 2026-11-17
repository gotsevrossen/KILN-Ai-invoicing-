import { validPaymentProof } from './payment-proof.ts';
Deno.test('only full received USD is confirmed; processing does not pretend money arrived',()=>{
 const ok=(value:boolean)=>{if(!value)throw new Error('invalid payment proof accepted or valid proof rejected');};
 ok(validPaymentProof({amount:30000,amount_received:30000,currency:'usd'},'succeeded'));
 ok(!validPaymentProof({amount:30000,amount_received:0,currency:'usd'},'succeeded'));
 ok(!validPaymentProof({amount:30000,amount_received:30000,currency:'eur'},'succeeded'));
 ok(!validPaymentProof({amount:1.5,amount_received:1.5,currency:'usd'},'succeeded'));
 ok(validPaymentProof({amount:30000,amount_received:0,currency:'usd'},'processing'));
});
