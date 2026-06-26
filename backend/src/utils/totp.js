const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

// Generate a random Base32 secret key for the user
function generateSecret() {
  // Speakeasy returns an object with various encodings. We just want the base32 string.
  const secret = speakeasy.generateSecret({ name: 'SecureBank' });
  return secret.base32; 
}

// Generate the scannable QR Code image (as a Data URL)
async function generateQRCode(username, secret) {
  try {
    // Creates the specific URI format that Google Authenticator expects
    const otpauthUrl = speakeasy.otpauthURL({
      secret: secret,
      label: username,
      issuer: 'SecureBank',
      encoding: 'base32'
    });

    // Converts the URI into an image format the frontend can display
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);
    return qrCodeUrl;
  } catch (err) {
    console.error('Error generating QR code:', err);
    throw err;
  }
}

// Verify the 6-digit code typed by the user against their saved secret
function verifyTOTP(token, secret) {
  try {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 0 // Hard enforcement. 0 means ONLY accept the exact current 30s code.
    });
  } catch (err) {
    console.error('Error verifying TOTP:', err);
    return false;
  }
}

module.exports = { generateSecret, generateQRCode, verifyTOTP };