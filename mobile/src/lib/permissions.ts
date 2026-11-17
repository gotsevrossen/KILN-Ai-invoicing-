// What each team role can do in the app. The server enforces the same rules
// (supabase/migrations/20261117120000_team_roles.sql); this only decides which buttons show.

export type Role = 'owner' | 'manager' | 'crew';

export type Action =
  // business
  | 'businessSettings' | 'stripe' | 'deleteBusiness' | 'seeMoneyOnHome' | 'seeCosts'
  // team
  | 'teamTab' | 'inviteCrew' | 'inviteManager' | 'changeRoles' | 'removeCrew' | 'removeManager' | 'assignJobs' | 'approveCrew' | 'approveManager'
  // jobs and customers
  | 'seeAllJobs' | 'editJobs' | 'seeCustomerList'
  // documents
  | 'editEstimates' | 'editInvoices' | 'editChangeOrders' | 'sendDocuments' | 'markPaid' | 'useServicePackages'
  // prices
  | 'changePrices' | 'addPriceItems'
  // on assigned jobs
  | 'addWork' | 'addHours' | 'addPhotos' | 'addNotes' | 'suggestChange' | 'viewDocuments'
  | 'useAi';

const MANAGER: Action[] = [
  'seeMoneyOnHome', 'teamTab', 'inviteCrew', 'removeCrew', 'assignJobs', 'approveCrew',
  'seeAllJobs', 'editJobs', 'seeCustomerList',
  'editEstimates', 'editInvoices', 'editChangeOrders', 'sendDocuments', 'markPaid', 'useServicePackages',
  'changePrices', 'addPriceItems',
  'addWork', 'addHours', 'addPhotos', 'addNotes', 'suggestChange', 'viewDocuments', 'useAi',
];
const OWNER_ONLY: Action[] = [
  'businessSettings', 'stripe', 'deleteBusiness', 'seeCosts', 'inviteManager', 'changeRoles', 'removeManager', 'approveManager',
];
const CREW: Action[] = ['addPriceItems', 'addWork', 'addHours', 'addPhotos', 'addNotes', 'suggestChange', 'viewDocuments'];

const allowed: Record<Role, ReadonlySet<Action>> = {
  owner: new Set([...MANAGER, ...OWNER_ONLY]),
  manager: new Set(MANAGER),
  crew: new Set(CREW),
};

/**
 * Whether this role may do this. No role (example mode, or one person working alone) is the owner.
 * `managersSeeCosts` is the owner's switch that lets managers see pay rates and job profit.
 */
export function can(role: Role | null | undefined, action: Action, opts: { managersSeeCosts?: boolean } = {}): boolean {
  const r = role ?? 'owner';
  if (action === 'seeCosts' && r === 'manager') return !!opts.managersSeeCosts;
  return allowed[r].has(action);
}

/** Who may approve, remove or invite someone with this role. */
export function canManagePerson(me: Role | null | undefined, theirs: Role): boolean {
  if (theirs === 'owner') return false;
  return can(me, theirs === 'manager' ? 'removeManager' : 'removeCrew');
}
