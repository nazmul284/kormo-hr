/** Typed, validated runtime configuration. Fails fast at boot. */
export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  cookie: {
    domain: string;
    secure: boolean;
  };
  redisUrl: string;
  storage: {
    driver: 's3' | 'local';
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
    localDir: string;
  };
  throttle: { ttl: number; limit: number };
}

function required(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${key}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

const DEV_SECRET_MARKERS = ['change-me', 'dev-access-secret', 'dev-refresh-secret'];

export function loadConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];

  const accessSecret = required('JWT_ACCESS_SECRET');
  const refreshSecret = required('JWT_REFRESH_SECRET');

  // A placeholder secret in production would silently make every token
  // forgeable, so refuse to start rather than warn into the void.
  if (nodeEnv === 'production') {
    for (const [name, secret] of [['JWT_ACCESS_SECRET', accessSecret], ['JWT_REFRESH_SECRET', refreshSecret]]) {
      if (DEV_SECRET_MARKERS.some((marker) => secret.includes(marker)) || secret.length < 32) {
        throw new Error(`${name} is still a development placeholder. Set a strong secret before running in production.`);
      }
    }
    if (accessSecret === refreshSecret) {
      throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ.');
    }
  }

  return {
    nodeEnv,
    port: Number(process.env.API_PORT ?? 4000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    jwt: {
      accessSecret,
      refreshSecret,
      accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    },
    cookie: {
      domain: process.env.COOKIE_DOMAIN ?? 'localhost',
      secure: (process.env.COOKIE_SECURE ?? 'false') === 'true',
    },
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:56379',
    storage: {
      driver: (process.env.STORAGE_DRIVER ?? 'local') as 's3' | 'local',
      endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:59000',
      region: process.env.S3_REGION ?? 'us-east-1',
      bucket: process.env.S3_BUCKET ?? 'kormo-media',
      accessKey: process.env.S3_ACCESS_KEY ?? 'kormo',
      secretKey: process.env.S3_SECRET_KEY ?? 'kormo_dev_pw',
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
      localDir: process.env.STORAGE_LOCAL_DIR ?? '.storage',
    },
    throttle: {
      ttl: Number(process.env.THROTTLE_TTL ?? 60),
      limit: Number(process.env.THROTTLE_LIMIT ?? 300),
    },
  };
}

export const CONFIG = 'APP_CONFIG';
