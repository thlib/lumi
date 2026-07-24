<script setup lang="ts">
import type {Project} from '../../../data'

withDefaults(defineProps<{
  items: readonly Project[]
  overview?: boolean
}>(), {
  overview: false,
})
</script>

<template>
  <div :class="['project-grid', {'project-grid--overview': overview}]">
    <article v-for="project in items" :key="project.id" class="project-card">
      <div class="project-card__top">
        <span class="project-accent" :style="{backgroundColor: project.accent}" />
        <span :class="['status', {'status--planning': project.status === 'Planning'}]">
          {{ project.status }}
        </span>
      </div>
      <h3>{{ project.name }}</h3>
      <p>{{ project.description }}</p>
      <div class="progress-label">
        <span>Progress</span><strong>{{ project.progress }}%</strong>
      </div>
      <div class="progress-track">
        <span :style="{width: `${project.progress}%`}" />
      </div>
      <div class="project-card__footer">
        <span class="member-stack">{{ project.members }}</span>
        <span>{{ project.due }}</span>
      </div>
    </article>
  </div>
</template>
