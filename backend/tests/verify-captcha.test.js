
const { verifyCaptcha } = require('../src/middleware/validation');

// Mock fetch globally
global.fetch = jest.fn();

describe('verifyCaptcha Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      body: {
        captcha: 'mock-captcha-token'
      }
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    mockNext = jest.fn();
    
    // Set environment variable
    process.env.CFTS_SECRET_KEY = 'test-secret-key';
  });

  afterEach(() => {
    delete process.env.CFTS_SECRET_KEY;
  });

  // ============================================
  // 1. SUCCESSFUL VERIFICATION TESTS
  // ============================================
  
  test('should call next() when captcha verification succeeds', async () => {
    // Mock successful Turnstile response
    const mockResponse = {
      success: true,
      'error-codes': []
    };
    
    global.fetch.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    });

    await verifyCaptcha(mockReq, mockRes, mockNext);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.any(URLSearchParams)
      }
    );
    
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockRes.json).not.toHaveBeenCalled();
  });

  test('should include secret key and token in request body', async () => {
    const mockResponse = { success: true };
    
    global.fetch.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    });

    await verifyCaptcha(mockReq, mockRes, mockNext);

    const fetchCall = global.fetch.mock.calls[0];
    const body = fetchCall[1].body;
    
    // Verify URLSearchParams contains secret and response
    expect(body.get('secret')).toBe('test-secret-key');
    expect(body.get('response')).toBe('mock-captcha-token');
  });

  // ============================================
  // 2. FAILED VERIFICATION TESTS
  // ============================================
  
  test('should return 400 when captcha token is missing', async () => {
    mockReq.body = {}; // No captcha field

    await verifyCaptcha(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Verification token missing. Please refresh.'
    });
    expect(mockNext).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('should return 400 when captcha token is empty string', async () => {
    mockReq.body.captcha = '';

    await verifyCaptcha(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Verification token missing. Please refresh.'
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should return 400 when Turnstile verification fails', async () => {
    const mockResponse = {
      success: false,
      'error-codes': ['invalid-input-response']
    };
    
    global.fetch.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    });

    await verifyCaptcha(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Verification failed. Please try again.'
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  // ============================================
  // 3. EDGE CASE TESTS
  // ============================================

  test('should handle multiple error codes from Turnstile', async () => {
    const mockResponse = {
      success: false,
      'error-codes': ['invalid-input-response', 'timeout-or-duplicate']
    };
    
    global.fetch.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    });

    await verifyCaptcha(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Verification failed. Please try again.'
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  // ============================================
  // 4. ERROR HANDLING TESTS
  // ============================================
  
  test('should return 500 when fetch fails with network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    await verifyCaptcha(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Verification service unavailable. Please try again.'
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should return 500 when Turnstile API returns invalid response', async () => {
    global.fetch.mockResolvedValueOnce({
      json: jest.fn().mockRejectedValueOnce(new Error('Invalid JSON'))
    });

    await verifyCaptcha(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Verification service unavailable. Please try again.'
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should handle missing error-codes in Turnstile response', async () => {
    const mockResponse = {
      success: false
      // No 'error-codes' field
    };
    
    global.fetch.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    });

    await verifyCaptcha(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Verification failed. Please try again.'
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

 
});