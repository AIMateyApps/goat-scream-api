jest.setTimeout(30000);

process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';
process.env.RATE_LIMIT_MAX = '1000';
