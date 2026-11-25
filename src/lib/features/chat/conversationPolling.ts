// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/** Sequential polling; disposal aborts requests and ignores late results. */
export function pollConversation<T>(options: {
  fetch: (signal: AbortSignal) => Promise<T>;
  apply: (value: T) => boolean;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  unschedule?: (timer: ReturnType<typeof setTimeout>) => void;
}): () => void {
  const controller = new AbortController();
  const schedule = options.schedule ?? setTimeout;
  const unschedule = options.unschedule ?? clearTimeout;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout>;
  async function poll() {
    try {
      const value = await options.fetch(controller.signal);
      if (controller.signal.aborted) return;
      failures = 0;
      if (!options.apply(value)) return;
    } catch {
      if (controller.signal.aborted) return;
      failures++;
    }
    timer = schedule(poll, failures === 0 ? 1000 : failures === 1 ? 2000 : 5000);
  }
  timer = schedule(poll, 1000);
  return () => {
    controller.abort();
    unschedule(timer);
  };
}
