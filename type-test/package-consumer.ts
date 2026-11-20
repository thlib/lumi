import {
  attr,
  child,
  classToggle,
  component,
  flush,
  on,
  prop,
  repeat,
  style,
  text,
  tracked,
  type Binding,
  type Component,
  type ComponentOptions,
  type ComponentSource,
  type EventBindingOptions,
  type MountedComponent,
  type ProjectionContext,
} from '@thlibjs/lumi'

type CounterData = {
  count: number
  label: string
  disabled: boolean
}

const template = document.createElement('template')
template.innerHTML = '<output></output>'

const elementSource: ComponentSource = document.createElement('output')
const fragmentSource: ComponentSource = template.content
void elementSource
void fragmentSource

// @ts-expect-error component sources must already be parsed DOM.
component({source: '<output></output>'})

const mediaOptions: EventBindingOptions = {
  at: 'elements',
  freq: 'once',
}

const options: ComponentOptions<CounterData> = {
  source: template,
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
  source: template,
  bindings: [
    child('.profile', childComponent, page => page.profile),
  ],
}

component(pageOptions)

type Person = {name: string}
type PeoplePage = {people: Person[], heading: string}

const peopleOptions: ComponentOptions<PeoplePage> = {
  source: template,
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
    repeat<Person, PeoplePage>(
      'li',
      ({data}) => data.people,
      ({item, data}) => `${data.heading}:${item.name}`,
      [text<Person>('.name', ({item}) => item.name)],
    ),
  ],
}

component(peopleOptions)

repeat<Person, PeoplePage>(
  'li',
  ({data}) => data.people,
  // @ts-expect-error repeat key projections do not receive a DOM element.
  ({item}, _el: Element) => item.name,
)

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

// ARIA states are string tokens: a literal aria-* name rejects a projection
// that can return true. Every other attribute name keeps TextValue.
type CounterContext = ProjectionContext<CounterData, CounterData>

// @ts-expect-error true writes an empty aria-* attribute; project 'true' or 'false'.
attr('button', 'aria-expanded', ({data}: CounterContext) => data.disabled)
// @ts-expect-error a literal true is rejected for ARIA names too.
attr('button', 'aria-pressed', () => true)
// @ts-expect-error ARIA name matching ignores case.
attr('button', 'ARIA-Pressed', ({data}: CounterContext) => data.disabled)
// @ts-expect-error explicit type arguments that name the attribute keep the check.
attr<CounterData, CounterData, 'button', 'aria-checked'>('button', 'aria-checked', ({data}) => data.disabled)

const ariaExpanded: Binding<CounterData> = attr(
  'button',
  'aria-expanded',
  ({data}: CounterContext, button) => {
    const control: HTMLButtonElement = button
    void control
    return String(data.disabled)
  },
)
void ariaExpanded
attr('a', 'aria-current', ({data}: CounterContext) => data.disabled ? 'page' : false)
attr('output', 'aria-valuenow', ({data}: CounterContext) => data.count)
attr('output', 'aria-hidden', () => null)

const disabledAttribute: Binding<CounterData> = attr(
  'button',
  'disabled',
  ({data}: CounterContext) => data.disabled,
)
void disabledAttribute
attr('output', 'hidden', () => true)
attr('output', 'data-aria-state', () => true)
declare const dynamicName: string
attr('output', dynamicName, () => true)
// Explicit type arguments without the name fall back to a string name.
attr<CounterData, CounterData>('output', 'aria-busy', ({data}) => data.disabled)

// Tracked data has the type of the plain data.
const trackedData: {count: number, items: string[]} = tracked({
  count: 1,
  items: ['a'],
})
trackedData.count += 1
trackedData.items.push('b')
const flushed: void = flush()
void flushed
// @ts-expect-error tracked data is an object or an array.
tracked(1)
