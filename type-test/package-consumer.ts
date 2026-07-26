import {
  attr,
  bind,
  child,
  classToggle,
  component,
  on,
  prop,
  style,
  type Component,
  type ComponentOptions,
  type EventBindingOptions,
  type MountedComponent,
} from '@thlib/lumi'

type CounterData = {
  count: number
  label: string
  disabled: boolean
}

const template = document.createElement('template')
template.innerHTML = '<output></output>'

const mediaOptions: EventBindingOptions = {
  at: 'elements',
  freq: 'once',
}

const options: ComponentOptions<CounterData> = {
  template,
  bindings: [
    bind('output', (data, element) => {
      const output: HTMLOutputElement = element
      return `${data.label}: ${data.count} (${output.htmlFor.value})`
    }),
    prop('output', data => data.count, 'value'),
    attr('output', 'aria-label', data => data.label),
    classToggle('output', 'disabled', data => data.disabled),
    style('output', 'opacity', data => data.disabled ? '0.5' : '1'),
    on('button', 'click', (nativeEvent, button) => {
      const click: MouseEvent = nativeEvent
      const control: HTMLButtonElement = button
      void click
      void control
    }),
    on('video', 'ended', () => {}, mediaOptions),
  ],
}

// @ts-expect-error the native once option is replaced by freq.
on('button', 'click', () => {}, { once: true })

const definition: Component<CounterData> = component(options)
const mounted: MountedComponent<CounterData> = definition.mount(document.body)

mounted.update({
  count: 1,
  label: 'Count',
  disabled: false,
})

// @ts-expect-error count must remain a number across the component boundary.
mounted.update({ count: '1', label: 'Count', disabled: false })

// @ts-expect-error text bindings cannot project arbitrary objects.
bind('output', () => ({ count: 1 }))

// @ts-expect-error attribute bindings accept only text-compatible primitives.
attr('output', 'title', () => ['invalid'])

// @ts-expect-error class bindings require boolean projections.
classToggle('output', 'active', () => 'true')

// @ts-expect-error style bindings require string projections.
style('output', 'color', () => 1)

type ChildData = { name: string }
type PageData = { profile: ChildData }

declare const childComponent: Component<ChildData>

const pageOptions: ComponentOptions<PageData> = {
  template,
  bindings: [
    child('.profile', childComponent, page => page.profile),
  ],
}

component(pageOptions)

bind<CounterData>('output', data => data.count)

bind('circle', (_data, circle) => circle.r.baseVal.value)
bind('math', (_data, math) => math.tagName)

bind('.result', (_data, element) => {
  const matchedElement: Element = element

  // @ts-expect-error complex selectors safely retain the base Element type.
  element.value

  return matchedElement.tagName
})
