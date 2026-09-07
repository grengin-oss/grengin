export const APP_NAME = "Grengin";
const MAX_TITLE_LENGTH = 60;

export function setPageTitle(title?: string | null): void {
  const trimmed = title?.trim();
  if (!trimmed) {
    document.title = APP_NAME;
    return;
  }
  const truncated =
    trimmed.length > MAX_TITLE_LENGTH
      ? trimmed.slice(0, MAX_TITLE_LENGTH - 1).trimEnd() + "…"
      : trimmed;
  document.title = `${truncated} | ${APP_NAME}`;
}
