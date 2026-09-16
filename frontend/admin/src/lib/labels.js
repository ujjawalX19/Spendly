/** Human names for recorded event names (backend/lib/appEvents.js). */
export const EVENT_LABELS = {
  first_launch: 'App first launch', app_open: 'App opened', signup: 'Sign-up', signup_failed: 'Sign-up failed',
  login: 'Sign-in', login_failed: 'Sign-in failed', logout: 'Sign-out', google_sign_in_started: 'Google sign-in started',
  auth_callback_failed: 'Auth callback / deep link failed', password_reset_requested: 'Password reset requested',
  password_reset_failed: 'Password reset failed', password_updated: 'Password changed', ai_mentor_opened: 'AI Mentor opened',
  app_crash: 'App crash (error screen)', expense_created: 'Expense created', expense_create_failed: 'Expense save failed',
  expense_edited: 'Expense edited', expense_deleted: 'Expense deleted', receipt_scanned: 'Receipt scanned',
  receipt_scan_failed: 'Receipt scan failed', csv_exported: 'CSV export', csv_export_failed: 'CSV export failed',
  pdf_imported: 'PDF statement import', pdf_import_failed: 'PDF import failed', ai_question_answered: 'AI question answered',
  ai_question_failed: 'AI question failed', group_created: 'Group created', group_joined: 'Group joined',
  group_join_failed: 'Group join failed', group_expense_added: 'Group expense added', group_settlement: 'Group settlement',
  group_left: 'Left a group', profile_updated: 'Profile updated', recurring_bill_added: 'Recurring bill added',
  subscription_marked_cancelled: 'Subscription marked cancelled', account_deleted: 'Account deleted',
  account_delete_failed: 'Account deletion failed', pro_purchase_attempted: 'Pro purchase attempted',
};
