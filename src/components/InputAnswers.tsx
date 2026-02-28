import { useState, useRef, useEffect } from 'react'
import Tesseract from 'tesseract.js'
import { Html5Qrcode } from 'html5-qrcode'

interface Word {
  id: string
  text: string
  confidence: number
}

const STORAGE_KEY = 'saved_answers'
const WRONG_WORDS_KEY = 'wrong_words'

export default function InputAnswers() {
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string>('')
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [recognitionProgress, setRecognitionProgress] = useState(0)
  const [words, setWords] = useState<Word[]>([])
  const [savedAnswers, setSavedAnswers] = useState<Word[][]>([])
  const [wrongWords, setWrongWords] = useState<Word[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const qrScannerRef = useRef<Html5Qrcode | null>(null)
  const qrReaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      setSavedAnswers(JSON.parse(saved))
    }
    
    const wrong = localStorage.getItem(WRONG_WORDS_KEY)
    if (wrong) {
      setWrongWords(JSON.parse(wrong))
    }
  }, [])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      })
      
      streamRef.current = stream
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setIsCameraOpen(true)
      }
    } catch (err) {
      console.error('无法访问摄像头:', err)
      alert('无法访问摄像头，请确保已授予摄像头权限')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsCameraOpen(false)
  }

  const startQRScanner = async () => {
    try {
      setIsQRScannerOpen(true)
      
      if (!qrReaderRef.current) return
      
      const html5QrCode = new Html5Qrcode("qr-reader")
      qrScannerRef.current = html5QrCode
      
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      }
      
      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          handleQRCodeScanned(decodedText)
        },
        () => {
        }
      )
    } catch (err) {
      console.error('无法启动二维码扫描:', err)
      alert('无法启动二维码扫描，请确保已授予摄像头权限')
      setIsQRScannerOpen(false)
    }
  }

  const stopQRScanner = async () => {
    if (qrScannerRef.current) {
      try {
        await qrScannerRef.current.stop()
      } catch (err) {
        console.error('停止扫描器失败:', err)
      }
      qrScannerRef.current = null
    }
    setIsQRScannerOpen(false)
  }

  const handleQRCodeScanned = async (decodedText: string) => {
    await stopQRScanner()
    
    const wordsList = decodedText
      .split(/[\n,，、;；]/)
      .map(word => word.trim())
      .filter(word => word.length > 0)
      .map((word, index) => ({
        id: `${Date.now()}-${index}`,
        text: word,
        confidence: 100
      }))
    
    setWords(wordsList)
    
    const newWrongWords = [...wrongWords, ...wordsList]
    setWrongWords(newWrongWords)
    localStorage.setItem(WRONG_WORDS_KEY, JSON.stringify(newWrongWords))
    
    alert(`成功扫描并保存 ${wordsList.length} 个单词到错词本！`)
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    
    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    
    if (!context) return
    
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    const imageData = canvas.toDataURL('image/png')
    setCapturedImage(imageData)
    stopCamera()
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
      
      setWords(recognizedWords)
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-3">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
            单词默写批改
          </h1>
          <p className="text-gray-600 text-lg">使用摄像头拍照或扫码，自动识别英文单词</p>
        </div>

        <div className="card bg-white/80 backdrop-blur-sm shadow-2xl border border-white/50">
          <div className="card-body space-y-6">
            <div className="flex flex-wrap gap-4">
              {!isCameraOpen && !isQRScannerOpen && !capturedImage && (
                <>
                  <button 
                    className="btn btn-primary gap-2"
                    onClick={startCamera}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    打开摄像头
                  </button>
                  <button 
                    className="btn btn-secondary gap-2"
                    onClick={startQRScanner}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    扫码识别
                  </button>
                </>
              )}

              {isCameraOpen && (
                <>
                  <button 
                    className="btn btn-success gap-2"
                    onClick={capturePhoto}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    拍照
                  </button>
                  <button 
                    className="btn btn-error gap-2"
                    onClick={stopCamera}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    关闭
                  </button>
                </>
              )}

              {isQRScannerOpen && (
                <button 
                  className="btn btn-error gap-2"
                  onClick={stopQRScanner}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  停止扫描
                </button>
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

            {isCameraOpen && (
              <div className="relative">
                <video 
                  ref={videoRef}
                  className="w-full rounded-lg shadow-lg"
                  autoPlay
                  playsInline
                />
                <canvas ref={canvasRef} className="hidden" />
              </div>
            )}

            {isQRScannerOpen && (
              <div className="relative">
                <div 
                  id="qr-reader" 
                  ref={qrReaderRef}
                  className="w-full rounded-lg shadow-lg"
                  style={{ minHeight: '300px' }}
                ></div>
                <div className="text-center mt-4 text-gray-600">
                  <p>请扫描包含单词列表的二维码</p>
                  <p className="text-sm">二维码内容格式：单词1,单词2,单词3</p>
                </div>
              </div>
            )}

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
                  {words.map((word, index) => (
                    <div key={word.id} className="card bg-base-100 border border-base-300">
                      <div className="card-body p-4 flex flex-row items-center gap-4">
                        <span className="badge badge-primary font-mono text-lg">
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
                              <p className="text-xl font-medium text-gray-800">{word.text}</p>
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
                  ))}
                </div>
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
                        localStorage.removeItem(WRONG_WORDS_KEY)
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
