import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StripePay } from '@/components/stripe-pay';
import { Button, Card, Notice, PageHeader, Screen, T } from '@/components/ui';
import { checkPayment } from '@/data/pay-page';
import { loadCollectionPage, type CollectionPage } from '@/data/job-payments';
import { useLang, useTFor } from '@/i18n';
import { jobPaymentCopy } from '@/i18n/job-payment-copy';
import { formatters } from '@/lib/format';

export default function CollectionRoute() {
 const {token}=useLocalSearchParams<{token:string}>();
 return <CollectionPageView key={token}/>;
}
function CollectionPageView() {
 const {token,payment_intent: returnedIntent}=useLocalSearchParams<{token:string;payment_intent?:string}>();
 const {lang}=useLang();const [page,setPage]=useState<CollectionPage|null>(null);const [error,setError]=useState(false);
 const customerLang=page?.customer.lang??lang;const c=jobPaymentCopy[customerLang];const tc=useTFor(customerLang);const f=formatters(customerLang);
 const reload=useCallback(async()=>{try{const result=await loadCollectionPage(token);if(!result?.request)throw new Error();setPage(result);setError(false);}catch{setError(true);}},[token]);
 useEffect(()=>{let live=true;(returnedIntent ? checkPayment(token, returnedIntent).then(() => loadCollectionPage(token)) : loadCollectionPage(token)).then(result=>{if(live)setPage(result);},()=>{if(live)setError(true);});return()=>{live=false;};},[token,returnedIntent]);
 useEffect(()=>{if(!page?.pending)return;const timer=setInterval(()=>void reload(),15000);return()=>clearInterval(timer);},[page?.pending,reload]);
 return <Screen header={<PageHeader title={c.collect}/>}>
 {error?<Notice text={c.unavailable}/>:null}
 {page?<>
 <T v="title">{page.business.name}</T><T v="body">{page.request.job}</T><T v="small">{page.request.address}</T>
 <Card><T v="h2">{page.request.label}</T><T v="money">{f.money(page.request.amountCents)}</T></Card>
 {page.paid?<Notice text={c.thanks}/>:page.pending?<Notice text={c.waiting}/>:page.pay?<StripePay token={token} pay={page.pay} amountCents={page.request.amountCents} amountText={f.money(page.request.amountCents)} lang={customerLang} tc={tc} onDone={()=>void reload()}/>:<Notice text={c.web}/>}
 </>:null}<Button label={c.reload} onPress={()=>void reload()} variant="outline"/>
 </Screen>;
}
