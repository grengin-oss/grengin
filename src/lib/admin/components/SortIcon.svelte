<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
    interface Props {
        sort: "name" | "email" | "created_at" | null;
        currentSort: "name" | "email" | "created_at" | null;
        ascending: boolean;
    }

    let { sort, currentSort, ascending }: Props = $props();

    const isActive = $derived(sort === currentSort);
</script>

{#if isActive}
    <span class="sort-icon sort-icon-active">
        {#if ascending}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 320 512"
                class="sort-svg sort-svg-up"
            >
                <path
                    fill="currentColor"
                    d="M279 224H41c-21.4 0-32.1-25.9-17-41L143 64c9.4-9.4 24.6-9.4 33.9 0l119 119c15.2 15.1 4.5 41-16.9 41"
                />
            </svg>
        {:else}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 320 512"
                class="sort-svg sort-svg-down"
            >
                <path
                    fill="currentColor"
                    d="M41 288h238c21.4 0 32.1 25.9 17 41L177 448c-9.4 9.4-24.6 9.4-33.9 0L24 329c-15.1-15.1-4.4-41 17-41"
                />
            </svg>
        {/if}
    </span>
{:else}
    <span class="sort-icon sort-icon-unsorted">
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 1024 1408"
            class="sort-svg"
        >
            <path
                fill="currentColor"
                d="M1024 896q0 26-19 45l-448 448q-19 19-45 19t-45-19L19 941Q0 922 0 896t19-45t45-19h896q26 0 45 19t19 45m0-384q0 26-19 45t-45 19H64q-26 0-45-19T0 512t19-45L467 19q19-19 45-19t45 19l448 448q19 19 19 45"
            />
        </svg>
    </span>
{/if}

<style>
    .sort-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: var(--space-xs);
        transition: all 0.2s ease;
        color: var(--text-primary);
    }

    .sort-svg {
        width: 12px;
        height: 12px;
        display: block;
    }

    .sort-svg-up, .sort-svg-down {
       width: 16px;
       height: 16px;
    }

    .sort-icon-unsorted {
        opacity: 0.5;
        color: var(--text-secondary);
    }

    .sort-icon-active {
        opacity: 1;
        color: color-mix(in oklab, var(--brand) 85%, black);
    }

    :global(.sortable:hover .sort-icon-unsorted) {
        opacity: 0.8;
        color: var(--brand);
    }

    :global(.sortable:hover .sort-icon-active) {
        opacity: 1;
    }
</style>
