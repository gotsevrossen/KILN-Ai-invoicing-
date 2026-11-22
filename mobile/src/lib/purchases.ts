// The App Store and Google Play, through RevenueCat (react-native-purchases). Phones only; the web
// version uses purchases.web.ts. The purchase belongs to the business: RevenueCat's user id is the
// business id, and the server reads the result from RevenueCat itself (functions/subscriptions).
// In Expo Go, RevenueCat runs in a pretend mode; real purchases need a development build.
// Keys: EXPO_PUBLIC_REVENUECAT_IOS_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_KEY (RevenueCat's public
// app keys, meant to be in the app; the secret key stays on the server).

import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

import { productPlan, type Period, type PlanId } from './subscription';

const KEY = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
const ENTITLEMENT = 'kiln_pro';

/** The stores are set up in this build. */
export const storeReady = (): boolean => !!KEY;

export interface StorePlan {
  productId: string;
  plan: PlanId;
  period: Period;
  /** The store's own price text, in the phone's currency (e.g. "$5.99"). */
  price: string;
  pkg: PurchasesPackage;
}

let signedInAs: string | null = null;

async function start(businessId: string): Promise<void> {
  if (!KEY) throw Object.assign(new Error('store not set up'), { code: 'not_set_up' });
  if (signedInAs === null) {
    Purchases.configure({ apiKey: KEY, appUserID: businessId });
  } else if (signedInAs !== businessId) {
    await Purchases.logIn(businessId);
  }
  signedInAs = businessId;
}

/** KILN's plans as the store sells them here. */
export async function loadPlans(businessId: string): Promise<StorePlan[]> {
  await start(businessId);
  const offerings = await Purchases.getOfferings();
  return (offerings.current?.availablePackages ?? []).flatMap((pkg) => {
    const found = productPlan(pkg.product.identifier);
    return found ? [{ productId: pkg.product.identifier, ...found, price: pkg.product.priceString, pkg }] : [];
  });
}

const cancelled = (e: unknown) => {
  const err = e as { code?: unknown; userCancelled?: unknown };
  return err?.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || err?.userCancelled === true;
};

/**
 * Starts the trial, buys, or switches plans. On iPhone, plans in KILN's subscription group switch
 * on their own; Google Play needs the plan being replaced.
 */
export async function buy(businessId: string, plan: StorePlan, currentProduct: string | null): Promise<'bought' | 'cancelled'> {
  await start(businessId);
  const replacing = currentProduct?.split(':')[0];
  const change = Platform.OS === 'android' && replacing && replacing !== plan.productId.split(':')[0]
    ? { oldProductIdentifier: replacing } : null;
  try {
    await Purchases.purchasePackage(plan.pkg, null, change);
    return 'bought';
  } catch (e) {
    if (cancelled(e)) return 'cancelled';
    throw e;
  }
}

/** Finds a subscription bought with this Apple or Google account. True when there is one. */
export async function restore(businessId: string): Promise<boolean> {
  await start(businessId);
  const info = await Purchases.restorePurchases();
  return !!info.entitlements.active[ENTITLEMENT];
}

/** The store's own page for canceling or changing the card. */
export async function manage(businessId: string): Promise<void> {
  await start(businessId);
  await Purchases.showManageSubscriptions();
}
