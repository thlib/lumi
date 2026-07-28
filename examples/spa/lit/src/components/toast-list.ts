import {html, type TemplateResult} from 'lit'
import {repeat} from 'lit/directives/repeat.js'
import type {Toast} from '../../../data'

export function renderToastList(
  toasts: readonly Toast[],
  onDismiss: (id: string) => void,
): TemplateResult {
  return html`
    <div id="toasts" aria-live="polite" aria-label="Notifications">
      ${repeat(toasts, toast => toast.id, toast => html`
        <div class="toast">
          <span class="icon" aria-hidden="true">!</span>
          <span class="message">${toast.message}</span>
          <button type="button" aria-label="Dismiss notification" @click=${() => onDismiss(toast.id)}>×</button>
        </div>
      `)}
    </div>
  `
}
