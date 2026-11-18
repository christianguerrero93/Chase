import { lookupMerchant, lookupKeyword } from './merchants.js';

// Budget categories shown in the app, in display order.
export const CATEGORIES = [
  'Groceries', 'Dining', 'Coffee', 'Food Delivery', 'Shopping', 'Clothing',
  'Transportation', 'Gas', 'Travel', 'Rent', 'Bills & Utilities', 'Phone & Internet',
  'Insurance', 'Subscriptions', 'Entertainment', 'Fitness', 'Health', 'Personal Care',
  'Home', 'Pets', 'Education', 'Gifts & Donations', 'Venmo & Zelle', 'Cash & ATM',
  'Fees', 'Debt Payments', 'Other',
  'Income', 'Transfer', 'Credit Card Payment',
];

// Tracked but NOT counted as spending. Credit Card Payment is excluded so
// paying your Chase card from checking isn't counted twice.
export const NON_SPENDING = ['Income', 'Transfer', 'Credit Card Payment'];

// ---- Plaid personal_finance_category -> app category ----
const PLAID_DETAILED = {
  FOOD_AND_DRINK_GROCERIES: 'Groceries',
  FOOD_AND_DRINK_COFFEE: 'Coffee',
  TRANSPORTATION_GAS: 'Gas',
  RENT_AND_UTILITIES_RENT: 'Rent',
  RENT_AND_UTILITIES_TELEPHONE: 'Phone & Internet',
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: 'Phone & Internet',
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: 'Credit Card Payment',
  ENTERTAINMENT_TV_AND_MOVIES: 'Subscriptions',
  ENTERTAINMENT_MUSIC_AND_AUDIO: 'Subscriptions',
  GENERAL_SERVICES_EDUCATION: 'Education',
  GENERAL_SERVICES_INSURANCE: 'Insurance',
  GENERAL_SERVICES_AUTOMOTIVE: 'Transportation',
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: 'Clothing',
  GENERAL_MERCHANDISE_PET_SUPPLIES: 'Pets',
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: 'Fitness',
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: 'Gifts & Donations',
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: 'Gifts & Donations',
  TRANSFER_OUT_WITHDRAWAL: 'Cash & ATM',
};

const PLAID_PRIMARY = {
  INCOME: 'Income',
  TRANSFER_IN: 'Transfer',
  TRANSFER_OUT: 'Transfer',
  LOAN_PAYMENTS: 'Debt Payments',
  BANK_FEES: 'Fees',
  ENTERTAINMENT: 'Entertainment',
  FOOD_AND_DRINK: 'Dining',
  GENERAL_MERCHANDISE: 'Shopping',
  HOME_IMPROVEMENT: 'Home',
  MEDICAL: 'Health',
  PERSONAL_CARE: 'Personal Care',
  GENERAL_SERVICES: 'Other',
  TRANSPORTATION: 'Transportation',
  TRAVEL: 'Travel',
  RENT_AND_UTILITIES: 'Bills & Utilities',
};

function fromPlaid(pfc) {
  if (!pfc) return null;
  const c = PLAID_DETAILED[pfc.detailed] || PLAID_PRIMARY[pfc.primary];
  return c && c !== 'Other' ? c : null;
}

// ---- Chase CSV "Category" column (credit cards) ----
const CHASE = {
  'Food & Drink': 'Dining',
  Groceries: 'Groceries',
  Shopping: 'Shopping',
  Travel: 'Travel',
  Gas: 'Gas',
  Automotive: 'Transportation',
  'Bills & Utilities': 'Bills & Utilities',
  Entertainment: 'Entertainment',
  'Health & Wellness': 'Health',
  Personal: 'Personal Care',
  Home: 'Home',
  Education: 'Education',
  'Gifts & Donations': 'Gifts & Donations',
  'Fees & Adjustments': 'Fees',
  'Professional Services': 'Other',
};

// ---- Chase CSV "Type" column (checking/savings) ----
const CHASE_TYPE = {
  ATM: 'Cash & ATM',
  ATM_DEPOSIT: 'Income',
  QUICKPAY_DEBIT: 'Venmo & Zelle',
  QUICKPAY_CREDIT: 'Transfer',
  ACCT_XFER: 'Transfer',
  FEE_TRANSACTION: 'Fees',
  LOAN_PMT: 'Debt Payments',
  PAYMENT: 'Credit Card Payment',
};

/**
 * Picks a category for a transaction. Order:
 *  1. Card payments and transfers (so they never count as spending)
 *  2. Merchant directory (known brands, most precise)
 *  3. The bank's own category (Plaid or the Chase CSV column)
 *  4. Chase transaction type (ATM, Zelle, fees...)
 *  5. Generic keywords ("PIZZA", "PHARMACY"...)
 *  6. Money coming in -> Income, otherwise Other
 * amount: positive = money out, negative = money in.
 */
export function autoCategory({ name, description, amount, pfc, bankCategory, type }) {
  const t = (type || '').toUpperCase();
  const merchant = lookupMerchant(name, description);

  if (t === 'PAYMENT' || merchant === 'Credit Card Payment') return 'Credit Card Payment';
  if (merchant === 'Transfer' || t === 'ACCT_XFER') return 'Transfer';
  // Money received through Zelle/Venmo is usually someone paying you back
  if (merchant === 'Venmo & Zelle' && amount < 0) return 'Transfer';
  if (merchant) return merchant;

  const bank = fromPlaid(pfc) || CHASE[bankCategory];
  if (bank) return bank;

  if (CHASE_TYPE[t]) return CHASE_TYPE[t];

  const keyword = lookupKeyword(name, description);
  if (keyword) return keyword;

  return amount < 0 ? 'Income' : 'Other';
}
