// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

// Route definitions
export const routes = {
  home: '/',
  chat: '/',
  authCallback: '/auth/callback',
} as const;

// Navigation items mapping to routes
export const navigationRoutes = {
  chat: routes.chat,
} as const;

// Helper function to get route for navigation item
export function getRouteForNavItem(navItem: string): string {
  return navigationRoutes[navItem as keyof typeof navigationRoutes] || routes.home;
}

// Helper function to get nav item from current route
export function getNavItemFromRoute(route: string): string {
  if (route === '/' || route.startsWith('/chat')) return 'chat';
  return 'chat';
}
