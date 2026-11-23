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

/** Carries the item type of a binding. It is not a property at run time. */
declare const itemType: unique symbol

/**
 * A binding connects one declared data-to-DOM relationship.
 *
 * `Item` is the type of `context.item` in the projection of the binding. The
 * binding list of a `repeat` gives this type to its bindings, so a projection
 * in the list needs no type argument. `Binding<Data>` accepts each item type.
 */
export type Binding<Data, Item = any> = {
  connect: (root: Element) => ConnectedBinding<Data>
  readonly [itemType]?: (item: Item) => void
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

export type ComponentSource = HTMLTemplateElement | DocumentFragment | Element

export type ComponentOptions<Data> = {
  source: ComponentSource | null
  /**
   * A binding at the component boundary can have each item type, because a
   * binding outside the list of a `repeat` gets its context from the
   * position of its element.
   */
  bindings?: ReadonlyArray<Binding<Data>>
}

export type Component<Data> = {
  /** Puts a copy of the component source into the target. */
  mount: (target: Element | DocumentFragment | null) => MountedComponent<Data>
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

export type KeyProjection<Item, Data = unknown> =
  (context: ProjectionContext<Item, Data>) => unknown

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
  bindings?: ReadonlyArray<Binding<Data, Item>>,
): Binding<Data, Parent>

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
  key: KeyProjection<Item, Data>,
  bindings?: ReadonlyArray<Binding<Data, Item>>,
): Binding<Data, Parent>

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
): Binding<Data, Item>

export function prop<
  Item,
  Data = unknown,
  Value = unknown,
  Selector extends string = string,
>(
  selector: Selector,
  name: string,
  project: ContextProjection<
    Item,
    Data,
    Value | null | undefined,
    SelectorElement<Selector>
  >,
): Binding<Data, Item>

/**
 * ARIA states are string tokens. For a literal `aria-*` name, the projection
 * cannot return `true`, because `true` writes an empty attribute. Project
 * `'true'` or `'false'` instead; `false` still removes the attribute.
 */
export function attr<
  Item,
  Data = unknown,
  Selector extends string = string,
  Name extends string = string,
>(
  selector: Selector,
  name: Name,
  project: ContextProjection<
    Item,
    Data,
    | (Lowercase<Name> extends `aria-${string}`
      ? string | number | false
      : TextValue)
    | null
    | undefined,
    SelectorElement<Selector>
  >,
): Binding<Data, Item>

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
): Binding<Data, Item>

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
): Binding<Data, Item>

/**
 * In the binding list of a `repeat`, each occurrence gets its own child
 * component, and the projection receives the context of that occurrence. A
 * nullish projection keeps the child component as it is.
 */
export function child<Item, Data = unknown, ChildData = unknown>(
  selector: string,
  childComponent: Component<ChildData>,
  project: ContextProjection<Item, Data, ChildData | null | undefined>,
): Binding<Data, Item>

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
