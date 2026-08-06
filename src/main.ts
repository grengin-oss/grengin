import { mount } from 'svelte'
import './app.css'
import { i18nReady, loadNamespaces, loadNamespacesForRoute } from './lib/i18n'
import App from './App.svelte'
import { initTheme } from './lib/theme.svelte.js'
import { startNativeOAuthDeepLinks } from './lib/features/auth/nativeDeepLink.js'
import { hasPendingOAuth } from './lib/features/auth/pendingOAuth.js'

initTheme()

// Start listening before the i18n gate below resolves. A native OAuth deep link
// fires a single, non-replayed event: when Android relaunches the app from an
// `msauth://` intent, waiting for the app to mount can miss it outright.
startNativeOAuthDeepLinks()

// Wait for core i18n namespaces (common + error) then load route-specific
// namespaces before mounting — prevents flash of untranslated keys.
// A pending OAuth handshake means the deep link may rewrite the route to the
// callback screen before (or just after) mount, so preload `auth` too.
Promise.all([
  i18nReady,
  loadNamespacesForRoute(window.location.pathname),
  hasPendingOAuth() ? loadNamespaces(['auth']) : Promise.resolve(),
]).then(() => {
  mount(App, {
    target: document.getElementById('app')!,
  })
})
