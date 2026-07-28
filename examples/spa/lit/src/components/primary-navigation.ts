import {html, nothing, type TemplateResult} from 'lit'
import {projects, type Route} from '../../../data'

export interface PrimaryNavigationOptions {
  route: Route
  onNavigate: (route: Route) => void
}

export function renderPrimaryNavigation({
  route,
  onNavigate,
}: PrimaryNavigationOptions): TemplateResult {
  const current = (candidate: Route) => {
    return route === candidate ? 'page' : nothing
  }

  return html`
    <nav id="navigation" aria-label="Primary navigation">
      <div class="body">
        <p class="eyebrow">Workspace</p>
        <a class="link" href="#/overview" aria-current=${current('overview')} @click=${() => onNavigate('overview')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><rect x="14" y="14" width="6" height="6" rx="1"></rect></svg>
          <span>Overview</span>
        </a>
        <a class="link" href="#/projects" aria-current=${current('projects')} @click=${() => onNavigate('projects')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h6l2-2h8v14H4v-12Z"></path></svg>
          <span>Projects</span><span class="count">${projects.length}</span>
        </a>
        <a class="link" href="#/records" aria-current=${current('records')} @click=${() => onNavigate('records')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M5 12h14M5 19h14"></path></svg>
          <span>Records</span>
        </a>
        <a class="link" href="#/activity" aria-current=${current('activity')} @click=${() => onNavigate('activity')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h3l2-6 4 12 2-6h5"></path></svg>
          <span>Activity</span>
        </a>
        <p class="eyebrow manage">Manage</p>
        <a class="link" href="#/teams" aria-current=${current('teams')} @click=${() => onNavigate('teams')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"></circle><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M16 8h5M18.5 5.5v5"></path></svg>
          <span>Teams</span>
        </a>
      </div>
    </nav>
  `
}
