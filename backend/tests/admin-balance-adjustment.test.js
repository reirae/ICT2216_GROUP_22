const express = require('express');
const request = require('supertest');

const mockExecute = jest.fn();
const mockRunTransaction = jest.fn(async (work) => work({ execute: mockExecute }));
const mockWriteLog = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/config/database', () => ({
  pool: { execute: jest.fn() },
  runTransaction: (...args) => mockRunTransaction(...args),
}));
jest.mock('../src/middleware/auth', () => ({
  requireAuth: () => (_req, _res, next) => next(),
}));
jest.mock('../src/utils/logger', () => ({
  writeLog: (...args) => mockWriteLog(...args),
}));

const adminRouter = require('../src/routes/admin');

function makeApp(role = 'business_admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { user: { id: 7, role } };
    next();
  });
  app.use('/api/admin', adminRouter);
  return app;
}

describe('business admin balance adjustments', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockRunTransaction.mockClear();
    mockWriteLog.mockClear();
  });

  test.each(['-500', '0', '1.001', 'not-money', '99999999999999']) (
    'rejects invalid amount %s before starting a transaction',
    async (amount) => {
      const response = await request(makeApp())
        .post('/api/admin/users/12/balance-adjustment')
        .send({ operation: 'deposit', amount });

      expect(response.statusCode).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(mockRunTransaction).not.toHaveBeenCalled();
    }
  );

  it('rejects non-business-admin roles', async () => {
    const response = await request(makeApp('user'))
      .post('/api/admin/users/12/balance-adjustment')
      .send({ operation: 'deposit', amount: '50.00' });

    expect(response.statusCode).toBe(403);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('deposits and records the matching credit while the customer row is locked', async () => {
    mockExecute
      .mockResolvedValueOnce([[{ user_id: 12, balance: '100.00', status: 'active' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ balance: '150.00' }]]);

    const response = await request(makeApp())
      .post('/api/admin/users/12/balance-adjustment')
      .send({ operation: 'deposit', amount: '50.00' });

    expect(response.statusCode).toBe(200);
    expect(response.body.balance).toBe('150.00');
    expect(mockExecute.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(mockExecute.mock.calls[1]).toEqual(expect.arrayContaining([
      expect.stringContaining('balance = balance + ?'),
      ['50.00', '12'],
    ]));
    expect(mockExecute.mock.calls[2][1]).toEqual(['12', '50.00', 'ADMIN_DEPOSIT $50.00 TO 12 BY ADMIN 7']);
    expect(mockWriteLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      action: 'ADMIN_DEPOSIT $50.00 TO 12',
      status: 'success',
    }));
  });

  it('prevents an overdraft and does not insert transaction history', async () => {
    mockExecute
      .mockResolvedValueOnce([[{ user_id: 12, balance: '25.00', status: 'active' }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);

    const response = await request(makeApp())
      .post('/api/admin/users/12/balance-adjustment')
      .send({ operation: 'withdrawal', amount: '50.00' });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe('Insufficient balance');
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockExecute.mock.calls[1]).toEqual(expect.arrayContaining([
      expect.stringContaining('balance >= ?'),
      ['50.00', '12', '50.00'],
    ]));
    expect(mockWriteLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ADMIN_WITHDRAWAL $50.00 FROM 12',
      status: 'failure',
    }));
  });
});
