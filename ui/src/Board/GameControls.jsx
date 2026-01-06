"use client"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, FlipVertical2 } from "lucide-react"

export default function GameControls({ onBackward, onForward, onFlip, onStart, onEnd }) {


  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "ArrowLeft") {
        console.log(" Left arrow pressed!");
        handlePrevious(); 
      } else if (event.key === "ArrowRight") {
        console.log("️ Right arrow pressed!");
        handleNext(); 
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handlePrevious = () => {
    onBackward()
  };

  const handleNext = () => {
    onForward()
  };


  return (
    <div className="flex gap-2 justify-center bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
      <Button
        variant="outline"
        size="sm"
        onClick={onStart} // ← Fixed: was onBackward
        title="Go to start"
        className="bg-slate-700/60 border-slate-600/50 hover:bg-slate-600/80 text-slate-200 h-10 w-10 p-0"
      >
        <ChevronsLeft className="h-5 w-5" strokeWidth={2.5} />
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onBackward}
        title="Previous move"
        className="bg-slate-700/60 border-slate-600/50 hover:bg-slate-600/80 text-slate-200 h-10 w-10 p-0"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onForward}
        title="Next move"
        className="bg-slate-700/60 border-slate-600/50 hover:bg-slate-600/80 text-slate-200 h-10 w-10 p-0"
      >
        <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onEnd} // ← Fixed: was onForward
        title="Go to current position"
        className="bg-slate-700/60 border-slate-600/50 hover:bg-slate-600/80 text-slate-200 h-10 w-10 p-0"
      >
        <ChevronsRight className="h-5 w-5" strokeWidth={2.5} />
      </Button>

      <div className="border-l border-slate-600/50 mx-1" />

      <Button
        variant="outline"
        size="sm"
        onClick={onFlip}
        title="Flip board"
        className="bg-slate-700/60 border-slate-600/50 hover:bg-slate-600/80 text-slate-200 h-10 w-10 p-0"
      >
        <FlipVertical2 className="h-5 w-5" strokeWidth={2.5} />
      </Button>
    </div>
  )
}