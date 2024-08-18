<script setup>
import { defineProps, defineComponent } from 'vue';

const props = defineProps({
  axeResults: {
    type: Object,
    required: true
  }
});

const DetailsItem = defineComponent({
  name: 'DetailsItem',
  props: {
    item: {
      type: Object,
      required: true
    }
  },
  template: `
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
  `
});
</script>

<template>
  <details open>
    <summary>Axe results</summary>

    <details class="category">
      <summary>Violations <span>{{ axeResults.violations.length }}</span></summary>
      <div v-for="violation in axeResults.violations" :key="violation.id">
        <DetailsItem :item="violation"></DetailsItem>
      </div>
    </details>

    <details class="category">
      <summary>Passes <span>{{ axeResults.passes.length }}</span></summary>
      <div v-for="pass in axeResults.passes" :key="pass.id">
        <DetailsItem :item="pass"></DetailsItem>
      </div>
    </details>

    <details class="category">
      <summary>Inapplicable <span>{{ axeResults.inapplicable.length }}</span></summary>
      <div v-for="inapplicableItem in axeResults.inapplicable" :key="inapplicableItem.id">
        <DetailsItem :item="inapplicableItem"></DetailsItem>
      </div>
    </details>

    <details class="category">
      <summary>Incomplete <span>{{ axeResults.incomplete.length }}</span></summary>
      <div v-for="incompleteItem in axeResults.incomplete" :key="incompleteItem.id">
        <DetailsItem :item="incompleteItem"></DetailsItem>
      </div>
    </details>
  </details>
</template>

<style scoped>
details {
  margin-bottom: 15px;
}
summary {
  font-weight: bold;
}
.category {
  margin-left: 20px;
}
.violation,
.inapplicable,
.passes,
.incomplete {
  margin-left: 40px;
}
.node {
  margin-left: 60px;
  color: darkred;
}
details > div {
  margin-left: 2rem;
}
</style>
