
<script lang="ts" setup>


const props = defineProps<{
    item: any
}>()

</script>


<template>
<details :class="item.impact || 'inapplicable'">
    <summary>
      <strong>{{ item.id }}</strong> ({{ item.impact || 'none' }}) - {{ item.description }}
    </summary>
    <div>
      <p><strong>Description:</strong> {{ item.description }}</p>
      <p><strong>Help:</strong> <a :href="item.helpUrl" target="_blank">{{ item.help }}</a></p>
      <p><strong>Tags:</strong> {{ item.tags.join(', ') }}</p>
    </div>
    <div v-for="node in item.nodes" :key="node.target">
      <div class="node">
        <p><strong>Impact:</strong> {{ node.impact || 'none' }}</p>
        <p><strong>Failure Summary:</strong> {{ node.failureSummary || 'N/A' }}</p>
        <p><strong>Target:</strong>{{ node.target.join(', ') }}</p>
      </div>
    </div>
  </details>
</template>