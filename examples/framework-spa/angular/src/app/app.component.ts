import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core'
import {NgTemplateOutlet} from '@angular/common'
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
  type Route,
  type Toast,
} from '../../../data'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly projects = projects
  readonly activities = activities
  readonly members = members
  readonly metrics = metrics
  readonly filters: readonly ProjectFilter[] = ['all', 'active', 'planning']
  readonly weeklyBars = [
    {day: 'Mon', height: 42},
    {day: 'Tue', height: 67},
    {day: 'Wed', height: 55},
    {day: 'Thu', height: 88},
    {day: 'Fri', height: 76},
    {day: 'Sat', height: 24},
    {day: 'Sun', height: 18},
  ] as const
  readonly miniBars = [30, 55, 42, 75, 100, 62, 80]

  readonly route = signal<Route>('overview')
  readonly memberId = signal<string | null>(null)
  readonly navOpen = signal(false)
  readonly filter = signal<ProjectFilter>('all')
  readonly toasts = signal<Toast[]>([])
  readonly emailError = signal('')

  readonly selectedMember = computed(() => {
    return this.members.find(member => member.id === this.memberId())
  })
  readonly visibleProjects = computed(() => {
    return this.projects.filter(project => {
      return this.filter() === 'all'
        || project.status.toLowerCase() === this.filter()
    })
  })

  private readonly destroyRef = inject(DestroyRef)
  private readonly toastTimers = new Map<string, number>()
  private nextToastId = 1

  constructor() {
    normalizeHash()
    this.readHash()

    const handleHashChange = () => {
      this.readHash()
      this.navOpen.set(false)
      this.toasts.set([])
      document.querySelector<HTMLElement>('main')?.focus({preventScroll: true})
    }

    addEventListener('hashchange', handleHashChange)
    this.destroyRef.onDestroy(() => {
      removeEventListener('hashchange', handleHashChange)
      this.toastTimers.forEach(timer => clearTimeout(timer))
    })

    effect(() => {
      document.title = documentTitle(this.route(), this.memberId())
    })
  }

  closeIfCurrent(route: Route): void {
    if (this.route() === route) this.navOpen.set(false)
  }

  setFilter(filter: ProjectFilter): void {
    this.filter.set(filter)
  }

  submitInvite(event: SubmitEvent): void {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const input = form.elements.namedItem('email') as HTMLInputElement
    input.value = input.value.trim()
    const message = this.validationMessage(input)
    this.emailError.set(message)

    if (message !== '') {
      input.focus()
      return
    }
    this.showToast()
  }

  submitDemo(event: SubmitEvent): void {
    event.preventDefault()
    this.showToast()
  }

  updateEmailError(event: Event): void {
    if (this.emailError() !== '') {
      this.emailError.set(this.validationMessage(event.currentTarget as HTMLInputElement))
    }
  }

  showToast(): void {
    const toast = {
      id: `demo-toast-${this.nextToastId++}`,
      message: 'No server for demo',
    }
    this.toasts.update(items => [...items, toast])
    this.toastTimers.set(
      toast.id,
      window.setTimeout(() => this.dismissToast(toast.id), 3200),
    )
  }

  dismissToast(id: string): void {
    clearTimeout(this.toastTimers.get(id))
    this.toastTimers.delete(id)
    this.toasts.update(items => items.filter(item => item.id !== id))
  }

  private readHash(): void {
    this.route.set(routeFromHash(location.hash))
    this.memberId.set(memberFromHash(location.hash))
  }

  private validationMessage(input: HTMLInputElement): string {
    if (input.validity.valueMissing) return 'Enter an email address.'
    if (input.validity.typeMismatch) return 'Enter a valid email address.'
    return ''
  }
}
