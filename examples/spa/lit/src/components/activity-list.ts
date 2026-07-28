import {html, type TemplateResult} from 'lit'
import {repeat} from 'lit/directives/repeat.js'
import type {Activity} from '../../../data'

export function renderActivityList(
  activities: readonly Activity[],
): TemplateResult {
  return html`
    <ol class="activity-list">
      ${repeat(activities, activity => activity.id, activity => html`
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
