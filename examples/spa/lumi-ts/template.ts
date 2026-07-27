export function composeTemplate(id: string): HTMLTemplateElement {
  const template = document.createElement('template')
  template.content.append(cloneTemplate(id, []))
  return template
}

function cloneTemplate(
  id: string,
  ancestors: readonly string[],
): DocumentFragment {
  if (ancestors.includes(id)) {
    throw new Error(
      `Circular template inclusion: ${[...ancestors, id].join(' -> ')}`,
    )
  }

  const source = document.querySelector(`#${CSS.escape(id)}`)

  if (!(source instanceof HTMLTemplateElement)) {
    throw new Error(`Template "${id}" was not found`)
  }

  const fragment = source.content.cloneNode(true)

  if (!(fragment instanceof DocumentFragment)) {
    throw new TypeError(`Template "${id}" did not clone as a fragment`)
  }

  for (const include of Array.from(
    fragment.querySelectorAll('template[data-include]'),
  )) {
    const includedId = include.getAttribute('data-include')

    if (includedId === null || includedId === '') {
      throw new Error(`Template "${id}" has an empty data-include`)
    }

    const included = cloneTemplate(includedId, [...ancestors, id])
    const attributes = Array.from(include.attributes)
      .filter(attribute => attribute.name !== 'data-include')

    if (attributes.length > 0) {
      const roots = Array.from(included.children)

      if (roots.length !== 1) {
        throw new Error(
          `Template "${includedId}" needs one root to receive include data`,
        )
      }

      for (const attribute of attributes) {
        roots[0]?.setAttribute(attribute.name, attribute.value)
      }
    }

    include.replaceWith(included)
  }

  return fragment
}
