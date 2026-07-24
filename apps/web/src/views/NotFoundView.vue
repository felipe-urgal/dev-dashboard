<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="content">
    <div class="empty-state page-empty-state">
      <div class="empty-icon">404</div>
      <h3>Página não encontrada</h3>
      <p>O endereço solicitado não existe no Dev Dashboard.</p>
      <RouterLink class="primary-button link-button" to="/">
        Voltar à visão geral
      </RouterLink>
    </div>
  </section>
</template>
