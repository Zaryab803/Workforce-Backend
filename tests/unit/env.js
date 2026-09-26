process.env.NODE_ENV = "test";
process.env.DATABASE_URL ||=
  "postgresql://test:test@localhost/orbit_test?schema=workforce_test";
process.env.DIRECT_URL ||= process.env.DATABASE_URL;
process.env.JWT_ACCESS_SECRET ||=
  "unit-test-secret-that-is-never-a-production-secret";
process.env.REDIS_URL ||= "redis://localhost:6379";
process.env.LOG_LEVEL = "silent";

process.env.EMAIL_ENABLED = "false";
process.env.ONESIGNAL_ENABLED = "false";
