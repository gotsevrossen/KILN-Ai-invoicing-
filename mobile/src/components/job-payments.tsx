import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Share, View } from 'react-native';
import { createJobPaymentRequest, loadJobPayments, jobPaymentLink, confirmJobCash, type JobPayment, type JobPaymentRequest } from '@/data/job-payments';
import { currentState, useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { jobPaymentCopy } from '@/i18n/job-payment-copy';
import { useFormat } from '@/lib/format';
import { Button, Card, Field, Notice, T } from './ui';

/** Server-confirmed requests and cash. No optimistic payment writes. */
export function JobPayments({jobId}:{jobId:string}) {
 const {state}=useStore();
 return <JobPaymentsEditor key={`${state.mode}:${state.businessId}:${jobId}`} jobId={jobId}/>;
}
function JobPaymentsEditor({jobId}:{jobId:string}) {
 const {lang}=useLang();const c=jobPaymentCopy[lang];const f=useFormat();const {state,actions}=useStore();
 const [rows,setRows]=useState<{requests:JobPaymentRequest[];payments:JobPayment[]}>({requests:[],payments:[]});
 const [label,setLabel]=useState('');const [amount,setAmount]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState(false);const [cash,setCash]=useState<string|null>(null);
 const requestKey=useRef<{key:string;id:string}|null>(null);
 const reload=useCallback(async()=>{try{const data=await loadJobPayments(jobId);setRows(data);setError(false);}catch{setError(true);}},[jobId]);
 useEffect(()=>{if(state.mode!=='connected')return;let live=true;loadJobPayments(jobId).then(data=>{if(live)setRows(data);},()=>{if(live)setError(true);});return()=>{live=false;};},[jobId,state.mode]);
 const run=async(work:()=>Promise<void>)=>{if(busy||currentState().businessId!==state.businessId)return;setBusy(true);setError(false);try{await work();await reload();await actions.refreshPay();}catch{setError(true);}finally{setBusy(false);}};
 const request=async(kind:'deposit'|'milestone')=>{
 const text=kind==='deposit'?c.deposit:label.trim();const cents=kind==='deposit'?0:Math.round(Number(amount.replace(',','.'))*100);
 if(kind==='milestone'&&(!/^\d{1,6}([.,]\d{1,2})?$/.test(amount)||cents<=0||!text)) {setError(true);return;}
 const key=`${jobId}:${kind}:${text}:${cents}`;
 if(requestKey.current?.key!==key)requestKey.current={key,id:Crypto.randomUUID()};
 await createJobPaymentRequest(requestKey.current.id,jobId,kind,cents,text);
 requestKey.current=null;setLabel('');setAmount('');
 };
 if(state.mode!=='connected')return <Notice text={c.sign}/>;
 return <Card style={{gap:12}}><T v="h2">{c.title}</T><T v="small" muted>{c.help}</T>
 {error?<Notice text={c.failed}/>:null}
 {rows.requests.map(r=>{const payment=rows.payments.find(p=>p.request_id===r.id);return <View key={r.id} style={{gap:8}}>
 <T v="label">{r.label} · {f.money(r.amount_cents)}</T><T v="small">{payment?.status==='succeeded'?c.paid:payment?.status==='processing'?c.pending:c.requested}</T>
 {!payment||payment.status==='failed'?<>
 <Button label={c.share} disabled={busy} variant="outline" onPress={()=>void run(async()=>{const url=await jobPaymentLink(r.id);await Share.share({message:url});})}/>
 {r.intent_method ? <Notice text={c.onlineStarted} tone="soft"/> : cash===r.id?<><Button label={c.confirm} disabled={busy} onPress={()=>void run(async()=>{await confirmJobCash(r.id);setCash(null);})}/><Button label={c.cancel} variant="outline" onPress={()=>setCash(null)}/></>:<Button label={c.cash} disabled={busy} variant="outline" onPress={()=>setCash(r.id)}/>}
 </>:null}</View>;})}
 {!rows.requests.some(r=>r.kind==='deposit')?<Button label={c.deposit} disabled={busy} variant="outline" onPress={()=>void run(()=>request('deposit'))}/>:null}
 <Field label={c.label} value={label} onChangeText={setLabel}/><Field label={c.amount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/>
 <Button label={c.milestone} disabled={busy||!label.trim()||!amount} onPress={()=>void run(()=>request('milestone'))}/><Button label={c.reload} disabled={busy} variant="outline" onPress={()=>void reload()}/>
 </Card>;
}
