import { useState, useRef, useEffect } from 'react'
import Tesseract from 'tesseract.js'

interface Word {
  id: string
  text: string
  confidence: number
}

interface WrongWordStats {
  text: string
  count: number
  lastWrongDate: string
}

const STORAGE_KEY = 'saved_answers'
const WRONG_WORDS_KEY = 'wrong_words'
const WRONG_WORDS_STATS_KEY = 'wrong_words_stats'

export default function InputAnswers() {
  const [capturedImage, setCapturedImage] = useState<string>('')
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [recognitionProgress, setRecognitionProgress] = useState(0)
  const [words, setWords] = useState<Word[]>([])
  const [savedAnswers, setSavedAnswers] = useState<Word[][]>([])
  const [wrongWords, setWrongWords] = useState<Word[]>([])
  const [wrongWordStats, setWrongWordStats] = useState<WrongWordStats[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')
  const [standardWords, setStandardWords] = useState<string[]>([])
  const [showStats, setShowStats] = useState(false)
  const [isRecognizingStandard, setIsRecognizingStandard] = useState(false)
  const [standardInputMode, setStandardInputMode] = useState<'manual' | 'ai'>('manual')
  const standardFileInputRef = useRef<HTMLInputElement>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      setSavedAnswers(JSON.parse(saved))
    }
    
    const wrong = localStorage.getItem(WRONG_WORDS_KEY)
    if (wrong) {
      setWrongWords(JSON.parse(wrong))
    }

    const stats = localStorage.getItem(WRONG_WORDS_STATS_KEY)
    if (stats) {
      setWrongWordStats(JSON.parse(stats))
    }
  }, [])

  // 自动整理错词统计
  const updateWrongWordStats = (newWrongWords: Word[]) => {
    const today = new Date().toISOString().split('T')[0]
    const statsMap = new Map<string, WrongWordStats>()
    
    // 加载现有统计
    wrongWordStats.forEach(stat => {
      statsMap.set(stat.text.toLowerCase(), stat)
    })
    
    // 更新统计
    newWrongWords.forEach(word => {
      const key = word.text.toLowerCase()
      const existing = statsMap.get(key)
      
      if (existing) {
        existing.count += 1
        existing.lastWrongDate = today
      } else {
        statsMap.set(key, {
          text: word.text,
          count: 1,
          lastWrongDate: today
        })
      }
    })
    
    const newStats = Array.from(statsMap.values()).sort((a, b) => b.count - a.count)
    setWrongWordStats(newStats)
    localStorage.setItem(WRONG_WORDS_STATS_KEY, JSON.stringify(newStats))
  }

  // 比对识别结果与标准答案
  const compareWithStandard = (recognizedWords: Word[]) => {
    if (standardWords.length === 0) return recognizedWords
    
    const wrong: Word[] = []
    const correct: Word[] = []
    
    recognizedWords.forEach((word, index) => {
      const recognized = word.text.toLowerCase().trim()
      const standard = standardWords[index]?.toLowerCase().trim()
      
      if (standard && recognized !== standard) {
        wrong.push({
          ...word,
          text: standard // 显示标准答案
        })
      } else {
        correct.push(word)
      }
    })
    
    // 保存错词
    if (wrong.length > 0) {
      const newWrongWords = [...wrongWords, ...wrong]
      setWrongWords(newWrongWords)
      localStorage.setItem(WRONG_WORDS_KEY, JSON.stringify(newWrongWords))
      updateWrongWordStats(wrong)
    }
    
    return recognizedWords
  }

  // AI 识别标准答案
  const recognizeStandardWords = async (imageUrl: string) => {
    setIsRecognizingStandard(true)
    try {
      const result = await Tesseract.recognize(
        imageUrl,
        'eng',
        {
          logger: (m: any) => {
            if (m.status === 'recognizing text') {
              console.log(`标准答案识别进度: ${(m.progress * 100).toFixed(0)}%`)
            }
          }
        }
      )
      
      const text = result.data.text
      console.log('标准答案识别结果:', text)
      
      // 解析识别的文本
      const words = text
        .split(/[\n,，、;；]/)
        .map(word => word.trim())
        .filter(word => word.length > 0 && /^[a-zA-Z]+$/.test(word))
      
      setStandardWords(words)
      alert(`成功识别 ${words.length} 个标准单词`)
    } catch (error) {
      console.error('标准答案识别失败:', error)
      alert('标准答案识别失败，请手动输入')
    } finally {
      setIsRecognizingStandard(false)
    }
  }

  // 处理标准答案图片上传
  const handleStandardImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string
        recognizeStandardWords(imageUrl)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const imageData = e.target?.result as string
      setCapturedImage(imageData)
    }
    reader.readAsDataURL(file)
  }

  const recognizeText = async () => {
    if (!capturedImage) return
    
    setIsRecognizing(true)
    setRecognitionProgress(0)
    
    try {
      const result = await Tesseract.recognize(
        capturedImage,
        'eng',
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setRecognitionProgress(Math.round(m.progress * 100))
            }
          }
        }
      )
      
      const recognizedWords = (result.data as any).lines
        .map((line: any, index: number) => ({
          id: `${Date.now()}-${index}`,
          text: line.text.trim(),
          confidence: line.confidence
        }))
        .filter((word: any) => word.text.length > 0)
      
      // 自动比对并整理错词
      const finalWords = compareWithStandard(recognizedWords)
      setWords(finalWords)
    } catch (err) {
      console.error('OCR 识别失败:', err)
      alert('OCR 识别失败，请重试')
    } finally {
      setIsRecognizing(false)
      setRecognitionProgress(0)
    }
  }

  const handleEditWord = (index: number) => {
    setEditingIndex(index)
    setEditingText(words[index].text)
  }

  const handleSaveEdit = () => {
    if (editingIndex === null) return
    
    const updatedWords = [...words]
    updatedWords[editingIndex] = {
      ...updatedWords[editingIndex],
      text: editingText
    }
    setWords(updatedWords)
    setEditingIndex(null)
    setEditingText('')
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setEditingText('')
  }

  const handleDeleteWord = (index: number) => {
    const updatedWords = words.filter((_, i) => i !== index)
    setWords(updatedWords)
  }

  const handleAddWord = () => {
    const newWord: Word = {
      id: `${Date.now()}`,
      text: '',
      confidence: 100
    }
    setWords([...words, newWord])
    setEditingIndex(words.length)
    setEditingText('')
  }

  const saveAnswers = () => {
    const updated = [...savedAnswers, words]
    setSavedAnswers(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    alert('保存成功！')
  }

  const saveToWrongWords = () => {
    const newWrongWords = [...wrongWords, ...words]
    setWrongWords(newWrongWords)
    localStorage.setItem(WRONG_WORDS_KEY, JSON.stringify(newWrongWords))
    updateWrongWordStats(words)
    alert(`成功保存 ${words.length} 个单词到错词本！`)
  }

  const loadAnswers = (index: number) => {
    setWords(savedAnswers[index])
  }

  const deleteSavedAnswers = (index: number) => {
    const updated = savedAnswers.filter((_, i) => i !== index)
    setSavedAnswers(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  const deleteWrongWord = (index: number) => {
    const updated = wrongWords.filter((_, i) => i !== index)
    setWrongWords(updated)
    localStorage.setItem(WRONG_WORDS_KEY, JSON.stringify(updated))
  }

  const clearAll = () => {
    setWords([])
    setCapturedImage('')
  }

  const handleStandardWordsInput = (text: string) => {
    const words = text
      .split(/[\n,，、;；]/)
      .map(word => word.trim())
      .filter(word => word.length > 0)
    setStandardWords(words)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center relative">
          <div className="text-center space-y-3 flex-1">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              单词默写批改
            </h1>
            <p className="text-gray-600 text-lg">拍照识别英文单词，自动比对标准答案</p>
          </div>
          <button 
            className="btn btn-secondary gap-2"
            onClick={() => window.location.href = '/#analysis'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            返回首页
          </button>
        </div>

        {/* 标准答案输入 */}
        <div className="card bg-white/80 backdrop-blur-sm shadow-xl border border-white/50">
          <div className="card-body">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">标准答案</h2>
              <div className="flex gap-2">
                <button
                  className={`btn btn-sm ${standardInputMode === 'manual' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setStandardInputMode('manual')}
                >
                  手动输入
                </button>
                <button
                  className={`btn btn-sm ${standardInputMode === 'ai' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setStandardInputMode('ai')}
                >
                  AI识别
                </button>
              </div>
            </div>
            
            {standardInputMode === 'manual' ? (
              <textarea
                className="textarea textarea-bordered w-full h-24"
                placeholder="输入标准答案，用逗号、换行或空格分隔&#10;例如：apple, banana, orange"
                onChange={(e) => handleStandardWordsInput(e.target.value)}
              />
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  上传包含标准答案的图片，AI将自动识别单词
                </p>
                <div className="flex flex-wrap gap-2">
                  <label className="btn btn-secondary gap-2 cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    上传答案图片
                    <input
                      ref={standardFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleStandardImageUpload}
                    />
                  </label>
                  <label className="btn btn-accent gap-2 cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    拍照识别
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleStandardImageUpload}
                    />
                  </label>
                </div>
                {isRecognizingStandard && (
                  <div className="flex items-center gap-2 text-blue-600">
                    <span className="loading loading-spinner loading-sm"></span>
                    <span>正在识别标准答案...</span>
                  </div>
                )}
              </div>
            )}
            
            {standardWords.length > 0 && (
              <div className="mt-4">
                <div className="text-sm text-gray-600 mb-2">
                  已设置 {standardWords.length} 个标准单词
                </div>
                <div className="flex flex-wrap gap-2">
                  {standardWords.map((word, index) => (
                    <span key={index} className="badge badge-primary">
                      {index + 1}. {word}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card bg-white/80 backdrop-blur-sm shadow-2xl border border-white/50">
          <div className="card-body space-y-6">
            <div className="flex flex-wrap gap-4">
              {!capturedImage && (
                <>
                  <button 
                    className="btn btn-primary gap-2"
                    onClick={() => setShowStats(!showStats)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    错题统计
                  </button>
                  <button 
                    className="btn btn-secondary gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    上传图片
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <label className="btn btn-accent gap-2 cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    直接拍照
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                </>
              )}

              {capturedImage && !isRecognizing && (
                <>
                  <button 
                    className="btn btn-info gap-2"
                    onClick={recognizeText}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    识别文字
                  </button>
                  <button 
                    className="btn btn-warning gap-2"
                    onClick={clearAll}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    清空
                  </button>
                </>
              )}
            </div>

            {capturedImage && (
              <div className="space-y-4">
                <div className="relative">
                  <img 
                    src={capturedImage} 
                    alt="Captured" 
                    className="w-full rounded-lg shadow-lg"
                  />
                </div>

                {isRecognizing && (
                  <div className="card bg-blue-50 border border-blue-200">
                    <div className="card-body items-center text-center">
                      <div className="flex flex-col items-center gap-4">
                        <span className="loading loading-spinner loading-lg text-primary"></span>
                        <div className="w-full max-w-md">
                          <progress 
                            className="progress progress-primary w-full" 
                            value={recognitionProgress} 
                            max="100"
                          ></progress>
                          <p className="mt-2 text-blue-600 font-medium">
                            正在识别文字... {recognitionProgress}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {words.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-800">识别结果</h2>
                  <div className="flex gap-2">
                    <button 
                      className="btn btn-sm btn-secondary gap-1"
                      onClick={handleAddWord}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      添加单词
                    </button>
                    <button 
                      className="btn btn-sm btn-primary gap-1"
                      onClick={saveAnswers}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      保存结果
                    </button>
                    <button 
                      className="btn btn-sm btn-accent gap-1"
                      onClick={saveToWrongWords}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332-.477 4.5-1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      保存到错词本
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {words.map((word, index) => {
                    const isWrong = standardWords.length > 0 && 
                      index < standardWords.length && 
                      word.text.toLowerCase().trim() !== standardWords[index].toLowerCase().trim()
                    
                    return (
                      <div key={word.id} className={`card border ${isWrong ? 'bg-red-50 border-red-300' : 'bg-base-100 border-base-300'}`}>
                        <div className="card-body p-4 flex flex-row items-center gap-4">
                          <span className={`badge font-mono text-lg ${isWrong ? 'badge-error' : 'badge-primary'}`}>
                            {index + 1}
                          </span>
                          
                          {editingIndex === index ? (
                            <div className="flex-1 flex gap-2">
                              <input 
                                type="text" 
                                className="input input-bordered flex-1" 
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                autoFocus
                              />
                              <button 
                                className="btn btn-success btn-sm"
                                onClick={handleSaveEdit}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button 
                                className="btn btn-error btn-sm"
                                onClick={handleCancelEdit}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1">
                                <p className={`text-xl font-medium ${isWrong ? 'text-red-700' : 'text-gray-800'}`}>
                                  {word.text}
                                  {isWrong && standardWords[index] && (
                                    <span className="text-sm text-red-500 ml-2">
                                      (应为: {standardWords[index]})
                                    </span>
                                  )}
                                </p>
                                <p className="text-sm text-gray-500">
                                  置信度: {word.confidence.toFixed(1)}%
                                </p>
                              </div>
                              <div className="flex gap-1">
                                <button 
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => handleEditWord(index)}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button 
                                  className="btn btn-ghost btn-sm text-error"
                                  onClick={() => handleDeleteWord(index)}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 错词统计 */}
            {wrongWordStats.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-800">错词统计</h2>
                  <button 
                    className="btn btn-sm btn-ghost"
                    onClick={() => setShowStats(!showStats)}
                  >
                    {showStats ? '收起' : '展开'}
                  </button>
                </div>
                {showStats && (
                  <div className="overflow-x-auto">
                    <table className="table table-zebra">
                      <thead>
                        <tr>
                          <th>单词</th>
                          <th>错误次数</th>
                          <th>最后错误日期</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wrongWordStats.slice(0, 10).map((stat, index) => (
                          <tr key={index}>
                            <td className="font-medium">{stat.text}</td>
                            <td>
                              <span className={`badge ${stat.count >= 3 ? 'badge-error' : stat.count >= 2 ? 'badge-warning' : 'badge-info'}`}>
                                {stat.count} 次
                              </span>
                            </td>
                            <td className="text-sm text-gray-500">{stat.lastWrongDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {wrongWordStats.length > 10 && (
                      <div className="text-center mt-2 text-sm text-gray-500">
                        还有 {wrongWordStats.length - 10} 个错词...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {wrongWords.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-800">错词本 ({wrongWords.length})</h2>
                  <button 
                    className="btn btn-sm btn-error gap-1"
                    onClick={() => {
                      if (confirm('确定清空错词本吗？')) {
                        setWrongWords([])
                        setWrongWordStats([])
                        localStorage.removeItem(WRONG_WORDS_KEY)
                        localStorage.removeItem(WRONG_WORDS_STATS_KEY)
                      }
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    清空错词本
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {wrongWords.map((word, index) => (
                    <div key={word.id} className="badge badge-error badge-lg gap-2">
                      {word.text}
                      <button 
                        className="btn btn-ghost btn-xs p-0 h-4 w-4 min-h-0"
                        onClick={() => deleteWrongWord(index)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {savedAnswers.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-800">历史记录</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {savedAnswers.map((answerList, index) => (
                    <div key={index} className="card bg-base-100 border border-base-300">
                      <div className="card-body p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold">记录 {index + 1}</h3>
                          <div className="flex gap-1">
                            <button 
                              className="btn btn-ghost btn-xs"
                              onClick={() => loadAnswers(index)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                              加载
                            </button>
                            <button 
                              className="btn btn-ghost btn-xs text-error"
                              onClick={() => deleteSavedAnswers(index)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              删除
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {answerList.slice(0, 5).map((word) => (
                            <span key={word.id} className="badge badge-outline">
                              {word.text}
                            </span>
                          ))}
                          {answerList.length > 5 && (
                            <span className="badge badge-ghost">
                              +{answerList.length - 5}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
