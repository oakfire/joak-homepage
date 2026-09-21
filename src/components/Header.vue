<script setup lang="ts">
import { ref } from 'vue'

const quotes = [
  'Keep Thriving',
  'Let life be beautiful like summer flowers and death like autumn leaves. — Rabindranath Tagore',
  'Life has become richer by the love that has been lost. — Rabindranath Tagore',
  'By plucking her petals you do not gather the beauty of the flower. — Rabindranath Tagore',
  'We read the world wrong and say that it deceives us. — Rabindranath Tagore',
  'The birth and death of the leaves are the rapid whirls of the eddy whose wider circles move slowly among stars. — Rabindranath Tagore',
]

const currentQuote = ref(quotes[Math.floor(Math.random() * quotes.length)])
</script>

<template>
  <header class="py-12 text-center">
    <div class="w-20 h-20 rounded-full mx-auto mb-4 overflow-hidden">
      <img src="/avatar.jpg" alt="Joak" class="w-full h-full object-cover" />
    </div>
    <h1 class="text-3xl font-bold text-text mb-2">oakfire</h1>
    <p class="text-text-light text-lg tracking-wide">{{ currentQuote }}</p>
  </header>
</template>
