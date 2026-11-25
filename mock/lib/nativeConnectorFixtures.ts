// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/** Offline fixtures for suite cards, long descriptions and regional installs. */
function fixtureIcon(label: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="${color}"/><text x="20" y="27" text-anchor="middle" font-family="Arial,sans-serif" font-size="21" font-weight="700" fill="white">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function plugin(id: string, name: string, category: string, description: string, color: string, label: string, members: string[] = []) {
  const icon = fixtureIcon(label, color)
  return {
    id, name, category, description, members, icon, icon_dark: icon, status: 'preview',
    selected_version: '1.0.0', latest_version: '1.0.0',
    available_versions: [{ version: '1.0.0', schema_version: '1.0', contract_version: '1.0', sha256: '0'.repeat(64) }],
  }
}

// Suite variants share member IDs so Browse groups Zoho into one regional card.
export const nativeConnectorFixtures = [
  plugin('google-office', 'Google Office Apps', 'files', 'Google Docs, Sheets and Slides with one Google sign-in; read only.', '#4285f4', 'G', ['google-docs', 'google-sheets', 'google-slides']),
  plugin('microsoft-365', 'Microsoft 365', 'productivity', 'Outlook mail and calendar, OneDrive, SharePoint, Teams and To Do with one Microsoft work sign-in; read only.', '#0078d4', 'M', ['outlook-mail', 'outlook-calendar', 'onedrive', 'sharepoint', 'teams', 'microsoft-todo']),
  plugin('zoho', 'Zoho (US)', 'customers', 'Zoho CRM, Books and Desk with one Zoho sign-in in the US region; read only.', '#d92d20', 'Z', ['zoho-crm', 'zoho-books', 'zoho-desk']),
  plugin('zoho-india', 'Zoho (India)', 'customers', 'Zoho CRM, Books and Desk with one Zoho sign-in in the India region; read only.', '#d92d20', 'Z', ['zoho-crm', 'zoho-books', 'zoho-desk']),
  plugin('google-basic', 'Google Basic Apps', 'email-calendar', 'Search Gmail, check upcoming meetings and find files in Google Drive with a single account.', '#4285f4', 'G', ['gmail', 'google-calendar', 'google-drive']),
  plugin('atlassian', 'Atlassian', 'developer', 'Find Jira issues and Confluence pages across your team’s workspace with one Atlassian sign-in.', '#1868db', 'A', ['jira', 'confluence']),

  // Every member is present so the icon strip and member searches are realistic.
  plugin('google-docs', 'Google Docs', 'files', 'Read documents and find shared team notes.', '#4285f4', 'D'),
  plugin('google-sheets', 'Google Sheets', 'files', 'Read spreadsheets and analyze tabular data.', '#0f9d58', 'S'),
  plugin('google-slides', 'Google Slides', 'files', 'Find presentations and read slides.', '#e8a400', 'S'),
  plugin('outlook-mail', 'Outlook Mail', 'email-calendar', 'Search and read Outlook email.', '#0078d4', 'O'),
  plugin('outlook-calendar', 'Outlook Calendar', 'email-calendar', 'Read events and check meeting availability.', '#0364b8', 'C'),
  plugin('onedrive', 'OneDrive', 'files', 'Find files in your personal work drive.', '#0078d4', 'D'),
  plugin('sharepoint', 'SharePoint', 'files', 'Search shared sites and document libraries.', '#038387', 'S'),
  plugin('teams', 'Microsoft Teams', 'chat', 'Find team conversations and channels.', '#6264a7', 'T'),
  plugin('microsoft-todo', 'Microsoft To Do', 'productivity', 'Review tasks and upcoming deadlines.', '#2564cf', 'T'),
  plugin('zoho-crm', 'Zoho CRM', 'customers', 'Read accounts, contacts and sales opportunities.', '#d92d20', 'C'),
  plugin('zoho-books', 'Zoho Books', 'money', 'Find invoices and review customer balances.', '#00875a', 'B'),
  plugin('zoho-desk', 'Zoho Desk', 'support', 'Review support tickets and customer conversations.', '#ea580c', 'D'),
  plugin('gmail', 'Gmail', 'email-calendar', 'Find emails, read threads and prepare drafts.', '#d93025', 'G'),
  plugin('google-calendar', 'Google Calendar', 'email-calendar', 'Review upcoming events and meetings.', '#4285f4', 'C'),
  plugin('google-drive', 'Google Drive', 'files', 'Find documents and shared files.', '#0f9d58', 'D'),
  plugin('jira', 'Jira', 'developer', 'Search issues and track team work.', '#1868db', 'J'),
  plugin('confluence', 'Confluence', 'developer', 'Read your team’s project documentation.', '#1868db', 'C'),

  // Standalone cards deliberately exercise short and long copy.
  plugin('calendly', 'Calendly', 'email-calendar', 'Native read-only Calendly workflows; preview pending live vendor consent testing.', '#006bff', 'C'),
  plugin('microsoft-365-search', 'Microsoft 365 Search (Graph-backed)', 'email-calendar', 'Microsoft 365 Graph-backed search; not Microsoft’s proprietary Work IQ engine.', '#0078d4', 'M'),
  plugin('zoom', 'Zoom', 'email-calendar', 'Native read-only Zoom workflows; preview pending live vendor consent testing.', '#2d8cff', 'Z'),
  plugin('slack', 'Slack', 'chat', 'Search messages, find shared files and follow conversations across your workspace.', '#611f69', 'S'),
  plugin('notion', 'Notion', 'productivity', 'Find notes and project pages.', '#292929', 'N'),
  plugin('github', 'GitHub', 'developer', 'Review repositories, issues and pull requests across your organization.', '#24292f', 'GH'),
]

/** Stable IDs shared by the admin list and the caller's connection fixtures. */
export const nativeConnectorInstallations = [
  { key: 'google-office', serverId: 'srv-native-google-office', connected: true, toolCount: 12 },
  { key: 'microsoft-365', serverId: 'srv-native-microsoft-365', connected: false, toolCount: 24 },
  { key: 'zoho', serverId: 'srv-native-zoho-us', connected: false, toolCount: 18 },
  { key: 'microsoft-365-search', serverId: 'srv-native-microsoft-search', connected: false, toolCount: 6 },
]

export function nativeConnectorDetail(id: string) {
  const entry = nativeConnectorFixtures.find((item) => item.id === id)
  if (!entry) return undefined
  return {
    id: entry.id, version: entry.latest_version,
    plugin: { id: entry.id, name: entry.name, auth: 'oauth2', base_url: `https://example.invalid/${entry.id}`, tools: [] },
    installation: entry.id === 'atlassian' ? { configuration_schema: {
      required: ['cloud_id'], properties: { cloud_id: { pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' } },
    } } : null,
  }
}
