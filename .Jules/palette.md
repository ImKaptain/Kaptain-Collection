## 2026-07-02 - Toast Live Region and Icon Accessibility
**Learning:** Toast notifications dynamically injected into the DOM are invisible to screen readers unless the container acts as a live region. Also, the close button used `&times;` with no ARIA label.
**Action:** Added `aria-live="polite"` and `aria-atomic="true"` to the `#toast-container` in `index.html`. Added `aria-label="Close toast"` to the `.toast-close` buttons in `app.js`. Future dynamic notifications must always target an established live region and ensure icon-only buttons are labelled.
