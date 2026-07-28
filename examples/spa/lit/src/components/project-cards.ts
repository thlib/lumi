import {html, type TemplateResult} from 'lit'
import {repeat} from 'lit/directives/repeat.js'
import type {Project} from '../../../data'

export function renderProjectCards(
  projects: readonly Project[],
): TemplateResult {
  return html`
    <div class="project-grid">
      ${repeat(projects, project => project.id, project => html`
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
