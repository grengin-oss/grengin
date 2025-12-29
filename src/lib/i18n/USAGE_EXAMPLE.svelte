<script lang="ts">
  import { _ } from 'svelte-i18n';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
</script>

<div class="example-container">
  <h1>Localization Usage Examples</h1>
  
  <div class="language-switcher-demo">
    <h2>Language Switcher Component</h2>
    <LanguageSwitcher />
  </div>

  <div class="translation-examples">
    <h2>Translation Examples</h2>
    
    <div class="example">
      <h3>Basic Translation</h3>
      <p>{$_('common.welcome')}</p>
      <code>{'$_("common.welcome")'}</code>
    </div>

    <div class="example">
      <h3>Navigation Items</h3>
      <ul>
        <li>{$_('navigation.home')}</li>
        <li>{$_('navigation.dashboard')}</li>
        <li>{$_('navigation.settings')}</li>
      </ul>
      <code>{'$_("navigation.home")'}</code>
    </div>

    <div class="example">
      <h3>Auth Form Labels</h3>
      <div>
        <label for="example-email">{$_('auth.emailPlaceholder')}</label>
        <input id="example-email" type="email" style="display: none;" />
      </div>
      <button>{$_('auth.signIn')}</button>
      <code>{'$_("auth.signIn")'}</code>
    </div>

    <div class="example">
      <h3>With Variables (Advanced)</h3>
      <p>Add to locale JSON: "greeting": "Hello, {name}!"</p>
      <p>{$_('common.greeting', { values: { name: 'Manish' } })}</p>
      <code>{'$_("common.greeting", { values: { name: "Manish" } })'}</code>
    </div>
  </div>
</div>

<style>
  .example-container {
    padding: 2rem;
    max-width: 800px;
    margin: 0 auto;
  }

  .language-switcher-demo {
    margin: 2rem 0;
    padding: 1.5rem;
    background: #f5f5f5;
    border-radius: 8px;
  }

  .translation-examples {
    margin: 2rem 0;
  }

  .example {
    margin: 1.5rem 0;
    padding: 1rem;
    border: 1px solid #ddd;
    border-radius: 8px;
  }

  code {
    display: block;
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: #2d2d2d;
    color: #f8f8f2;
    border-radius: 4px;
    font-family: monospace;
  }
</style>
