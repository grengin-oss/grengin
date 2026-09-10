<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  /**
   * Control Hub Overview, built to control-hub-overview.html: the welcome
   * banner, the Quick Stats row, the Quick Links grid and the Top Models
   * table. Every figure comes from /admin/analytics/overview over a fixed
   * 30-day window, which is what the design's captions describe.
   */
  import { onMount } from "svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import { getAnalyticsOverview } from "../../api/admin/analytics.js";
  import type { AnalyticsOverview } from "../types.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { _ } from "svelte-i18n";
  import { Link } from "svelte-routing";
  import { getAuthState } from "../../features/auth/index.js";
  import { setPageTitle } from "../../utils/pageTitle";

  $effect(() => {
    setPageTitle($_("sidebar.adminPanel"));
  });

  let isLoading = $state(true);
  let overviewData = $state<AnalyticsOverview | null>(null);
  let error = $state<string | null>(null);

  const auth = getAuthState();

  /** The banner greets by first name, the way the design shows it. */
  const firstName = $derived.by(() => {
    const name = auth.user?.name?.trim();
    if (name) return name.split(/\s+/)[0];
    const email = auth.user?.email ?? "";
    return email.split("@")[0] || "";
  });

  function getDefaultStartDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split("T")[0];
  }

  function getDefaultEndDate(): string {
    return new Date().toISOString().split("T")[0];
  }

  async function fetchOverview() {
    isLoading = true;
    error = null;

    try {
      overviewData = await getAnalyticsOverview({
        start_date: getDefaultStartDate(),
        end_date: getDefaultEndDate(),
      });
    } catch (err: any) {
      const errorMessage = err instanceof ApiError ? err.message : err.message;
      error = errorMessage;
      toast.error(errorMessage || $_("adminOverview.errors.fetchFailed"));
      console.error("Overview fetch error:", err);
    } finally {
      isLoading = false;
    }
  }

  function formatNumber(num: number): string {
    if (num >= 1000000) {
      const val = num / 1000000;
      return (val % 1 === 0 ? val.toString() : val.toFixed(1)) + "M";
    }
    if (num >= 1000) {
      const val = num / 1000;
      return (val % 1 === 0 ? val.toString() : val.toFixed(1)) + "K";
    }
    return Math.round(num).toString();
  }

  function formatCurrency(num: number): string {
    return "$" + (num ?? 0).toFixed(2);
  }

  function formatPercentage(num: number): string {
    const sign = num >= 0 ? "+" : "";
    return sign + (num * 100).toFixed(1) + "%";
  }

  const PROVIDER_COLORS: Record<string, string> = {
    openai: "var(--gx-org-kpi-icon-fg)",
    anthropic: "var(--gx-an-violet)",
    google: "var(--gx-an-amber)",
    azure: "var(--gx-an-blue)",
    mistral: "var(--gx-an-rose)",
  };

  function providerColor(provider: string): string {
    return (
      PROVIDER_COLORS[provider?.toLowerCase?.() ?? ""] ?? "var(--gx-an-axis)"
    );
  }

  interface QuickLink {
    href: string;
    title: string;
    description: string;
    icon: "organization" | "analytics" | "prompts" | "settings" | "system";
  }

  const QUICK_LINKS = $derived<QuickLink[]>([
    {
      href: "/admin/departments",
      title: $_("admin.departments.organization"),
      description: $_("adminOverview.manageOrganization"),
      icon: "organization",
    },
    {
      href: "/admin/analytics",
      title: $_("sidebar.usageAnalytics"),
      description: $_("adminOverview.viewAnalytics"),
      icon: "analytics",
    },
    {
      href: "/admin/prompt-effectiveness",
      title: $_("sidebar.promptEffectiveness"),
      description: $_("adminOverview.viewPromptEffectiveness"),
      icon: "prompts",
    },
    {
      href: "/admin/settings",
      title: $_("sidebar.settings"),
      description: $_("adminOverview.configureSettings"),
      icon: "settings",
    },
    {
      href: "/admin/system-metrics",
      title: $_("sidebar.systemMetrics"),
      description: $_("adminOverview.viewSystemMetrics"),
      icon: "system",
    },
  ]);

  onMount(() => {
    fetchOverview();
  });
</script>

