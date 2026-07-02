const request = require('supertest');

// 1. MOCK THE OTP MODULE TO PREVENT JEST FROM PARSING THE OTP EMAIL TEMPLATE
jest.mock('../src/utils/otp', () => ({
  sendOtpEmail: jest.fn().mockResolvedValue(true),
  verifyOtp: jest.fn().mockReturnValue(true)
}));

// 2. MOCK THE NOTIFICATIONS MODULE TO PREVENT JEST FROM PARSING THE PASSWORD EMAIL TEMPLATE
jest.mock('../src/utils/notifications', () => ({
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true)
}));

const app = require('../src/app');

// HELPER FUNCTION: Recursively extract all endpoints from the Express router stack
function getRoutes(router, prefix = '') {
  let routes = [];
  if (!router || !router.stack) return routes;

  router.stack.forEach((layer) => {
    if (layer.route) {
      // Direct route registered on this router layer
      const path = prefix + layer.route.path;
      Object.keys(layer.route.methods).forEach((method) => {
        routes.push({ path: path.replace(/\/+$/, ''), method });
      });
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      // Router middleware (e.g., app.use('/api/user', userRoutes))
      let newPrefix = prefix;
      if (layer.regexp && layer.regexp.source) {
        // Clean up Express route regex to extract the path prefix
        const match = layer.regexp.source
          .replace('^\\', '')
          .replace('\\/?(?=\\/|$)', '')
          .replace('(?=\\/|$)', '')
          .replace('\\/', '/');
        newPrefix = prefix + match.split('?')[0];
      }
      routes = routes.concat(getRoutes(layer.handle, newPrefix));
    }
  });
  return routes;
}

describe('🔒 SecureBank Global Access Control Validation', () => {
  let dynamicEndpoints = [];

  beforeAll(() => {
    // Dynamically scrape all endpoints from your Express app instance at runtime
    const allRoutes = getRoutes(app._router);
    
    // Filter to target only session-gated paths (/api/user and /api/admin)
    // Exclude /api/auth/me from the loop since it requires its own special assertion
    dynamicEndpoints = allRoutes.filter(({ path }) => 
      (path.startsWith('/api/user') || path.startsWith('/api/admin') || path === '/api/auth/logout') &&
      path !== '/api/auth/me'
    );
  });

  // This block runs dynamically based on whatever endpoints are parsed above!
  it('should deny unauthorized access to all protected endpoints', async () => {
    expect(dynamicEndpoints.length).toBeGreaterThan(0); // Sanity check that routes were found

    for (const { path, method } of dynamicEndpoints) {
      // Standardize dynamic path parameters (e.g., /api/user/recipients/:id -> /api/user/recipients/1)
      const testPath = path.replace(/:[a-zA-Z0-9_]+/g, '1');
      
      const res = await request(app)[method](testPath).set('Accept', 'application/json');
      
      // Every session-gated endpoint must return 401 when anonymous
      if (res.statusCode !== 401) {
        console.error(`❌ Access Control Failure on: ${method.toUpperCase()} ${path} (Received: ${res.statusCode})`);
      }
      expect(res.statusCode).toBe(401);
    }
  }, 30000);

  // ------------------------------------------------------------------
  // GET /api/auth/me — special case, returns 401 when unauthenticated
  // ------------------------------------------------------------------
  it('should return 401 and user null for GET /api/auth/me with no session', async () => {
    const res = await request(app).get('/api/auth/me').set('Accept', 'application/json');
    expect(res.statusCode).toBe(401);
    expect(res.body.user).toBeNull();
  });
});