import {component} from '../../../../dist/lumi.js'
import {attributeBehaviors} from './behaviors/attributes'
import {navigationBehaviors} from './behaviors/navigation'
import {pathBehavior} from './behaviors/path'
import {projectBehaviors} from './behaviors/projects'
import {propertyBehaviors} from './behaviors/properties'
import {recordBehaviors} from './behaviors/records'
import {repeatBehavior} from './behaviors/repeat'
import {toastBehaviors} from './behaviors/toasts'
import {validationBehaviors} from './behaviors/validation'
import {composeTemplate} from './template'

import type {MountedComponent} from '../../../../dist/lumi.js'
import type {Presentation} from './presentation'

export function mountApplication(
  target: Element | null,
): MountedComponent<Presentation> {
  return component<Presentation>({
    template: composeTemplate('app-shell'),
    bindings: [
      repeatBehavior,
      pathBehavior,
      ...attributeBehaviors,
      ...propertyBehaviors,
      ...navigationBehaviors,
      ...projectBehaviors,
      ...recordBehaviors,
      ...validationBehaviors,
      ...toastBehaviors,
    ],
  }).mount(target)
}
