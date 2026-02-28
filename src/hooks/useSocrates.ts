import { useState } from 'react'

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export const useSocrates = (apiKey: string) => {
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const analyze = async (question: string, imageFile?: File) => {
    setLoading(true)
    setError('')
    setAnswer('')

    try {
      const content: any[] = [
        { type: 'text', text: question }
      ]

      if (imageFile) {
        const base64 = await fileToBase64(imageFile)
        content.push({
          type: 'image_url',
          image_url: { url: base64 }
        })
      }

      const response = await fetch('/qwen-api/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'qwen-vl-max',
          messages: [
            {
              role: 'system',
              content: `你是一个专业的数学教育专家，采用苏格拉底式教学法帮助学生理解错题。

你的回答格式要求：
1. 思考过程（放在<thinking>标签中）：
   - 分析题目考查的知识点
   - 识别学生可能的错误原因
   - 设计引导性问题

2. 分析结果：
   - 用简洁清晰的语言解释正确解法
   - 通过提问引导学生思考
   - 提供相关的知识点和技巧
   - 使用数学公式时用LaTeX格式（如 $x^2$ 或 $$\\frac{a}{b}$$）

注意事项：
- 不要直接给出答案，要引导学生思考
- 语言要通俗易懂，适合学生理解
- 鼓励学生提问和探索
- 对图片中的数学符号和公式要准确识别`
            },
            {
              role: 'user',
              content
            }
          ],
          stream: true,
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 4000
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No reader available')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content
              if (content) {
                setAnswer(prev => prev + content)
              }
            } catch (e) {
              console.error('Parse error:', e)
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return { answer, loading, error, analyze }
}