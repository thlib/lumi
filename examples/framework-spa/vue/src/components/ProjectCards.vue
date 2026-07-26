<script setup lang="ts">
import type {Project} from '../../../data'

defineProps<{items: readonly Project[]}>()
</script>

<template>
  <div class="project-grid">
    <article v-for="project in items" :key="project.id" class="project-card">
      <div class="top">
        <span class="accent" :style="{backgroundColor: project.accent}" />
        <span :class="['status', {'planning': project.status === 'Planning'}]">
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
      <div class="footer">
        <span class="members">{{ project.members }}</span>
        <span>{{ project.due }}</span>
      </div>
    </article>
  </div>
</template>
