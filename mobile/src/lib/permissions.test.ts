import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { can, canManagePerson } from './permissions.ts';

describe('team roles', () => {
  it('owner can do everything', () => {
    for (const action of ['businessSettings', 'stripe', 'changeRoles', 'inviteManager', 'seeCosts', 'sendDocuments', 'changePrices'] as const) {
      assert.equal(can('owner', action), true, action);
    }
  });

  it('no role means one person working alone, who is the owner', () => {
    assert.equal(can(null, 'businessSettings'), true);
    assert.equal(can(undefined, 'sendDocuments'), true);
  });

  it('managers run jobs and documents but not the business, roles or pay', () => {
    for (const action of ['editEstimates', 'editInvoices', 'sendDocuments', 'markPaid', 'changePrices', 'assignJobs', 'inviteCrew', 'teamTab'] as const) {
      assert.equal(can('manager', action), true, action);
    }
    for (const action of ['businessSettings', 'stripe', 'changeRoles', 'inviteManager', 'removeManager', 'deleteBusiness'] as const) {
      assert.equal(can('manager', action), false, action);
    }
  });

  it('managers see costs only when the owner allows it', () => {
    assert.equal(can('manager', 'seeCosts'), false);
    assert.equal(can('manager', 'seeCosts', { managersSeeCosts: true }), true);
    assert.equal(can('crew', 'seeCosts', { managersSeeCosts: true }), false);
  });

  it('crew add work to their jobs and can add (not change) prices', () => {
    for (const action of ['addWork', 'addHours', 'addPhotos', 'addNotes', 'suggestChange', 'viewDocuments', 'addPriceItems'] as const) {
      assert.equal(can('crew', action), true, action);
    }
    for (const action of ['editEstimates', 'editInvoices', 'sendDocuments', 'markPaid', 'changePrices', 'seeAllJobs', 'seeCustomerList', 'teamTab', 'seeMoneyOnHome', 'useAi'] as const) {
      assert.equal(can('crew', action), false, action);
    }
  });

  it('only the owner manages managers; managers manage crew; nobody removes the owner', () => {
    assert.equal(canManagePerson('owner', 'manager'), true);
    assert.equal(canManagePerson('owner', 'crew'), true);
    assert.equal(canManagePerson('manager', 'crew'), true);
    assert.equal(canManagePerson('manager', 'manager'), false);
    assert.equal(canManagePerson('crew', 'crew'), false);
    assert.equal(canManagePerson('owner', 'owner'), false);
  });
});
