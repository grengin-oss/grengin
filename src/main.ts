import { mount } from 'svelte'
import './app.css'
import { i18nReady, loadNamespacesForRoute } from './lib/i18n'
import App from './App.svelte'

// Wait for core i18n namespaces (common + error) then load route-specific
// namespaces before mounting — prevents flash of untranslated keys.
Promise.all([
  i18nReady,
  loadNamespacesForRoute(window.location.pathname),
]).then(() => {
  mount(App, {
    target: document.getElementById('app')!,
  })
})
