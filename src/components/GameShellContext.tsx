import {
  createContext,
  useContext,
  type ReactNode,
} from 'react'

interface GameShellContextValue {
  isFullscreen: boolean
}

const GameShellContext = createContext<GameShellContextValue>({
  isFullscreen: false,
})

export function GameShellProvider({
  isFullscreen,
  children,
}: {
  isFullscreen: boolean
  children: ReactNode
}) {
  return (
    <GameShellContext.Provider value={{ isFullscreen }}>
      {children}
    </GameShellContext.Provider>
  )
}

export function useGameShell(): GameShellContextValue {
  return useContext(GameShellContext)
}
