// tests/login.test.js

// ============================================
// 1. MOCK ALL DEPENDENCIES FIRST
// ============================================

// ✅ Use jest.mock (not doMock) - these will be hoisted
jest.mock('../src/utils/otp', () => ({
  sendOtpEmail: jest.fn().mockResolvedValue(true),
  verifyOtp: jest.fn().mockReturnValue(true),
  generateSecret: jest.fn().mockReturnValue('JBSWY3DPEHPK3PXP')
}));

jest.mock('../src/utils/notifications', () => ({
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendAccountLockedEmail: jest.fn().mockResolvedValue(true),
  sendAccountUnlockedEmail: jest.fn().mockResolvedValue(true)
}));

jest.mock('@react-email/render', () => ({
  render: jest.fn().mockReturnValue('<html>Mock email</html>')
}));

jest.mock('../src/utils/mailer', () => ({
  transporter: {
    sendMail: jest.fn().mockResolvedValue(true)
  }
}));

// ✅ Fix: Database mock with shared mockExecute
const mockExecute = jest.fn().mockResolvedValue([[], []]);
jest.mock('../src/config/database', () => ({
  execute: mockExecute,
  pool: {
    execute: mockExecute
  }
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hashed_password')
}));

jest.mock('../src/utils/logger', () => ({
  writeLog: jest.fn().mockResolvedValue(true),
  log: jest.fn(),
  error: jest.fn(),
  info: jest.fn()
}));

jest.mock('../src/middleware/csrf', () => ({
  ensureCsrfToken: jest.fn().mockReturnValue('mock-csrf-token')
}));

// ============================================
// 2. IMPORT THE FUNCTION
// ============================================

const authRoutes = require('../src/routes/auth');
const { handleLogin } = authRoutes;
const bcrypt = require('bcrypt');
const pool = require('../src/config/database');
const { writeLog } = require('../src/utils/logger');

// ============================================
// 3. TESTS
// ============================================

