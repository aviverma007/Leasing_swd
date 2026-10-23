/* Next-step nudges — not a tour.
   After a user completes an action, one small dismissible popup suggests the
   natural next move in the workflow, with a button that takes them there.
   Components call suggestNextStep('<key>'); App subscribes and renders it. */

let listener = null;
export function onNextStep(fn) { listener = fn; return () => { if (listener === fn) listener = null; }; }

export function suggestNextStep(key, extra) {
  const step = STEPS[key];
  if (step && listener) listener({ ...step, key, ...(extra || {}) });
}

/* Each step: title (what just happened), desc (why the next move matters),
   label (the action button), view (sidebar view to open). */
const STEPS = {
  companyCreated: {
    title: 'Lessee company saved',
    desc: 'Set up the project (property) where its units will be leased.',
    label: 'Open Project Master', view: 'assets'
  },
  assetCreated: {
    title: 'Project saved',
    desc: 'Add the blocks (wings/towers) inside this project.',
    label: 'Open Block Master', view: 'blocks'
  },
  blockCreated: {
    title: 'Block saved',
    desc: 'Add the leasable units with their carpet and super areas.',
    label: 'Open Unit Master', view: 'units'
  },
  unitCreated: {
    title: 'Unit saved',
    desc: 'Record the unit owner in the Customer Master so invoices and SD settlements know whose unit it is.',
    label: 'Open Customer Master', view: 'customers'
  },
  customerCreated: {
    title: 'Customer saved',
    desc: 'Create the tenant brand that will take a unit on lease.',
    label: 'Open Brand Master', view: 'brands'
  },
  brandCreated: {
    title: 'Brand saved',
    desc: 'Everything is in place — create the lease for this brand.',
    label: 'Open Leases', view: 'leases'
  },
  brokerCreated: {
    title: 'Broker saved',
    desc: 'Pick this broker on the lease so brokerage is tracked against them.',
    label: 'Open Leases', view: 'leases'
  },
  leaseCreated: {
    title: 'Lease created',
    desc: 'When rent commencement is reached, move its stage to Active and generate the first invoice.',
    label: 'Open Invoices', view: 'invoices'
  },
  leaseUpdated: {
    title: 'Lease updated',
    desc: 'If terms changed, regenerate or adjust billing from the Invoices page.',
    label: 'Open Invoices', view: 'invoices'
  },
  stageActive: {
    title: 'Lease is now Active',
    desc: 'Billing is unlocked — generate this month’s invoice for it.',
    label: 'Generate invoices', view: 'invoices'
  },
  invoicesGenerated: {
    title: 'Invoices generated',
    desc: 'Email or print them for dispatch, then record payments as they arrive.',
    label: 'Open Collections', view: 'collections'
  },
  collectionSaved: {
    title: 'Receipt recorded',
    desc: 'The tenant’s running balance is updated — review it on the statement.',
    label: 'Open Tenant Ledger', view: 'ledger'
  },
  sdAdjusted: {
    title: 'SD adjustment applied',
    desc: 'The deposit balance has changed — verify it on the SD reconciliation.',
    label: 'Open SD Reconciliation', view: 'sdrecon'
  },
  creditNoteIssued: {
    title: 'Note issued',
    desc: 'The invoice balance is updated — the ledger shows the note against it.',
    label: 'Open Tenant Ledger', view: 'ledger'
  },
  leaseRenewed: {
    title: 'Lease renewed',
    desc: 'The new term is live. Generate its first invoice when billing starts.',
    label: 'Open Invoices', view: 'invoices'
  },
  leaseExited: {
    title: 'Exit settled — unit is vacant',
    desc: 'The unit is back on the market. Check availability on the inventory board.',
    label: 'Open Inventory', view: 'inventory'
  }
};
