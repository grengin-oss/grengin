/** Single entry for the user/chat area — keeps Chat, alerts, sidebar chat, and forbidden in one async chunk. */
export { default as Chat } from '$lib/features/chat/components/Chat.svelte';
export { default as AlertsPage } from '$lib/features/notifications/AlertsPage.svelte';
export { default as SidebarChatSection } from '$lib/components/layout/SidebarChatSection.svelte';
export { default as Forbidden } from '$lib/components/Forbidden.svelte';
