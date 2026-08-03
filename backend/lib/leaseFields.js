/* Single source of truth for the extended lease fields from the Excel.
   Each entry: { key (api/json), col (DB column), type ('date'|'dec'|'int'|'str'), len? }
   Used by the leases route to build INSERT/UPDATE and to map rows to JSON. */
const sql = require('mssql');

const LEASE_FIELDS = [
  // Customer sheet
  ['bookingDate', 'BookingDate', 'date'],
  ['loiDate', 'LoiDate', 'date'],
  ['leasingHod', 'LeasingHod', 'str', 150],
  ['brandStatus', 'BrandStatus', 'str', 80],
  ['consentStatus', 'ConsentStatus', 'str', 80],
  ['lms', 'Lms', 'str', 120],
  ['physicalPossessionStatus', 'PhysicalPossessionStatus', 'str', 80],
  ['handoverStatus', 'HandoverStatus', 'str', 80],
  ['tcv', 'Tcv', 'dec'],
  ['calledIncludingTax', 'CalledIncludingTax', 'dec'],
  ['availableFor', 'AvailableFor', 'str', 80],
  ['cdStatus', 'CdStatus', 'str', 80],
  ['cdExecutionDate', 'CdExecutionDate', 'date'],
  ['registrationStatus', 'RegistrationStatus', 'str', 80],
  ['agreementRegistrationDate', 'AgreementRegistrationDate', 'date'],
  ['agreementStatus', 'AgreementStatus', 'str', 80],
  ['dealStatus', 'DealStatus', 'str', 80],
  ['signedAgreementDate', 'SignedAgreementDate', 'date'],
  ['agreementConsultant', 'AgreementConsultant', 'str', 150],
  ['rmName', 'RmName', 'str', 150],
  ['customerDocRemarks', 'CustomerDocRemarks', 'str', 500],
  ['standardRemarks', 'StandardRemarks', 'str', 500],
  ['detailedRemarks', 'DetailedRemarks', 'str', 1000],
  // BRAND Final Data sheet
  ['chequeClearanceDate', 'ChequeClearanceDate', 'date'],
  ['dealApprovalDate', 'DealApprovalDate', 'date'],
  ['agreementSignedBrand', 'AgreementSignedBrand', 'str', 80],
  ['agreementSignedInvestor', 'AgreementSignedInvestor', 'str', 80],
  ['docLeaseCommencementDate', 'DocLeaseCommencementDate', 'date'],
  ['actualHandoverDate', 'ActualHandoverDate', 'date'],
  ['docOperationalDate', 'DocOperationalDate', 'date'],
  ['actualOperationalDate', 'ActualOperationalDate', 'date'],
  ['docRentCommencementDate', 'DocRentCommencementDate', 'date'],
  ['actualRcdDate', 'ActualRcdDate', 'date'],
  ['channelPartner', 'ChannelPartner', 'str', 150],
  ['stage', 'Stage', 'str', 80],
  ['operationalStatus', 'OperationalStatus', 'str', 80],
  ['percentWork', 'PercentWork', 'dec'],
  ['loanRs', 'LoanRs', 'dec'],
  ['capex', 'Capex', 'dec'],
  ['capexReleased', 'CapexReleased', 'dec'],
  ['capexDue', 'CapexDue', 'dec'],
  ['tenureYears', 'TenureYears', 'dec'],
  ['lockinMonths', 'LockinMonths', 'int'],
  ['minGuaranteePsf', 'MinGuaranteePsf', 'dec'],
  ['sdRate', 'SdRate', 'dec'],
  ['sdSchedule', 'SdSchedule', 'str', 120],
  ['securityDeposit', 'SecurityDeposit', 'dec'],
  ['sdDue', 'SdDue', 'dec'],
  ['sdReceived', 'SdReceived', 'dec'],
  ['sdBalance', 'SdBalance', 'dec'],
  ['sdFutureDue', 'SdFutureDue', 'dec'],
  ['camSchedule', 'CamSchedule', 'str', 120],
  ['camDeposit', 'CamDeposit', 'dec'],
  ['camDue', 'CamDue', 'dec'],
  ['camReceived', 'CamReceived', 'dec'],
  ['camBalance', 'CamBalance', 'dec'],
  ['camFutureDue', 'CamFutureDue', 'dec'],
  ['revenueSharePct', 'RevenueSharePct', 'dec'],
  ['fitoutPeriod', 'FitoutPeriod', 'str', 80],
  ['brokerageTerms', 'BrokerageTerms', 'str', 200],
  ['brokerageDisbursal', 'BrokerageDisbursal', 'str', 120],
  ['brokerageRate', 'BrokerageRate', 'dec'],
  ['brokerageAmount', 'BrokerageAmount', 'dec'],
  ['brokerageDue', 'BrokerageDue', 'dec'],
  ['brokeragePaid', 'BrokeragePaid', 'dec'],
  ['brokerageBalance', 'BrokerageBalance', 'dec'],
  ['futureBrokerage', 'FutureBrokerage', 'dec'],
  ['dealWith', 'DealWith', 'str', 150],
  ['billingRemarks', 'BillingRemarks', 'str', 1000],
  ['category', 'Category', 'str', 80]
];

function sqlType(f) {
  const [, , type, len] = f;
  if (type === 'date') return sql.Date;
  if (type === 'dec') return sql.Decimal(18, 2);
  if (type === 'int') return sql.Int;
  return sql.NVarChar(len || 200);
}

// coerce an incoming value to a DB-safe value
function coerce(f, v) {
  const type = f[2];
  if (v === undefined || v === null || v === '') return null;
  if (type === 'dec') { const n = Number(v); return isFinite(n) ? n : null; }
  if (type === 'int') { const n = parseInt(v, 10); return isFinite(n) ? n : null; }
  if (type === 'date') { return v; } // 'YYYY-MM-DD' string
  return String(v);
}

// map a DB row's extra columns back to JSON keys
function mapExtra(r) {
  const out = {};
  for (const f of LEASE_FIELDS) {
    const [key, col, type] = f;
    let v = r[col];
    if (v === undefined) { out[key] = null; continue; }
    if (v === null) { out[key] = null; continue; }
    if (type === 'date') { try { out[key] = new Date(v).toISOString().slice(0, 10); } catch { out[key] = null; } }
    else if (type === 'dec' || type === 'int') { out[key] = v === null ? null : Number(v); }
    else out[key] = v;
  }
  return out;
}

module.exports = { LEASE_FIELDS, sqlType, coerce, mapExtra };
