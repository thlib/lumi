import type {Toast} from '../../../data'

const toastDuration = 3200

export class ToastController {
  private nextId = 1
  private toasts: Toast[] = []
  private readonly timers = new Map<string, number>()

  constructor(
    private readonly onChange: (toasts: readonly Toast[]) => void,
  ) {}

  show(message = 'No server for demo'): void {
    const toast = {
      id: `toast-${this.nextId++}`,
      message,
    }
    this.toasts = [...this.toasts, toast]
    this.publish()
    this.timers.set(
      toast.id,
      window.setTimeout(() => this.dismiss(toast.id), toastDuration),
    )
  }

  dismiss(id: string): void {
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
    this.toasts = this.toasts.filter(toast => toast.id !== id)
    this.publish()
  }

  clear(): void {
    this.timers.forEach(timer => clearTimeout(timer))
    this.timers.clear()
    this.toasts = []
    this.publish()
  }

  private publish(): void {
    this.onChange(this.toasts)
  }
}
