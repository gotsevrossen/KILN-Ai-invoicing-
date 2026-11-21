import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Share, View } from 'react-native';
import { createJobPaymentRequest, loadJobPayments, jobPaymentLink, confirmJobCash, type JobPayment, type JobPaymentRequest } from '@/data/job-payments';
import { onLiveRefresh } from '@/data/live-events';
import { currentState, useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { jobPaymentCopy } from '@/i18n/job-payment-copy';
import { useFormat } from '@/lib/format';
import { Button, Card, Notice, T } from './ui';

/** Server-confirmed requests and cash. No optimistic payment writes. */
export function JobPayments({jobId}:{jobId:string}) {
 const {state}=useStore();
 return <JobPaymentsEditor key={`${state.mode}:${state.businessId}:${jobId}`} jobId={jobId}/>;
}
function JobPaymentsEditor({jobId}:{jobId:string}) {
 const {lang}=useLang();const c=jobPaymentCopy[lang];const f=useFormat();const {state,actions}=useStore();
 const depositOn=!!state.estimates[jobId]?.depositOn;
 const [rows,setRows]=useState<{requests:JobPaymentRequest[];payments:JobPayment[]}>({requests:[],payments:[]});
 const [busy,setBusy]=useState(false);const [error,setError]=useState(false);const [cash,setCash]=useState<string|null>(null);
 const requestKey=useRef<{key:string;id:string}|null>(null);
 const reload=useCallback(async()=>{try{const data=await loadJobPayments(jobId);setRows(data);setError(false);}catch{setError(true);}},[jobId]);
 useEffect(()=>onLiveRefresh(()=>void reload()),[reload]);
 useEffect(()=>{if(state.mode!=='connected')return;let live=true;loadJobPayments(jobId).then(data=>{if(live)setRows(data);},()=>{if(live)setError(true);});return()=>{live=false;};},[jobId,state.mode]);
 const run=async(work:()=>Promise<void>)=>{if(busy||currentState().businessId!==state.businessId)return;setBusy(true);setError(false);try{await work();await reload();await actions.refreshPay();}catch{setError(true);}finally{setBusy(false);}};
 // Deposits only: milestone requests were removed (Nov 20). Older ones still show their status below.
 const request=async()=>{
 const key=`${jobId}:deposit`;
 if(requestKey.current?.key!==key)requestKey.current={key,id:Crypto.randomUUID()};
 // the server works out the agreed deposit from the signed estimate
 await createJobPaymentRequest(requestKey.current.id,jobId,'deposit',0,c.deposit);
 requestKey.current=null;
 };
 if(state.mode!=='connected')return depositOn?<Notice text={c.sign}/>:null;
 // nothing to show: no deposit on the estimate and nothing requested before
 if(!depositOn&&!rows.requests.length)return null;
 return <Card style={{gap:12}}><T v="h3">{c.title}</T>
 {error?<Notice text={c.failed}/>:null}
 {rows.requests.map(r=>{const payment=rows.payments.find(p=>p.request_id===r.id);return <View key={r.id} style={{gap:8}}>
 <T v="label">{r.label} · {f.money(r.amount_cents)}</T><T v="small">{payment?.status==='succeeded'?c.paid:payment?.status==='processing'?c.pending:c.requested}</T>
 {!payment||payment.status==='failed'?<>
 <Button label={c.share} disabled={busy} variant="outline" onPress={()=>void run(async()=>{const url=await jobPaymentLink(r.id);await Share.share({message:url});})}/>
 {r.intent_method ? <Notice text={c.onlineStarted} tone="soft"/> : cash===r.id?<><Button label={c.confirm} disabled={busy} onPress={()=>void run(async()=>{await confirmJobCash(r.id);setCash(null);})}/><Button label={c.cancel} variant="outline" onPress={()=>setCash(null)}/></>:<Button label={c.cash} disabled={busy} variant="outline" onPress={()=>setCash(r.id)}/>}
 </>:null}</View>;})}
 {depositOn&&!rows.requests.some(r=>r.kind==='deposit')?<Button label={c.deposit} disabled={busy} variant="outline" onPress={()=>void run(request)}/>:null}
 </Card>;
}
