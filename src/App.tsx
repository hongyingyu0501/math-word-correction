import { useState, useEffect, useRef } from 'react'
import { useSocrates } from './hooks/useSocrates'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import * as pdfjs from 'pdfjs-dist'
import InputAnswers from './components/InputAnswers'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

interface SavedPrompt {
  id: string
  title: string
  content: string
  createdAt: number
}

const STORAGE_KEY = 'saved_prompts'

function App() {
  const [question, setQuestion] = useState('')
  const [imageFile, setImageFile] = useState<File | undefined>()
  const [imagePreview, setImagePreview] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([])
  const [showSaved, setShowSaved] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<SavedPrompt | null>(null)
  const [newPromptTitle, setNewPromptTitle] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState('')
  const [processingPercent, setProcessingPercent] = useState(0)
  const [currentView, setCurrentView] = useState<string>('analysis')
  const { answer, loading, error, analyze } = useSocrates(import.meta.env.VITE_API_KEY)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      setSavedPrompts(JSON.parse(saved))
    }
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessing(true)
    setProcessingProgress('正在加载文件...')
    setProcessingPercent(10)
    setImageFile(undefined)
    setImagePreview('')

    try {
      if (file.type === 'application/pdf') {
        setProcessingProgress('正在解析PDF文件...')
        setProcessingPercent(20)
        
        const images = await convertPdfToImages(file)
        
        if (images.length > 0) {
          setProcessingProgress('正在生成预览...')
          setProcessingPercent(90)
          
          const imageBlob = await fetch(images[0]).then(r => r.blob())
          const imageFile = new File([imageBlob], 'pdf-page.png', { type: 'image/png' })
          setImageFile(imageFile)
          
          setProcessingProgress('处理完成')
          setProcessingPercent(100)
          
          setTimeout(() => {
            setProcessingProgress('')
            setProcessingPercent(0)
          }, 500)
        } else {
          throw new Error('PDF文件为空或无法解析')
        }
      } else if (file.type.startsWith('image/')) {
        setProcessingProgress('正在读取图片...')
        setProcessingPercent(30)
        
        await new Promise(resolve => setTimeout(resolve, 100))
        
        setImageFile(file)
        
        setProcessingProgress('处理完成')
        setProcessingPercent(100)
        
        setTimeout(() => {
          setProcessingProgress('')
          setProcessingPercent(0)
        }, 500)
      } else {
        throw new Error('不支持的文件格式，请上传图片或PDF文件')
      }
    } catch (err) {
      console.error('文件处理失败:', err)
      const errorMessage = err instanceof Error ? err.message : '文件处理失败，请重试'
      alert(errorMessage)
      setProcessingProgress('')
      setProcessingPercent(0)
    } finally {
      setIsProcessing(false)
    }
  }

  const convertPdfToImages = async (file: File): Promise<string[]> => {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
    const images: string[] = []
    const scale = 2.0
    const totalPages = pdf.numPages

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const progress = 20 + Math.floor((pageNum / totalPages) * 60)
      setProcessingProgress(`正在处理第 ${pageNum}/${totalPages} 页...`)
      setProcessingPercent(progress)
      
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')

      if (!context) continue

      canvas.height = viewport.height
      canvas.width = viewport.width

      context.fillStyle = '#FFFFFF'
      context.fillRect(0, 0, canvas.width, canvas.height)

      await page.render({ canvasContext: context, viewport, canvas }).promise

      images.push(canvas.toDataURL('image/png', 0.95))
    }

    return images
  }

  useEffect(() => {
    if (imageFile && imageFile.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(imageFile)
    } else {
      setImagePreview('')
    }
  }, [imageFile])

  useEffect(() => {
    if (answer && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [answer])

  const parseAnswer = (text: string) => {
    const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/)
    const thinking = thinkingMatch ? thinkingMatch[1].trim() : ''
    const content = text.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim()
    return { thinking, content }
  }

  const handleSubmit = () => {
    if (!question.trim()) return
    analyze(question, imageFile)
  }

  const markdownToWord = (markdown: string): string => {
    let text = markdown
      .replace(/#{6}\s+(.+)/g, '\n\n$1\n')
      .replace(/#{5}\s+(.+)/g, '\n\n$1\n')
      .replace(/#{4}\s+(.+)/g, '\n\n$1\n')
      .replace(/#{3}\s+(.+)/g, '\n\n$1\n')
      .replace(/#{2}\s+(.+)/g, '\n\n$1\n')
      .replace(/#{1}\s+(.+)/g, '\n\n$1\n')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, '').trim())
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+|\n+$/g, '')
    
    return text
  }

  const markdownToHtml = (markdown: string): string => {
    let html = markdown
      .replace(/#{6}\s+(.+)/g, '<h6>$1</h6>')
      .replace(/#{5}\s+(.+)/g, '<h5>$1</h5>')
      .replace(/#{4}\s+(.+)/g, '<h4>$1</h4>')
      .replace(/#{3}\s+(.+)/g, '<h3>$1</h3>')
      .replace(/#{2}\s+(.+)/g, '<h2>$1</h2>')
      .replace(/#{1}\s+(.+)/g, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
    
    return `<p>${html}</p>`
  }

  const handleCopy = async () => {
    const { thinking, content } = parseAnswer(answer)
    
    let htmlContent = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
    htmlContent += '<h1>错题分析报告</h1>'
    
    if (thinking) {
      htmlContent += '<h2>思考过程</h2>'
      htmlContent += '<hr>'
      htmlContent += markdownToHtml(thinking)
    }
    
    htmlContent += '<h2>分析结果</h2>'
    htmlContent += '<hr>'
    htmlContent += markdownToHtml(content)
    
    if (imagePreview) {
      htmlContent += '<h2>题目图片</h2>'
      htmlContent += `<img src="${imagePreview}" style="max-width: 100%; height: auto;">`
    }
    
    htmlContent += '</body></html>'
    
    let plainText = '错题分析报告\n\n'
    
    if (thinking) {
      plainText += '思考过程\n' + '='.repeat(20) + '\n\n'
      plainText += markdownToWord(thinking) + '\n\n'
    }
    
    plainText += '分析结果\n' + '='.repeat(20) + '\n\n'
    plainText += markdownToWord(content)
    
    if (imagePreview) {
      plainText += '\n\n题目图片：[已包含]'
    }
    
    try {
      const clipboardItems = [
        new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' })
        })
      ]
      
      await navigator.clipboard.write(clipboardItems)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
      try {
        await navigator.clipboard.writeText(plainText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (fallbackErr) {
        console.error('备用复制也失败:', fallbackErr)
      }
    }
  }

  const savePrompt = () => {
    if (!question.trim() || !newPromptTitle.trim()) return
    
    const newPrompt: SavedPrompt = {
      id: Date.now().toString(),
      title: newPromptTitle,
      content: question,
      createdAt: Date.now()
    }
    
    const updated = [...savedPrompts, newPrompt]
    setSavedPrompts(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setNewPromptTitle('')
    setShowSaved(false)
  }

  const updatePrompt = () => {
    if (!editingPrompt || !newPromptTitle.trim()) return
    
    const updated = savedPrompts.map(p => 
      p.id === editingPrompt.id 
        ? { ...p, title: newPromptTitle, content: question }
        : p
    )
    
    setSavedPrompts(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setEditingPrompt(null)
    setNewPromptTitle('')
  }

  const deletePrompt = (id: string) => {
    const updated = savedPrompts.filter(p => p.id !== id)
    setSavedPrompts(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  const loadPrompt = (prompt: SavedPrompt) => {
    setQuestion(prompt.content)
    setShowSaved(false)
  }

  const startEdit = (prompt: SavedPrompt) => {
    setEditingPrompt(prompt)
    setNewPromptTitle(prompt.title)
    setQuestion(prompt.content)
  }

  const { thinking, content } = parseAnswer(answer)

  if (currentView === 'ocr') {
    return <InputAnswers />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-3 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
            错题分析助手
          </h1>
          <p className="text-gray-600 text-lg">上传图片或PDF文件，获取苏格拉底式的引导分析</p>
          <div className="flex justify-center gap-4 mt-4">
            <button 
              className={`btn btn-sm ${currentView === 'analysis' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setCurrentView('analysis')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              错题分析
            </button>
            <button 
              className={`btn btn-sm ${currentView === 'ocr' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setCurrentView('ocr')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              单词批改
            </button>
          </div>
        </div>

        <div className="card bg-white/80 backdrop-blur-sm shadow-2xl border border-white/50 hover:shadow-3xl transition-all duration-300">
          <div className="card-body space-y-6">
            <div className="flex items-center justify-between">
              <label className="label">
                <span className="label-text font-semibold text-gray-700 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  上传题目文件
                </span>
              </label>
              <button 
                className="btn btn-ghost btn-sm gap-2"
                onClick={() => setShowSaved(!showSaved)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332-.477 4.5-1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                常用指令 ({savedPrompts.length})
              </button>
            </div>
            
            <div className="flex items-center gap-4">
              <input 
                type="file" 
                className="file-input file-input-bordered file-input-primary flex-1 focus:ring-2 focus:ring-blue-300" 
                accept="image/*,.pdf"
                onChange={handleFileChange}
                disabled={isProcessing}
              />
              {isProcessing && (
                <div className="flex flex-col items-center gap-2 min-w-[200px]">
                  <span className="loading loading-spinner loading-lg"></span>
                  {processingProgress && (
                    <span className="text-sm text-blue-600 font-medium animate-pulse text-center">
                      {processingProgress}
                    </span>
                  )}
                  {processingPercent > 0 && (
                    <div className="w-full">
                      <progress 
                        className="progress progress-primary w-full" 
                        value={processingPercent} 
                        max="100"
                      ></progress>
                      <span className="text-xs text-gray-500 text-center block mt-1">
                        {processingPercent}%
                      </span>
                    </div>
                  )}
                </div>
              )}
              {imagePreview && !isProcessing && (
                <div className="avatar animate-scale-in">
                  <div className="w-20 rounded-xl ring-4 ring-primary ring-offset-2 shadow-lg">
                    <img src={imagePreview} alt="Preview" />
                  </div>
                </div>
              )}
            </div>
            
            <div className="divider divider-primary"></div>
            
            <div className="space-y-2">
              <label className="label">
                <span className="label-text font-semibold text-gray-700 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  描述你的问题
                </span>
              </label>
              <textarea 
                className="textarea textarea-bordered textarea-lg w-full focus:textarea-primary focus:ring-2 focus:ring-blue-300 transition-all duration-200" 
                placeholder="请详细描述你的错题，包括题目内容、你的解题思路和遇到的困难..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={5}
              />
            </div>

            {showSaved && (
              <div className="card bg-base-100 border border-base-300 animate-fade-in-up">
                <div className="card-body p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg">常用指令</h3>
                    <div className="flex gap-2">
                      <button 
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          if (editingPrompt) {
                            updatePrompt()
                          } else {
                            savePrompt()
                          }
                        }}
                        disabled={!question.trim() || !newPromptTitle.trim()}
                      >
                        {editingPrompt ? '更新' : '保存'}
                      </button>
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <input 
                      type="text" 
                      className="input input-bordered w-full" 
                      placeholder="给这个指令起个名字..."
                      value={newPromptTitle}
                      onChange={(e) => setNewPromptTitle(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {savedPrompts.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">暂无保存的指令</p>
                    ) : (
                      savedPrompts.map((prompt) => (
                        <div key={prompt.id} className="flex items-center justify-between p-3 bg-base-200 rounded-lg hover:bg-base-300 transition-colors">
                          <div 
                            className="flex-1 cursor-pointer"
                            onClick={() => loadPrompt(prompt)}
                          >
                            <div className="font-medium">{prompt.title}</div>
                            <div className="text-sm text-gray-600 truncate">{prompt.content}</div>
                          </div>
                          <div className="flex gap-1">
                            <button 
                              className="btn btn-ghost btn-xs"
                              onClick={() => startEdit(prompt)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button 
                              className="btn btn-ghost btn-xs text-error"
                              onClick={() => deletePrompt(prompt.id)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <button 
              className="btn btn-primary btn-lg w-full shadow-xl hover:shadow-2xl transform hover:scale-[1.02] transition-all duration-200" 
              onClick={handleSubmit}
              disabled={loading || !question.trim()}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner"></span>
                  分析中...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  开始分析
                </>
              )}
            </button>
          </div>
        </div>
        
        {error && (
          <div className="alert alert-error shadow-lg animate-shake">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{error}</span>
          </div>
        )}
        
        {answer && (
          <div ref={resultRef} className="space-y-6 animate-fade-in-up">
            <div className="flex justify-end">
              <button 
                className="btn btn-success gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    已复制
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    复制到 Word
                  </>
                )}
              </button>
            </div>

            {thinking && (
              <div className="card bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 shadow-2xl border-2 border-amber-300 hover:border-amber-400 transition-all duration-300">
                <div className="card-body">
                  <h2 className="card-title text-amber-700 flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    思考过程
                  </h2>
                  <div className="prose prose-amber max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {thinking}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
            
            <div className="card bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 shadow-2xl border-2 border-blue-300 hover:border-blue-400 transition-all duration-300">
              <div className="card-body">
                <h2 className="card-title text-blue-700 flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  分析结果
                </h2>
                <div className="prose prose-blue max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App