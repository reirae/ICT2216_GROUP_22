const { render } = require("@react-email/render");
const { transporter } = require("./mailer");

// Register ts-node so .tsx files can be required
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

  console.log(`Password-changed notice sent to ${email}`);
}

module.exports = { sendPasswordChangedEmail };