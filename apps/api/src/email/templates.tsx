import type { ReactNode } from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from 'react-email';

/** Account emails (React Email). They carry no evidence, scores or institution data. */

const font =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const text = { color: '#1b1b1b', fontSize: '16px', lineHeight: '24px' };
const secret = {
  ...text,
  backgroundColor: '#f0f0f0',
  borderRadius: '6px',
  fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
  fontSize: '22px',
  fontWeight: 700,
  letterSpacing: '2px',
  padding: '12px 16px',
  textAlign: 'center' as const,
};
const button = {
  backgroundColor: '#005ea2',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 700,
  padding: '12px 20px',
};

const nairobi = (instant: string) =>
  new Date(instant).toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

function Layout({
  preview,
  title,
  children,
}: {
  preview: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: font }}>
        <Container style={{ maxWidth: '560px', padding: '24px' }}>
          <Heading as="h1" style={{ ...text, fontSize: '22px' }}>
            {title}
          </Heading>
          {children}
          <Hr />
          <Text style={{ ...text, color: '#565c65', fontSize: '13px' }}>
            CPI Platform, corruption prevention reporting. This is an automated
            message; replies are not read.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function TemporaryPasswordEmail(props: {
  displayName: string;
  email: string;
  password: string;
  invitedBy: string;
  expiresAt: string;
  signInUrl: string;
}) {
  return (
    <Layout
      preview="Your CPI Platform account is ready"
      title={`Welcome, ${props.displayName}`}
    >
      <Text style={text}>
        {props.invitedBy} created a CPI Platform account for you. Sign in with
        your email address ({props.email}) and this temporary password:
      </Text>
      <Text style={secret}>Temporary password: {props.password}</Text>
      <Text style={text}>
        It works until {nairobi(props.expiresAt)} (Nairobi time). Each time you
        sign in we email you a code, and the first time you choose your own
        password.
      </Text>
      <Button href={props.signInUrl} style={button}>
        Sign in
      </Button>
      <Text style={text}>
        If you did not expect this account, ignore this email.
      </Text>
    </Layout>
  );
}

export function SignInCodeEmail(props: {
  displayName: string;
  code: string;
  minutes: number;
}) {
  return (
    <Layout
      preview={`Your sign-in code is ${props.code}`}
      title="Your sign-in code"
    >
      <Text style={text}>Hello {props.displayName},</Text>
      <Text style={secret}>Your sign-in code is {props.code}</Text>
      <Text style={text}>
        Enter it on the sign-in page within {props.minutes} minutes. If you did
        not just sign in, someone may know your password: reset it now.
      </Text>
    </Layout>
  );
}

export function PasswordResetEmail(props: { resetUrl: string }) {
  return (
    <Layout
      preview="Reset your CPI Platform password"
      title="Reset your password"
    >
      <Text style={text}>
        Someone asked to reset the password for this account. If it was you,
        choose a new password with this link; it works once and expires in 1
        hour. Otherwise you can ignore this email.
      </Text>
      <Button href={props.resetUrl} style={button}>
        Choose a new password
      </Button>
    </Layout>
  );
}
