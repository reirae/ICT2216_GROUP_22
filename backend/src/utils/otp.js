const crypto = require("crypto");
const { render } = require("@react-email/render");
const { transporter } = require("./mailer");

// Register ts-node so .tsx files can be required
require("ts-node").register({ transpileOnly: true });
const OtpEmail = require("../emails/OtpEmail").default;

// TODO: Replace with Redis before going to production
const otpStore = new Map();

function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

function saveOtp(email, otp) {
  otpStore.set(email, {
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });
}

function verifyOtp(email, inputOtp) {
    console.log("Store contents:", [...otpStore.entries()]);
  console.log("Looking for:", email, "| Got:", inputOtp);
  const record = otpStore.get(email);
  if (!record) return false;
  if (Date.now() > record.expiresAt) {
    otpStore.delete(email);
    return false;
  }
  const valid = record.otp === inputOtp;
  if (valid) otpStore.delete(email); // one-time use
  return valid;
}

async function sendOtpEmail(email, username) {
  const otp = generateOtp();
  saveOtp(email, otp);

  const html = await render(OtpEmail({ otp, username }));

  await transporter.sendMail({
    from: `"SecureBank" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Your verification code",
    html,
  });

  console.log(`OTP sent to ${email}`);
}

// hello

module.exports = { generateOtp, saveOtp, verifyOtp, sendOtpEmail };