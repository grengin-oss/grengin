<script lang="ts">
  import { Route } from 'svelte-routing';
  import { Chat, AlertsPage, Forbidden } from './user-chunk';
</script>

<Route path="/"><Chat /></Route>
<Route path="/chat"><Chat /></Route>
<Route path="/chat/:id"><Chat /></Route>
<Route path="/alerts"><AlertsPage /></Route>
<Route path="/forbidden"><Forbidden /></Route>
