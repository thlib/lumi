import {LitElement, html, nothing, type TemplateResult} from 'lit'
import {repeat} from 'lit/directives/repeat.js'
import {
  activities,
  documentTitle,
  memberFromHash,
  members,
  metrics,
  normalizeHash,
  overviewDetails,
  projects,
  routeFromHash,
  type Activity,
  type Member,
  type Project,
  type ProjectFilter,
  type Route,
  type Toast,
} from '../../data'
import {
  filterLargeRecords,
  orderLargeRecords,
  recordFilters,
  type RecordFilter,
  type RecordSortDirection,
} from '../../data-20k'

const projectFilters: readonly ProjectFilter[] = ['all', 'active', 'planning']
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

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
  declare private toasts: Toast[]
  declare private emailError: string
  declare private now: Date

  private nextToastId = 1
  private clock: number | undefined
  private readonly toastTimers = new Map<string, number>()

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
    this.clearToastTimers()
    super.disconnectedCallback()
  }

  protected override updated(): void {
    document.title = documentTitle(this.route, this.memberId)
  }

  private readonly handleHashChange = (): void => {
    this.route = routeFromHash(location.hash)
    this.memberId = memberFromHash(location.hash)
    this.navOpen = false
    this.toasts = []
    this.clearToastTimers()
    void this.updateComplete.then(() => {
      this.querySelector<HTMLElement>('main')?.focus({preventScroll: true})
    })
  }

  private closeIfCurrent(route: Route): void {
    if (this.route === route) this.navOpen = false
  }

  private clearToastTimers(): void {
    this.toastTimers.forEach(timer => clearTimeout(timer))
    this.toastTimers.clear()
  }

  private validationMessage(input: HTMLInputElement): string {
    if (input.validity.valueMissing) return 'Enter an email address.'
    if (input.validity.typeMismatch) return 'Enter a valid email address.'
    return ''
  }

  private submitInvite(event: SubmitEvent): void {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const input = form.elements.namedItem('email') as HTMLInputElement
    input.value = input.value.trim()
    this.emailError = this.validationMessage(input)
    if (this.emailError !== '') {
      input.focus()
      return
    }
    this.showToast()
  }

  private submitDemo(event: SubmitEvent): void {
    event.preventDefault()
    this.showToast()
  }

  private updateEmailError(event: Event): void {
    if (this.emailError !== '') {
      this.emailError = this.validationMessage(
        event.currentTarget as HTMLInputElement,
      )
    }
  }

  private showToast(): void {
    const toast = {
      id: `toast-${this.nextToastId++}`,
      message: 'No server for demo',
    }
    this.toasts = [...this.toasts, toast]
    this.toastTimers.set(
      toast.id,
      window.setTimeout(() => this.dismissToast(toast.id), 3200),
    )
  }

  private dismissToast(id: string): void {
    clearTimeout(this.toastTimers.get(id))
    this.toastTimers.delete(id)
    this.toasts = this.toasts.filter(toast => toast.id !== id)
  }

  protected override render(): TemplateResult {
    return html`
      <div id="shell" data-navigation-state=${this.navOpen ? 'open' : nothing}>
        <div id="header">${this.renderHeader()}</div>
        <aside id="sidebar">${this.renderNavigation()}</aside>
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

  private renderHeader(): TemplateResult {
    return html`
      <header id="topbar">
        <div class="start">
          <button
            id="menu"
            class="icon-button"
            type="button"
            aria-label="Open navigation"
            aria-controls="navigation"
            aria-expanded=${this.navOpen}
            @click=${() => {
              this.navOpen = !this.navOpen
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16"></path>
            </svg>
          </button>
          <a class="brand" href="#/overview" aria-label="Luminate overview">
            <svg class="mark" viewBox="0 0 36 36" aria-hidden="true">
              <path d="M18 3l3.6 11.4L33 18l-11.4 3.6L18 33l-3.6-11.4L3 18l11.4-3.6L18 3Z"></path>
              <circle cx="18" cy="18" r="3.8"></circle>
            </svg>
            <span>luminate</span>
          </a>
          <span class="divider" aria-hidden="true"></span>
          <div class="workspace-switcher">
            <span class="avatar">N</span><span class="name">Luminate</span>
          </div>
        </div>
        <div class="end">
          <a class="user-menu" href="#/teams/freddy-fraggin">
            <span class="avatar">FF</span><span class="name">Freddy Fraggin</span>
          </a>
        </div>
      </header>
    `
  }

  private renderNavigation(): TemplateResult {
    const current = (route: Route) => this.route === route ? 'page' : nothing
    return html`
      <nav id="navigation" aria-label="Primary navigation">
        <div class="body">
          <p class="eyebrow">Workspace</p>
          <a class="link" href="#/overview" aria-current=${current('overview')} @click=${() => this.closeIfCurrent('overview')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><rect x="14" y="14" width="6" height="6" rx="1"></rect></svg>
            <span>Overview</span>
          </a>
          <a class="link" href="#/projects" aria-current=${current('projects')} @click=${() => this.closeIfCurrent('projects')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h6l2-2h8v14H4v-12Z"></path></svg>
            <span>Projects</span><span class="count">${projects.length}</span>
          </a>
          <a class="link" href="#/records" aria-current=${current('records')} @click=${() => this.closeIfCurrent('records')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M5 12h14M5 19h14"></path></svg>
            <span>Records</span>
          </a>
          <a class="link" href="#/activity" aria-current=${current('activity')} @click=${() => this.closeIfCurrent('activity')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h3l2-6 4 12 2-6h5"></path></svg>
            <span>Activity</span>
          </a>
          <p class="eyebrow manage">Manage</p>
          <a class="link" href="#/teams" aria-current=${current('teams')} @click=${() => this.closeIfCurrent('teams')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"></circle><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M16 8h5M18.5 5.5v5"></path></svg>
            <span>Teams</span>
          </a>
        </div>
      </nav>
    `
  }

  private renderPage(): TemplateResult {
    switch (this.route) {
      case 'projects': return this.renderProjects()
      case 'records': return this.renderRecords()
      case 'activity': return this.renderActivity()
      case 'teams': return this.renderTeams()
      default: return this.renderOverview()
    }
  }

  private renderOverview(): TemplateResult {
    const overview = overviewDetails(this.now)
    return html`
      <section id="overview" aria-labelledby="overview-title">
        <div class="heading">
          <div><p class="eyebrow">${overview.date}</p><h1 id="overview-title">${overview.title}</h1><p>Here's what's happening across your workspace today.</p></div>
          <a class="primary-button" href="#/projects"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h6l2-2h8v14H4v-12Z"></path></svg>View projects</a>
        </div>
        <div class="metric-grid">
          ${repeat(metrics, metric => metric.id, metric => html`
            <article class="metric-card" data-direction=${metric.direction}>
              <div class="top"><span>${metric.label}</span></div>
              <strong>${metric.value}</strong><span class="change">${metric.change}</span>
            </article>
          `)}
        </div>
        <section class="focus">
          <div class="heading">
            <div><h2>In focus</h2><p>Your team's most active projects.</p></div>
            <a class="text-link" href="#/projects">View all <span aria-hidden="true">→</span></a>
          </div>
          ${this.renderProjectCards(projects.slice(0, 3))}
        </section>
        <div class="overview-lower">
          <section class="panel activity-panel" aria-labelledby="recent-activity-title">
            <div class="heading">
              <div><h2 id="recent-activity-title">Recent activity</h2><p>The latest updates from your team.</p></div>
              <a class="text-link" href="#/activity">See all</a>
            </div>
            ${this.renderActivityList(activities.slice(0, 3))}
          </section>
          <aside class="panel week-card" aria-labelledby="week-title">
            <div class="top"><p class="eyebrow">This week</p><h2 id="week-title">Strong momentum</h2><p>Your team completed 28% more work than last week.</p></div>
            <div class="week-chart" aria-label="Weekly activity chart">
              ${weekdays.map(day => html`<span data-day-state=${day === overview.today ? 'today' : nothing}><i>${day}</i></span>`)}
            </div>
          </aside>
        </div>
      </section>
    `
  }

  private renderProjects(): TemplateResult {
    const visible = projects.filter(project => {
      return this.projectFilter === 'all'
        || project.status.toLowerCase() === this.projectFilter
    })
    return html`
      <section id="projects" aria-labelledby="projects-title">
        <div class="heading"><div><p class="eyebrow">Workspace</p><h1 id="projects-title">Projects</h1><p>Plan work, track progress, and keep the team aligned.</p></div></div>
        <div class="project-toolbar">
          <div class="filters" aria-label="Filter projects">
            ${projectFilters.map(filter => html`
              <button
                type="button"
                aria-pressed=${this.projectFilter === filter}
                @click=${() => {
                  this.projectFilter = filter
                }}
              >${filter[0].toUpperCase() + filter.slice(1)}</button>
            `)}
          </div>
          <p>${visible.length} ${visible.length === 1 ? 'project' : 'projects'} shown</p>
        </div>
        ${this.renderProjectCards(visible)}
      </section>
    `
  }

  private renderRecords(): TemplateResult {
    const visible = orderLargeRecords(
      filterLargeRecords(this.recordFilter),
      this.recordSort,
    )
    return html`
      <section id="records" aria-labelledby="records-title">
        <div class="heading"><div><p class="eyebrow">Performance dataset</p><h1 id="records-title">Records</h1><p>Filter and sort a deterministic 20,000-row dataset without virtualization.</p></div></div>
        <div class="record-toolbar">
          <div class="filters" aria-label="Filter records">
            ${recordFilters.map(filter => html`
              <button
                type="button"
                data-record-filter=${filter}
                aria-pressed=${this.recordFilter === filter}
                @click=${() => {
                  this.recordFilter = filter
                }}
              >${filter[0].toUpperCase() + filter.slice(1)}</button>
            `)}
          </div>
          <p class="record-summary">${visible.length.toLocaleString('en-US')} records shown</p>
        </div>
        <div class="record-list-wrap panel">
          <div class="record-list-header" aria-sort=${this.recordSort}>
            <button
              type="button"
              data-record-sort
              @click=${() => {
                this.recordSort = this.recordSort === 'ascending'
                  ? 'descending'
                  : 'ascending'
              }}
            >
              Record <span class="record-sort-indicator" aria-hidden="true">${this.recordSort === 'ascending' ? '↑' : '↓'}</span>
            </button>
          </div>
          <ol class="record-list">
            ${repeat(visible, record => record.id, record => html`
              <li class="record-row">${record.label}</li>
            `)}
          </ol>
        </div>
      </section>
    `
  }

  private renderActivity(): TemplateResult {
    return html`
      <section id="activity" aria-labelledby="activity-title">
        <div class="heading">
          <div><p class="eyebrow">Workspace</p><h1 id="activity-title">Team activity</h1><p>A shared record of progress across every project.</p></div>
          <span class="count">${activities.length} updates</span>
        </div>
        <div class="activity-layout">
          <section class="panel activity-panel" aria-label="All activity">
            <div class="activity-date"><span>Today</span><span class="line"></span></div>
            ${this.renderActivityList(activities)}
          </section>
          <aside class="activity-summary">
            <section class="panel summary-card">
              <p class="eyebrow">Last 7 days</p><strong>42</strong><span>team updates</span>
              <div class="mini-bars" aria-hidden="true">${weekdays.map(() => html`<i></i>`)}</div>
            </section>
            <section class="panel contributor-card">
              <p class="eyebrow">Top contributors</p>
              ${this.renderContributor('norm-barlug', 'Norm Barlug', '14')}
              ${this.renderContributor('emmy-nother', 'Emmy Nother', '11')}
              ${this.renderContributor('fazlo-kan', 'Fazlo Kan', '9')}
            </section>
          </aside>
        </div>
      </section>
    `
  }

  private renderTeams(): TemplateResult {
    const selected = members.find(member => member.id === this.memberId)
    return html`
      <section id="teams">
        ${selected ? this.renderMemberProfile(selected) : this.renderDirectory()}
        <div id="toasts" aria-live="polite" aria-label="Notifications">
          ${repeat(this.toasts, toast => toast.id, toast => html`
            <div class="toast">
              <span class="icon" aria-hidden="true">!</span>
              <span class="message">${toast.message}</span>
              <button type="button" aria-label="Dismiss notification" @click=${() => this.dismissToast(toast.id)}>×</button>
            </div>
          `)}
        </div>
      </section>
    `
  }

  private renderDirectory(): TemplateResult {
    return html`
      <div>
        <div class="heading">
          <div><p class="eyebrow">Manage</p><h1 id="teams-title">Manage teams</h1><p>Invite people and organize how your workspace collaborates.</p></div>
          <span class="count">${members.length} members</span>
        </div>
        <section class="panel member-directory" aria-labelledby="member-list-title">
          <div class="heading"><div><h2 id="member-list-title">All team members</h2><p>Everyone with access to the Luminate workspace.</p></div><span>Team</span><span>Role</span></div>
          <div class="member-list">
            ${repeat(members, member => member.id, member => html`
              <article class="member-row">
                <span class="avatar" data-person=${member.id}>${member.initials}</span>
                <div class="identity"><a href="#/teams/${member.id}">${member.name}</a><span>${member.email}</span></div>
                <span class="team">${member.team}</span><span class="role">${member.role}</span>
              </article>
            `)}
          </div>
        </section>
        <section class="team-actions">
          <div class="heading"><div><h2>Team actions</h2><p>Invitations and new teams require a connected server.</p></div></div>
          <div class="forms">
            <form class="panel team-form" novalidate @submit=${this.submitInvite}>
              ${this.renderFormHeading(
                html`<circle cx="9" cy="8" r="3"></circle><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M17.5 8v6M14.5 11h6"></path>`,
                'Invite a teammate',
                'Send an invitation to join Luminate.',
              )}
              <label class="field">
                <span>Email address</span>
                <input
                  type="email"
                  name="email"
                  placeholder="name@company.com"
                  aria-describedby="invite-email-error"
                  aria-invalid=${this.emailError ? 'true' : nothing}
                  required
                  @input=${this.updateEmailError}
                >
                <small id="invite-email-error" class="error" aria-live="polite" ?hidden=${!this.emailError}>${this.emailError}</small>
              </label>
              <label class="field"><span>Role</span><select name="role"><option>Member</option><option>Admin</option><option>Viewer</option></select></label>
              <button class="primary-button" type="submit">Send invitation</button>
            </form>
            <form class="panel team-form" novalidate @submit=${this.submitDemo}>
              ${this.renderFormHeading(
                html`<circle cx="8" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M2.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M14 14c3.8-.7 6.2 1 6.8 5"></path>`,
                'Create a team',
                'Group teammates around a shared area of work.',
                'create-team',
              )}
              <label class="field"><span>Team name</span><input type="text" name="teamName" placeholder="e.g. Product design" required></label>
              <label class="field"><span>Description <em>Optional</em></span><textarea name="description" rows="3" placeholder="What does this team work on?"></textarea></label>
              <button class="primary-button" type="submit">Create team</button>
            </form>
          </div>
        </section>
      </div>
    `
  }

  private renderMemberProfile(member: Member): TemplateResult {
    return html`
      <div id="profile">
        <a class="back-link" href="#/teams"><span aria-hidden="true">←</span> All team members</a>
        <article class="panel member-profile-card">
          <div class="header">
            <span class="avatar large" data-person=${member.id}>${member.initials}</span>
            <div><p class="eyebrow">${member.team}</p><h1>${member.name}</h1><span>${member.role}</span></div>
          </div>
          <p class="bio">${member.bio}</p>
          <dl class="member-details">
            <div><dt>Email</dt><dd><a href="mailto:${member.email}">${member.email}</a></dd></div>
            <div><dt>Country</dt><dd>${member.country}</dd></div>
            <div><dt>Team</dt><dd>${member.team}</dd></div>
          </dl>
        </article>
      </div>
    `
  }

  private renderProjectCards(items: readonly Project[]): TemplateResult {
    return html`
      <div class="project-grid">
        ${repeat(items, project => project.id, project => html`
          <article class="project-card">
            <div class="top"><span class="accent" data-project=${project.id}></span><span class="status" data-status=${project.status}>${project.status}</span></div>
            <h3>${project.name}</h3><p>${project.description}</p>
            <div class="progress-label"><span>Progress</span><strong>${project.progress}%</strong></div>
            <div class="progress-track"><span class="bar" data-project=${project.id}></span></div>
            <div class="footer"><span class="members">${project.members}</span><span>${project.due}</span></div>
          </article>
        `)}
      </div>
    `
  }

  private renderActivityList(items: readonly Activity[]): TemplateResult {
    return html`
      <ol class="activity-list">
        ${repeat(items, activity => activity.id, activity => html`
          <li class="activity-item">
            <span class="avatar" data-person=${activity.personId}>${activity.initials}</span>
            <div class="copy">
              <p><a class="person" href="#/teams/${activity.personId}">${activity.person}</a> <span>${activity.action}</span> <b>${activity.target}</b></p>
              <time>${activity.time}</time>
            </div>
          </li>
        `)}
      </ol>
    `
  }

  private renderContributor(
    id: string,
    name: string,
    count: string,
  ): TemplateResult {
    const initials = name.split(' ').map(part => part[0]).join('')
    return html`
      <div><span class="avatar" data-person=${id}>${initials}</span><a href="#/teams/${id}">${name}</a><em>${count}</em></div>
    `
  }

  private renderFormHeading(
    icon: TemplateResult,
    title: string,
    copy: string,
    kind?: 'create-team',
  ): TemplateResult {
    return html`
      <div class="heading">
        <span class="icon" data-form-kind=${kind ?? nothing} aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></span>
        <div><h2>${title}</h2><p>${copy}</p></div>
      </div>
    `
  }
}

customElements.define('luminate-app', LuminateApp)
