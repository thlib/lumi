import {
  attr,
  on,
  prop,
  repeat,
  text,
  update,
} from '../app.js'

import type {Member, Toast} from '../../../data.js'
import type {DefinitionOptions} from '../components.js'
import type {PageData} from '../page.js'
import type {TeamsData} from '../view-data.js'

export default function teams(): DefinitionOptions<PageData, TeamsData> {
  let nextToastID = 1
  const toastTimers = new Map<string, number>()

  return {
    source: document.querySelector('#teams-view'),
    present: data => {
      const selectedMember = data.members.find(
        member => member.id === data.selectedMemberId,
      )

      return {
        toasts: data.toasts,
        memberCount: `${data.members.length} members`,
        members: data.members,
        // The profile is in the DOM only when a member is selected.
        profile: selectedMember === undefined ? [] : [selectedMember],
      }
    },
    bindings: [
      text('#directory > .heading .count', ({data}) => data.memberCount),
      repeat<Member, TeamsData>('.member-row', ({data}) => data.members, [
        text('.avatar', ({item}) => item.initials),
        text('.name', ({item}) => item.name),
        text('.email', ({item}) => item.email),
        text('.team', ({item}) => item.team),
        text('.role', ({item}) => item.role),
        attr('.name', 'href', ({item}) => `#/teams/${item.id}`),
        attr('.avatar', 'data-person', ({item}) => item.id),
      ]),
      repeat<Member, TeamsData>('#profile', ({data}) => data.profile, [
        text('.avatar', ({item}) => item.initials),
        text('.name', ({item}) => item.name),
        text('.role', ({item}) => item.role),
        text('.team', ({item}) => item.team),
        text('.country', ({item}) => item.country),
        text('.email', ({item}) => item.email),
        text('.bio', ({item}) => item.bio),
        attr('.email', 'href', ({item}) => `mailto:${item.email}`),
        attr('.avatar', 'data-person', ({item}) => item.id),
      ]),
      repeat<Toast, TeamsData>('.toast', ({data}) => data.toasts, [
        text('.message', ({item}) => item.message),
        attr(':scope', 'data-toast-id', ({item}) => item.id),
      ]),
      on('.team-form', 'submit', (e, el) => {
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
      on('.toast', 'click', (_, el) => {
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
      // The directory stays in the DOM, so its forms keep their state.
      prop('#directory', 'hidden', ({data}) => data.profile.length > 0),
    ],
  }

}
