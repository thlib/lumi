import {
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  activities,
  documentTitle,
  memberFromHash,
  members,
  metrics,
  normalizeHash,
  projects,
  routeFromHash,
  type Activity,
  type Project,
  type ProjectFilter,
  type Route,
  type Toast,
} from '../../data'

function App() {
  normalizeHash()
  const [route, setRoute] = useState<Route>(() => routeFromHash(location.hash))
  const [memberId, setMemberId] = useState<string | null>(() => memberFromHash(location.hash))
  const [navOpen, setNavOpen] = useState(false)
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(routeFromHash(location.hash))
      setMemberId(memberFromHash(location.hash))
      setNavOpen(false)
      setToasts([])
      document.querySelector<HTMLElement>('main')?.focus({preventScroll: true})
    }
    addEventListener('hashchange', handleHashChange)
    return () => removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    document.title = documentTitle(route, memberId)
  }, [route, memberId])

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <div className="topbar-slot">
        <Header navOpen={navOpen} toggleNav={() => setNavOpen(open => !open)} />
      </div>
      <aside className="sidebar">
        <Navigation
          route={route}
          closeNav={() => setNavOpen(false)}
        />
      </aside>
      <button
        className="nav-backdrop"
        type="button"
        onClick={() => setNavOpen(false)}
        aria-label="Close navigation"
      />
      <main className="main-content" id="main-content" tabIndex={-1}>
        {route === 'overview' && <Overview />}
        {route === 'projects' && <Projects filter={filter} setFilter={setFilter} />}
        {route === 'activity' && <ActivityPage />}
        {route === 'teams' && (
          <Teams
            memberId={memberId}
            toasts={toasts}
            setToasts={setToasts}
          />
        )}
      </main>
    </div>
  )
}

function Header({navOpen, toggleNav}: {navOpen: boolean; toggleNav: () => void}) {
  return (
    <header className="topbar">
      <div className="topbar__start">
        <button
          className="icon-button menu-button"
          type="button"
          onClick={toggleNav}
          aria-label="Open navigation"
          aria-controls="primary-navigation"
          aria-expanded={navOpen}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <a className="brand" href="#/overview" aria-label="Luminate overview">
          <svg className="brand__mark" viewBox="0 0 36 36" aria-hidden="true">
            <path d="M18 3l3.6 11.4L33 18l-11.4 3.6L18 33l-3.6-11.4L3 18l11.4-3.6L18 3Z" />
            <circle cx="18" cy="18" r="3.8" />
          </svg>
          <span>luminate</span>
        </a>
        <span className="topbar__divider" aria-hidden="true" />
        <div className="workspace-switcher"><span className="workspace-avatar">N</span><span>Luminate</span></div>
      </div>
      <div className="topbar__end">
        <a className="user-menu" href="#/teams/freddy-fraggin">
          <span className="user-avatar">FF</span><span className="user-name">Freddy Fraggin</span>
        </a>
      </div>
    </header>
  )
}

