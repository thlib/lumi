import {html, nothing, type TemplateResult} from 'lit'
import {repeat} from 'lit/directives/repeat.js'
import {members, type Member, type Toast} from '../../../data'
import {renderToastList} from '../components/toast-list'

export interface TeamsPageOptions {
  memberId: string | null
  toasts: readonly Toast[]
  emailError: string
  onDismissToast: (id: string) => void
  onInviteSubmit: (event: SubmitEvent) => void
  onDemoSubmit: (event: SubmitEvent) => void
  onEmailInput: (event: Event) => void
}

export function renderTeamsPage(options: TeamsPageOptions): TemplateResult {
  const selectedMember = members.find(member => member.id === options.memberId)

  return html`
    <section id="teams">
      ${selectedMember
        ? renderMemberProfile(selectedMember)
        : renderDirectory(options)}
      ${renderToastList(options.toasts, options.onDismissToast)}
    </section>
  `
}

function renderDirectory({
  emailError,
  onInviteSubmit,
  onDemoSubmit,
  onEmailInput,
}: TeamsPageOptions): TemplateResult {
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
          <form class="panel team-form" novalidate @submit=${onInviteSubmit}>
            ${renderFormHeading(
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
                aria-invalid=${emailError ? 'true' : nothing}
                required
                @input=${onEmailInput}
              >
              <small id="invite-email-error" class="error" aria-live="polite" ?hidden=${!emailError}>${emailError}</small>
            </label>
            <label class="field"><span>Role</span><select name="role"><option>Member</option><option>Admin</option><option>Viewer</option></select></label>
            <button class="primary-button" type="submit">Send invitation</button>
          </form>
          <form class="panel team-form" novalidate @submit=${onDemoSubmit}>
            ${renderFormHeading(
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

function renderMemberProfile(member: Member): TemplateResult {
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

function renderFormHeading(
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
