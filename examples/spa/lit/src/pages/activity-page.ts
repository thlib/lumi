import {html, type TemplateResult} from 'lit'
import {activities} from '../../../data'
import {renderActivityList} from '../components/activity-list'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function renderActivityPage(): TemplateResult {
  return html`
    <section id="activity" aria-labelledby="activity-title">
      <div class="heading">
        <div><p class="eyebrow">Workspace</p><h1 id="activity-title">Team activity</h1><p>A shared record of progress across every project.</p></div>
        <span class="count">${activities.length} updates</span>
      </div>
      <div class="activity-layout">
        <section class="panel activity-panel" aria-label="All activity">
          <div class="activity-date"><span>Today</span><span class="line"></span></div>
          ${renderActivityList(activities)}
        </section>
        <aside class="activity-summary">
          <section class="panel summary-card">
            <p class="eyebrow">Last 7 days</p><strong>42</strong><span>team updates</span>
            <div class="mini-bars" aria-hidden="true">${weekdays.map(() => html`<i></i>`)}</div>
          </section>
          <section class="panel contributor-card">
            <p class="eyebrow">Top contributors</p>
            ${renderContributor('norm-barlug', 'Norm Barlug', '14')}
            ${renderContributor('emmy-nother', 'Emmy Nother', '11')}
            ${renderContributor('fazlo-kan', 'Fazlo Kan', '9')}
          </section>
        </aside>
      </div>
    </section>
  `
}

function renderContributor(
  id: string,
  name: string,
  count: string,
): TemplateResult {
  const initials = name.split(' ').map(part => part[0]).join('')
  return html`
    <div><span class="avatar" data-person=${id}>${initials}</span><a href="#/teams/${id}">${name}</a><em>${count}</em></div>
  `
}