<div class="overview-page">
  <div class="header-block">
    <h1 class="page-title">{$_("adminOverview.title")}</h1>
    <span class="page-sub">{$_("adminOverview.subtitle")}</span>
  </div>

  {#if isLoading}
    <div
      class="loading-container"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={$_("admin.common.loading")}
    >
      <LoadingSpinner />
    </div>
  {:else if error}
    <div class="error-state" role="alert" aria-live="assertive">
      <p class="error-message">{error}</p>
      <button type="button" class="retry-btn" onclick={fetchOverview}>
        {$_("adminOverview.retry")}
      </button>
    </div>
  {:else if overviewData}
    <!-- ===================== welcome banner ===================== -->
    <div class="welcome-banner">
      <div class="banner-content">
        <span class="welcome-title">
          {$_("adminOverview.welcomeBack", { values: { name: firstName } })}
        </span>
        <span class="welcome-sub">
          {$_("adminOverview.welcomeSummary", {
            values: {
              cost: formatCurrency(overviewData.total_cost),
              users: formatNumber(overviewData.total_users),
            },
          })}
        </span>
      </div>
      <Link to="/admin/mcp-servers" class="connect-btn">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <line
            x1="7"
            y1="1"
            x2="7"
            y2="13"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <line
            x1="1"
            y1="7"
            x2="13"
            y2="7"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
        <span>{$_("adminOverview.connectAccount")}</span>
      </Link>
    </div>

    <!-- ===================== Quick Stats ===================== -->
    <section class="section" aria-labelledby="quick-stats-title">
      <div class="section-head">
        <h2 class="section-title" id="quick-stats-title">
          {$_("adminOverview.quickStats")}
        </h2>
        <span class="section-sub">{$_("adminOverview.last30Days")}</span>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-card__bar" style="background: var(--gx-an-green)"
          ></span>
          <div class="stat-card__head">
            <span class="stat-title">{$_("adminOverview.totalUsers")}</span>
          </div>
          <span class="stat-value"
            >{formatNumber(overviewData.total_users)}</span
          >
          <div class="stat-desc">
            <span class="stat-desc-dot" style="background: var(--gx-an-green)"
            ></span>
            <span class="stat-desc-text" style="color: var(--gx-an-green)">
              {$_("adminOverview.activeUsers", {
                values: { count: formatNumber(overviewData.active_users) },
              })}
            </span>
          </div>
        </div>

        <div class="stat-card">
          <span class="stat-card__bar" style="background: var(--gx-an-bar-blue)"
          ></span>
          <div class="stat-card__head">
            <span class="stat-title">{$_("adminOverview.totalRequests")}</span>
            {#if overviewData.request_growth_rate !== 0}
              <span
                class="stat-badge"
                class:stat-badge--up={overviewData.request_growth_rate > 0}
                class:stat-badge--down={overviewData.request_growth_rate < 0}
                aria-label={$_("adminOverview.growthRate")}
              >
                {formatPercentage(overviewData.request_growth_rate)}
              </span>
            {/if}
          </div>
          <span class="stat-value"
            >{formatNumber(overviewData.total_requests)}</span
          >
          <span class="stat-desc-muted">{$_("adminOverview.last30Days")}</span>
        </div>

        <div class="stat-card">
          <span class="stat-card__bar" style="background: var(--gx-an-bar-blue)"
          ></span>
          <div class="stat-card__head">
            <span class="stat-title">{$_("adminOverview.totalTokens")}</span>
            {#if overviewData.token_growth_rate !== 0}
              <span
                class="stat-badge"
                class:stat-badge--up={overviewData.token_growth_rate > 0}
                class:stat-badge--down={overviewData.token_growth_rate < 0}
                aria-label={$_("adminOverview.growthRate")}
              >
                {formatPercentage(overviewData.token_growth_rate)}
              </span>
            {/if}
          </div>
          <span class="stat-value"
            >{formatNumber(overviewData.total_tokens)}</span
          >
          <span class="stat-desc-muted">{$_("adminOverview.last30Days")}</span>
        </div>

        <div class="stat-card">
          <span class="stat-card__bar" style="background: var(--gx-an-bar-blue)"
          ></span>
          <div class="stat-card__head">
            <span class="stat-title">{$_("adminOverview.totalCost")}</span>
            {#if overviewData.cost_growth_rate !== 0}
              <span
                class="stat-badge"
                class:stat-badge--up={overviewData.cost_growth_rate > 0}
                class:stat-badge--down={overviewData.cost_growth_rate < 0}
                aria-label={$_("adminOverview.growthRate")}
              >
                {formatPercentage(overviewData.cost_growth_rate)}
              </span>
            {/if}
          </div>
          <span class="stat-value"
            >{formatCurrency(overviewData.total_cost)}</span
          >
          <span class="stat-desc-muted">{$_("adminOverview.last30Days")}</span>
        </div>
      </div>
    </section>

    <!-- ===================== Quick Links ===================== -->
    <section class="section" aria-labelledby="quick-links-title">
      <h2 class="section-title" id="quick-links-title">
        {$_("adminOverview.quickLinks")}
      </h2>

      <div class="links-grid">
        {#each QUICK_LINKS as link (link.href)}
          <Link to={link.href} class="quick-link-card">
            <span class="quick-link-card__icon" aria-hidden="true">
              {#if link.icon === "organization"}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                >
                  <path
                    d="M11.9999 14.9994V2.99939C11.9999 2.60156 11.8418 2.22003 11.5605 1.93873C11.2792 1.65742 10.8976 1.49939 10.4997 1.49939H7.4995C7.10165 1.49939 6.72009 1.65742 6.43876 1.93873C6.15743 2.22003 5.99938 2.60156 5.99938 2.99939V14.9994M2.99914 4.49939H15.0001C15.8286 4.49939 16.5002 5.17096 16.5002 5.99939V13.4994C16.5002 14.3278 15.8286 14.9994 15.0001 14.9994H2.99914C2.17065 14.9994 1.49902 14.3278 1.49902 13.4994V5.99939C1.49902 5.17096 2.17065 4.49939 2.99914 4.49939Z"
                    stroke="#427AC6"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              {:else if link.icon === "analytics"}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                >
                  <path
                    d="M2.25 2.25V14.25C2.25 14.6478 2.40804 15.0294 2.68934 15.3107C2.97064 15.592 3.35218 15.75 3.75 15.75H15.75M13.5 12.75V6.75M9.75 12.75V3.75M6 12.75V10.5"
                    stroke="#427AC6"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              {:else if link.icon === "prompts"}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                >
                  <path
                    d="M10.5002 1.49939H4.50083C4.10304 1.49939 3.72155 1.65744 3.44027 1.93877C3.159 2.22009 3.00098 2.60166 3.00098 2.99951V15.0005C3.00098 15.3983 3.159 15.7799 3.44027 16.0612C3.72155 16.3425 4.10304 16.5006 4.50083 16.5006H13.4999C13.8977 16.5006 14.2792 16.3425 14.5605 16.0612C14.8418 15.7799 14.9998 15.3983 14.9998 15.0005V5.99975M10.5002 1.49939C10.7376 1.49901 10.9727 1.5456 11.1921 1.63648C11.4114 1.72736 11.6105 1.86074 11.7781 2.02893L14.4688 4.72015C14.6374 4.88779 14.7712 5.08719 14.8623 5.30682C14.9534 5.52645 15.0002 5.76196 14.9998 5.99975M10.5002 1.49939V5.24969C10.5002 5.44862 10.5792 5.6394 10.7199 5.78006C10.8605 5.92072 11.0513 5.99975 11.2501 5.99975L14.9998 5.99975M7.50053 6.74981H6.00068M12.0001 9.75005H6.00068M12.0001 12.7503H6.00068"
                    stroke="#427AC6"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              {:else if link.icon === "settings"}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                >
                  <path
                    d="M7.25275 3.10272C7.29407 2.66798 7.496 2.26426 7.81907 1.97043C8.14215 1.67661 8.56317 1.51379 8.99987 1.51379C9.43658 1.51379 9.85759 1.67661 10.1807 1.97043C10.5037 2.26426 10.7057 2.66798 10.747 3.10272C10.7718 3.38356 10.864 3.65429 11.0156 3.89198C11.1672 4.12967 11.3739 4.32733 11.6181 4.46823C11.8623 4.60913 12.1369 4.68913 12.4185 4.70144C12.7002 4.71375 12.9807 4.65803 13.2362 4.53897C13.6331 4.35881 14.0828 4.33274 14.4977 4.46584C14.9127 4.59894 15.2634 4.88169 15.4814 5.25905C15.6994 5.63642 15.7692 6.0814 15.6772 6.5074C15.5852 6.9334 15.338 7.30994 14.9837 7.56372C14.753 7.72561 14.5647 7.94068 14.4347 8.19074C14.3047 8.44081 14.2368 8.7185 14.2368 9.00035C14.2368 9.28219 14.3047 9.55989 14.4347 9.80996C14.5647 10.06 14.753 10.2751 14.9837 10.437C15.338 10.6908 15.5852 11.0673 15.6772 11.4933C15.7692 11.9193 15.6994 12.3643 15.4814 12.7416C15.2634 13.119 14.9127 13.4018 14.4977 13.5349C14.0828 13.668 13.6331 13.6419 13.2362 13.4617C12.9807 13.3427 12.7002 13.2869 12.4185 13.2993C12.1369 13.3116 11.8623 13.3916 11.6181 13.5325C11.3739 13.6734 11.1672 13.871 11.0156 14.1087C10.864 14.3464 10.7718 14.6171 10.747 14.898C10.7057 15.3327 10.5037 15.7364 10.1807 16.0303C9.85759 16.3241 9.43658 16.4869 8.99987 16.4869C8.56317 16.4869 8.14215 16.3241 7.81907 16.0303C7.496 15.7364 7.29407 15.3327 7.25275 14.898C7.22795 14.617 7.13582 14.3462 6.98415 14.1084C6.83247 13.8707 6.62573 13.6729 6.38142 13.532C6.13712 13.3911 5.86245 13.3111 5.58068 13.2989C5.29891 13.2867 5.01835 13.3425 4.76275 13.4617C4.36591 13.6419 3.91624 13.668 3.50125 13.5349C3.08625 13.4018 2.73563 13.119 2.51761 12.7416C2.29959 12.3643 2.22978 11.9193 2.32177 11.4933C2.41375 11.0673 2.66095 10.6908 3.01525 10.437C3.24596 10.2751 3.43429 10.06 3.56431 9.80996C3.69433 9.55989 3.76221 9.28219 3.76221 9.00035C3.76221 8.7185 3.69433 8.44081 3.56431 8.19074C3.43429 7.94068 3.24596 7.72561 3.01525 7.56372C2.66144 7.30981 2.41468 6.93342 2.32292 6.50771C2.23116 6.082 2.30095 5.63738 2.51873 5.26026C2.73652 4.88314 3.08673 4.60046 3.50131 4.46715C3.9159 4.33385 4.36523 4.35945 4.762 4.53897C5.01756 4.65803 5.29805 4.71375 5.57972 4.70144C5.86139 4.68913 6.13595 4.60913 6.38015 4.46823C6.62435 4.32733 6.83102 4.12967 6.98265 3.89198C7.13428 3.65429 7.22641 3.38356 7.25125 3.10272M11.2493 9.00061C11.2493 10.2433 10.2419 11.2506 8.99927 11.2506C7.75663 11.2506 6.74927 10.2433 6.74927 9.00061C6.74927 7.75797 7.75663 6.75061 8.99927 6.75061C10.2419 6.75061 11.2493 7.75797 11.2493 9.00061Z"
                    stroke="#427AC6"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                >
                  <g clip-path="url(#clip0_193_1121)">
                    <path
                      d="M11.9999 9.7502L15.9174 12.3617C15.9739 12.3993 16.0395 12.4208 16.1073 12.4241C16.175 12.4273 16.2424 12.4121 16.3022 12.3801C16.362 12.3481 16.412 12.3005 16.4469 12.2423C16.4818 12.1841 16.5002 12.1175 16.5002 12.0497V5.9027C16.5002 5.83672 16.4829 5.7719 16.4498 5.71478C16.4168 5.65767 16.3692 5.61029 16.312 5.57742C16.2548 5.54456 16.1899 5.52737 16.1239 5.52759C16.0579 5.52781 15.9932 5.54544 15.9362 5.5787L11.9999 7.8752M2.99914 4.5H10.4997C11.3282 4.5 11.9999 5.17157 11.9999 6V12C11.9999 12.8284 11.3282 13.5 10.4997 13.5H2.99914C2.17065 13.5 1.49902 12.8284 1.49902 12V6C1.49902 5.17157 2.17065 4.5 2.99914 4.5Z"
                      stroke="#427AC6"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                  </g>
                  <defs>
                    <clipPath id="clip0_193_1121">
                      <rect width="18" height="18" fill="white" />
                    </clipPath>
                  </defs>
                </svg>
              {/if}
            </span>
            <span class="quick-link-card__body">
              <span class="quick-link-card__title">{link.title}</span>
              <span class="quick-link-card__desc">{link.description}</span>
            </span>
            <span class="quick-link-card__chevron" aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M10 16L14 12L10 8"
                  stroke="#0E1828"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
          </Link>
        {/each}
      </div>
    </section>

    <!-- ===================== Top Models ===================== -->
    {#if overviewData.top_models && overviewData.top_models.length > 0}
      <section class="section" aria-labelledby="top-models-title">
        <div class="section-head">
          <h2 class="section-title" id="top-models-title">
            {$_("adminOverview.topModels")}
          </h2>
          <span class="section-sub">
            {$_("analytics.topModels.subtitleByCost", {
              values: {
                range: $_("adminOverview.last30Days").toLocaleLowerCase(),
              },
            })}
          </span>
        </div>

        <div
          class="table-container"
          role="table"
          aria-label={$_("analytics.aria.topModelsCaption")}
        >
          <div class="table-header" role="row">
            <span role="columnheader">{$_("analytics.topModels.model")}</span>
            <span role="columnheader">{$_("analytics.topModels.provider")}</span
            >
            <span role="columnheader">{$_("analytics.topModels.requests")}</span
            >
            <span role="columnheader">{$_("analytics.topModels.tokens")}</span>
            <span role="columnheader">{$_("analytics.topModels.cost")}</span>
          </div>

          {#each overviewData.top_models.slice(0, 5) as model (model.model_name + model.model_provider)}
            <div class="model-row" role="row">
              <div role="cell">
                <span class="model-name">{model.model_name}</span>
              </div>
              <div role="cell">
                <span
                  class="provider-dot"
                  style="background: {providerColor(model.model_provider)}"
                ></span>
                <span class="provider-name">{model.model_provider}</span>
              </div>
              <div role="cell">
                <span class="table-value"
                  >{formatNumber(model.total_requests)}</span
                >
              </div>
              <div role="cell">
                <span class="table-value"
                  >{formatNumber(model.total_tokens)}</span
                >
              </div>
              <div role="cell">
                <span class="table-value--cost"
                  >{formatCurrency(model.total_cost)}</span
                >
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  /* app.css's global button rule blurs what sits behind it, which erases the
     hairlines this design draws under its buttons. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* Design (control-hub-overview.html): 32px page padding, 28px stack. */
  .overview-page {
    display: flex;
    flex-direction: column;
    gap: 28px;
    padding: 32px;
    font-family: var(--gx-font);
  }

  .header-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .page-title {
    margin: 0;
    font-family: var(--gx-font-display);
    font-weight: 700;
    font-size: 28px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .page-sub {
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  .loading-container {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 64px 20px;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
    padding: 48px 24px;
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-an-ring);
  }

  .error-message {
    margin: 0;
    font-size: 13px;
    color: var(--gx-an-sub);
  }

  .retry-btn {
    height: 33px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-org-brand);
    box-shadow: none;
    padding: 0 14px;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    color: #fff;
    cursor: pointer;
  }

  .retry-btn:focus-visible {
    outline: 2px solid var(--gx-an-blue);
    outline-offset: 2px;
  }

  /* ---------------- welcome banner ---------------- */
  .welcome-banner {
    min-height: 82px;
    border-radius: 12px;
    background: var(--gx-ch-banner);
    display: flex;
    gap: 16px;
    padding: 20px 24px;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
  }

  .banner-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .welcome-title {
    font-family: var(--gx-font-display);
    font-weight: 700;
    font-size: 18px;
    line-height: 130%;
    color: #fff;
  }

  .welcome-sub {
    font-weight: 400;
    font-size: 13px;
    line-height: 130%;
    color: var(--gx-ch-banner-sub);
  }

  .overview-page :global(.connect-btn) {
    min-height: 38px;
    border-radius: 8px;
    background: var(--gx-ch-connect-bg);
    display: flex;
    gap: 8px;
    padding: 7px 19px;
    align-items: center;
    justify-content: center;
    color: #fff;
    flex-shrink: 0;
    font-weight: 500;
    font-size: 14px;
    line-height: 20px;
    white-space: nowrap;
    text-decoration: none;
    transition: background-color 120ms ease;
  }

  .overview-page :global(.connect-btn:hover) {
    background: var(--gx-ch-connect-bg-hover);
    color: #fff;
  }

  .overview-page :global(.connect-btn:focus-visible) {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  /* ---------------- sections ---------------- */
  .section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .section-title {
    margin: 0;
    font-family: var(--gx-font-display);
    font-weight: 700;
    font-size: 15px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .section-sub {
    font-weight: 500;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  /* ---------------- quick stats ---------------- */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }

  .stat-card {
    position: relative;
    overflow: hidden;
    min-height: 116px;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-an-ring);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }

  .stat-card__bar {
    position: absolute;
    inset-inline: 0;
    top: 0;
    height: 3px;
  }

  .stat-card__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .stat-title {
    font-weight: 500;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-an-sub);
    white-space: nowrap;
  }

  .stat-badge {
    border-radius: 4px;
    padding: 2px 6px;
    font-weight: 700;
    font-size: 10px;
    line-height: 1.4;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .stat-badge--down {
    background: var(--gx-an-badge-down-bg);
    color: var(--gx-an-badge-down-fg);
  }

  .stat-badge--up {
    background: var(--gx-an-badge-up-bg);
    color: var(--gx-an-badge-up-fg);
  }

  .stat-value {
    font-weight: 700;
    font-size: 28px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .stat-desc {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .stat-desc-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .stat-desc-text {
    font-weight: 600;
    font-size: 11px;
    line-height: 100%;
  }

  .stat-desc-muted {
    font-weight: 400;
    font-size: 11px;
    line-height: 100%;
    color: var(--gx-slate-400);
  }

  /* ---------------- quick links ---------------- */
  .links-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }

  .overview-page :global(.quick-link-card) {
    min-height: 68px;
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px var(--gx-an-ring);
    display: flex;
    gap: 12px;
    padding: 16px;
    align-items: center;
    text-decoration: none;
    transition: box-shadow 120ms ease;
  }

  .overview-page :global(.quick-link-card:hover) {
    box-shadow:
      inset 0 0 0 1px var(--gx-ch-card-hover-ring),
      var(--gx-ch-card-hover-shadow);
  }

  .overview-page :global(.quick-link-card:focus-visible) {
    outline: 2px solid var(--gx-an-blue);
    outline-offset: 2px;
  }

  .quick-link-card__icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: var(--gx-org-kpi-icon-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-org-kpi-icon-fg);
    flex-shrink: 0;
  }

  .quick-link-card__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-grow: 1;
    min-width: 0;
  }

  .quick-link-card__title {
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .quick-link-card__desc {
    font-weight: 400;
    font-size: 11px;
    line-height: 130%;
    color: var(--gx-an-sub);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .quick-link-card__chevron {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-ink);
    flex-shrink: 0;
  }

  :global([dir="rtl"]) .quick-link-card__chevron svg {
    transform: rotate(90deg);
  }

  /* ---------------- top models ---------------- */
  .table-container {
    border-radius: 12px;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px var(--gx-an-ring);
  }

  .table-header {
    min-height: 41px;
    background: var(--gx-module-bg);
    display: flex;
    padding: 12px 16px;
    align-items: center;
    gap: 12px;
  }

  .table-header > span {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    font-size: 11px;
    line-height: 100%;
    text-transform: uppercase;
    color: var(--gx-an-sub);
  }

  .model-row {
    min-height: 41px;
    background: var(--gx-card);
    border: 1px solid var(--gx-an-ring);
    border-top: none;
    display: flex;
    padding: 12px 16px;
    align-items: center;
    gap: 12px;
  }

  .model-row > div {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .model-name {
    font-weight: 700;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .provider-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .provider-name {
    font-weight: 500;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .table-value {
    font-weight: 500;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .table-value--cost {
    font-weight: 700;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  /* ---------------- responsive ---------------- */
  @media (max-width: 1100px) {
    .stats-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .links-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 768px) {
    .overview-page {
      padding: 20px;
    }

    .stats-row,
    .links-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .welcome-banner {
      align-items: stretch;
    }

    .overview-page :global(.connect-btn) {
      width: 100%;
    }
  }

  /* The quick-link description is a one-line ellipsis so the cards keep a
     uniform height on a wide grid. On a phone the cards are full-width and
     stacked, so there is room to show the whole sentence over two lines. */
  @media (max-width: 640px) {
    .quick-link-card__desc {
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
    }
  }

  /* Same five-column Top Models table as the analytics overview: below
     ~640px the equal flex columns crush model names to a few characters.
     Keep a legible minimum and scroll the table inside its card. */
  @media (max-width: 640px) {
    .table-container {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-x: contain;
    }

    .table-header,
    .model-row {
      min-width: 520px;
    }

    .table-header > span:first-child,
    .model-row > div:first-child {
      flex: 1.6;
    }
  }
</style>
