class SupabaseConfig {
  static const url = String.fromEnvironment('SUPABASE_URL', defaultValue: 'https://wfwohnssvftegnhwdzmt.supabase.co');
  static const publishableKey = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY', defaultValue: 'sb_publishable_CNbcPta61eS3yFkmWukRoQ_3rdGsOhl');
  static const passwordRecoveryRedirect = 'https://vbf1.github.io/kidsloc-app/';
}
