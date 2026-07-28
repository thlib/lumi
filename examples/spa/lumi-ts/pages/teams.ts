import {
  attr,
  on,
  prop,
  repeat,
  text,
  update,
} from '../app.js'

import type {Member, Toast} from '../../data.js'
import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {TeamsData} from '../view-data.js'

export default function teams(): DefinitionOptions<PageData, TeamsData> {
  let nextToastID = 1
  const toastTimers = new Map<string, number>()

  return {
    template: document.querySelector('#teams-view'),
    present: data => {
      const selectedMember = data.members.find(
        member => member.id === data.selectedMemberId,
      )
      const profileMember = selectedMember ?? data.members[0]

      if (profileMember === undefined) {
        throw new Error('The teams view requires at least one member')
      }

      return {
        toasts: data.toasts,
        memberCount: `${data.members.length} members`,
        members: data.members,
        hasSelectedMember: selectedMember !== undefined,
        selectedMember: profileMember,
      }
    },
    bindings: [
      text<TeamsData, TeamsData>('#directory > .heading .count', ({data}) => data.memberCount),
      repeat<Member, TeamsData>('.member-row', ({data}) => data.members, [
        text<Member>('.avatar', ({item}) => item.initials),
        text<Member>('.name', ({item}) => item.name),
        text<Member>('.email', ({item}) => item.email),
        text<Member>('.team', ({item}) => item.team),
        text<Member>('.role', ({item}) => item.role),
        attr<Member>('.name', 'href', ({item}) => `#/teams/${item.id}`),
        attr<Member>('.avatar', 'data-person', ({item}) => item.id),
      ]),
      text<TeamsData, TeamsData>('#profile .avatar', ({data}) => data.selectedMember.initials),
      text<TeamsData, TeamsData>('#profile .name', ({data}) => data.selectedMember.name),
      text<TeamsData, TeamsData>('#profile .role', ({data}) => data.selectedMember.role),
      text<TeamsData, TeamsData>('#profile .team', ({data}) => data.selectedMember.team),
      text<TeamsData, TeamsData>('#profile .country', ({data}) => data.selectedMember.country),
      text<TeamsData, TeamsData>('#profile .email', ({data}) => data.selectedMember.email),
      text<TeamsData, TeamsData>('#profile .bio', ({data}) => data.selectedMember.bio),
      repeat<Toast, TeamsData>('.toast', ({data}) => data.toasts, [
        text<Toast>('.message', ({item}) => item.message),
        attr<Toast>(':scope', 'data-toast-id', ({item}) => item.id),
      ]),
      on<string, 'submit', TeamsData>('.team-form', 'submit', (e, el) => {
        if (e.defaultPrevented) {
          return
        }

        e.preventDefault()

        const toast: Toast = {
          id: `toast-${nextToastID++}`,
          message: 'No server for demo',
        }

        update(data => ({...data, toasts: [...data.toasts, toast]}))

        const timer = window.setTimeout(() => {
          toastTimers.delete(toast.id)
          update(data => ({
            ...data,
            toasts: data.toasts.filter(item => item.id !== toast.id),
          }))
        }, 3200)
        toastTimers.set(toast.id, timer)
      }),
      on<string, 'click', TeamsData>('.toast', 'click', (_, el) => {
        const id = el.getAttribute('data-toast-id')

        if (id === null) {
          return
        }

        window.clearTimeout(toastTimers.get(id))
        toastTimers.delete(id)
        update(data => ({
          ...data,
          toasts: data.toasts.filter(item => item.id !== id),
        }))
      }),
      prop<TeamsData, TeamsData, boolean>(
        '#directory',
        ({data}) => data.hasSelectedMember,
        'hidden',
      ),
      prop<TeamsData, TeamsData, boolean>(
        '#profile',
        ({data}) => !data.hasSelectedMember,
        'hidden',
      ),
      attr<TeamsData, TeamsData>(
        '#profile .email',
        'href',
        ({data}) => `mailto:${data.selectedMember.email}`,
      ),
      attr<TeamsData, TeamsData>(
        '#profile .avatar',
        'data-person',
        ({data}) => data.selectedMember.id,
      ),
    ],
  }

}
