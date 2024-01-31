import ollama from 'npm:ollama'

const response = await ollama.chat({
  model: 'llama2',
  messages: [
    { role: 'system', content: 'answer as short as posible' },
    { role: 'user', content: 'Why is the sky blue?' }
],
})
console.log(response)