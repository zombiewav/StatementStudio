export type PublicPageAction = 'wait' | 'redirect-to-app' | 'show';

// The home, login and register pages are for visitors who are not signed in.
// While the saved session is still being restored nothing should flash, and a
// visitor who already has a valid session goes straight to their workspace.
export function publicPageAction(auth: { loading: boolean; signedIn: boolean }): PublicPageAction {
  if (auth.loading) return 'wait';
  return auth.signedIn ? 'redirect-to-app' : 'show';
}

export const SIGNED_IN_HOME = '/app/dashboard';
