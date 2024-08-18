<script lang="ts" setup>


const props = defineProps<{
    reports: any
}>()



</script>


<template>
  <details open>
    <summary>Axe results</summary>

    <details class="category">
      <summary>Violations <span>{{ reports.axeResults.violations.length }}</span></summary>
      <div v-for="violation in  reports.axeResults.violations" :key="violation.id">
        <axe-result-cat :item="violation"></axe-result-cat>
      </div>
    </details>

    <details class="category">
      <summary>Passes <span>{{ reports.axeResults.passes.length }}</span></summary>
      <div v-for="pass in  reports.axeResults.passes" :key="pass.id">
        <axe-result-cat :item="pass"></axe-result-cat>
      </div>
    </details>

    <details class="category">
      <summary>Inapplicable <span>{{ reports.axeResults.inapplicable.length }}</span></summary>
      <div v-for="inapplicableItem in  reports.axeResults.inapplicable" :key="inapplicableItem.id">
        <axe-result-cat :item="inapplicableItem"></axe-result-cat>
      </div>
    </details>

    <details class="category">
      <summary>Incomplete <span>{{ reports.axeResults.incomplete.length }}</span></summary>
      <div v-for="incompleteItem in reports.axeResults.incomplete" :key="incompleteItem.id">
        <axe-result-cat :item="incompleteItem"></axe-result-cat>
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
