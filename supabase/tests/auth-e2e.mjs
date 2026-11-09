import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const apiUrl = process.env.API_URL;
const apiKey = process.env.ANON_KEY || process.env.PUBLISHABLE_KEY;
const mailpitUrl = process.env.MAILPIT_URL || 'http://127.0.0.1:54324';

assert.ok(apiUrl, 'API_URL is missing; run supabase status -o env');
assert.ok(apiKey, 'ANON_KEY or PUBLISHABLE_KEY is missing');

const email = `kidsloc-ci-${randomUUID()}@example.test`;
const initialPassword = `KidsLoc-${randomUUID()}-A1!`;
const updatedPassword = `KidsLoc-${randomUUID()}-B2!`;
const redirectTo = 'http://localhost:3000/app/company/';

function headers(token = apiKey) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function request(path, { method = 'GET', body, token = apiKey, base = apiUrl } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: headers(token),
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  return { response, data, raw };
}

async function waitForEmail(recipient, subjectPattern) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages?limit=50`);
    assert.equal(response.ok, true, 'Mailpit API is unavailable');
    const data = await response.json();
    const message = (data.messages || []).find((item) => {
      const recipients = (item.To || []).map((to) => to.Address?.toLowerCase());
      return recipients.includes(recipient.toLowerCase())
        && subjectPattern.test(item.Subject || '');
    });

    if (message) {
      const detailResponse = await fetch(
        `${mailpitUrl}/api/v1/message/${encodeURIComponent(message.ID)}`,
      );
      assert.equal(detailResponse.ok, true, 'Could not read captured email');
      return detailResponse.json();
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for email matching ${subjectPattern}`);
}