function Navigation({route, closeNav}: {route: Route; closeNav: () => void}) {
  const current = (name: Route) => route === name ? 'page' : undefined
  const closeIfCurrent = (name: Route) => {
    if (route === name) closeNav()
  }
  return (
    <nav className="navigation" id="primary-navigation" aria-label="Primary navigation">
      <div className="navigation__body">
        <p className="navigation__eyebrow">Workspace</p>
        <a className="nav-link" href="#/overview" aria-current={current('overview')} onClick={() => closeIfCurrent('overview')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" />
            <rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" />
          </svg>
          <span>Overview</span>
        </a>
        <a className="nav-link" href="#/projects" aria-current={current('projects')} onClick={() => closeIfCurrent('projects')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h6l2-2h8v14H4v-12Z" /></svg>
          <span>Projects</span><span className="nav-link__count">{projects.length}</span>
        </a>
        <a className="nav-link" href="#/activity" aria-current={current('activity')} onClick={() => closeIfCurrent('activity')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h3l2-6 4 12 2-6h5" /></svg>
          <span>Activity</span>
        </a>
        <p className="navigation__eyebrow navigation__eyebrow--spaced">Manage</p>
        <a className="nav-link" href="#/teams" aria-current={current('teams')} onClick={() => closeIfCurrent('teams')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M16 8h5M18.5 5.5v5" /></svg>
          <span>Teams</span>
        </a>
      </div>
    </nav>
  )
}

function ProjectCards({items, overview = false}: {items: readonly Project[]; overview?: boolean}) {
  return (
    <div className={`project-grid${overview ? ' project-grid--overview' : ''}`}>
      {items.map(project => (
        <article className="project-card" key={project.id}>
          <div className="project-card__top">
            <span className="project-accent" style={{backgroundColor: project.accent}} />
            <span className={`status${project.status === 'Planning' ? ' status--planning' : ''}`}>{project.status}</span>
          </div>
          <h3>{project.name}</h3><p>{project.description}</p>
          <div className="progress-label"><span>Progress</span><strong>{project.progress}%</strong></div>
          <div className="progress-track"><span style={{width: `${project.progress}%`}} /></div>
          <div className="project-card__footer"><span className="member-stack">{project.members}</span><span>{project.due}</span></div>
        </article>
      ))}
    </div>
  )
}

function ActivityList({items, compact = false}: {items: readonly Activity[]; compact?: boolean}) {
  return (
    <ol className={`activity-list${compact ? ' activity-list--compact' : ''}`}>
      {items.map(activity => (
        <li className="activity-item" key={activity.id}>
          <span className="activity-avatar" style={{backgroundColor: activity.tone}}>{activity.initials}</span>
          <div className="activity-item__copy">
            <p>
              <a className="person-link" href={`#/teams/${activity.personId}`}>{activity.person}</a>{' '}
              <span>{activity.action}</span>{' '}<b>{activity.target}</b>
            </p>
            <time>{activity.time}</time>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Overview() {
  return (
    <section className="page" aria-labelledby="overview-title">
      <div className="page-heading">
        <div><p className="eyebrow">Friday, July 24</p><h1 id="overview-title">Good morning, Freddy</h1><p>Here's what's happening across your workspace today.</p></div>
        <a className="primary-button" href="#/projects"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h6l2-2h8v14H4v-12Z" /></svg>View projects</a>
      </div>
      <div className="metric-grid">
        {metrics.map(metric => (
          <article className={`metric-card${metric.direction === 'positive' ? ' metric-card--positive' : ''}`} key={metric.id}>
            <div className="metric-card__top"><span>{metric.label}</span></div>
            <strong>{metric.value}</strong><span className="metric-card__change">{metric.change}</span>
          </article>
        ))}
      </div>
      <div className="section-heading">
        <div><h2>In focus</h2><p>Your team's most active projects.</p></div>
        <a className="text-link" href="#/projects">View all <span aria-hidden="true">→</span></a>
      </div>
      <ProjectCards items={projects.slice(0, 3)} overview />
      <div className="overview-lower">
        <section className="panel activity-panel" aria-labelledby="recent-activity-title">
          <div className="panel__heading">
            <div><h2 id="recent-activity-title">Recent activity</h2><p>The latest updates from your team.</p></div>
            <a className="text-link" href="#/activity">See all</a>
          </div>
          <ActivityList items={activities.slice(0, 3)} compact />
        </section>
        <WeekCard />
      </div>
    </section>
  )
}

function WeekCard() {
  const days = [['Mon', 42], ['Tue', 67], ['Wed', 55], ['Thu', 88], ['Fri', 76], ['Sat', 24], ['Sun', 18]] as const
  return (
    <aside className="panel week-card" aria-labelledby="week-title">
      <div className="week-card__top"><p className="eyebrow">This week</p><h2 id="week-title">Strong momentum</h2><p>Your team completed 28% more work than last week.</p></div>
      <div className="week-chart" aria-label="Weekly activity chart">
        {days.map(([day, height]) => <span className={day === 'Fri' ? 'is-today' : undefined} style={{height: `${height}%`}} key={day}><i>{day}</i></span>)}
      </div>
    </aside>
  )
}

function Projects({filter, setFilter}: {filter: ProjectFilter; setFilter: (filter: ProjectFilter) => void}) {
  const visible = projects.filter(project => filter === 'all' || project.status.toLowerCase() === filter)
  return (
    <section className="page" aria-labelledby="projects-title">
      <div className="page-heading"><div><p className="eyebrow">Workspace</p><h1 id="projects-title">Projects</h1><p>Plan work, track progress, and keep the team aligned.</p></div></div>
      <div className="project-toolbar">
        <div className="filter-group" aria-label="Filter projects">
          {(['all', 'active', 'planning'] as const).map(value => (
            <button type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>{value[0].toUpperCase() + value.slice(1)}</button>
          ))}
        </div>
        <p>{visible.length} {visible.length === 1 ? 'project' : 'projects'} shown</p>
      </div>
      <ProjectCards items={visible} />
    </section>
  )
}

function ActivityPage() {
  return (
    <section className="page" aria-labelledby="activity-title">
      <div className="page-heading">
        <div><p className="eyebrow">Workspace</p><h1 id="activity-title">Team activity</h1><p>A shared record of progress across every project.</p></div>
        <span className="count-chip">{activities.length} updates</span>
      </div>
      <div className="activity-layout">
        <section className="panel activity-panel activity-panel--page" aria-label="All activity">
          <div className="activity-date"><span>Today</span><span className="activity-date__line" /></div>
          <ActivityList items={activities} />
        </section>
        <aside className="activity-summary">
          <section className="panel summary-card">
            <p className="eyebrow">Last 7 days</p><strong>42</strong><span>team updates</span>
            <div className="mini-bars" aria-hidden="true">{[30, 55, 42, 75, 100, 62, 80].map((height, index) => <i style={{height: `${height}%`}} key={index} />)}</div>
          </section>
          <section className="panel contributor-card">
            <p className="eyebrow">Top contributors</p>
            <Contributor tone="purple" id="norm-barlug" name="Norm Barlug" count="14" />
            <Contributor tone="green" id="emmy-nother" name="Emmy Nother" count="11" />
            <Contributor tone="orange" id="fazlo-kan" name="Fazlo Kan" count="9" />
          </section>
        </aside>
      </div>
    </section>
  )
}

function Contributor({tone, id, name, count}: {tone: string; id: string; name: string; count: string}) {
  const initials = name.split(' ').map(part => part[0]).join('')
  return <div><span className={`tiny-avatar tiny-avatar--${tone}`}>{initials}</span><a href={`#/teams/${id}`}>{name}</a><em>{count}</em></div>
}

function Teams({memberId, toasts, setToasts}: {
  memberId: string | null
  toasts: Toast[]
  setToasts: Dispatch<SetStateAction<Toast[]>>
}) {
  const selected = members.find(member => member.id === memberId)
  const [emailError, setEmailError] = useState('')
  const nextToastId = useRef(1)
  const timers = useRef(new Map<string, number>())

  useEffect(() => () => {
    timers.current.forEach(timer => clearTimeout(timer))
  }, [])

  const dismiss = (id: string) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts(items => items.filter(item => item.id !== id))
  }
  const showToast = () => {
    const toast = {id: `demo-toast-${nextToastId.current++}`, message: 'No server for demo'}
    setToasts(items => [...items, toast])
    timers.current.set(toast.id, window.setTimeout(() => dismiss(toast.id), 3200))
  }
  const submitInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const input = event.currentTarget.elements.namedItem('email') as HTMLInputElement
    input.value = input.value.trim()
    const message = input.validity.valueMissing
      ? 'Enter an email address.'
      : input.validity.typeMismatch
        ? 'Enter a valid email address.'
        : ''
    setEmailError(message)
    if (message) {
      input.focus()
      return
    }
    showToast()
  }

  return (
    <section className="page">
      {selected ? <MemberProfile member={selected} /> : (
        <div>
          <div className="page-heading">
            <div><p className="eyebrow">Manage</p><h1 id="teams-title">Manage teams</h1><p>Invite people and organize how your workspace collaborates.</p></div>
            <span className="count-chip">{members.length} members</span>
          </div>
          <section className="panel member-directory" aria-labelledby="member-list-title">
            <div className="member-directory__heading"><div><h2 id="member-list-title">All team members</h2><p>Everyone with access to the Luminate workspace.</p></div><span>Team</span><span>Role</span></div>
            <div className="member-list">
              {members.map(member => (
                <article className="member-row" key={member.id}>
                  <span className="member-avatar" style={{backgroundColor: member.tone}}>{member.initials}</span>
                  <div className="member-row__identity"><a href={`#/teams/${member.id}`}>{member.name}</a><span>{member.email}</span></div>
                  <span className="member-row__team">{member.team}</span><span className="member-row__role">{member.role}</span>
                </article>
              ))}
            </div>
          </section>
          <div className="section-heading team-actions-heading"><div><h2>Team actions</h2><p>Invitations and new teams require a connected server.</p></div></div>
          <div className="team-form-grid">
            <form className="panel team-form" onSubmit={submitInvite} noValidate>
              <FormHeading icon={<><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M17.5 8v6M14.5 11h6" /></>} title="Invite a teammate" copy="Send an invitation to join Luminate." />
              <label className="form-field"><span>Email address</span><input type="email" name="email" placeholder="name@company.com" aria-describedby="invite-email-error" aria-invalid={emailError ? true : undefined} onInput={event => emailError && setEmailError(event.currentTarget.validationMessage ? (event.currentTarget.validity.typeMismatch ? 'Enter a valid email address.' : 'Enter an email address.') : '')} required /><small className="form-field__error" id="invite-email-error" aria-live="polite" hidden={!emailError}>{emailError}</small></label>
              <label className="form-field"><span>Role</span><select name="role"><option>Member</option><option>Admin</option><option>Viewer</option></select></label>
              <button className="primary-button" type="submit">Send invitation</button>
            </form>
            <form className="panel team-form" onSubmit={event => {event.preventDefault(); showToast()}} noValidate>
              <FormHeading orange icon={<><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M14 14c3.8-.7 6.2 1 6.8 5" /></>} title="Create a team" copy="Group teammates around a shared area of work." />
              <label className="form-field"><span>Team name</span><input type="text" name="teamName" placeholder="e.g. Product design" required /></label>
              <label className="form-field"><span>Description <em>Optional</em></span><textarea name="description" rows={3} placeholder="What does this team work on?" /></label>
              <button className="primary-button" type="submit">Create team</button>
            </form>
          </div>
        </div>
      )}
      <div className="demo-toast-region" aria-live="polite" aria-label="Notifications">
        {toasts.map(toast => <div className="demo-toast" key={toast.id}><span className="demo-toast__icon" aria-hidden="true">!</span><span>{toast.message}</span><button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">×</button></div>)}
      </div>
    </section>
  )
}

function FormHeading({icon, title, copy, orange = false}: {icon: ReactNode; title: string; copy: string; orange?: boolean}) {
  return <div className="team-form__heading"><span className={`team-form__icon${orange ? ' team-form__icon--orange' : ''}`} aria-hidden="true"><svg viewBox="0 0 24 24">{icon}</svg></span><div><h2>{title}</h2><p>{copy}</p></div></div>
}

function MemberProfile({member}: {member: (typeof members)[number]}) {
  return (
    <div className="member-profile">
      <a className="back-link" href="#/teams"><span aria-hidden="true">←</span> All team members</a>
      <article className="panel member-profile-card">
        <div className="member-profile-card__header">
          <span className="member-avatar member-avatar--large" style={{backgroundColor: member.tone}}>{member.initials}</span>
          <div><p className="eyebrow">{member.team}</p><h1>{member.name}</h1><span>{member.role}</span></div>
        </div>
        <p className="member-profile-card__bio">{member.bio}</p>
        <dl className="member-details">
          <div><dt>Email</dt><dd><a href={`mailto:${member.email}`}>{member.email}</a></dd></div>
          <div><dt>Country</dt><dd>{member.country}</dd></div>
          <div><dt>Team</dt><dd>{member.team}</dd></div>
        </dl>
      </article>
    </div>
  )
}

export default App
