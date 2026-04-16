import { useRef, useState } from "react"
import { AlarmClock } from "lucide-react"

const ClockComponent = () => {
  const startTimeRef = useRef<number | null>(null)
  const pausedAtRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  const [display, setDisplay] = useState({ mm: "00", ss: "00", ms: "0" })
  const [running, setRunning] = useState(false)

  const pad = (n: number) => String(n).padStart(2, "0")

  const render = (elapsed: number) => {
    const totalSec = Math.floor(elapsed / 1000)
    const mm = Math.floor(totalSec / 60)
    const ss = totalSec % 60
    const ms = Math.floor((elapsed % 1000) / 100)
    setDisplay({ mm: pad(mm), ss: pad(ss), ms: String(ms) })
  }

  const tick = () => {
    const elapsed = Date.now() - startTimeRef.current!
    render(elapsed)
    rafRef.current = requestAnimationFrame(tick)
  }

  const play = () => {
    if (running) return
    startTimeRef.current = Date.now() - pausedAtRef.current
    setRunning(true)
    rafRef.current = requestAnimationFrame(tick)
  }

  const pause = () => {
    if (!running) return
    pausedAtRef.current = Date.now() - startTimeRef.current!
    cancelAnimationFrame(rafRef.current!)
    setRunning(false)
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current!)
    startTimeRef.current = null
    pausedAtRef.current = 0
    setRunning(false)
    setDisplay({ mm: "00", ss: "00", ms: "0" })
  }

  return (
    <div className="flex flex-col items-center gap-6 p-10">
      <div className="flex items-center gap-2">
        <AlarmClock color="red" size={28} />
        <span className="text-sm text-gray-500">
          {running ? "Running" : "Stopped"}
        </span>
      </div>

      <div className="font-mono text-6xl font-medium tracking-widest">
        {display.mm}
        <span className="opacity-40">:</span>
        {display.ss}
        <span className="text-3xl text-gray-400">.{display.ms}</span>
      </div>

      <div className="flex gap-3">
        <button
          onClick={play}
          disabled={running}
          className="px-6 py-2 rounded border border-green-400 text-green-600 disabled:opacity-30"
        >
          Play
        </button>
        <button
          onClick={pause}
          disabled={!running}
          className="px-6 py-2 rounded border border-yellow-400 text-yellow-600 disabled:opacity-30"
        >
          Pause
        </button>
        <button
          onClick={reset}
          className="px-6 py-2 rounded border border-red-400 text-red-500"
        >
          Reset
        </button>
      </div>
    </div>
  )
}

export default ClockComponent
