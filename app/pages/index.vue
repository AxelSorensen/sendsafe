<script setup lang="ts">
const status = await $fetch<{ setup: boolean, authed: boolean }>('/api/status')
await navigateTo(!status.setup ? '/setup' : status.authed ? '/admin' : '/login', { replace: true })
</script>

<template><div /></template>
