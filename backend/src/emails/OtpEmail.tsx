import * as React from "react";
import {
  Html,
  Container,
  Section,
  Heading,
  Text,
  Hr,
} from "@react-email/components";

interface OtpEmailProps {
  otp: string;
  username?: string;
}

export default function OtpEmail({ otp, username }: OtpEmailProps) {
  return (
    <Html lang="en">
      <Container style={container}>
        <Section style={section}>
          <Heading style={heading}>Verify your account</Heading>
          {username && (
            <Text style={text}>Hi <strong>{username}</strong>,</Text>
          )}
          <Text style={text}>
            Use the code below to complete your registration. It expires in{" "}
            <strong>10 minutes</strong>.
          </Text>
          <Section style={otpBox}>
            <Heading style={otpText}>{otp}</Heading>
          </Section>
          <Hr />
          <Text style={footer}>
            If you didn't request this, please ignore this email.
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
const otpBox = { background: "#eff6ff", borderRadius: "8px", padding: "16px", textAlign: "center" as const };
const otpText = { fontSize: "36px", letterSpacing: "8px", color: "#1d4ed8", margin: 0 };
const footer = { fontSize: "12px", color: "#9ca3af" };