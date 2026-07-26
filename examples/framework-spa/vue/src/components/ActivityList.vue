<script setup lang="ts">
import type {Activity} from '../../../data'

defineProps<{items: readonly Activity[]}>()
</script>

<template>
  <ol class="activity-list">
    <li v-for="activity in items" :key="activity.id" class="activity-item">
      <span class="avatar" :style="{backgroundColor: activity.tone}">
        {{ activity.initials }}
      </span>
      <div class="copy">
        <p>
          <a class="person" :href="`#/teams/${activity.personId}`">{{ activity.person }}</a>
          {{ ' ' }}<span>{{ activity.action }}</span>
          {{ ' ' }}<b>{{ activity.target }}</b>
        </p>
        <time>{{ activity.time }}</time>
      </div>
    </li>
  </ol>
</template>
