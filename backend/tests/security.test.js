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

// Now it is 100% safe to import the app blueprint without any compilation blocks!
const app = require('../src/app');

describe('🔒 SecureBank Global Access Control Validation', () => {

  // ------------------------------------------------------------------
  // Unauthenticated access — every session-gated endpoint must 401
  // ------------------------------------------------------------------
  const protectedEndpoints = [
    // --- Auth (session-gated only) ---
    { path: '/api/auth/logout', method: 'post' },

    // --- User (requireAuth('user')) ---
    { path: '/api/user/dashboard', method: 'get' },
    { path: '/api/user/profile', method: 'get' },
    { path: '/api/user/profile', method: 'put' },
    { path: '/api/user/generate-2fa', method: 'post' },
    { path: '/api/user/verify-and-activate-2fa', method: 'post' },
    { path: '/api/user/password', method: 'put' },
    { path: '/api/user/transactions', method: 'get' },
    { path: '/api/user/recipients', method: 'get' },
    { path: '/api/user/recipients', method: 'post' },
    { path: '/api/user/recipients/1', method: 'delete' },
    { path: '/api/user/lookup', method: 'get' },
    { path: '/api/user/transfer', method: 'post' },
    { path: '/api/user/disable-2fa', method: 'post' },

    // --- Admin (requireAuth() + role check) ---
    { path: '/api/admin/users', method: 'get' },
    { path: '/api/admin/users', method: 'post' },
    { path: '/api/admin/users/1', method: 'put' },
    { path: '/api/admin/users/1/status', method: 'put' },
    { path: '/api/admin/transactions', method: 'get' },
    { path: '/api/admin/logs', method: 'get' },
    { path: '/api/admin/create-business-admin', method: 'post' },
    { path: '/api/admin/list-admins', method: 'get' },
  ];

  protectedEndpoints.forEach(({ path, method }) => {
    it(`should deny unauthorized access to ${method.toUpperCase()} ${path}`, async () => {
      const res = await request(app)[method](path).set('Accept', 'application/json');

      // Asserts that the requireAuth interceptor stops requests with a 401
      expect(res.statusCode).toBe(401);
    });
  });

  // ------------------------------------------------------------------
  // GET /api/auth/me — special case, returns 401 when unauthenticated
  // ------------------------------------------------------------------
  it('should return 401 and user null for GET /api/auth/me with no session', async () => {
    const res = await request(app).get('/api/auth/me').set('Accept', 'application/json');

    expect(res.statusCode).toBe(401);
    expect(res.body.user).toBeNull();
  });

});

// ==========================================================================
// Admin role boundary validation (Skipped for now until session helper is wired)
// ==========================================================================
describe.skip('🔒 SecureBank Admin Role Boundary Validation', () => {
  const businessAdminOnlyRoutes = [
    { path: '/api/admin/users', method: 'get' },
    { path: '/api/admin/users', method: 'post' },
    { path: '/api/admin/users/1', method: 'put' },
    { path: '/api/admin/users/1/status', method: 'put' },
    { path: '/api/admin/transactions', method: 'get' },
  ];

  const itAdminOnlyRoutes = [
    { path: '/api/admin/logs', method: 'get' },
    { path: '/api/admin/create-business-admin', method: 'post' },
    { path: '/api/admin/list-admins', method: 'get' },
  ];

  function sessionCookieFor(role) {
    throw new Error('sessionCookieFor() is a placeholder');
  }

  describe('generic admin role (super-admin bypass)', () => {
    [...businessAdminOnlyRoutes, ...itAdminOnlyRoutes].forEach(({ path, method }) => {
      it(`allows role='admin' to reach ${method.toUpperCase()} ${path}`, async () => {
        const cookie = sessionCookieFor('admin');
        const res = await request(app)[method](path).set('Cookie', cookie).set('Accept', 'application/json');
        expect(res.statusCode).not.toBe(403);
      });
    });
  });
});