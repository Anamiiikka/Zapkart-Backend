const { signAccessToken, signRefreshToken, verifyToken } = require('../../src/utils/jwt');

describe('JWT helpers', () => {
  const testPayload = { sub: 123, role: 'customer' };

  describe('signAccessToken', () => {
    it('signs a valid access token', () => {
      const token = signAccessToken(testPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('includes payload claims in token', () => {
      const token = signAccessToken(testPayload);
      const decoded = verifyToken(token);
      expect(decoded.sub).toBe(123);
      expect(decoded.role).toBe('customer');
    });

    it('sets expiration time', () => {
      const token = signAccessToken(testPayload);
      const decoded = verifyToken(token);
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });
  });

  describe('signRefreshToken', () => {
    it('signs a valid refresh token', () => {
      const token = signRefreshToken(testPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('has longer expiration than access token', () => {
      const accessToken = signAccessToken(testPayload);
      const refreshToken = signRefreshToken(testPayload);
      
      const accessDecoded = verifyToken(accessToken);
      const refreshDecoded = verifyToken(refreshToken);
      
      // Refresh token should expire later than access token
      expect(refreshDecoded.exp).toBeGreaterThan(accessDecoded.exp);
    });

    it('includes payload claims in token', () => {
      const token = signRefreshToken(testPayload);
      const decoded = verifyToken(token);
      expect(decoded.sub).toBe(123);
      expect(decoded.role).toBe('customer');
    });
  });

  describe('verifyToken', () => {
    it('verifies a valid token', () => {
      const token = signAccessToken(testPayload);
      const decoded = verifyToken(token);
      expect(decoded.sub).toBe(123);
      expect(decoded.role).toBe('customer');
    });

    it('throws on invalid token', () => {
      expect(() => verifyToken('invalid.token.here')).toThrow();
    });

    it('throws on tampered token', () => {
      const token = signAccessToken(testPayload);
      const tamperedToken = token.slice(0, -5) + 'xxxxx';
      expect(() => verifyToken(tamperedToken)).toThrow();
    });

    it('throws on malformed token', () => {
      expect(() => verifyToken('not-a-jwt')).toThrow();
    });

    it('throws on empty token', () => {
      expect(() => verifyToken('')).toThrow();
    });
  });

  describe('token payload preservation', () => {
    it('preserves additional payload fields', () => {
      const extendedPayload = { 
        sub: 456, 
        role: 'admin',
        customField: 'custom-value'
      };
      const token = signAccessToken(extendedPayload);
      const decoded = verifyToken(token);
      
      expect(decoded.sub).toBe(456);
      expect(decoded.role).toBe('admin');
      expect(decoded.customField).toBe('custom-value');
    });
  });
});
