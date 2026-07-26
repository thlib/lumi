<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import ActivityList from './components/ActivityList.vue'
import ProjectCards from './components/ProjectCards.vue'
import {
  activities,
  documentTitle,
  memberFromHash,
  members,
  metrics,
  normalizeHash,
  projects,
  routeFromHash,
  type ProjectFilter,
  type Toast,
} from '../../data'
import {
  filterLargeRecords,
  orderLargeRecords,
  recordFilters,
  type RecordFilter,
  type RecordSortDirection,
} from '../../large-data'

normalizeHash()

const route = ref(routeFromHash(location.hash))
const memberId = ref(memberFromHash(location.hash))
const navOpen = ref(false)
const filter = ref<ProjectFilter>('all')
const recordFilter = ref<RecordFilter>('all')
const recordSort = ref<RecordSortDirection>('ascending')
const toasts = ref<Toast[]>([])
const emailError = ref('')
let nextToastId = 1
const toastTimers = new Map<string, number>()

const selectedMember = computed(() => members.find(member => member.id === memberId.value))
const visibleProjects = computed(() => projects.filter(project => {
  return filter.value === 'all' || project.status.toLowerCase() === filter.value
}))
const visibleRecords = computed(() => orderLargeRecords(
  filterLargeRecords(recordFilter.value),
  recordSort.value,
))

function handleHashChange() {
  route.value = routeFromHash(location.hash)
  memberId.value = memberFromHash(location.hash)
  navOpen.value = false
  toasts.value = []
  document.querySelector<HTMLElement>('main')?.focus({preventScroll: true})
}

function closeIfCurrent(name: typeof route.value) {
  if (route.value === name) navOpen.value = false
}

function showToast() {
  const toast = {id: `toast-${nextToastId++}`, message: 'No server for demo'}
  toasts.value.push(toast)
  toastTimers.set(toast.id, window.setTimeout(() => dismissToast(toast.id), 3200))
}

function dismissToast(id: string) {
  clearTimeout(toastTimers.get(id))
  toastTimers.delete(id)
  toasts.value = toasts.value.filter(toast => toast.id !== id)
}

function validateEmail(input: HTMLInputElement) {
  return input.validity.valueMissing
    ? 'Enter an email address.'
    : input.validity.typeMismatch
      ? 'Enter a valid email address.'
      : ''
}

function submitInvite(e: Event) {
  const form = e.currentTarget as HTMLFormElement
  const input = form.elements.namedItem('email') as HTMLInputElement
  input.value = input.value.trim()
  emailError.value = validateEmail(input)
  if (emailError.value) {
    input.focus()
    return
  }
  showToast()
}

function updateEmailError(e: Event) {
  if (emailError.value) emailError.value = validateEmail(e.currentTarget as HTMLInputElement)
}

watch([route, memberId], () => {
  document.title = documentTitle(route.value, memberId.value)
}, {immediate: true})

onMounted(() => addEventListener('hashchange', handleHashChange))
onBeforeUnmount(() => {
  removeEventListener('hashchange', handleHashChange)
  toastTimers.forEach(timer => clearTimeout(timer))
})
</script>

