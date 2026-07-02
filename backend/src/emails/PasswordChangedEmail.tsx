import * as React from "react";
import {
  Html,
  Container,
  Section,
  Heading,
  Text,
  Hr,
} from "@react-email/components";

interface PasswordChangedEmailProps {
  username?: string;
  changedAt?: string;
}

export default function PasswordChangedEmail({ username, changedAt }: PasswordChangedEmailProps) {
  return (
    <Html lang="en">
      <Container style={container}>
        <Section style={section}>
          <Heading style={heading}>Your password was changed</Heading>
          {username && (
            <Text style={text}>Hi <strong>{username}</strong>,</Text>
          )}
          <Text style={text}>
            This is a confirmation that the password for your account was just
            changed{changedAt ? <> on <strong>{changedAt}</strong></> : null}.
          </Text>
          <Section style={noticeBox}>
            <Text style={noticeText}>
              If you made this change, no further action is needed.
            </Text>
          </Section>
          <Hr />
          <Text style={footer}>
            If you didn't request this change, please contact support immediately and secure your account.
          </Text>
        </Section>
      </Container>
    </Html>
  );
}

const container = { fontFamily: "Arial, sans-serif", maxWidth: "480px", margin: "0 auto" };
const section = { padding: "32px", backgroundColor: "#ffffff", borderRadius: "8px" };
const heading = { fontSize: "22px", color: "#1d4ed8" };
const text = { fontSize: "15px", color: "#374151" };
const noticeBox = { background: "#eff6ff", borderRadius: "8px", padding: "16px", textAlign: "center" as const };
const noticeText = { fontSize: "15px", color: "#1d4ed8", margin: 0 };
const footer = { fontSize: "12px", color: "#9ca3af" };