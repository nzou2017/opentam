// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Issue a signed Q Enterprise license key.
 *
 * Usage:
 *   Q_LICENSE_PRIVATE_KEY="$(cat private.pem)" npx tsx scripts/issue-license.ts \
 *     --features sso,team,surveys,feature_requests --expires 2027-01-01
 */

import { importPKCS8, SignJWT } from 'jose';

async function main() {
  const args = process.argv.slice(2);

  let features = 'sso,team,surveys,feature_requests';
  let expires = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--features' && args[i + 1]) features = args[++i];
    if (args[i] === '--expires' && args[i + 1]) expires = args[++i];
  }

  const privateKeyPem = process.env.Q_LICENSE_PRIVATE_KEY;
  if (!privateKeyPem) {
    console.error('Error: Q_LICENSE_PRIVATE_KEY environment variable is required');
    console.error('Set it to the PEM-encoded Ed25519 private key');
    process.exit(1);
  }

  if (!expires) {
    // Default: 1 year from now
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    expires = d.toISOString().split('T')[0];
  }

  const featureList = features.split(',').map((f) => f.trim());
  const expiresAt = new Date(expires);

  if (isNaN(expiresAt.getTime())) {
    console.error(`Error: Invalid date "${expires}"`);
    process.exit(1);
  }

  const privateKey = await importPKCS8(privateKeyPem, 'EdDSA');

  const jwt = await new SignJWT({
    plan: 'enterprise',
    features: featureList,
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuer('q-license')
    .setSubject('q-enterprise')
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(privateKey);

  console.log('\nQ Enterprise License Key:\n');
  console.log(jwt);
  console.log('\nDetails:');
  console.log(`  Plan:     enterprise`);
  console.log(`  Features: ${featureList.join(', ')}`);
  console.log(`  Expires:  ${expiresAt.toISOString()}`);
  console.log('\nSet this as Q_LICENSE_KEY in your .env or paste it in Settings > General > License.\n');
}

main().catch((err) => {
  console.error('Failed to issue license:', err);
  process.exit(1);
});