<template>
  <div id="shell" :class="{'nav-open': navOpen}">
    <div id="header">
      <header id="topbar">
        <div class="start">
          <button id="menu" class="icon-button" type="button" aria-label="Open navigation" aria-controls="navigation" :aria-expanded="navOpen" @click="navOpen = !navOpen">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <a class="brand" href="#/overview" aria-label="Luminate overview">
            <svg class="mark" viewBox="0 0 36 36" aria-hidden="true"><path d="M18 3l3.6 11.4L33 18l-11.4 3.6L18 33l-3.6-11.4L3 18l11.4-3.6L18 3Z" /><circle cx="18" cy="18" r="3.8" /></svg>
            <span>luminate</span>
          </a>
          <span class="divider" aria-hidden="true" />
          <div class="workspace-switcher"><span class="avatar">N</span><span class="name">Luminate</span></div>
        </div>
        <div class="end"><a class="user-menu" href="#/teams/freddy-fraggin"><span class="avatar">FF</span><span class="name">Freddy Fraggin</span></a></div>
      </header>
    </div>

    <aside id="sidebar">
      <nav id="navigation" aria-label="Primary navigation">
        <div class="body">
          <p class="eyebrow">Workspace</p>
          <a class="link" href="#/overview" :aria-current="route === 'overview' ? 'page' : undefined" @click="closeIfCurrent('overview')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>
            <span>Overview</span>
          </a>
          <a class="link" href="#/projects" :aria-current="route === 'projects' ? 'page' : undefined" @click="closeIfCurrent('projects')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h6l2-2h8v14H4v-12Z" /></svg>
            <span>Projects</span><span class="count">{{ projects.length }}</span>
          </a>
          <a class="link" href="#/records" :aria-current="route === 'records' ? 'page' : undefined" @click="closeIfCurrent('records')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M5 12h14M5 19h14" /></svg><span>Records</span>
          </a>
          <a class="link" href="#/activity" :aria-current="route === 'activity' ? 'page' : undefined" @click="closeIfCurrent('activity')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h3l2-6 4 12 2-6h5" /></svg><span>Activity</span>
          </a>
          <p class="eyebrow manage">Manage</p>
          <a class="link" href="#/teams" :aria-current="route === 'teams' ? 'page' : undefined" @click="closeIfCurrent('teams')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M16 8h5M18.5 5.5v5" /></svg><span>Teams</span>
          </a>
        </div>
      </nav>
    </aside>

    <button id="backdrop" type="button" aria-label="Close navigation" @click="navOpen = false" />

    <main tabindex="-1">
      <section v-if="route === 'overview'" id="overview" aria-labelledby="overview-title">
        <div class="heading">
          <div><p class="eyebrow">Friday, July 24</p><h1 id="overview-title">Good morning, Freddy</h1><p>Here's what's happening across your workspace today.</p></div>
          <a class="primary-button" href="#/projects"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h6l2-2h8v14H4v-12Z" /></svg>View projects</a>
        </div>
        <div class="metric-grid">
          <article v-for="metric in metrics" :key="metric.id" :class="['metric-card', {'positive': metric.direction === 'positive'}]">
            <div class="top"><span>{{ metric.label }}</span></div><strong>{{ metric.value }}</strong><span class="change">{{ metric.change }}</span>
          </article>
        </div>
        <section class="focus">
          <div class="heading"><div><h2>In focus</h2><p>Your team's most active projects.</p></div><a class="text-link" href="#/projects">View all <span aria-hidden="true">→</span></a></div>
          <ProjectCards :items="projects.slice(0, 3)" />
        </section>
        <div class="overview-lower">
          <section class="panel activity-panel" aria-labelledby="recent-activity-title">
            <div class="heading"><div><h2 id="recent-activity-title">Recent activity</h2><p>The latest updates from your team.</p></div><a class="text-link" href="#/activity">See all</a></div>
            <ActivityList :items="activities.slice(0, 3)" />
          </section>
          <aside class="panel week-card" aria-labelledby="week-title">
            <div class="top"><p class="eyebrow">This week</p><h2 id="week-title">Strong momentum</h2><p>Your team completed 28% more work than last week.</p></div>
            <div class="week-chart" aria-label="Weekly activity chart">
              <span style="height:42%"><i>Mon</i></span><span style="height:67%"><i>Tue</i></span><span style="height:55%"><i>Wed</i></span><span style="height:88%"><i>Thu</i></span><span class="today" style="height:76%"><i>Fri</i></span><span style="height:24%"><i>Sat</i></span><span style="height:18%"><i>Sun</i></span>
            </div>
          </aside>
        </div>
      </section>

      <section v-else-if="route === 'projects'" id="projects" aria-labelledby="projects-title">
        <div class="heading"><div><p class="eyebrow">Workspace</p><h1 id="projects-title">Projects</h1><p>Plan work, track progress, and keep the team aligned.</p></div></div>
        <div class="project-toolbar">
          <div class="filters" aria-label="Filter projects">
            <button v-for="value in (['all', 'active', 'planning'] as const)" :key="value" type="button" :aria-pressed="filter === value" @click="filter = value">{{ value[0].toUpperCase() + value.slice(1) }}</button>
          </div>
          <p>{{ visibleProjects.length }} {{ visibleProjects.length === 1 ? 'project' : 'projects' }} shown</p>
        </div>
        <ProjectCards :items="visibleProjects" />
      </section>

      <section v-else-if="route === 'records'" id="records" aria-labelledby="records-title">
        <div class="heading"><div><p class="eyebrow">Performance dataset</p><h1 id="records-title">Records</h1><p>Filter and sort a deterministic 20,000-row dataset without virtualization.</p></div></div>
        <div class="record-toolbar">
          <div class="filters" aria-label="Filter records">
            <button v-for="value in recordFilters" :key="value" type="button" :data-record-filter="value" :aria-pressed="recordFilter === value" @click="recordFilter = value">{{ value[0].toUpperCase() + value.slice(1) }}</button>
          </div>
          <p class="record-summary">{{ visibleRecords.length.toLocaleString('en-US') }} records shown</p>
        </div>
        <div class="record-list-wrap panel">
          <div class="record-list-header" :aria-sort="recordSort">
            <button type="button" data-record-sort @click="recordSort = recordSort === 'ascending' ? 'descending' : 'ascending'">
              Record <span class="record-sort-indicator" aria-hidden="true">{{ recordSort === 'ascending' ? '↑' : '↓' }}</span>
            </button>
          </div>
          <ol class="record-list">
            <li v-for="record in visibleRecords" :key="record.id" class="record-row">{{ record.label }}</li>
          </ol>
        </div>
      </section>

      <section v-else-if="route === 'activity'" id="activity" aria-labelledby="activity-title">
        <div class="heading"><div><p class="eyebrow">Workspace</p><h1 id="activity-title">Team activity</h1><p>A shared record of progress across every project.</p></div><span class="count">{{ activities.length }} updates</span></div>
        <div class="activity-layout">
          <section class="panel activity-panel" aria-label="All activity"><div class="activity-date"><span>Today</span><span class="line" /></div><ActivityList :items="activities" /></section>
          <aside class="activity-summary">
            <section class="panel summary-card"><p class="eyebrow">Last 7 days</p><strong>42</strong><span>team updates</span><div class="mini-bars" aria-hidden="true"><i style="height:30%" /><i style="height:55%" /><i style="height:42%" /><i style="height:75%" /><i style="height:100%" /><i style="height:62%" /><i style="height:80%" /></div></section>
            <section class="panel contributor-card"><p class="eyebrow">Top contributors</p><div><span class="avatar purple">NB</span><a href="#/teams/norm-barlug">Norm Barlug</a><em>14</em></div><div><span class="avatar green">EN</span><a href="#/teams/emmy-nother">Emmy Nother</a><em>11</em></div><div><span class="avatar orange">FK</span><a href="#/teams/fazlo-kan">Fazlo Kan</a><em>9</em></div></section>
          </aside>
        </div>
      </section>

      <section v-else id="teams">
        <div v-if="!selectedMember">
          <div class="heading"><div><p class="eyebrow">Manage</p><h1 id="teams-title">Manage teams</h1><p>Invite people and organize how your workspace collaborates.</p></div><span class="count">{{ members.length }} members</span></div>
          <section class="panel member-directory" aria-labelledby="member-list-title">
            <div class="heading"><div><h2 id="member-list-title">All team members</h2><p>Everyone with access to the Luminate workspace.</p></div><span>Team</span><span>Role</span></div>
            <div class="member-list">
              <article v-for="member in members" :key="member.id" class="member-row"><span class="avatar" :style="{backgroundColor: member.tone}">{{ member.initials }}</span><div class="identity"><a :href="`#/teams/${member.id}`">{{ member.name }}</a><span>{{ member.email }}</span></div><span class="team">{{ member.team }}</span><span class="role">{{ member.role }}</span></article>
            </div>
          </section>
          <section class="team-actions">
            <div class="heading"><div><h2>Team actions</h2><p>Invitations and new teams require a connected server.</p></div></div>
            <div class="forms">
              <form class="panel team-form" novalidate @submit.prevent="submitInvite">
                <div class="heading"><span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M17.5 8v6M14.5 11h6" /></svg></span><div><h2>Invite a teammate</h2><p>Send an invitation to join Luminate.</p></div></div>
                <label class="field"><span>Email address</span><input type="email" name="email" placeholder="name@company.com" aria-describedby="invite-email-error" :aria-invalid="emailError ? 'true' : undefined" required @input="updateEmailError"><small id="invite-email-error" class="error" aria-live="polite" :hidden="!emailError">{{ emailError }}</small></label>
                <label class="field"><span>Role</span><select name="role"><option>Member</option><option>Admin</option><option>Viewer</option></select></label>
                <button class="primary-button" type="submit">Send invitation</button>
              </form>
              <form class="panel team-form" novalidate @submit.prevent="showToast">
                <div class="heading"><span class="icon orange" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M14 14c3.8-.7 6.2 1 6.8 5" /></svg></span><div><h2>Create a team</h2><p>Group teammates around a shared area of work.</p></div></div>
                <label class="field"><span>Team name</span><input type="text" name="teamName" placeholder="e.g. Product design" required></label>
                <label class="field"><span>Description <em>Optional</em></span><textarea name="description" rows="3" placeholder="What does this team work on?" /></label>
                <button class="primary-button" type="submit">Create team</button>
              </form>
            </div>
          </section>
        </div>

        <div v-else id="profile">
          <a class="back-link" href="#/teams"><span aria-hidden="true">←</span> All team members</a>
          <article class="panel member-profile-card">
            <div class="header"><span class="avatar large" :style="{backgroundColor: selectedMember.tone}">{{ selectedMember.initials }}</span><div><p class="eyebrow">{{ selectedMember.team }}</p><h1>{{ selectedMember.name }}</h1><span>{{ selectedMember.role }}</span></div></div>
            <p class="bio">{{ selectedMember.bio }}</p>
            <dl class="member-details"><div><dt>Email</dt><dd><a :href="`mailto:${selectedMember.email}`">{{ selectedMember.email }}</a></dd></div><div><dt>Country</dt><dd>{{ selectedMember.country }}</dd></div><div><dt>Team</dt><dd>{{ selectedMember.team }}</dd></div></dl>
          </article>
        </div>

        <div id="toasts" aria-live="polite" aria-label="Notifications">
          <div v-for="toast in toasts" :key="toast.id" class="toast"><span class="icon" aria-hidden="true">!</span><span class="message">{{ toast.message }}</span><button type="button" aria-label="Dismiss notification" @click="dismissToast(toast.id)">×</button></div>
        </div>
      </section>
    </main>
  </div>
</template>
