// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * First-launch guided tour + Setup guide for the first Super Admin (ENGG-447).
 *
 * Everything comes from the API — nothing is decided or stored in the browser:
 *
 * Only Super Admins (`is_super_admin` on the signed-in user) are considered at
 * all; for anyone else `/me/metadata` is never read.
 *
 * `/me/metadata` → `tourGuide` says who sees the tour and how far they got.
 *   firstLogin      true only for the workspace's first Super Admin. Anyone
 *                   else (Super Admins added later included) never sees the
 *                   tour or the Setup guide.
 *   guidePageCount  0 / missing  never started — opens by itself on the chat screen
 *                   1…6          on that page (Step N of 6) — a reload or re-login resumes it
 *                   7            finished or skipped — never opens by itself again
 *
 * `/admin/ai-engines` and `/admin/users` drive the Setup guide checklist: setup
 * is complete once an engine holds an API key and the workspace has a user
 * besides the owner. Until then — after the tour is finished or skipped — the
 * Setup guide pill stays pinned top-right on every Chat and Control Hub page.
 *
 * The guide's close (✕) is in-memory only: it hides the pill until the next
 * page refresh.
 */

import { navigate } from 'svelte-routing';
import { getUsers } from '../../api/admin/users.js';
import { getAIEngines } from '../../api/admin/AiEngines.js';
import { getMyMetadata, updateGuidePageCount } from '../../api/meMetadata.js';
import { getAuthState } from '../auth/state.svelte.js';

export type TourStepId = 'welcome' | 'controlHub' | 'apiKey' | 'invite' | 'signIn' | 'prompt';

export const TOUR_STEPS: readonly TourStepId[] = [
  'welcome',
  'controlHub',
  'apiKey',
  'invite',
  'signIn',
  'prompt',
];

/** The screen each step belongs to; the tour navigates there when it enters the step. */
const STEP_PATH: Record<TourStepId, string> = {
  welcome: '/',
  controlHub: '/',
  apiKey: '/admin/ai-engines',
  // Organization's Users tab, where the Create Users dialog lives.
  invite: '/admin/departments?tab=users',
  signIn: '/admin/settings',
  prompt: '/',
};

/** `guidePageCount` once the tour was finished or skipped. */
const TOUR_DONE = TOUR_STEPS.length + 1;

/** The API sends `is_super_admin`; the generated `User` type spells it `isSuperAdmin`. */
function isSuperAdmin(user: unknown): boolean {
  const u = user as { is_super_admin?: unknown; isSuperAdmin?: unknown } | null;
  return u?.is_super_admin === true || u?.isSuperAdmin === true;
}

function onChatScreen(path: string): boolean {
  return path === '/' || path === '/chat' || path.startsWith('/chat/');
}

