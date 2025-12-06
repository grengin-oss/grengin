# Admin Dashboard Module

Complete admin panel for user management, analytics, and system configuration.

## Quick Start

### Access the Dashboard

1. Ensure you're logged in as an admin user
2. Click your user avatar in the sidebar
3. Select "Admin Dashboard"

### Development

```bash
# Start mock API server
pnpm mock:dev

# In another terminal, start dev server
pnpm dev

# Navigate to admin dashboard from user menu
```

## Module Structure

```
admin/
├── Admin.svelte           # Root component
├── types.ts               # TypeScript definitions
├── api/                   # API service layer
├── stores/                # State management
├── components/            # Reusable components
└── pages/                 # Page components
```

## Key Features

### 1. User Management (`/admin/users`)
- View, search, and filter users
- Create/edit/deactivate users
- Pagination support
- Role and department management

### 2. Dashboard (`/admin/dashboard`)
- Real-time statistics
- Usage charts (Chart.js)
- Cost tracking
- System health monitoring
- Auto-refresh every 30s

### 3. Usage Analytics (`/admin/usage`)
- Model usage distribution
- Cost and request trends
- Detailed breakdowns

### 4. Settings (`/admin/settings`)
- Organization settings
- SSO provider configuration
- API key management
- Rate limits and budgets

### 5. Audit Log (`/admin/audit-log`)
- Track all admin actions
- Filterable audit trail

## API Integration

All API calls go through `src/lib/admin/api/client.ts`:

```typescript
import { apiClient } from './lib/admin/api';

// Example: Fetch users
const users = await apiClient.get('/admin/users');
```

### Auth Headers

Update `getAuthHeaders()` in `client.ts` to include your auth tokens:

```typescript
function getAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${yourAuthToken}`,
    'X-CSRF-Token': yourCsrfToken,
  };
}
```

## State Management

### Admin Store
```typescript
import { adminStore } from './lib/admin/stores';

// Navigate to a page
adminStore.setPage('users');

// Set loading state
adminStore.setLoading(true);

// Handle errors
adminStore.setError('Something went wrong');
```

### Dashboard Store
```typescript
import { dashboardStore } from './lib/admin/stores';

// Fetch dashboard data (cached for 5 minutes)
await dashboardStore.fetch();

// Force refresh
await dashboardStore.refresh();
```

### Users Store
```typescript
import { usersStore } from './lib/admin/stores';

// Fetch with filters
await usersStore.setFilters({
  search: 'john',
  role: 'admin'
});

// Create user
await usersStore.create({
  email: 'user@example.com',
  name: 'John Doe',
  role: 'user'
});
```

## Components

### PageHeader
```svelte
<PageHeader title="My Page" subtitle="Description">
  {#snippet children()}
    <button class="btn-primary">Action</button>
  {/snippet}
</PageHeader>
```

### StatCard
```svelte
<StatCard
  title="Total Users"
  value={1234}
  subtitle="Active this month"
  icon="👥"
  trend={{ value: 12.5, isPositive: true }}
/>
```

### Modal
```svelte
<Modal
  isOpen={showModal}
  title="Create User"
  onclose={() => showModal = false}
>
  {#snippet children()}
    <form>...</form>
  {/snippet}
</Modal>
```

### ChartWrapper
```svelte
<ChartWrapper
  type="line"
  data={{
    labels: ['Jan', 'Feb', 'Mar'],
    datasets: [{
      label: 'Sales',
      data: [10, 20, 30]
    }]
  }}
/>
```

## Styling

Follows the Liquid Glass design system from `src/app.css`:

- Uses CSS variables for colors, spacing, shadows
- Glass effects on navigation only
- Solid surfaces for content (performance)
- Mobile-responsive
- WCAG 2.1 AA compliant

## Security

### Role-Based Access
- Frontend checks `isAdmin` prop
- Backend must verify admin role on all endpoints
- Audit logging for all admin actions

### Input Validation
- Client-side validation on all forms
- Server-side validation required
- CSRF protection (wire up in `client.ts`)

## Testing

### With Mock Server
```bash
# Terminal 1
pnpm mock:dev

# Terminal 2
pnpm dev
```

Mock data is defined in `mock/examples/admin/`.

### Test Checklist
- [ ] View dashboard
- [ ] Create user
- [ ] Edit user
- [ ] Deactivate user
- [ ] Filter users
- [ ] View charts
- [ ] Check mobile layout
- [ ] Test error states
- [ ] Verify accessibility

## Extending

### Add a New Page

1. Create `pages/MyPage.svelte`
2. Add page type to `stores/adminStore.ts`
3. Add navigation item to `components/AdminLayout.svelte`
4. Add route to `Admin.svelte`

### Add a New API Endpoint

1. Add function to appropriate `api/*.ts` file
2. Add TypeScript types to `types.ts`
3. Use in components/stores

## Performance

- Dashboard data cached for 5 minutes
- Pagination on user lists (20/page)
- Charts lazy-loaded
- Solid backgrounds (no blur) on content
- Auto-refresh configurable

## Accessibility

- Semantic HTML
- ARIA labels
- Keyboard navigation
- Focus management
- Screen reader support
- High contrast support

## TODOs

Backend integration needed for:
- [ ] Real auth tokens
- [ ] Audit log endpoint
- [ ] Settings CRUD operations
- [ ] WebSocket for real-time updates
- [ ] CSV export functionality
- [ ] Bulk operations
- [ ] Granular permissions

## Support

See `ADMIN_DASHBOARD.md` in project root for full documentation.

