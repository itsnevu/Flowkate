// Chevron for the sunken selects — the native arrow is hidden by appearance-none.
export const SelectChevron = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
    aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);
