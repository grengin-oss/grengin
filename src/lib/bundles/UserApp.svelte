<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { Route } from 'svelte-routing';
  import { Chat, AlertsPage, Forbidden, UserSettings, McpOAuthCallback, ProjectsPage, ProjectDetailPage } from './user-chunk';
</script>

<Route path="/"><Chat /></Route>
<Route path="/chat"><Chat /></Route>
<Route path="/chat/:id"><Chat /></Route>
<Route path="/projects"><ProjectsPage /></Route>
<Route path="/projects/:id" let:params><ProjectDetailPage id={params.id} /></Route>
<Route path="/alerts"><AlertsPage /></Route>
<Route path="/settings"><UserSettings /></Route>
<Route path="/forbidden"><Forbidden /></Route>
<Route path="/mcp/oauth/callback"><McpOAuthCallback /></Route>