function extractVerificationUrl(message) {
  const body = `${message.HTML || ''}\n${message.Text || ''}`
    .replace(/&amp;/g, '&')
    .replace(/&#x3D;/g, '=');
  const candidates = [...body.matchAll(/https?:\/\/[^\s"'<>]+/g)]
    .map((match) => match[0].replace(/[),.;]+$/, ''));

  const link = candidates.find((candidate) => {
    try {
      return new URL(candidate).pathname.endsWith('/auth/v1/verify');
    } catch {
      return false;
    }
  });

  assert.ok(link, 'Verification URL was not found in the captured email');
  return new URL(link);
}

async function verifyEmail(message, type) {
  const verificationUrl = extractVerificationUrl(message);
  const verification = await fetch(verificationUrl, { redirect: 'manual' });
  const location = verification.headers.get('location');

  if (location) {
    const redirected = new URL(location, verificationUrl);
    const hash = new URLSearchParams(redirected.hash.replace(/^#/, ''));
    const accessToken = hash.get('access_token')
      || redirected.searchParams.get('access_token');
    if (accessToken) return accessToken;
  }

  const tokenHash = verificationUrl.searchParams.get('token_hash')
    || verificationUrl.searchParams.get('token');
  assert.ok(tokenHash, 'Verification email did not contain a token');

  const verified = await request('/auth/v1/verify', {
    method: 'POST',
    body: { token_hash: tokenHash, type },
  });
  assert.equal(
    verified.response.ok,
    true,
    `Email verification failed: ${JSON.stringify(verified.data)}`,
  );
  assert.ok(verified.data?.access_token, 'Verification did not return a session');
  return verified.data.access_token;
}

async function signIn(password) {
  const result = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(
    result.response.ok,
    true,
    `Password sign-in failed: ${JSON.stringify(result.data)}`,
  );
  assert.ok(result.data?.access_token, 'Sign-in did not return an access token');
  return result.data;
}

// 1. Signup must create a user but require email confirmation.
const signup = await request(
  `/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`,
  {
    method: 'POST',
    body: {
      email,
      password: initialPassword,
      data: { full_name: 'KidsLoc CI Test' },
    },
  },
);
assert.equal(signup.response.ok, true, `Signup failed: ${JSON.stringify(signup.data)}`);
const user = signup.data?.user || signup.data;
assert.ok(user?.id, 'Signup did not create an Auth user');
assert.ok(!signup.data?.access_token, 'Signup bypassed required email confirmation');

// 2. Confirm the email using the message captured by local Mailpit.
const confirmationEmail = await waitForEmail(email, /confirm|verify|signup/i);
const confirmedAccessToken = await verifyEmail(confirmationEmail, 'signup');
const confirmedUser = await request('/auth/v1/user', { token: confirmedAccessToken });
assert.equal(confirmedUser.response.ok, true, 'Confirmed user session is invalid');
assert.equal(confirmedUser.data?.id, user.id, 'Confirmed user id changed');

// 3. Password sign-in must work after confirmation.
const signedIn = await signIn(initialPassword);
assert.equal(signedIn.user?.id, user.id, 'Sign-in returned a different user');

// 4. Profile trigger must create the user's profile.
const profile = await request(
  `/rest/v1/profiles?select=id,full_name&id=eq.${encodeURIComponent(user.id)}`,
  { token: signedIn.access_token },
);
assert.equal(profile.response.ok, true, 'Profile query failed');
assert.equal(profile.data?.length, 1, 'Auth signup did not create exactly one profile');
assert.equal(profile.data[0].full_name, 'KidsLoc CI Test');

// 5. Password recovery must send a recovery email and permit a password update.
await new Promise((resolve) => setTimeout(resolve, 1100));
const recovery = await request(
  `/auth/v1/recover?redirect_to=${encodeURIComponent('http://localhost:3000/reset-password/')}`,
  { method: 'POST', body: { email } },
);
assert.equal(recovery.response.ok, true, 'Password recovery request failed');
const recoveryEmail = await waitForEmail(email, /reset|recover|password/i);
const recoveryAccessToken = await verifyEmail(recoveryEmail, 'recovery');
const passwordUpdate = await request('/auth/v1/user', {
  method: 'PUT',
  token: recoveryAccessToken,
  body: { password: updatedPassword },
});
assert.equal(
  passwordUpdate.response.ok,
  true,
  `Password update failed: ${JSON.stringify(passwordUpdate.data)}`,
);

// 6. The new password must work and the first company must be created atomically.
const newSession = await signIn(updatedPassword);
const companyName = `  KidsLoc   CI ${randomUUID().slice(0, 8)}  `;
const normalizedCompanyName = companyName.trim().replace(/\s+/g, ' ');
const company = await request('/rest/v1/rpc/create_company', {
  method: 'POST',
  token: newSession.access_token,
  body: { p_name: companyName },
});
assert.equal(
  company.response.ok,
  true,
  `Company creation failed: ${JSON.stringify(company.data)}`,
);
assert.match(String(company.data), /^[0-9a-f-]{36}$/i, 'Company RPC did not return a UUID');

const companyRow = await request(
  `/rest/v1/companies?select=name&id=eq.${encodeURIComponent(company.data)}`,
  { token: newSession.access_token },
);
assert.equal(companyRow.response.ok, true, 'Company row query failed');
assert.equal(companyRow.data?.[0]?.name, normalizedCompanyName, 'Company name was not normalized');

const membership = await request(
  `/rest/v1/company_members?select=company_id,role&user_id=eq.${encodeURIComponent(user.id)}`,
  { token: newSession.access_token },
);
assert.equal(membership.response.ok, true, 'Membership query failed');
assert.equal(membership.data?.length, 1, 'Company creation did not create one membership');
assert.equal(membership.data[0].company_id, company.data);
assert.equal(membership.data[0].role, 'owner');

// 7. A second company must be rejected for the same account.
const secondCompany = await request('/rest/v1/rpc/create_company', {
  method: 'POST',
  token: newSession.access_token,
  body: { p_name: 'Segunda empresa proibida' },
});
assert.equal(secondCompany.response.ok, false, 'The account created a second company');
assert.equal(secondCompany.data?.code, '23505', 'Duplicate-company guard returned the wrong SQLSTATE');

// 8. Logout must succeed.
const logout = await request('/auth/v1/logout', {
  method: 'POST',
  token: newSession.access_token,
});
assert.equal(logout.response.ok, true, 'Logout failed');

process.stdout.write(
  'Auth E2E PASS: signup, email confirmation, login, profile trigger, password recovery, password update, company onboarding, duplicate guard and logout.\n',
);
