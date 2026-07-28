/** A scalar value that a Lumi text or attribute binding can render. */
export type TextValue = string | number | boolean

/** The current component data and repeated-item position. */
export type ProjectionContext<Item, Data = unknown> = Readonly<{
  data: Data
  item: Item
  index: number
  path: ReadonlyArray<number>
  parent: ProjectionContext<unknown, Data> | null
}>

/** A binding connects one declared data-to-DOM relationship. */
export type Binding<Data> = {
  connect: (root: Element) => ConnectedBinding<Data>
}

/** The connected work owned by one binding. */
export type ConnectedBinding<Data> = {
  prepare: (data: Data) => PreparedUpdate
  destroy: () => void
}

/** A prepared update that can commit or discard its DOM work. */
export type PreparedUpdate = {
  commit: () => void
  discard?: () => void
}

/** The element type for a simple native element selector. */
export type SelectorElement<Selector extends string> =
  Selector extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[Selector]
    : Selector extends keyof SVGElementTagNameMap ? SVGElementTagNameMap[Selector]
      : Selector extends keyof MathMLElementTagNameMap ? MathMLElementTagNameMap[Selector]
        : Selector extends keyof HTMLElementDeprecatedTagNameMap ? HTMLElementDeprecatedTagNameMap[Selector]
          : Element

/** The native event type for a known global event name. */
export type NativeEvent<Type extends string> =
  Type extends keyof GlobalEventHandlersEventMap
    ? GlobalEventHandlersEventMap[Type]
    : Event

export type EventBindingLocation = 'component' | 'elements'
export type EventBindingFrequency = 'always' | 'once'
export type EventBindingOptions = Readonly<{
  at?: EventBindingLocation
  capture?: boolean
  passive?: boolean
  freq?: EventBindingFrequency
}>

export type ComponentOptions<Data> = {
  template: HTMLTemplateElement | null
  bindings?: ReadonlyArray<Binding<Data>>
}

export type Component<Data> = {
  mount: (target: Element | null) => MountedComponent<Data>
}

export type MountedComponent<Data> = {
  root: Element
  update: (data: Data) => void
  unmount: () => void
}

export type ContextProjection<
  Item,
  Data = unknown,
  Value = unknown,
  Target extends Element = Element,
> = (context: ProjectionContext<Item, Data>, el: Target) => Value

export function repeat<
  Item,
  Data = unknown,
  Parent = Data,
  Selector extends string = string,
>(
  selector: Selector,
  project: ContextProjection<
    Parent,
    Data,
    ReadonlyArray<Item> | null | undefined,
    SelectorElement<Selector>
  >,
  bindings?: ReadonlyArray<Binding<Data>>,
): Binding<Data>

export function text<
  Item,
  Data = unknown,
  Selector extends string = string,
>(
  selector: Selector,
  project: ContextProjection<
    Item,
    Data,
    TextValue | null | undefined,
    SelectorElement<Selector>
  >,
): Binding<Data>

export function prop<
  Item,
  Data = unknown,
  Value = unknown,
  Selector extends string = string,
>(
  selector: Selector,
  project: ContextProjection<
    Item,
    Data,
    Value | null | undefined,
    SelectorElement<Selector>
  >,
  name: string,
): Binding<Data>

export function attr<
  Item,
  Data = unknown,
  Selector extends string = string,
>(
  selector: Selector,
  name: string,
  project: ContextProjection<
    Item,
    Data,
    TextValue | null | undefined,
    SelectorElement<Selector>
  >,
): Binding<Data>

export function classToggle<
  Item,
  Data = unknown,
  Selector extends string = string,
>(
  selector: Selector,
  name: string,
  project: ContextProjection<
    Item,
    Data,
    boolean | null | undefined,
    SelectorElement<Selector>
  >,
): Binding<Data>

export function style<
  Item,
  Data = unknown,
  Selector extends string = string,
>(
  selector: Selector,
  name: string,
  project: ContextProjection<
    Item,
    Data,
    string | null | undefined,
    SelectorElement<Selector>
  >,
): Binding<Data>

export function child<ParentData, ChildData>(
  selector: string,
  childComponent: Component<ChildData>,
  project: (data: ParentData) => ChildData,
): Binding<ParentData>

export function component<Data>(options: ComponentOptions<Data>): Component<Data>

export function on<
  Selector extends string,
  Type extends string,
  Data = unknown,
>(
  selector: Selector,
  type: Type,
  handler: (
    event: NativeEvent<Type>,
    element: SelectorElement<Selector>,
  ) => void,
  options?: EventBindingOptions,
): Binding<Data>
