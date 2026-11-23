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
  type Binding,
  type Component,
  type ComponentOptions,
  type ComponentSource,
  type EventBindingOptions,
  type MountedComponent,
  type ProjectionContext,
} from '@thlibjs/lumi'
import {unmatchedSelectors} from '@thlibjs/lumi/check.js'

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
    prop<CounterData, CounterData>('output', 'value', ({data}) => data.count),
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
    child('.profile', childComponent, ({data}) => data.profile),
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

// A child in the list of a repeat gets the context of the occurrence.
const memberListOptions: ComponentOptions<PeoplePage> = {
  source: template,
  bindings: [
    repeat<Person, PeoplePage>('li', ({data}) => data.people, [
      child('.slot', childComponent, ({item}) => {
        const person: Person = item
        return person
      }),
    ]),
    child('.heading', childComponent, ({data}) => ({name: data.heading})),
    // @ts-expect-error the projection gives the data type of the child.
    child('.heading', childComponent, ({data}) => data.heading.length),
  ],
}

component(memberListOptions)

// The binding list of a repeat gives its item type to its bindings. Only
// the repeat has type arguments.
type Group = {title: string, people: Person[]}
type GroupsPage = {groups: Group[], heading: string}

const groupsOptions: ComponentOptions<GroupsPage> = {
  source: template,
  bindings: [
    text('h1', ({data}) => {
      const page: GroupsPage = data
      return page.heading
    }),
    repeat<Group, GroupsPage>('section', ({data}) => data.groups, ({item}) => item.title, [
      text('h2', ({item, data}) => {
        const group: Group = item
        const page: GroupsPage = data
        return `${page.heading}: ${group.title}`
      }),
      attr('h2', 'title', ({item}) => item.title),
      classToggle(':scope', 'empty', ({item}) => item.people.length === 0),
      style(':scope', 'order', ({index}) => String(index)),
      prop(':scope', 'hidden', ({item}) => item.people.length === 0),
      repeat<Person, GroupsPage, Group>('li', ({item}) => item.people, [
        text(':scope', ({item}) => {
          const person: Person = item
          return person.name
        }),
      ]),
      // A typed context parameter gives the same result without type
      // arguments.
      repeat('li', ({item}: ProjectionContext<Group, GroupsPage>) => item.people, [
        text(':scope', ({item}) => item.name),
      ]),
    ]),
    // A binding outside the list of a repeat gets its context from the
    // position of its element, so the component accepts each item type.
    text<Person>('li .name', ({item}) => item.name),
  ],
}

component(groupsOptions)

repeat<Group, GroupsPage>('section', ({data}) => data.groups, [
  // @ts-expect-error the list of a repeat gives the item type to its bindings.
  text('h2', ({item}) => item.missing),
])

// @ts-expect-error a binding for a different item type is not in this list.
repeat<Group, GroupsPage>('section', ({data}) => data.groups, [
  text<Person>('h2', ({item}) => item.name),
])

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

// The selector check accepts a component or its options.
const unmatched: Array<{binding: string, selector: string}> = [
  ...unmatchedSelectors(definition),
  ...unmatchedSelectors(options),
]
void unmatched
