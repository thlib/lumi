import {html, nothing, type TemplateResult} from 'lit'
import {repeat} from 'lit/directives/repeat.js'
import {
  activities,
  metrics,
  overviewDetails,
  projects,
} from '../../../data'
import {renderActivityList} from '../components/activity-list'
import {renderProjectCards} from '../components/project-cards'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function renderOverviewPage(now: Date): TemplateResult {
  const overview = overviewDetails(now)

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
        ${renderProjectCards(projects.slice(0, 3))}
      </section>
      <div class="overview-lower">
        <section class="panel activity-panel" aria-labelledby="recent-activity-title">
          <div class="heading">
            <div><h2 id="recent-activity-title">Recent activity</h2><p>The latest updates from your team.</p></div>
            <a class="text-link" href="#/activity">See all</a>
          </div>
          ${renderActivityList(activities.slice(0, 3))}
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
