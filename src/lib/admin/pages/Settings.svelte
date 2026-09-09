<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<!--
  /admin/settings is the Authorisation page (authorisation.html): a single
  full-bleed page, so this route component is a pass-through. It kept a
  "Settings" header and a one-entry tab bar until the redesign; OAuthProviders
  now owns the whole page — header, card and dialogs.
-->
<script lang="ts">
  import { _ } from "svelte-i18n";
  import OAuthProviders from "./advanced/OAuthProviders.svelte";
  import { setPageTitle } from "../../utils/pageTitle";

  $effect(() => {
    setPageTitle($_("admin.settings.title"));
  });
</script>

<OAuthProviders />
