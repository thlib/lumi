import {html, type TemplateResult} from 'lit'
import {projects, type ProjectFilter} from '../../../data'
import {renderProjectCards} from '../components/project-cards'

const projectFilters: readonly ProjectFilter[] = ['all', 'active', 'planning']

export interface ProjectsPageOptions {
  filter: ProjectFilter
  onFilterChange: (filter: ProjectFilter) => void
}

export function renderProjectsPage({
  filter: selectedFilter,
  onFilterChange,
}: ProjectsPageOptions): TemplateResult {
  const visibleProjects = projects.filter(project => {
    return selectedFilter === 'all'
      || project.status.toLowerCase() === selectedFilter
  })

  return html`
    <section id="projects" aria-labelledby="projects-title">
      <div class="heading"><div><p class="eyebrow">Workspace</p><h1 id="projects-title">Projects</h1><p>Plan work, track progress, and keep the team aligned.</p></div></div>
      <div class="project-toolbar">
        <div class="filters" aria-label="Filter projects">
          ${projectFilters.map(filter => html`
            <button
              type="button"
              aria-pressed=${selectedFilter === filter}
              @click=${() => onFilterChange(filter)}
            >${filter[0].toUpperCase() + filter.slice(1)}</button>
          `)}
        </div>
        <p>${visibleProjects.length} ${visibleProjects.length === 1 ? 'project' : 'projects'} shown</p>
      </div>
      ${renderProjectCards(visibleProjects)}
    </section>
  `
}
