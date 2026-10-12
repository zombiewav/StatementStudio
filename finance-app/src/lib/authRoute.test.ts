import { describe, expect, it } from 'vitest';
import { publicPageAction, SIGNED_IN_HOME } from './authRoute';

describe('publicPageAction', () => {
  it('waits while the saved session is being restored', () => {
    expect(publicPageAction({ loading: true, signedIn: false })).toBe('wait');
    expect(publicPageAction({ loading: true, signedIn: true })).toBe('wait');
  });

  it('sends a signed-in visitor to the workspace instead of the login page', () => {
    expect(publicPageAction({ loading: false, signedIn: true })).toBe('redirect-to-app');
    expect(SIGNED_IN_HOME).toBe('/app/dashboard');
  });

  it('shows the page to a visitor who is not signed in', () => {
    expect(publicPageAction({ loading: false, signedIn: false })).toBe('show');
  });
});