function createOnboardingStore() {
  const authState = getAuthState();

  let userId = $state<string | null>(null);
  /** `/me/metadata` marks this user as the workspace's first Super Admin. */
  let isOwner = $state(false);
  let statusLoaded = $state(false);
  let apiKeyConnected = $state(false);
  let apiKeyProvider = $state<string | null>(null);
  let teammateAdded = $state(false);
  let tourSeen = $state(false);
  let step = $state(-1);
  /** Guide closed with ✕ / "Remind me later" — lasts until the page reloads. */
  let guideDismissed = $state(false);
  let guideOpen = $state(false);
  /**
   * One-shot request for the Organization page: open (or close) its Create
   * Users dialog. The page consumes it; see `consumeInviteDialogRequest`.
   */
  let inviteDialogRequest = $state<'open' | 'close' | null>(null);

  let initialized = false;
  let loadingFor: string | null = null;
  /** Bumped by every load and reset; a load that is no longer the latest stops. */
  let loadSeq = 0;
  /** Last `guidePageCount` the server holds (or was sent), to skip no-op PUTs. */
  let syncedPageCount: number | null = null;
  /** PUTs go out one at a time, in order, so the last one written wins. */
  let syncQueue: Promise<unknown> = Promise.resolve();

  // Computed on read, not `$derived`: this store lives outside any component,
  // and a module-level derived can go stale once the effect that last read it
  // is torn down (the guide re-mounts on every page). Reading the `$state`
  // fields directly keeps every caller reactive.
  const setupComplete = () => apiKeyConnected && teammateAdded;
  const tourActive = () => isOwner && step >= 0 && step < TOUR_STEPS.length;
  const currentStep = (): TourStepId | null => (tourActive() ? TOUR_STEPS[step] : null);
  const guideVisible = () =>
    isOwner && statusLoaded && tourSeen && !tourActive() && !setupComplete() && !guideDismissed;

  /** The tour's progress as `/me/metadata` stores it. */
  function pageCount(): number {
    if (tourActive()) return step + 1;
    return tourSeen ? TOUR_DONE : 0;
  }

  /** Write the tour's progress to `/me/metadata`. */
  function syncPageCount(): void {
    if (!userId || !isOwner) return;
    const value = pageCount();
    if (value === syncedPageCount) return;
    syncedPageCount = value;
    const forUser = userId;
    syncQueue = syncQueue
      .then(() => (userId === forUser ? updateGuidePageCount(value) : undefined))
      .catch(() => {
        // Offline or server error: send it again on the next change.
        if (userId === forUser && syncedPageCount === value) syncedPageCount = null;
      });
  }

  function reset(): void {
    userId = null;
    isOwner = false;
    statusLoaded = false;
    apiKeyConnected = false;
    apiKeyProvider = null;
    teammateAdded = false;
    tourSeen = false;
    step = -1;
    guideDismissed = false;
    guideOpen = false;
    inviteDialogRequest = null;
    loadingFor = null;
    loadSeq++;
    syncedPageCount = null;
  }

  /**
   * Re-read whether a key and a teammate exist. Called on login, and by the
   * AI Engines / Users stores after a key or a user is added or removed.
   */
  async function refreshSetupStatus(): Promise<void> {
    if (!userId || !isOwner) return;
    const forUser = userId;
    try {
      const [engines, users] = await Promise.all([
        getAIEngines(),
        getUsers({ limit: 1, offset: 0 }),
      ]);
      if (userId !== forUser) return;
      const withKey = engines.find((engine) => engine.api_key_configured);
      apiKeyConnected = !!withKey;
      apiKeyProvider = withKey?.display_name ?? null;
      teammateAdded = (users.total ?? 0) > 1;
      statusLoaded = true;
    } catch {
      // Leave the last known status; the guide simply stays as it was.
    }
  }

  async function load(forUser: string): Promise<void> {
    loadingFor = forUser;
    const seq = ++loadSeq;

    // The tour and Setup guide are for Super Admins only; skip the metadata call otherwise.
    if (!isSuperAdmin(authState.user)) {
      userId = forUser;
      return;
    }

    let guide;
    try {
      guide = (await getMyMetadata()).metadata?.tourGuide;
    } catch {
      // Unknown for now — try again on the next login instead of guessing.
      if (seq === loadSeq) loadingFor = null;
      return;
    }
    if (seq !== loadSeq) return;
    userId = forUser;
    isOwner = guide?.firstLogin === true;
    if (!guide || !isOwner) return;

    const count = Number(guide.guidePageCount ?? 0) || 0;
    syncedPageCount = count;
    tourSeen = count > TOUR_STEPS.length;
    step = count >= 1 && count <= TOUR_STEPS.length ? count - 1 : -1;

    await refreshSetupStatus();
    if (seq !== loadSeq) return;

    // First login: open the tour on the chat screen.
    if (!tourSeen && step < 0 && onChatScreen(window.location.pathname)) {
      start();
    } else if (tourActive()) {
      // Resuming after a reload: land on the step's screen as entering it would,
      // including Step 4's open Create Users dialog.
      goToStepScreen();
      if (currentStep() === 'invite') inviteDialogRequest = 'open';
    }
  }

  /** Called once from App; follows the signed-in user. */
  function init(): void {
    if (initialized) return;
    initialized = true;
    $effect(() => {
      const id = authState.user?.id ?? null;
      if (!authState.isAuthenticated || !id) {
        reset();
        return;
      }
      if (userId === id || loadingFor === id) return;
      // Another user signed in without a sign-out in between: drop the last one's tour state.
      if (userId !== null || loadingFor !== null) reset();
      void load(id);
    });
  }

  function goToStepScreen(): void {
    const id = currentStep();
    if (!id) return;
    const path = STEP_PATH[id];
    const here = window.location.pathname;
    if (id === 'prompt') {
      // A fresh chat so the empty-state composer is on screen.
      if (here !== '/') navigate('/');
      setTimeout(() => window.dispatchEvent(new CustomEvent('focusChatInput')), 50);
      return;
    }
    const [pathname, query] = path.split('?');
    const alreadyThere =
      pathname === '/'
        ? onChatScreen(here)
        : here === pathname && (!query || window.location.search.includes(query));
    if (!alreadyThere) navigate(path);
  }

  function enterStep(index: number): void {
    const leaving = currentStep();
    if (leaving === 'invite' && TOUR_STEPS[index] !== 'invite') inviteDialogRequest = 'close';
    step = index;
    syncPageCount();
    goToStepScreen();
    if (TOUR_STEPS[index] === 'invite') inviteDialogRequest = 'open';
  }

  function start(): void {
    if (!isOwner) return;
    guideOpen = false;
    enterStep(0);
  }

  function next(): void {
    if (!tourActive()) return;
    if (step >= TOUR_STEPS.length - 1) {
      finish();
      return;
    }
    enterStep(step + 1);
  }

  function back(): void {
    if (!tourActive() || step <= 0) return;
    enterStep(step - 1);
  }

  /** Finish tour and Skip tour both end it for good; it never auto-opens again. */
  function finish(): void {
    if (currentStep() === 'invite') inviteDialogRequest = 'close';
    step = -1;
    tourSeen = true;
    syncPageCount();
    void refreshSetupStatus();
  }

  function dismissGuide(): void {
    guideDismissed = true;
    guideOpen = false;
  }

  function setGuideOpen(open: boolean): void {
    guideOpen = open;
    // Re-check the checklist against /admin/ai-engines and /admin/users, in case
    // a key or user was added elsewhere (another tab, another admin).
    if (open) void refreshSetupStatus();
  }

  function consumeInviteDialogRequest(): 'open' | 'close' | null {
    const request = inviteDialogRequest;
    inviteDialogRequest = null;
    return request;
  }

  return {
    get isOwner() { return isOwner; },
    get statusLoaded() { return statusLoaded; },
    get apiKeyConnected() { return apiKeyConnected; },
    get apiKeyProvider() { return apiKeyProvider; },
    get teammateAdded() { return teammateAdded; },
    get setupComplete() { return setupComplete(); },
    get tourActive() { return tourActive(); },
    get stepIndex() { return step; },
    get currentStep() { return currentStep(); },
    get guideVisible() { return guideVisible(); },
    get guideOpen() { return guideOpen; },
    get inviteDialogRequest() { return inviteDialogRequest; },
    init,
    refreshSetupStatus,
    start,
    next,
    back,
    finish,
    dismissGuide,
    setGuideOpen,
    consumeInviteDialogRequest,
  };
}

export const onboarding = createOnboardingStore();
