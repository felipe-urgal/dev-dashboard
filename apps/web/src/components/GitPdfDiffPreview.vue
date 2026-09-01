<script setup lang="ts">
import type {
  GitImageDiffPreview,
  GitImagePreviewContent,
} from '@dev-dashboard/contracts';

const props = defineProps<{
  preview: GitImageDiffPreview;
  path: string;
}>();

function pdfDataUrl(content: GitImagePreviewContent): string {
  return `data:${content.mimeType};base64,${content.base64}`;
}
</script>

<template>
  <div
    class="git-pdf-diff-preview"
    :class="{ 'is-single': !preview.before || !preview.after }"
  >
    <figure v-if="preview.before">
      <figcaption>Antes</figcaption>
      <object
        :data="pdfDataUrl(preview.before)"
        :type="preview.before.mimeType"
        :aria-label="`Versão anterior de ${props.path}`"
      >
        <p>O navegador não conseguiu exibir a versão anterior deste PDF.</p>
      </object>
    </figure>

    <figure v-if="preview.after">
      <figcaption>Depois</figcaption>
      <object
        :data="pdfDataUrl(preview.after)"
        :type="preview.after.mimeType"
        :aria-label="`Versão atual de ${props.path}`"
      >
        <p>O navegador não conseguiu exibir a versão atual deste PDF.</p>
      </object>
    </figure>
  </div>
</template>

<style src="./GitPdfDiffPreview.css"></style>
