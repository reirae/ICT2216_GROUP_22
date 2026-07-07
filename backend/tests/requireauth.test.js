
const { requireAuth } = require('../src/middleware/auth');

jest.mock('../src/config/database', () => ({
  execute: jest.fn(),  // ← This is for direct import
  pool: {
    execute: jest.fn()  // ← This is what your code uses
  }
}));

jest.mock('../src/utils/logger', () => ({
  writeLog: jest.fn().mockResolvedValue(true)
}));

// ✅ Import AFTER mocks
const pool = require('../src/config/database');
const { writeLog } = require('../src/utils/logger');

// ✅ Get the mock function reference
const mockPoolExecute = pool.pool.execute;

describe('requireAuth Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;
  let mockSession;
  let mockDestroy;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDestroy = jest.fn((cb) => cb(null));

    mockSession = {
      user: {
        id: '1',
        role: 'user',
        username: 'testuser'
      },
      createdAt: Date.now(),
      destroy: mockDestroy,
      sessionID: 'test-session-id'
    };

    mockReq = {
      session: mockSession,
      ip: '127.0.0.1',
      sessionID: 'test-session-id'
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      clearCookie: jest.fn()
    };

    mockNext = jest.fn();

    // ✅ Use pool.pool.execute or the reference
    mockPoolExecute.mockResolvedValue([[{ active_session_id: 'test-session-id' }], []]);
    // OR: pool.pool.execute.mockResolvedValue([...])
    writeLog.mockResolvedValue(true);

    process.env.SESSION_COOKIE_NAME = 'securebank.sid';
    process.env.ABSOLUTE_TIMEOUT_MS = '86400000';
  });

  afterEach(() => {
    delete process.env.SESSION_COOKIE_NAME;
    delete process.env.ABSOLUTE_TIMEOUT_MS;
  });

  // ============================================
  // 1. AUTHENTICATION REQUIRED TESTS
  // ============================================

  describe('Authentication Required', () => {
    test('should return 401 if no session exists', async () => {
      mockReq.session = null;

      const middleware = requireAuth();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(writeLog).toHaveBeenCalledWith({
        userRole: 'anonymous',
        action: 'AUTH_REQUIRED',
        status: 'failure',
        ipAddress: '127.0.0.1'
      });
    });

    test('should return 401 if session exists but no user', async () => {
      mockReq.session = {};

      const middleware = requireAuth();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 2. CONCURRENT SESSION TESTS
  // ============================================

  describe('Concurrent Session Verification', () => {
    test('should allow access when session ID matches database', async () => {
      const middleware = requireAuth();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockPoolExecute).toHaveBeenCalledWith(
        expect.stringContaining('SELECT active_session_id FROM users'),
        ['1']
      );
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should terminate session when session ID does NOT match database', async () => {
      mockPoolExecute.mockResolvedValueOnce([[{ active_session_id: 'different-session-id' }], []]);

      const middleware = requireAuth();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockDestroy).toHaveBeenCalled();
      expect(mockRes.clearCookie).toHaveBeenCalledWith('securebank.sid');
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Your account was logged in from another location. This session has been terminated.'
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(writeLog).toHaveBeenCalledWith({
        userId: '1',
        userRole: 'user',
        action: 'SESSION_TERMINATED_CONCURRENT',
        status: 'success',
        ipAddress: '127.0.0.1'
      });
    });

    test('should handle admin user concurrent session check', async () => {
      mockReq.session.user.role = 'admin';
      mockPoolExecute.mockResolvedValueOnce([[{ active_session_id: 'test-session-id' }], []]);

      const middleware = requireAuth();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockPoolExecute).toHaveBeenCalledWith(
        expect.stringContaining('SELECT active_session_id FROM admins'),
        ['1']
      );
      expect(mockNext).toHaveBeenCalled();
    });

    test('should handle database error during session validation', async () => {
      mockPoolExecute.mockRejectedValueOnce(new Error('Database connection failed'));

      const middleware = requireAuth();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server safety verification failed.'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should handle no rows returned from database', async () => {
      mockPoolExecute.mockResolvedValueOnce([[], []]);

      const middleware = requireAuth();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockDestroy).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Your account was logged in from another location. This session has been terminated.'
      });
    });
  });

  // ============================================
  // 3. SESSION TIMEOUT TESTS
  // ============================================

  describe('Session Timeout Verification', () => {
    test('should allow access when session is within timeout', async () => {
      const middleware = requireAuth();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should terminate session when absolute timeout is exceeded', async () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      mockReq.session.createdAt = oldTime;

      const middleware = requireAuth();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockDestroy).toHaveBeenCalled();
      expect(mockRes.clearCookie).toHaveBeenCalledWith('securebank.sid');
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Session expired. Please log in again.'
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(writeLog).toHaveBeenCalledWith({
        userId: '1',
        userRole: 'user',
        action: 'SESSION_EXPIRED',
        status: 'success',
        ipAddress: '127.0.0.1'
      });
    });

    test('should handle missing createdAt in session', async () => {
      delete mockReq.session.createdAt;

      const middleware = requireAuth();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockDestroy).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Session expired. Please log in again.'
      });
    });
  });

  // ============================================
  // 4. ROLE-BASED ACCESS CONTROL TESTS
  // ============================================

  describe('Role-Based Access Control', () => {
    test('should allow access when role matches', async () => {
      const middleware = requireAuth('user');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should return 403 when role does NOT match', async () => {
      const middleware = requireAuth('admin');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Forbidden'
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(writeLog).toHaveBeenCalledWith({
        userId: '1',
        userRole: 'user',
        action: 'AUTH_REQUIRED',
        status: 'failure',
        ipAddress: '127.0.0.1'
      });
    });

    test('should allow access when no role is required', async () => {
      const middleware = requireAuth();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should allow admin access when role matches admin', async () => {
      mockReq.session.user.role = 'admin';
      mockPoolExecute.mockResolvedValueOnce([[{ active_session_id: 'test-session-id' }], []]);

      const middleware = requireAuth('admin');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 5. SESSION DESTROY ERROR HANDLING
  // ============================================

  describe('Session Destroy Error Handling', () => {
    test('should handle error during session destroy', async () => {
      const destroyError = new Error('Destroy failed');
      mockReq.session.destroy = jest.fn((cb) => cb(destroyError));

      mockPoolExecute.mockResolvedValueOnce([[{ active_session_id: 'different-session-id' }], []]);

      const middleware = requireAuth();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Your account was logged in from another location. This session has been terminated.'
      });
    });
  });
   

   
});