describe('handleLogin - Login Function Tests', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Reset bcrypt to default
    bcrypt.compare.mockResolvedValue(true);
    
    // Reset database mock to default
    mockExecute.mockResolvedValue([[], []]);

    // Mock request object
    mockReq = {
      body: {
        username: 'testuser',
        password: 'Test123!'
      },
      ip: '127.0.0.1',
      session: {
        regenerate: jest.fn((cb) => cb(null)),
        save: jest.fn((cb) => cb(null)),
        user: null,
        pendingUser: null,
        otpAttempts: 0,
        createdAt: null,
        destroy: jest.fn()
      },
      sessionID: 'test-session-id'
    };

    // Mock response object
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  // ============================================
  // TEST: Successful Login with 2FA
  // ============================================
  test('should successfully login a user with correct credentials (2FA enabled)', async () => {
    const mockUser = {
      user_id: 1,
      username: 'testuser',
      password_hash: 'hashed_password',
      role: 'user',
      status: 'active',
      otp_enabled: 1,
      otp_secret: 'JBSWY3DPEHPK3PXP',
      failed_attempts: 0,
      locked_until: null,
      first_name: 'Test',
      last_name: 'User',
      email: 'test@test.com',
      account_number: '1234567890'
    };

    pool.execute.mockResolvedValueOnce([[mockUser], []]);
    bcrypt.compare.mockResolvedValueOnce(true);

    await handleLogin(mockReq, mockRes, 'user');

    expect(mockRes.status).toHaveBeenCalledWith(202);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Awaiting Authenticator Challenge Code',
      requires2FA: true,
      isSetupPending: false,
      mfaToken: expect.any(String)
    });
  });

  // ============================================
  // TEST: 2FA Setup Pending
  // ============================================
  test('should handle 2FA setup pending scenario', async () => {
    const mockUser = {
      user_id: 1,
      username: 'testuser',
      password_hash: 'hashed_password',
      role: 'user',
      status: 'active',
      otp_enabled: 1,
      otp_secret: null,
      failed_attempts: 0,
      locked_until: null,
      first_name: 'Test',
      last_name: 'User',
      email: 'test@test.com',
      account_number: '1234567890'
    };

    pool.execute.mockResolvedValueOnce([[mockUser], []]);
    bcrypt.compare.mockResolvedValueOnce(true);

    await handleLogin(mockReq, mockRes, 'user');

    expect(mockRes.status).toHaveBeenCalledWith(202);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Awaiting Mandatory 2FA Onboarding',
      requires2FA: true,
      isSetupPending: true,
      mfaToken: expect.any(String)
    });
  });

  // ============================================
  // TEST: User Not Found
  // ============================================
  test('should return 401 if user not found', async () => {
    pool.execute.mockResolvedValueOnce([[], []]);

    await handleLogin(mockReq, mockRes, 'user');

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    expect(writeLog).toHaveBeenCalledWith({
      userRole: 'user',
      action: 'LOGIN',
      status: 'failure',
      ipAddress: '127.0.0.1'
    });
  });

  // ============================================
  // TEST: Wrong Password
  // ============================================
  test('should return 401 if password is incorrect', async () => {
    const mockUser = {
      user_id: 1,
      username: 'testuser',
      password_hash: 'hashed_password',
      role: 'user',
      status: 'active',
      failed_attempts: 0,
      locked_until: null
    };

    pool.execute.mockResolvedValueOnce([[mockUser], []]);
    bcrypt.compare.mockResolvedValueOnce(false);

    await handleLogin(mockReq, mockRes, 'user');

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET failed_attempts = ?'),
      [1, mockUser.user_id]
    );
  });

  // ============================================
  // TEST: Account Locked
  // ============================================
  test('should return 423 if account is locked', async () => {
    const mockUser = {
      user_id: 1,
      username: 'testuser',
      password_hash: 'hashed_password',
      role: 'user',
      status: 'active',
      locked_until: new Date(Date.now() + 600000),
      failed_attempts: 5
    };

    pool.execute.mockResolvedValueOnce([[mockUser], []]);

    await handleLogin(mockReq, mockRes, 'user');

    expect(mockRes.status).toHaveBeenCalledWith(423);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Account is temporarily locked. Try again later.'
    });
  });

  // ============================================
  // TEST: Account Inactive
  // ============================================
  test('should return 403 if account is inactive', async () => {
    const mockUser = {
      user_id: 1,
      username: 'testuser',
      password_hash: 'hashed_password',
      role: 'user',
      status: 'inactive',
      locked_until: null,
      failed_attempts: 0
    };

    pool.execute.mockResolvedValueOnce([[mockUser], []]);

    await handleLogin(mockReq, mockRes, 'user');

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Account is not active.'
    });
  });

  // ============================================
  // TEST: Lock After 5 Failed Attempts
  // ============================================
  test('should lock account after 5 failed attempts', async () => {
    const mockUser = {
      user_id: 1,
      username: 'testuser',
      password_hash: 'hashed_password',
      role: 'user',
      status: 'active',
      failed_attempts: 4,
      locked_until: null
    };

    pool.execute.mockResolvedValueOnce([[mockUser], []]);
    bcrypt.compare.mockResolvedValueOnce(false);

    await handleLogin(mockReq, mockRes, 'user');

    // Check that the lock update was called with correct values
    // Note: LOCK_MINUTES is 15 in the code
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET failed_attempts = ?, locked_until = (NOW() + INTERVAL ? MINUTE)'),
      [5, 15, mockUser.user_id]
    );
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  // ============================================
  // TEST: Admin Login
  // ============================================
  test('should handle admin login successfully', async () => {
    const mockAdmin = {
      admin_id: 1,
      username: 'admin',
      password_hash: 'hashed_password',
      role: 'admin',
      first_name: 'Admin',
      last_name: 'User'
    };

    // Set admin username in request
    mockReq.body.username = 'admin';
    
    pool.execute.mockResolvedValueOnce([[mockAdmin], []]);
    bcrypt.compare.mockResolvedValueOnce(true);

    await handleLogin(mockReq, mockRes, 'admin');

    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM admins'),
      ['admin']
    );
    expect(mockRes.status).toHaveBeenCalledWith(202);
  });

  // ============================================
  // TEST: Admin Wrong Password
  // ============================================
  test('should return 401 for admin with wrong password', async () => {
    const mockAdmin = {
      admin_id: 1,
      username: 'admin',
      password_hash: 'hashed_password',
      role: 'admin'
    };

    mockReq.body.username = 'admin';
    pool.execute.mockResolvedValueOnce([[mockAdmin], []]);
    bcrypt.compare.mockResolvedValueOnce(false);

    await handleLogin(mockReq, mockRes, 'admin');

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });

  // ============================================
  // TEST: Database Error
  // ============================================
  test('should handle database errors gracefully', async () => {
    // ✅ This is the test that was failing in CI
    // Now properly mocked
    pool.execute.mockRejectedValueOnce(new Error('Database connection failed'));

    await handleLogin(mockReq, mockRes, 'user');

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Login failed' });
    expect(writeLog).toHaveBeenCalled();
  });

  
  // ============================================
  // TEST: Missing Request Body
  // ============================================
  test('should handle missing request body fields', async () => {
    mockReq.body = {};

    await handleLogin(mockReq, mockRes, 'user');

    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM users'),
      [undefined]
    );
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  
});