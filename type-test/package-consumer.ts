import {
  attr,
  child,
  classToggle,
  component,
  on,
  prop,
  repeat,
  style,
  text,
  type Component,
  type ComponentOptions,
  type EventBindingOptions,
  type MountedComponent,
  type ProjectionContext,
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
    text<CounterData, CounterData, 'output'>('output', ({data}, element) => {
      const output: HTMLOutputElement = element
      return `${data.label}: ${data.count} (${output.htmlFor.value})`
    }),
    prop<CounterData, CounterData>('output', ({data}) => data.count, 'value'),
    attr<CounterData, CounterData>('output', 'aria-label', ({data}) => data.label),
    classToggle<CounterData, CounterData>('output', 'disabled', ({data}) => data.disabled),
    style<CounterData, CounterData>('output', 'opacity', ({data}) => data.disabled ? '0.5' : '1'),
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
text('output', () => ({ count: 1 }))

// @ts-expect-error attribute bindings accept only text-compatible primitives.
attr('output', 'title', () => ({ invalid: true }))

// @ts-expect-error arrays belong to repeat, not scalar projections.
attr('output', 'title', () => ['first', 'second'])

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

type Person = {name: string}
type PeoplePage = {people: Person[], heading: string}

const peopleOptions: ComponentOptions<PeoplePage> = {
  template,
  bindings: [
    repeat<Person, PeoplePage>('li', ({data}, el) => {
      const item: Element = el
      void item
      return data.people
    }, [
      text<Person>('.name', ({item}, el) => {
        const contextItem: Person = item
        const matched: Element = el
        void contextItem
        void matched
        return item.name
      }),
      text<Person, PeoplePage>('.heading', ({data}) => data.heading),
    ]),
  ],
}

component(peopleOptions)

const personContext: ProjectionContext<Person, PeoplePage> = {
  data: {people: [], heading: 'People'},
  item: {name: 'Ada'},
  index: 0,
  path: [0],
  parent: null,
}
void personContext

// @ts-expect-error text item types are explicit and checked.
text<Person>('.name', ({item}) => item.missing)

text<CounterData, CounterData, 'output'>('output', ({data}) => data.count)

text<CounterData, CounterData, 'circle'>('circle', (_context, circle) => circle.r.baseVal.value)
text<CounterData, CounterData, 'math'>('math', (_context, math) => math.tagName)

text<CounterData, CounterData, '.result'>('.result', (_context, element) => {
  const matchedElement: Element = element

  // @ts-expect-error complex selectors safely retain the base Element type.
  element.value

  return matchedElement.tagName
})
