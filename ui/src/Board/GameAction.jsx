"use client"

import { Button } from "@/components/ui/button"
import { Undo2, Handshake, Flag } from "lucide-react"

export default function GameActions({ onResign, onDrawOffer, onRetake }) {
  return (
    <div className="grid grid-cols-3 gap-2 bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
      <Button
        variant="outline"
        size="sm"
        onClick={onRetake}
        className="bg-slate-700/60 border-slate-600/50 hover:bg-slate-600/80 text-slate-200 h-9 flex items-center gap-1.5"
      >
        <Undo2 className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">Takeback</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onDrawOffer}
        className="bg-slate-700/60 border-slate-600/50 hover:bg-slate-600/80 text-slate-200 h-9 flex items-center gap-1.5"
      >
        <Handshake className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">Draw</span>
      </Button>

      <Button
        size="sm"
        onClick={onResign}
        className="bg-red-700/80 hover:bg-red-600/90 border-red-600/50 text-white h-9 flex items-center gap-1.5"
      >
        <Flag className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">Resign</span>
      </Button>
    </div>
  )
}