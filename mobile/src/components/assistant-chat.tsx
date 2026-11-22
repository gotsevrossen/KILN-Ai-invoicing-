import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { KeyboardState, useAnimatedKeyboard, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/data/auth';
import { aiReady, askKiln } from '@/data/ai';
import { assistantInput, crewAssistantInput, type ChatMessage } from '@/data/assistant-context';
import { newUuid } from '@/data/db';
import { loadCrewJobs, loadCrewPriceList, type CrewJob, type CrewPriceItem } from '@/data/team-access';
import { useCrewOutboxIfCrew, type CrewCommand } from '@/features/team/crew-outbox';
import { invoiceForJob, jobById, receiptItemById } from '@/data/selectors';
import { currentState, useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { assistantCopy, fillIn } from '@/i18n/assistant';
import { needsOwnConfirm, stepReady, type AssistantAction } from '@/lib/assistant-check';
import { laborRateCents } from '@/lib/billing';
import { can } from '@/lib/permissions';
import { useFormat } from '@/lib/format';
import { font, radius, space, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { aiErrorText } from './ai-parts';
import { parseDollars } from './estimate-parts';
import { JobPicker, Sheet } from './sheet';
import { Button, ButtonRow, Field, Icon, IconButton, ListRow, Notice, PageHeader, Row, T } from './ui';
import { useDictation } from './use-dictation';

type StepState = 'waiting' | 'done' | 'failed';
interface Plan { actions: AssistantAction[]; prices: Record<number, string>; status: 'open' | 'done' | 'cancelled'; results: StepState[]; notes: string[]; routes: (Href | null)[] }
interface Message extends ChatMessage { id: string; plan?: Plan; offTopic?: boolean; error?: boolean }

// kept while the app is open, per signed-in business; never saved anywhere
const chats = new Map<string, Message[]>();
let nextId = 1;

/**
 * The KILN chat: ask about your jobs, or tell KILN what to do. KILN answers from the business's own
 * data and turns requests into a plan; nothing changes until the owner taps Do it, and sending,
 * payments and prices still get their own confirmation (the send screen, the payment sheet, a rate check).
 */
export function AssistantChat({ focusJobId: openedFrom, crew = false }: {
  /** Opened from a job's header: KILN talks about that job until the owner switches to all jobs. */
  focusJobId: string | null;
  /** A crew member: only their assigned jobs, crew steps only (hours, work from the price list, notes, change suggestions). */
  crew?: boolean;
}) {
  const p = usePalette();
  const { t, lang } = useLang();
  const c = assistantCopy[lang];
  const f = useFormat();
  const insets = useSafeAreaInsets();
  const { state, actions } = useStore();
  const auth = useAuth();
  const key = `${state.mode}:${state.businessId ?? 'example'}`;
  const [messages, setMessagesRaw] = useState<Message[]>(() => chats.get(key) ?? []);
  const setMessages = (update: (m: Message[]) => Message[]) => setMessagesRaw((old) => { const next = update(old); chats.set(key, next); return next; });
  const [focusJobId, setFocusJobId] = useState(openedFrom);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  // the mic in the text box: what's heard goes straight into the box, after anything already typed
  const typedBefore = useRef('');
  const dictation = useDictation((heard) => setText([typedBefore.current.trim(), heard].filter(Boolean).join(' ')));
  const toggleMic = () => {
    if (!dictation.listening) typedBefore.current = text;
    dictation.toggle();
  };
  const [pick, setPick] = useState<{ messageId: string; step: number } | null>(null);
  const [rate, setRate] = useState<{ messageId: string; cents: number } | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // the keyboard's height on every frame as it opens and closes. The input bar already keeps
  // room for the phone's bottom edge, which the keyboard covers, so that part isn't added twice.
  // (Reanimated marks this hook as replaced by react-native-keyboard-controller, a new package
  // to add later; this one is already installed and works in Expo Go.)
  const keyboard = useAnimatedKeyboard();
  const bottomEdge = Math.max(insets.bottom, space.sm);
  // The chat slides up with the keyboard instead of shrinking: a slide is drawn on the same frame,
  // while shrinking makes every message re-measure each frame, which is what made the box lag behind.
  const keyboardLift = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.max(keyboard.height.get() - bottomEdge + space.sm, 0) }] }));
  // Sliding up hides the top of the chat under the header, so once the keyboard is fully open the
  // chat gets that much room at the top, to scroll back to its first message.
  const [topRoom, setTopRoom] = useState(0);
  useAnimatedReaction(
    () => (keyboard.state.get() === KeyboardState.OPEN ? Math.max(keyboard.height.get() - bottomEdge + space.sm, 0) : 0),
    (now, before) => { if (now !== before) scheduleOnRN(setTopRoom, Math.round(now)); },
  );
  const ready = aiReady(state.mode);
  const allowed = crew || can(auth.role, 'useAi');
  // crew: their assigned jobs and the price items they may use, from the crew server functions
  const outbox = useCrewOutboxIfCrew();
  const [crewData, setCrewData] = useState<{ jobs: CrewJob[]; items: CrewPriceItem[] } | null>(null);
  useEffect(() => {
    if (!crew || !ready) return;
    let live = true;
    Promise.all([loadCrewJobs(), loadCrewPriceList()]).then(([jobs, items]) => { if (live) setCrewData({ jobs, items }); }, () => {});
    return () => { live = false; };
  }, [crew, ready]);
  const jobTitle = (id: string) => (crew ? crewData?.jobs.find((j) => j.id === id)?.title ?? '' : jobById(id).title);
  const chatInput = (history: ChatMessage[]) => (crew
    ? crewAssistantInput(lang, history, focusJobId, crewData?.jobs ?? [], crewData?.items ?? [])
    : assistantInput(currentState(), lang, history, focusJobId));

  useEffect(() => { const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); return () => clearTimeout(timer); }, [messages.length, thinking]);

  const ask = (said: string) => {
    const question = said.trim();
    if (!question || thinking || !ready) return;
    // sending while listening: stop, and don't let late words refill the box
    dictation.cancel();
    const owner: Message = { id: `m${nextId++}`, role: 'owner', text: question };
    const history = [...messages.filter((m) => !m.error && !m.offTopic), owner].map(({ role, text: t }) => ({ role, text: t }));
    setMessages((m) => [...m, owner]);
    setText('');
    setThinking(true);
    askKiln(chatInput(history))
      .then((reply) => {
        void Haptics.selectionAsync().catch(() => {});
        setMessages((m) => [...m, {
          id: `m${nextId++}`, role: 'kiln', text: reply.reply, offTopic: reply.offTopic,
          plan: reply.actions.length ? { actions: reply.actions, prices: {}, status: 'open', results: reply.actions.map(() => 'waiting'), notes: reply.actions.map(() => ''), routes: reply.actions.map(() => null) } : undefined,
        }]);
      }, (e: unknown) => setMessages((m) => [...m, { id: `m${nextId++}`, role: 'kiln', text: aiErrorText(t, e) || c.failed, error: true }]))
      .finally(() => setThinking(false));
  };

  const updatePlan = (messageId: string, change: (plan: Plan) => Plan) =>
    setMessages((m) => m.map((x) => (x.id === messageId && x.plan ? { ...x, plan: change(x.plan) } : x)));

  /** Runs every step in order. Steps that open a screen (invoice, payment, change order…) open the first one at the end. */
  const run = (messageId: string, confirmedRate = false) => {
    const message = messages.find((m) => m.id === messageId);
    const plan = message?.plan;
    if (!plan || plan.status !== 'open') return;
    // prices the owner typed into the plan fill the steps that had none
    const steps = plan.actions.map((a, i): AssistantAction => {
      if (a.type === 'work' && a.unitCents === null) return { ...a, unitCents: parseDollars(plan.prices[i] ?? '') };
      if (a.type === 'changeOrder' && a.cents === null) return { ...a, cents: parseDollars(plan.prices[i] ?? '') };
      return a;
    });
    const rateStep = steps.find((a): a is Extract<AssistantAction, { type: 'laborRate' }> => a.type === 'laborRate');
    if (rateStep && !confirmedRate) { setRate({ messageId, cents: rateStep.cents }); return; }
    const results: StepState[] = []; const notes: string[] = []; const routes: (Href | null)[] = [];
    for (const a of steps) {
      const outcome = runStep(a);
      results.push(outcome.ok ? 'done' : 'failed'); notes.push(outcome.note ?? ''); routes.push(outcome.route ?? null);
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    updatePlan(messageId, (old) => ({ ...old, actions: steps, status: 'done', results, notes, routes }));
    const first = routes.find((r) => r !== null);
    if (first) setTimeout(() => router.push(first), 250);
  };

  const runStep = (a: AssistantAction): { ok: boolean; note?: string; route?: Href } => {
    if (crew) return runCrewStep(a);
    const s = currentState();
    switch (a.type) {
      case 'hours': actions.logHours(a.jobId!, a.hundredths, a.note); return { ok: true };
      case 'note': actions.addCapture(a.jobId!, 'note', a.text); return { ok: true };
      case 'work': {
        const item = s.priceList.find((i) => i.id === a.itemId);
        const ok = a.unitCents !== null && actions.addWorkItem(a.jobId!, { priceItemId: item?.id, description: a.description, unit: item?.unit ?? 'flat',
          qtyHundredths: a.qtyHundredths, unitCents: a.unitCents, kind: a.kind });
        return { ok: !!ok };
      }
      case 'sortReceipt':
        actions.assign(a.receiptItemId, a.sortTo === 'job' ? { type: 'jobs', jobIds: [a.jobId!] } : { type: a.sortTo });
        return { ok: true };
      case 'laborRate': {
        if (!s.priceList.some((i) => i.id === 'labor' && i.unit === 'hour')) return { ok: false, note: c.noLabor };
        actions.setPrice('labor', a.cents); return { ok: true };
      }
      case 'invoice': {
        const id = actions.finishJob(a.jobId!);
        return { ok: true, route: `/invoice/${id}?review=1${a.send ? '&send=1' : ''}` as Href };
      }
      case 'estimate': return { ok: true, route: `/estimate/${a.jobId}?review=1${a.send ? '&send=1' : ''}` as Href };
      case 'cashPaid': case 'remind': {
        const invoice = invoiceForJob(a.jobId!);
        if (!invoice || !s.sentInvoices.includes(invoice.id)) return { ok: false, note: c.notSent };
        if (s.paidInvoices.includes(invoice.id)) return { ok: false, note: c.alreadyPaid };
        return { ok: true, route: (a.type === 'cashPaid' ? `/invoice/${invoice.id}?cash=${a.cents}` : `/invoice/${invoice.id}?remind=1`) as Href };
      }
      case 'changeOrder': {
        const id = a.cents === null ? null : actions.createChangeOrder(a.jobId!, a.description, a.cents);
        return id ? { ok: true, route: `/change-order/${id}` as Href } : { ok: false };
      }
      case 'newJob': {
        const q = new URLSearchParams({ customer: a.customer, address: a.address, title: a.title, ...(a.pricing ? { pricing: a.pricing } : {}) });
        return { ok: true, route: `/new-job?${q.toString()}` as Href };
      }
    }
  };

  /** Crew steps go through the crew save queue (kept on the phone until they reach the server). */
  const runCrewStep = (a: AssistantAction): { ok: boolean; note?: string; route?: Href } => {
    if (!outbox || !('jobId' in a) || !a.jobId) return { ok: false };
    const job = a.jobId;
    const command: CrewCommand | null = a.type === 'hours' ? { kind: 'hours', id: newUuid(), job, hours: a.hundredths, note: a.note }
      : a.type === 'note' ? { kind: 'note', id: newUuid(), job, text: a.text }
      : a.type === 'work' && a.itemId ? { kind: 'work', id: newUuid(), job, item: a.itemId, quantity: a.qtyHundredths }
      : a.type === 'changeOrder' ? { kind: 'change', id: newUuid(), job, text: a.description }
      : null;
    if (!command) return { ok: false };
    void outbox.save([command]).catch(() => {});
    return { ok: true, route: `/crew/job/${job}` as Href };
  };

  const label = (a: AssistantAction): string => {
    const st = c.steps;
    switch (a.type) {
      case 'hours': return fillIn(st.hours, { hours: f.qty(a.hundredths) }) + (a.note ? ` · ${a.note}` : '');
      case 'work': return fillIn(st.work, { what: a.qtyHundredths === 100 ? a.description : `${f.qty(a.qtyHundredths)} × ${a.description}` });
      case 'note': return `${st.note}: “${a.text}”`;
      case 'invoice': return a.send ? st.invoiceSend : st.invoice;
      case 'estimate': return a.send ? st.estimateSend : st.estimate;
      case 'cashPaid': return fillIn(st.cashPaid, { amount: f.money(a.cents) });
      case 'laborRate': return fillIn(st.laborRate, { amount: f.money(a.cents) });
      case 'newJob': return fillIn(st.newJob, { customer: a.customer }) + (a.title ? ` · ${a.title}` : '');
      case 'changeOrder': return fillIn(st.changeOrder, { what: a.description });
      case 'sortReceipt': {
        let item = a.receiptItemId;
        try { item = currentState().fixedNames[a.receiptItemId] ?? receiptItemById(a.receiptItemId).name; } catch { /* left as is */ }
        return fillIn(a.sortTo === 'personal' ? st.sortPersonal : a.sortTo === 'overhead' ? st.sortOverhead : st.sortJob, { item });
      }
      case 'remind': return st.remind;
    }
  };
  const jobOf = (a: AssistantAction) => ('jobId' in a && a.jobId ? jobTitle(a.jobId) : null);
  const needsJob = (a: AssistantAction) => a.type !== 'laborRate' && a.type !== 'newJob' && !(a.type === 'sortReceipt' && a.sortTo !== 'job');
  // crew never price anything: work comes from the price list, change orders are suggestions the owner prices
  const needsPrice = (a: AssistantAction) => !crew && ((a.type === 'work' && a.unitCents === null) || (a.type === 'changeOrder' && a.cents === null));
  const planReady = (plan: Plan) => plan.actions.every((a, i) => {
    if (needsPrice(a)) return parseDollars(plan.prices[i] ?? '') !== null && (a.type !== 'work' || a.jobId !== null);
    if (crew) return 'jobId' in a && a.jobId !== null;
    return stepReady(a);
  });

  const blocked = !ready ? c.exampleMode : !allowed ? c.crewOnly : null;
  const choose = (jobId: string) => {
    if (pick) updatePlan(pick.messageId, (old) => ({ ...old, actions: old.actions.map((a, j) => (j === pick.step && 'jobId' in a ? { ...a, jobId } : a)) }));
    setPick(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: p.ground }}>
      <SafeAreaView edges={['top']} style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 4 }}>
        <PageHeader title={c.title} back={() => router.back()} inline
          // opened from a job: an orange pill with the job right next to "KILN"; × talks about all jobs instead
          beside={focusJobId && jobTitle(focusJobId) ? (
            <View accessible={false} aria-label={`${c.aboutJob}: ${jobTitle(focusJobId)}`}
              style={{ flexDirection: 'row', gap: 6, flexShrink: 1, alignItems: 'center', backgroundColor: p.accent, borderRadius: radius.pill, paddingLeft: 12, paddingRight: 2, minHeight: 40 }}>
              <Icon name="briefcase" size={16} color={p.onAccent} />
              <T v="label" color={p.onAccent} numberOfLines={1} style={{ flexShrink: 1 }}>{jobTitle(focusJobId)}</T>
              <Pressable onPress={() => setFocusJobId(null)} accessibilityRole="button" accessibilityLabel={c.allJobs} hitSlop={6}
                style={({ pressed }) => ({ width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                <Icon name="x" size={18} color={p.onAccent} />
              </Pressable>
            </View>
          ) : undefined}
          right={messages.length ? <IconButton icon="edit" label={c.clear} onPress={() => setMessages(() => [])} /> : undefined} />
      </SafeAreaView>
      {/* moves with the keyboard frame by frame, so the text box rides up with it instead of catching up after;
          the clip keeps the raised chat from drawing over the header */}
      <View style={{ flex: 1, overflow: 'hidden' }}>
      <Animated.View style={[{ flex: 1 }, keyboardLift]}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, paddingTop: space.lg + topRoom, gap: 12 }}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
          // the room added at the top doesn't move what's on screen
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}>
          <Bubble kiln text={focusJobId && jobTitle(focusJobId) ? fillIn(c.helloJob, { job: jobTitle(focusJobId) }) : c.hello} />
          {messages.map((m) => (
            <View key={m.id} style={{ gap: 8 }}>
              {m.text ? <Bubble kiln={m.role === 'kiln'} text={m.text} tone={m.offTopic ? 'flag' : m.error ? 'danger' : undefined} /> : null}
              {m.plan ? (
                <View style={{ backgroundColor: p.card, borderRadius: radius.md, padding: 16, gap: 10, marginRight: 24 }}>
                  <T v="eyebrow">{c.planTitle}</T>
                  {m.plan.actions.map((a, i) => {
                    const plan = m.plan!;
                    const result = plan.results[i];
                    return (
                      <View key={i} style={{ gap: 6 }}>
                        <Row gap={10} style={{ alignItems: 'flex-start' }}>
                          <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: result === 'done' ? p.accent : result === 'failed' ? p.danger : p.ground }}>
                            {result === 'done' ? <Icon name="check" size={16} color={p.onAccent} /> : result === 'failed' ? <Icon name="x" size={16} color={p.onDanger} />
                              : <T v="small" style={{ fontFamily: font.bold }}>{i + 1}</T>}
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <T v="label">{label(a)}</T>
                            {jobOf(a) ? <T v="small" muted>{jobOf(a)}</T> : null}
                            {needsOwnConfirm(a) && plan.status === 'open' ? <T v="small" muted>🔒</T> : null}
                            {plan.notes[i] ? <T v="small" color={p.danger}>{plan.notes[i]}</T> : null}
                          </View>
                          {plan.status === 'open' && plan.actions.length > 1 ? (
                            <IconButton icon="x" label={c.removeStep} onPress={() => updatePlan(m.id, (old) => ({
                              ...old, actions: old.actions.filter((_, j) => j !== i), results: old.results.filter((_, j) => j !== i),
                              notes: old.notes.filter((_, j) => j !== i), routes: old.routes.filter((_, j) => j !== i), prices: {},
                            }))} />
                          ) : null}
                        </Row>
                        {plan.status === 'open' && needsJob(a) && !('jobId' in a && a.jobId) ? (
                          <Button label={c.whichJob} icon="briefcase" variant="dark" onPress={() => setPick({ messageId: m.id, step: i })} />
                        ) : null}
                        {plan.status === 'open' && needsPrice(a) ? (
                          <Field label={c.price} value={plan.prices[i] ?? ''} keyboardType="decimal-pad"
                            onChangeText={(v) => updatePlan(m.id, (old) => ({ ...old, prices: { ...old.prices, [i]: v } }))} />
                        ) : null}
                        {plan.status === 'done' && plan.routes[i] ? (
                          <Button label={c.openStep} icon="arrow-right" variant="outline" onPress={() => router.push(plan.routes[i]!)} />
                        ) : null}
                      </View>
                    );
                  })}
                  {m.plan.status === 'open' ? <>
                    {!planReady(m.plan) ? <T v="small" muted>{c.needsAnswers}</T> : null}
                    <ButtonRow gap={10}>
                      <Button label={c.cancel} variant="outline" onPress={() => updatePlan(m.id, (old) => ({ ...old, status: 'cancelled' }))} />
                      <Button label={c.doIt} icon="check" flex disabled={!planReady(m.plan)} onPress={() => run(m.id)} />
                    </ButtonRow>
                  </> : m.plan.status === 'cancelled' ? <T v="small" muted>{c.cancelled}</T> : null}
                </View>
              ) : null}
            </View>
          ))}
          {thinking ? <Bubble kiln text={c.thinking} /> : null}
        </ScrollView>

        {/* the input bar, like a messaging app: type, or tap the mic inside the box and talk */}
        {blocked ? <View style={{ padding: space.lg, paddingBottom: Math.max(insets.bottom, space.md) }}><Notice text={blocked} icon="info" tone="soft" /></View> : (
          // a rounded text box across the screen, with the mic and Send inside it on the right
          <View style={{ paddingHorizontal: space.sm, paddingTop: 6, paddingBottom: Math.max(insets.bottom, space.sm), gap: 6, backgroundColor: p.ground }}>
            {dictation.error ? <T v="small" color={p.danger} style={{ paddingHorizontal: 12 }}>{dictation.error}</T> : null}
            {/* one line: 48 buttons + 2 × 4 padding + 2 × 2 border = 60, so a radius of 30 makes the ends fully round */}
            <Row gap={4} style={{ alignItems: 'flex-end', backgroundColor: p.card, borderRadius: 30, padding: 4, paddingLeft: 18,
              borderWidth: 2, borderColor: dictation.listening ? p.danger : 'transparent' }}>
              <TextInput value={text} onChangeText={setText} placeholder={dictation.listening ? c.listening : focusJobId ? c.placeholderJob : c.placeholder} placeholderTextColor={p.muted}
                multiline maxLength={2000} accessibilityLabel={c.placeholder} editable={!thinking && !dictation.listening}
                // keep the newest message in view as the keyboard comes up
                onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300)}
                // one line is as tall as the buttons beside it: 22 line + 2 × 13 padding = 48
                style={{ flex: 1, fontSize: 16, lineHeight: 22, color: p.ink, paddingTop: 13, paddingBottom: 13, maxHeight: 140,
                  includeFontPadding: false, textAlignVertical: 'center' }} />
              <Pressable onPress={toggleMic} disabled={thinking || dictation.starting} accessibilityRole="button"
                accessibilityLabel={dictation.listening ? c.stopListening : c.speak} accessibilityState={{ selected: dictation.listening }} hitSlop={4}
                style={({ pressed }) => ({ width: tap.min, height: tap.min, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: dictation.listening ? p.danger : 'transparent', opacity: pressed || thinking ? 0.6 : 1 })}>
                <Icon name={dictation.listening ? 'square' : 'mic'} size={dictation.listening ? 18 : 22} color={dictation.listening ? p.onDanger : p.muted} />
              </Pressable>
              <Pressable onPress={() => ask(text)} disabled={!text.trim() || thinking} accessibilityRole="button" accessibilityLabel={c.send}
                accessibilityState={{ disabled: !text.trim() || thinking }} hitSlop={4}
                style={({ pressed }) => ({ width: tap.min, height: tap.min, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: !text.trim() || thinking ? p.line : p.inverse, opacity: pressed ? 0.7 : 1 })}>
                <Icon name="arrow-up" size={22} color={!text.trim() || thinking ? p.muted : p.onInverse} />
              </Pressable>
            </Row>
          </View>
        )}
      </Animated.View>
      </View>

      {crew ? (
        <Sheet open={pick !== null} onClose={() => setPick(null)} title={c.whichJob}>
          {(crewData?.jobs ?? []).filter((j) => j.is_open).map((j) => <ListRow key={j.id} icon="briefcase" title={j.title} sub={j.address} onPress={() => choose(j.id)} />)}
        </Sheet>
      ) : <JobPicker open={pick !== null} onClose={() => setPick(null)} onPick={choose} />}
      <Sheet open={rate !== null} onClose={() => setRate(null)} title={c.rateTitle}>
        {rate ? <>
          <T>{fillIn(c.rateBody, { from: f.money(laborRateCents(state.priceList, state.profile.rateCents) ?? 0), to: f.money(rate.cents) })}</T>
          <Button label={fillIn(c.rateYes, { to: f.money(rate.cents) })} icon="check" big onPress={() => { const id = rate.messageId; setRate(null); run(id, true); }} />
          <Button label={c.cancel} variant="outline" onPress={() => setRate(null)} />
        </> : null}
      </Sheet>
    </View>
  );
}

function Bubble({ text, kiln, tone }: { text: string; kiln?: boolean; tone?: 'flag' | 'danger' }) {
  const p = usePalette();
  const bg = tone === 'flag' ? p.flag : tone === 'danger' ? p.danger : kiln ? p.card : p.inverse;
  const fg = tone === 'flag' ? p.onFlag : tone === 'danger' ? p.onDanger : kiln ? p.ink : p.onInverse;
  return (
    <View style={{ alignSelf: kiln ? 'flex-start' : 'flex-end', maxWidth: '86%', backgroundColor: bg, borderRadius: radius.md,
      borderBottomLeftRadius: kiln ? 6 : radius.md, borderBottomRightRadius: kiln ? radius.md : 6, paddingHorizontal: 14, paddingVertical: 10 }}>
      <T color={fg}>{text}</T>
    </View>
  );
}
