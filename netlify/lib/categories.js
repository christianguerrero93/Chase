// Budget categories shown in the app. Edit freely.
export const CATEGORIES = [
  'Groceries', 'Dining', 'Shopping', 'Transportation', 'Gas', 'Travel',
  'Rent', 'Bills & Utilities', 'Subscriptions', 'Entertainment', 'Health',
  'Personal Care', 'Home', 'Education', 'Services', 'Gifts & Donations',
  'Fees', 'Debt Payments', 'Other',
  'Income', 'Transfer', 'Credit Card Payment',
];

// These are tracked but NOT counted as spending. Credit Card Payment is
// excluded so paying your Chase card from checking isn't counted twice.
export const NON_SPENDING = ['Income', 'Transfer', 'Credit Card Payment'];

// ---- Plaid personal_finance_category -> app category ----
const PLAID_DETAILED = {
  FOOD_AND_DRINK_GROCERIES: 'Groceries',
  TRANSPORTATION_GAS: 'Gas',
  RENT_AND_UTILITIES_RENT: 'Rent',
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: 'Credit Card Payment',
  ENTERTAINMENT_TV_AND_MOVIES: 'Subscriptions',
  ENTERTAINMENT_MUSIC_AND_AUDIO: 'Subscriptions',
  GENERAL_SERVICES_EDUCATION: 'Education',
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: 'Gifts & Donations',
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: 'Gifts & Donations',
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
  GENERAL_SERVICES: 'Services',
  TRANSPORTATION: 'Transportation',
  TRAVEL: 'Travel',
  RENT_AND_UTILITIES: 'Bills & Utilities',
};

export function categorizePlaid(pfc) {
  if (!pfc) return 'Other';
  return PLAID_DETAILED[pfc.detailed] || PLAID_PRIMARY[pfc.primary] || 'Other';
}

// ---- Chase CSV "Category" column -> app category ----
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
  'Professional Services': 'Services',
};

// amount convention everywhere: positive = money out, negative = money in
export function categorizeChase({ category, type, description, amount }) {
  const t = (type || '').toUpperCase();
  const d = (description || '').toUpperCase();
  if (t === 'PAYMENT' || /AUTOPAY|PAYMENT TO CHASE CARD|CHASE CREDIT CRD|PAYMENT THANK YOU/.test(d)) {
    return 'Credit Card Payment';
  }
  if (category && CHASE[category]) return CHASE[category];
  if (t === 'ACCT_XFER' || /ONLINE TRANSFER/.test(d)) return 'Transfer';
  if (amount < 0) return 'Income';
  return 'Other';
}
