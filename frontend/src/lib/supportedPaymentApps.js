/**
 * Apps whose notifications Vittova reads to detect payments.
 *
 * MUST stay identical to KNOWN_PACKAGES in
 * android/app/src/main/java/com/spendly/app/PaymentNotificationParser.java —
 * this list is what the onboarding screen and privacy policy promise.
 * tests/supportedPaymentApps.test.js fails if the two lists drift apart.
 * Notifications from any app not listed here are ignored without being read.
 */
export const SUPPORTED_PAYMENT_APPS = [
  { name: 'Google Pay', packageName: 'com.google.android.apps.nbu.paisa.user', type: 'UPI app' },
  { name: 'PhonePe', packageName: 'com.phonepe.app', type: 'UPI app' },
  { name: 'Paytm', packageName: 'net.one97.paytm', type: 'UPI app' },
  { name: 'BHIM', packageName: 'in.org.npci.upiapp', type: 'UPI app' },
  { name: 'BHIM SBI Pay', packageName: 'com.sbi.SBIFreedomPlus', type: 'UPI app' },
  { name: 'CRED', packageName: 'com.dreamplug.androidapp', type: 'UPI app' },
  { name: 'super.money', packageName: 'money.super.payments', type: 'UPI app' },
  { name: 'MobiKwik', packageName: 'com.mobikwik_new', type: 'UPI app' },
  { name: 'Freecharge', packageName: 'com.freecharge.android', type: 'UPI app' },
  { name: 'FamPay', packageName: 'com.fampay.in', type: 'UPI app' },
  { name: 'HDFC Bank', packageName: 'com.snapwork.hdfc', type: 'Bank app' },
  { name: 'ICICI Bank iMobile', packageName: 'com.csam.icici.bank.imobile', type: 'Bank app' },
  { name: 'SBI YONO', packageName: 'com.sbi.lotusintouch', type: 'Bank app' },
  { name: 'Kotak', packageName: 'com.msf.kbank.mobile', type: 'Bank app' },
  { name: 'Axis Bank', packageName: 'com.axis.mobile', type: 'Bank app' },
  { name: 'Bank of Baroda', packageName: 'com.bankofbaroda.mconnect', type: 'Bank app' },
  { name: 'Union Bank', packageName: 'com.infrasoft.uboi', type: 'Bank app' },
  { name: 'PNB', packageName: 'com.fss.pnbpsp', type: 'Bank app' },
  { name: 'Canara Bank', packageName: 'com.canarabank.mobility', type: 'Bank app' },
  { name: 'IndusInd Bank', packageName: 'com.indusind.indusmobile', type: 'Bank app' },
  { name: 'IDFC FIRST Bank', packageName: 'com.idfcfirstbank.optimus', type: 'Bank app' },
];

export const SUPPORTED_APPS_SUMMARY = 'Google Pay, PhonePe, Paytm, BHIM and other supported UPI and bank apps';
