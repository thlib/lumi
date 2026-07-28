import {LitElement, html, nothing, type TemplateResult} from 'lit'
import {
  documentTitle,
  memberFromHash,
  normalizeHash,
  routeFromHash,
  type ProjectFilter,
  type Route,
  type Toast,
} from '../../data'
import type {
  RecordFilter,
  RecordSortDirection,
} from '../../data-20k'
import {renderAppHeader} from './components/app-header'
import {renderPrimaryNavigation} from './components/primary-navigation'
import {renderActivityPage} from './pages/activity-page'
import {renderOverviewPage} from './pages/overview-page'
import {renderProjectsPage} from './pages/projects-page'
import {renderRecordsPage} from './pages/records-page'
import {renderTeamsPage} from './pages/teams-page'
import {ToastController} from './services/toast-controller'

class LuminateApp extends LitElement {
  static properties = {
    route: {state: true},
    memberId: {state: true},
    navOpen: {state: true},
    projectFilter: {state: true},
    recordFilter: {state: true},
    recordSort: {state: true},
    toasts: {state: true},
    emailError: {state: true},
    now: {state: true},
  }

  declare private route: Route
  declare private memberId: string | null
  declare private navOpen: boolean
  declare private projectFilter: ProjectFilter
  declare private recordFilter: RecordFilter
  declare private recordSort: RecordSortDirection
  declare private toasts: readonly Toast[]
  declare private emailError: string
  declare private now: Date

  private clock: number | undefined
  private readonly toastController = new ToastController(toasts => {
    this.toasts = toasts
  })

  constructor() {
    super()
    normalizeHash()
    this.route = routeFromHash(location.hash)
    this.memberId = memberFromHash(location.hash)
    this.navOpen = false
    this.projectFilter = 'all'
    this.recordFilter = 'all'
    this.recordSort = 'ascending'
    this.toasts = []
    this.emailError = ''
    this.now = new Date()
  }

  override createRenderRoot(): HTMLElement {
    return this
  }

  override connectedCallback(): void {
    super.connectedCallback()
    addEventListener('hashchange', this.handleHashChange)
    this.clock = window.setInterval(() => {
      this.now = new Date()
    }, 60_000)
  }

  override disconnectedCallback(): void {
    removeEventListener('hashchange', this.handleHashChange)
    window.clearInterval(this.clock)
    this.toastController.clear()
    super.disconnectedCallback()
  }

  protected override updated(): void {
    document.title = documentTitle(this.route, this.memberId)
  }

  private readonly handleHashChange = (): void => {
    this.route = routeFromHash(location.hash)
    this.memberId = memberFromHash(location.hash)
    this.navOpen = false
    this.toastController.clear()
    void this.updateComplete.then(() => {
      this.querySelector<HTMLElement>('main')?.focus({preventScroll: true})
    })
  }

  private validationMessage(input: HTMLInputElement): string {
    if (input.validity.valueMissing) return 'Enter an email address.'
    if (input.validity.typeMismatch) return 'Enter a valid email address.'
    return ''
  }

  private readonly submitInvite = (event: SubmitEvent): void => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const input = form.elements.namedItem('email') as HTMLInputElement
    input.value = input.value.trim()
    this.emailError = this.validationMessage(input)
    if (this.emailError !== '') {
      input.focus()
      return
    }
    this.toastController.show()
  }

  private readonly submitDemo = (event: SubmitEvent): void => {
    event.preventDefault()
    this.toastController.show()
  }

  private readonly updateEmailError = (event: Event): void => {
    if (this.emailError !== '') {
      this.emailError = this.validationMessage(
        event.currentTarget as HTMLInputElement,
      )
    }
  }

  protected override render(): TemplateResult {
    return html`
      <div id="shell" data-navigation-state=${this.navOpen ? 'open' : nothing}>
        <div id="header">
          ${renderAppHeader({
            navOpen: this.navOpen,
            onToggleNavigation: () => {
              this.navOpen = !this.navOpen
            },
          })}
        </div>
        <aside id="sidebar">
          ${renderPrimaryNavigation({
            route: this.route,
            onNavigate: route => {
              if (this.route === route) this.navOpen = false
            },
          })}
        </aside>
        <button
          id="backdrop"
          type="button"
          aria-label="Close navigation"
          @click=${() => {
            this.navOpen = false
          }}
        ></button>
        <main tabindex="-1">${this.renderPage()}</main>
      </div>
    `
  }

  private renderPage(): TemplateResult {
    switch (this.route) {
      case 'projects':
        return renderProjectsPage({
          filter: this.projectFilter,
          onFilterChange: filter => {
            this.projectFilter = filter
          },
        })
      case 'records':
        return renderRecordsPage({
          filter: this.recordFilter,
          sortDirection: this.recordSort,
          onFilterChange: filter => {
            this.recordFilter = filter
          },
          onSortChange: direction => {
            this.recordSort = direction
          },
        })
      case 'activity':
        return renderActivityPage()
      case 'teams':
        return renderTeamsPage({
          memberId: this.memberId,
          toasts: this.toasts,
          emailError: this.emailError,
          onDismissToast: id => this.toastController.dismiss(id),
          onInviteSubmit: this.submitInvite,
          onDemoSubmit: this.submitDemo,
          onEmailInput: this.updateEmailError,
        })
      default:
        return renderOverviewPage(this.now)
    }
  }
}

customElements.define('luminate-app', LuminateApp)
