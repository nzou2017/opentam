// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest';
import { extractSwiftUiElements } from '../crawler/swiftParser.js';
import { toMapCandidates } from '../crawler/mapper.js';

describe('extractSwiftUiElements', () => {
  it('extracts a Button with an inline label and accessibility identifier', () => {
    const code = `
struct LoginView: View {
  var body: some View {
    Button("Sign In") {
      login()
    }
    .accessibilityIdentifier("signInButton")
  }
}`;
    const elements = extractSwiftUiElements(code, 'Sources/Views/LoginView.swift');
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({
      type: 'button',
      label: 'Sign In',
      selector: 'signInButton',
      componentName: 'LoginView',
    });
  });

  it('extracts a Button label from a nested Text() when using the action/trailing-closure form', () => {
    const code = `
struct SettingsView: View {
  var body: some View {
    Button(action: { logout() }) {
      Text("Log Out")
    }
    .accessibilityIdentifier("logoutButton")
  }
}`;
    const elements = extractSwiftUiElements(code, 'Sources/Views/SettingsView.swift');
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ type: 'button', label: 'Log Out', selector: 'logoutButton' });
  });

  it('extracts NavigationLink, TextField, SecureField, and Toggle', () => {
    const code = `
struct ProfileView: View {
  var body: some View {
    NavigationLink("Edit Profile", destination: EditProfileView())
      .accessibilityIdentifier("editProfileLink")
    TextField("Email", text: $email)
      .accessibilityIdentifier("emailField")
    SecureField("Password", text: $password)
      .accessibilityIdentifier("passwordField")
    Toggle("Enable notifications", isOn: $notificationsEnabled)
      .accessibilityIdentifier("notificationsToggle")
  }
}`;
    const elements = extractSwiftUiElements(code, 'Sources/Views/ProfileView.swift');
    expect(elements.map((e) => e.type).sort()).toEqual(['input', 'input', 'link', 'toggle']);
    expect(elements.find((e) => e.selector === 'editProfileLink')).toMatchObject({ type: 'link', label: 'Edit Profile' });
    expect(elements.find((e) => e.selector === 'emailField')).toMatchObject({ type: 'input', label: 'Email' });
    expect(elements.find((e) => e.selector === 'passwordField')).toMatchObject({ type: 'input', label: 'Password' });
    expect(elements.find((e) => e.selector === 'notificationsToggle')).toMatchObject({ type: 'toggle', label: 'Enable notifications' });
  });

  it('prefers .accessibilityLabel() over the inline/Text label when both are present', () => {
    const code = `
struct HomeView: View {
  var body: some View {
    Button("Go") { doThing() }
      .accessibilityIdentifier("goButton")
      .accessibilityLabel("Start the workflow")
  }
}`;
    const elements = extractSwiftUiElements(code, 'Sources/Views/HomeView.swift');
    expect(elements[0].label).toBe('Start the workflow');
  });

  it('skips elements with neither a label nor an accessibility identifier', () => {
    const code = `
struct EmptyView2: View {
  var body: some View {
    Button("") { }
  }
}`;
    const elements = extractSwiftUiElements(code, 'Sources/Views/EmptyView2.swift');
    expect(elements).toHaveLength(0);
  });

  it('assigns componentName based on the nearest preceding struct declaration', () => {
    const code = `
struct FirstView: View {
  var body: some View {
    Button("One") {}.accessibilityIdentifier("btnOne")
  }
}
struct SecondView: View {
  var body: some View {
    Button("Two") {}.accessibilityIdentifier("btnTwo")
  }
}`;
    const elements = extractSwiftUiElements(code, 'Sources/Views/Multi.swift');
    expect(elements.find((e) => e.selector === 'btnOne')?.componentName).toBe('FirstView');
    expect(elements.find((e) => e.selector === 'btnTwo')?.componentName).toBe('SecondView');
  });

  it('returns an empty array for non-SwiftUI source with no matching constructors', () => {
    const code = `struct Point { var x: Int; var y: Int }`;
    expect(extractSwiftUiElements(code, 'Sources/Point.swift')).toEqual([]);
  });
});

describe('toMapCandidates — iOS platform branch', () => {
  it('builds iOS candidates using the accessibility identifier as selector and the filename as screen', () => {
    const elements = extractSwiftUiElements(
      `struct LoginView: View {
        var body: some View {
          Button("Sign In") { login() }.accessibilityIdentifier("signInButton")
        }
      }`,
      'Sources/Views/LoginView.swift',
    );
    const candidates = toMapCandidates(elements, '', 'ios');
    expect(candidates).toEqual([{
      feature: 'Sign In',
      url: 'LoginView',
      selector: 'signInButton',
      description: 'Button on the LoginView screen',
      source: 'crawler',
      platform: 'ios',
    }]);
  });

  it('drops elements without an accessibility identifier — nothing for XCUITest to target', () => {
    const elements = [{ type: 'button' as const, label: 'Sign In', filePath: 'Sources/Views/LoginView.swift' }];
    expect(toMapCandidates(elements, '', 'ios')).toEqual([]);
  });

  it('deduplicates candidates sharing the same accessibility identifier', () => {
    const elements = [
      { type: 'button' as const, label: 'Sign In', selector: 'signInButton', filePath: 'Sources/Views/LoginView.swift' },
      { type: 'button' as const, label: 'Sign In (again)', selector: 'signInButton', filePath: 'Sources/Views/LoginView.swift' },
    ];
    expect(toMapCandidates(elements, '', 'ios')).toHaveLength(1);
  });
});
