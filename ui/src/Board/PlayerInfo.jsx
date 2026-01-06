"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export default function PlayerInfo({ name, rating, time, isActive }) {
  const minutes = Math.floor(time / 60)
  const seconds = time % 60
  const timeString = `${minutes}:${seconds.toString().padStart(2, "0")}`

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg transition-all border ${
        isActive
          ? "bg-emerald-950/40 border-emerald-600/60 shadow-lg shadow-emerald-900/20"
          : "bg-slate-800/40 border-slate-700/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`} />
          <AvatarFallback>{name.charAt(0)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-sm">{name}</p>
          <p className="text-xs text-slate-400">{rating}</p>
        </div>
      </div>
      <div className={`text-xl font-mono font-bold tabular-nums ${isActive ? "text-emerald-400" : "text-slate-300"}`}>
        {timeString}
      </div>
    </div>
  )
}
