const readRequired = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const env = {
  supabaseUrl: readRequired("SUPABASE_URL"),
  supabaseServiceRoleKey: readRequired("SUPABASE_SERVICE_ROLE_KEY"),
  horizonUrl: readRequired("HORIZON_URL"),
  stellarNetworkPassphrase: readRequired("STELLAR_NETWORK_PASSPHRASE"),
};
