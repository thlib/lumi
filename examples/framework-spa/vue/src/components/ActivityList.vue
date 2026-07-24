<script setup lang="ts">
import type {Activity} from '../../../shared/data'

withDefaults(defineProps<{
  items: readonly Activity[]
  compact?: boolean
}>(), {
  compact: false,
})
</script>

<template>
  <ol :class="['activity-list', {'activity-list--compact': compact}]">
    <li v-for="activity in items" :key="activity.id" class="activity-item">
      <span class="activity-avatar" :style="{backgroundColor: activity.tone}">
        {{ activity.initials }}
      </span>
      <div class="activity-item__copy">
        <p>
          <a class="person-link" :href="`#/teams/${activity.personId}`">{{ activity.person }}</a>
          {{ ' ' }}<span>{{ activity.action }}</span>
          {{ ' ' }}<b>{{ activity.target }}</b>
        </p>
        <time>{{ activity.time }}</time>
      </div>
    </li>
  </ol>
</template>
