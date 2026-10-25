/**
 * @file smsProvider.test.js
 * @description Unit tests for SMS provider abstraction layer (P0 / P2).
 */

const {
  SMSProvider,
  FakeSMSProvider,
  Fast2SMSSMSProvider,
  getSMSProvider,
} = require('../../src/services/smsProvider');

describe('SMS Provider Unit Tests', () => {
  it('throws when calling abstract base methods directly', async () => {
    const base = new SMSProvider();
    await expect(base.sendOtp({})).rejects.toThrow('sendOtp() must be implemented');
    await expect(base.sendNotification({})).rejects.toThrow(
      'sendNotification() must be implemented'
    );
  });

  it('handles fake SMS provider notifications, records, and clearing', async () => {
    const fake = new FakeSMSProvider();
    const res = await fake.sendNotification({
      phone: '9876543210',
      message: 'Your Zipli order is arriving in 5 mins',
    });

    expect(res.success).toBe(true);
    expect(res.messageId).toBeDefined();
    expect(fake.sentMessages.length).toBe(1);

    fake.clear();
    expect(fake.sentMessages.length).toBe(0);
    expect(fake.getLastOtp('9876543210')).toBeNull();
  });

  it('handles Fast2SMS provider validation and missing API key error', async () => {
    const fast2sms = new Fast2SMSSMSProvider({ apiKey: '' });
    await expect(fast2sms.sendOtp({ phone: '9876543210', otp: '123456' })).rejects.toThrow(
      'SMS_API_KEY is not configured'
    );

    await expect(fast2sms.sendNotification({ phone: '9876543210', message: 'Hi' })).rejects.toThrow(
      'SMS_API_KEY is not configured'
    );
  });

  it('returns fake provider in test environment via getSMSProvider', () => {
    const provider = getSMSProvider();
    expect(provider.name).toBe('FAKE');
  });
});
