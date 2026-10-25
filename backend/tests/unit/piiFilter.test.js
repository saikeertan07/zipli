const { redactOutboundPII } = require('../../src/ai/piiFilter');

describe('PII Redaction Filter (P1)', () => {
  test('redacts email addresses from messages', () => {
    const input = 'My email is test.user@example.co.in please reach me there';
    const result = redactOutboundPII(input);
    expect(result.hasPII).toBe(true);
    expect(result.redactedTypes).toContain('email');
    expect(result.sanitizedText).toContain('[EMAIL_REDACTED]');
    expect(result.sanitizedText).not.toContain('test.user@example.co.in');
  });

  test('redacts Indian mobile phone numbers in multiple formats', () => {
    const inputs = [
      'Call me at 9876543210',
      'Contact +91 98765 43210',
      'My number is 8123456789 for delivery updates',
    ];

    for (const text of inputs) {
      const result = redactOutboundPII(text);
      expect(result.hasPII).toBe(true);
      expect(result.redactedTypes).toContain('phone');
      expect(result.sanitizedText).toContain('[PHONE_REDACTED]');
      expect(result.sanitizedText).not.toMatch(/9876543210|98765 43210|8123456789/);
    }
  });

  test('redacts 16-digit payment card numbers', () => {
    const input = 'My card number is 4532-1234-5678-9012 for the purchase';
    const result = redactOutboundPII(input);
    expect(result.hasPII).toBe(true);
    expect(result.redactedTypes).toContain('card');
    expect(result.sanitizedText).toContain('[CARD_REDACTED]');
    expect(result.sanitizedText).not.toContain('4532');
  });

  test('redacts addresses and Indian postal pincodes', () => {
    const input = 'Deliver to Flat 402, Green Glen Layout, Bangalore 560103';
    const result = redactOutboundPII(input);
    expect(result.hasPII).toBe(true);
    expect(result.redactedTypes).toContain('address');
    expect(result.sanitizedText).toContain('[ADDRESS_REDACTED]');
  });

  test('passes clean grocery queries without modification', () => {
    const cleanInputs = [
      'Add 1kg tomatoes and Amul butter',
      'What are some healthy breakfast substitutes for cornflakes?',
      'Show me ingredients for vegetable biryani',
    ];

    for (const text of cleanInputs) {
      const result = redactOutboundPII(text);
      expect(result.hasPII).toBe(false);
      expect(result.redactedTypes.length).toBe(0);
      expect(result.sanitizedText).toBe(text);
    }
  });

  test('handles null, undefined, and non-string inputs safely', () => {
    expect(redactOutboundPII(null)).toEqual({
      sanitizedText: '',
      hasPII: false,
      redactedTypes: [],
    });
    expect(redactOutboundPII(undefined)).toEqual({
      sanitizedText: '',
      hasPII: false,
      redactedTypes: [],
    });
    expect(redactOutboundPII(12345)).toEqual({
      sanitizedText: '',
      hasPII: false,
      redactedTypes: [],
    });
  });
});
