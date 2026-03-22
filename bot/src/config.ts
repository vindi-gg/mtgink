const REQUIRED_VARS = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type ConfigKey = (typeof REQUIRED_VARS)[number];
type Config = Record<ConfigKey, string>;

function loadConfig(): Config {
  const missing: string[] = [];
  const config = {} as Config;

  for (const key of REQUIRED_VARS) {
    const val = process.env[key];
    if (!val) {
      missing.push(key);
    } else {
      config[key] = val;
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  return config;
}

export const config = loadConfig();
