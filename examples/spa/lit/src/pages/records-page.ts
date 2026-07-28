import {html, type TemplateResult} from 'lit'
import {repeat} from 'lit/directives/repeat.js'
import {
  filterLargeRecords,
  orderLargeRecords,
  recordFilters,
  type RecordFilter,
  type RecordSortDirection,
} from '../../../data-20k'

export interface RecordsPageOptions {
  filter: RecordFilter
  sortDirection: RecordSortDirection
  onFilterChange: (filter: RecordFilter) => void
  onSortChange: (direction: RecordSortDirection) => void
}

export function renderRecordsPage({
  filter: selectedFilter,
  sortDirection,
  onFilterChange,
  onSortChange,
}: RecordsPageOptions): TemplateResult {
  const visibleRecords = orderLargeRecords(
    filterLargeRecords(selectedFilter),
    sortDirection,
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
              aria-pressed=${selectedFilter === filter}
              @click=${() => onFilterChange(filter)}
            >${filter[0].toUpperCase() + filter.slice(1)}</button>
          `)}
        </div>
        <p class="record-summary">${visibleRecords.length.toLocaleString('en-US')} records shown</p>
      </div>
      <div class="record-list-wrap panel">
        <div class="record-list-header" aria-sort=${sortDirection}>
          <button
            type="button"
            data-record-sort
            @click=${() => onSortChange(
              sortDirection === 'ascending' ? 'descending' : 'ascending',
            )}
          >
            Record <span class="record-sort-indicator" aria-hidden="true">${sortDirection === 'ascending' ? '↑' : '↓'}</span>
          </button>
        </div>
        <ol class="record-list">
          ${repeat(visibleRecords, record => record.id, record => html`
            <li class="record-row">${record.label}</li>
          `)}
        </ol>
      </div>
    </section>
  `
}
