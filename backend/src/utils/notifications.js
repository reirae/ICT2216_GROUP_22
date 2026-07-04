const { render } = require("@react-email/render");
const { transporter } = require("./mailer");

// ts-node is already registered by otp.js when loaded first, but we register
// here too so this module is independently requireable in any order.
require("ts-node").register({ transpileOnly: true });
const PasswordChangedEmail = require("../emails/PasswordChangedEmail").default;

async function sendPasswordChangedEmail(email, username) {
  const changedAt = new Date().toLocaleString("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const html = await render(PasswordChangedEmail({ username, changedAt }));

  await transporter.sendMail({
    from: `"SecureBank" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Your PIN was changed",
    html,
  });

}

module.exports = { sendPasswordChangedEmail };